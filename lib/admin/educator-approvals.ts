import "server-only";

import { audit } from "@/lib/audit";
import type { AccountContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  EducatorApprovalDecision,
  PendingEducatorApproval,
} from "@/lib/admin/types";

const PLATFORM_ADMIN_ROLES = new Set(["super_admin", "admin", "platform_admin"]);
const INSTITUTION_APPROVER_ROLES = new Set([
  "institution_super_admin",
  "institution_admin",
]);
const EDUCATOR_APPROVAL_ROLES = new Set([
  "instructor",
  "assistant_instructor",
  "career_services",
  "department_head",
  "program_coordinator",
  "read_only_analyst",
  "educator",
  "institution",
]);

type MembershipRow = {
  id: string;
  auth_user_id: string | null;
  user_id: string;
  role: string;
  scope_type: string;
  scope_id: string | null;
  status: string;
  created_at: string | null;
};

function canonicalInstitutionRole(role: string) {
  const normalized = role.trim().toLowerCase();
  if (normalized === "educator" || normalized === "institution") return "instructor";
  return normalized;
}

function isPlatformAdmin(account: AccountContext) {
  return account.memberships.some(
    (membership) =>
      membership.status.toLowerCase() === "active" &&
      PLATFORM_ADMIN_ROLES.has(membership.role.toLowerCase()),
  );
}

function institutionApprovalScope(
  account: AccountContext,
  institutionId: string | null,
) {
  if (!institutionId) return null;
  return account.memberships.find(
    (membership) =>
      membership.status.toLowerCase() === "active" &&
      INSTITUTION_APPROVER_ROLES.has(canonicalInstitutionRole(membership.role)) &&
      membership.scope_type.toLowerCase() === "institution" &&
      membership.scope_id === institutionId,
  ) ?? null;
}

function assertCanApproveEducator(params: {
  actor: AccountContext;
  target: MembershipRow;
}) {
  const targetRole = canonicalInstitutionRole(params.target.role);
  const institutionId =
    params.target.scope_type.toLowerCase() === "institution"
      ? params.target.scope_id
      : null;

  if (!EDUCATOR_APPROVAL_ROLES.has(targetRole)) {
    throw new Response("That membership is not an educator approval.", {
      status: 400,
    });
  }

  if (isPlatformAdmin(params.actor)) return "txkpro_admin";

  const institutionScope = institutionApprovalScope(params.actor, institutionId);
  if (institutionScope) return canonicalInstitutionRole(institutionScope.role);

  throw new Response("Forbidden", { status: 403 });
}

export async function listPendingEducatorApprovals(
  actor: AccountContext,
): Promise<PendingEducatorApproval[]> {
  const admin = createAdminClient();
  const actorIsPlatformAdmin = isPlatformAdmin(actor);
  const institutionAdminScopes = actor.memberships
    .filter(
      (membership) =>
        membership.status.toLowerCase() === "active" &&
        INSTITUTION_APPROVER_ROLES.has(canonicalInstitutionRole(membership.role)) &&
        membership.scope_type.toLowerCase() === "institution" &&
        membership.scope_id,
    )
    .map((membership) => membership.scope_id as string);

  if (!actorIsPlatformAdmin && institutionAdminScopes.length === 0) return [];

  let query = admin
    .from("app_role_memberships")
    .select("id, auth_user_id, user_id, role, scope_type, scope_id, status, created_at")
    .eq("status", "pending")
    .in("role", [...EDUCATOR_APPROVAL_ROLES])
    .order("created_at", { ascending: true });

  if (!actorIsPlatformAdmin) {
    query = query
      .eq("scope_type", "institution")
      .in("scope_id", institutionAdminScopes);
  }

  const { data: memberships, error } = await query;
  if (error) throw error;
  if (!memberships?.length) return [];

  const rows = memberships as MembershipRow[];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const institutionIds = [
    ...new Set(
      rows
        .filter((row) => row.scope_type.toLowerCase() === "institution")
        .map((row) => row.scope_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const [{ data: users }, { data: institutions }, { data: onboarding }] =
    await Promise.all([
      admin
        .from("users")
        .select("user_id, first_name, last_name, email")
        .in("user_id", userIds),
      institutionIds.length
        ? admin
            .from("wf_institutions")
            .select("institution_id, name, short_name")
            .in("institution_id", institutionIds)
        : Promise.resolve({ data: [] }),
      admin
        .from("wf_onboarding_accounts")
        .select("user_id, status, submitted_at")
        .in("user_id", userIds),
    ]);

  const userMap = new Map(
    (users ?? []).map((user) => [
      user.user_id,
      {
        name:
          [user.first_name, user.last_name].filter(Boolean).join(" ") ||
          "Educator",
        email: user.email ?? null,
      },
    ]),
  );
  const institutionMap = new Map(
    (institutions ?? []).map((institution) => [
      institution.institution_id,
      institution.name ?? institution.short_name ?? institution.institution_id,
    ]),
  );
  const onboardingMap = new Map(
    (onboarding ?? []).map((row) => [row.user_id, row]),
  );

  return rows.map((row) => {
    const user = userMap.get(row.user_id);
    const onboardingRow = onboardingMap.get(row.user_id);
    const institutionId =
      row.scope_type.toLowerCase() === "institution" ? row.scope_id : null;

    return {
      membershipId: row.id,
      userId: row.user_id,
      authUserId: row.auth_user_id,
      educatorName: user?.name ?? "Educator",
      educatorEmail: user?.email ?? null,
      role: canonicalInstitutionRole(row.role),
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      institutionId,
      institutionName:
        (institutionId ? institutionMap.get(institutionId) : null) ??
        institutionId ??
        "Institution",
      onboardingStatus: onboardingRow?.status ?? null,
      submittedAt: onboardingRow?.submitted_at ?? null,
      createdAt: row.created_at,
    };
  });
}

export async function decideEducatorApproval(input: {
  membershipId: string;
  decision: EducatorApprovalDecision;
  actor: AccountContext;
}) {
  const admin = createAdminClient();
  const { data: target, error } = await admin
    .from("app_role_memberships")
    .select("id, auth_user_id, user_id, role, scope_type, scope_id, status, created_at")
    .eq("id", input.membershipId)
    .maybeSingle();

  if (error) throw error;
  if (!target) throw new Response("Educator approval was not found.", { status: 404 });

  const targetRow = target as MembershipRow;
  const actorAuthority = assertCanApproveEducator({
    actor: input.actor,
    target: targetRow,
  });
  const previousStatus = targetRow.status;
  if (previousStatus.toLowerCase() !== "pending") {
    throw new Response("That educator approval is no longer pending.", {
      status: 409,
    });
  }

  const now = new Date().toISOString();
  const nextStatus = input.decision === "approved" ? "active" : "rejected";
  const institutionId =
    targetRow.scope_type.toLowerCase() === "institution"
      ? targetRow.scope_id
      : null;

  const { error: appRoleError } = await admin
    .from("app_role_memberships")
    .update({ status: nextStatus, updated_at: now })
    .eq("id", targetRow.id);
  if (appRoleError) throw appRoleError;

  let wfRoleQuery = admin
    .from("wf_role_memberships")
    .update({ status: nextStatus, updated_at: now })
    .eq("user_id", targetRow.user_id)
    .eq("role", targetRow.role);
  wfRoleQuery = institutionId
    ? wfRoleQuery.eq("institution_id", institutionId)
    : wfRoleQuery.is("institution_id", null);
  const { error: wfRoleError } = await wfRoleQuery;
  if (wfRoleError) throw wfRoleError;

  const onboardingStatus = input.decision === "approved" ? "complete" : "blocked";
  const onboardingPatch =
    input.decision === "approved"
      ? { status: onboardingStatus, completed_at: now, updated_at: now }
      : { status: onboardingStatus, updated_at: now };
  const { error: onboardingError } = await admin
    .from("wf_onboarding_accounts")
    .update(onboardingPatch)
    .eq("user_id", targetRow.user_id)
    .eq("selected_role", "educator");
  if (onboardingError) throw onboardingError;

  await audit({
    actorProfileId: input.actor.legacyUserId,
    actorAuthUserId: input.actor.authUserId,
    action: "institution.educator.approval_decided",
    entityType: "app_role_membership",
    entityId: targetRow.id,
    institutionId,
    result: "success",
    oldValue: { status: previousStatus },
    newValue: {
      status: nextStatus,
      decision: input.decision,
      role: canonicalInstitutionRole(targetRow.role),
      scopeType: targetRow.scope_type,
      scopeId: targetRow.scope_id,
    },
    metadata: {
      d01Decision: "txkpro_admin_or_scoped_institution_admin",
      actorAuthority,
      targetUserId: targetRow.user_id,
    },
  });

  return {
    membershipId: targetRow.id,
    userId: targetRow.user_id,
    institutionId,
    role: canonicalInstitutionRole(targetRow.role),
    previousStatus,
    decision: input.decision,
    status: nextStatus,
    actorAuthority,
  };
}
