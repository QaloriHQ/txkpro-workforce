import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  EmployerApprovalDecision,
  PendingEmployerApproval,
} from "@/lib/admin/types";

export async function listPendingEmployerApprovals(): Promise<
  PendingEmployerApproval[]
> {
  const admin = await createServerSupabaseClient();

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
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("admin_review_employer", {
    p_employer_id: input.employerId,
    p_decision: input.decision,
  });

  if (error) throw error;
  if (!data || typeof data !== "object") {
    throw new Error("Employer approval review returned no result.");
  }

  const result = data as Record<string, unknown>;
  return {
    employerId: String(result.employerId ?? input.employerId),
    businessName: String(result.businessName ?? "Employer"),
    previousStatus: String(result.previousStatus ?? "pending"),
    decision: String(result.decision ?? input.decision) as EmployerApprovalDecision,
  };
}
