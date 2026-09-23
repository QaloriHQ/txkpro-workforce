import "server-only";

import { getAccountContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  EmployerApprovalStatus,
  EmployerContext,
  EmployerMembership,
  EmployerRole,
} from "@/lib/employer/types";

const ROLE_PRIORITY: EmployerRole[] = [
  "employer_owner",
  "employer_admin",
  "recruiter",
  "hiring_manager",
  "employer_read_only",
];

function canonicalEmployerRole(role: string): EmployerRole | null {
  const normalized = role.toLowerCase();
  if (normalized === "contractor_owner") return "employer_owner";
  if (normalized === "contractor_recruiter") return "recruiter";
  return ROLE_PRIORITY.includes(normalized as EmployerRole)
    ? (normalized as EmployerRole)
    : null;
}

function approvalStatus(value: unknown): EmployerApprovalStatus {
  const normalized = typeof value === "string" ? value.toLowerCase() : "pending";
  if (
    normalized === "approved" ||
    normalized === "suspended" ||
    normalized === "rejected" ||
    normalized === "closed"
  ) {
    return normalized;
  }
  return "pending";
}

export function canManageCompany(role: EmployerRole) {
  return role === "employer_owner" || role === "employer_admin";
}

export function canCreateHiringNeed(role: EmployerRole) {
  return (
    role === "employer_owner" ||
    role === "employer_admin" ||
    role === "recruiter"
  );
}

export function canDeleteHiringNeed(role: EmployerRole) {
  return role === "employer_owner" || role === "employer_admin";
}

export async function getEmployerContext(
  preferredEmployerId?: string | null,
): Promise<EmployerContext | null> {
  const account = await getAccountContext();
  if (!account) return null;

  const employerMemberships = account.memberships
    .filter((membership) => membership.status.toLowerCase() === "active")
    .map((membership): EmployerMembership | null => {
      const role = canonicalEmployerRole(membership.role);
      const scopeType = membership.scope_type.toLowerCase();
      const employerId = membership.scope_id?.trim() ?? "";
      if (!role || !employerId || !["employer", "contractor"].includes(scopeType)) {
        return null;
      }
      return {
        role,
        rawRole: membership.role,
        status: membership.status,
        scopeType: membership.scope_type,
        employerId,
      };
    })
    .filter((membership): membership is EmployerMembership => Boolean(membership));

  if (!employerMemberships.length) return null;

  const candidates = preferredEmployerId
    ? employerMemberships.filter(
        (membership) => membership.employerId === preferredEmployerId,
      )
    : employerMemberships;

  if (!candidates.length) return null;

  const membership = [...candidates].sort(
    (a, b) => ROLE_PRIORITY.indexOf(a.role) - ROLE_PRIORITY.indexOf(b.role),
  )[0];

  // Employer reads must use the authenticated server client so RLS remains
  // the authorization boundary. The Employer workspace must not depend on a
  // Vercel service-role secret just to resolve its own tenant context.
  const supabase = await createServerSupabaseClient();
  const [{ data: employer, error: employerError }, { data: workforceProfile }] =
    await Promise.all([
      supabase
        .from("contractors")
        .select("contractor_id, business_name, approval_status, account_status")
        .eq("contractor_id", membership.employerId)
        .maybeSingle(),
      supabase
        .from("wf_contractor_profiles")
        .select("workforce_status")
        .eq("contractor_id", membership.employerId)
        .maybeSingle(),
    ]);

  if (employerError || !employer?.contractor_id) return null;

  return {
    authUserId: account.authUserId,
    legacyUserId: account.legacyUserId,
    email: account.email,
    firstName: account.firstName,
    lastName: account.lastName,
    employerId: employer.contractor_id,
    employerName: employer.business_name ?? "Employer",
    role: membership.role,
    approvalStatus: approvalStatus(employer.approval_status),
    accountStatus: employer.account_status ?? "active",
    workforceStatus: workforceProfile?.workforce_status ?? null,
    membership,
  };
}

export async function requireEmployerContext(options?: {
  employerId?: string | null;
  approved?: boolean;
}) {
  const context = await getEmployerContext(options?.employerId);
  if (!context) {
    throw new Response("Employer membership required", { status: 403 });
  }
  if (context.accountStatus === "suspended" || context.accountStatus === "closed") {
    throw new Response("Employer account is not active", { status: 403 });
  }
  if (options?.approved && context.approvalStatus !== "approved") {
    throw new Response("Employer approval required", { status: 403 });
  }
  return context;
}
