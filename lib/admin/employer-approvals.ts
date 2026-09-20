import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  EmployerApprovalDecision,
  PendingEmployerApproval,
} from "@/lib/admin/types";

export async function listPendingEmployerApprovals(): Promise<
  PendingEmployerApproval[]
> {
  const admin = createAdminClient();

  const { data: employers, error } = await admin
    .from("contractors")
    .select(
      "contractor_id, business_name, owner_user_id, business_phone, website, approval_status, account_status, created_at",
    )
    .eq("approval_status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!employers?.length) return [];

  const employerIds = employers.map((item) => item.contractor_id);
  const ownerIds = employers
    .map((item) => item.owner_user_id)
    .filter((value): value is string => Boolean(value));

  const [{ data: owners }, { data: profiles }, { data: onboarding }] =
    await Promise.all([
      ownerIds.length
        ? admin
            .from("users")
            .select("user_id, first_name, last_name, email")
            .in("user_id", ownerIds)
        : Promise.resolve({ data: [] }),
      admin
        .from("wf_contractor_profiles")
        .select("contractor_id, workforce_status")
        .in("contractor_id", employerIds),
      admin
        .from("wf_onboarding_accounts")
        .select("employer_id, status, submitted_at")
        .in("employer_id", employerIds),
    ]);

  const ownerMap = new Map(
    (owners ?? []).map((owner) => [
      owner.user_id,
      {
        name:
          [owner.first_name, owner.last_name].filter(Boolean).join(" ") ||
          "Employer owner",
        email: owner.email ?? null,
      },
    ]),
  );
  const profileMap = new Map(
    (profiles ?? []).map((profile) => [
      profile.contractor_id,
      profile.workforce_status ?? null,
    ]),
  );
  const onboardingMap = new Map(
    (onboarding ?? []).map((row) => [row.employer_id, row]),
  );

  return employers.map((employer) => {
    const owner = ownerMap.get(employer.owner_user_id);
    const onboardingRow = onboardingMap.get(employer.contractor_id);
    return {
      employerId: employer.contractor_id,
      businessName: employer.business_name ?? "Employer",
      ownerName: owner?.name ?? "Employer owner",
      ownerEmail: owner?.email ?? null,
      phone: employer.business_phone ?? null,
      website: employer.website ?? null,
      approvalStatus: employer.approval_status ?? "pending",
      accountStatus: employer.account_status ?? "active",
      workforceStatus: profileMap.get(employer.contractor_id) ?? null,
      onboardingStatus: onboardingRow?.status ?? null,
      onboardingSubmittedAt: onboardingRow?.submitted_at ?? null,
      createdAt: employer.created_at ?? null,
    };
  });
}

export async function decideEmployerApproval(input: {
  employerId: string;
  decision: EmployerApprovalDecision;
  actorUserId: string;
}) {
  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin
    .from("contractors")
    .select("contractor_id, approval_status, account_status, business_name")
    .eq("contractor_id", input.employerId)
    .maybeSingle();

  if (currentError) throw currentError;
  if (!current) throw new Response("Employer not found", { status: 404 });

  const patch =
    input.decision === "suspended"
      ? {
          approval_status: "suspended",
          account_status: "suspended",
          updated_at: new Date().toISOString(),
        }
      : {
          approval_status: input.decision,
          updated_at: new Date().toISOString(),
        };

  const { error: updateError } = await admin
    .from("contractors")
    .update(patch)
    .eq("contractor_id", input.employerId);
  if (updateError) throw updateError;

  const workforceStatus =
    input.decision === "approved"
      ? "approved"
      : input.decision === "rejected"
        ? "rejected"
        : "suspended";

  const { error: profileError } = await admin
    .from("wf_contractor_profiles")
    .update({
      workforce_status: workforceStatus,
      updated_by_user_id: input.actorUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("contractor_id", input.employerId);
  if (profileError) throw profileError;

  if (input.decision !== "approved") {
    const { error: onboardingError } = await admin
      .from("wf_onboarding_accounts")
      .update({
        status: "blocked",
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("employer_id", input.employerId)
      .eq("selected_role", "employer");
    if (onboardingError) throw onboardingError;
  }

  return {
    employerId: input.employerId,
    businessName: current.business_name ?? "Employer",
    previousStatus: current.approval_status ?? "pending",
    decision: input.decision,
  };
}
