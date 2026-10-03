import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InstitutionContext } from "@/lib/institution/types";
import type { StudentReadinessEvidence } from "@/lib/student/readiness";
import type {
  InstitutionAssignmentInput,
  InstitutionAssignmentPreview,
  InstitutionAssignmentResult,
  InstitutionCohortUpsertInput,
  InstitutionEmployerLearningContext,
  InstitutionAssignmentDetail,
  InstitutionAssignmentFilters,
  InstitutionCompanyBadgeEvidence,
  InstitutionEmployerDetail,
  InstitutionEmployerDirectoryItem,
  InstitutionMicroCertAssignment,
  InstitutionProgramCohortManagement,
  InstitutionProgramManagementCohort,
  InstitutionReferralCreateContext,
  InstitutionReferralCreateInput,
  InstitutionReferralCreateResult,
  InstitutionReferralDetail,
  InstitutionReferralSummary,
  InstitutionStudentReadinessSummary,
  InstitutionWorkforceSummary,
} from "@/lib/institution/types";

function institutionLearningError(error: { message?: string }) {
  const message = error.message ?? "Institution Employer Learning request failed.";
  if (/denied|scope|required|membership/i.test(message)) {
    throw new Response(message, { status: 403 });
  }
  if (/not found/i.test(message)) {
    throw new Response(message, { status: 404 });
  }
  if (/completed assignment cannot|already/i.test(message)) {
    throw new Response(message, { status: 409 });
  }
  if (
    /invalid|must be|select between|has no assignable|outside|eligible|studentIds|target type|program is required|cohort is required/i.test(
      message,
    )
  ) {
    throw new Response(message, { status: 400 });
  }
  throw new Error(message);
}

async function rpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) institutionLearningError(error);
  return data as T;
}

export async function getInstitutionEmployerLearningContext(
  context: InstitutionContext,
) {
  return rpc<InstitutionEmployerLearningContext>(
    "institution_employer_learning_context",
    { p_institution_id: context.institutionId },
  );
}

export async function getInstitutionProgramCohortManagement(
  context: InstitutionContext,
) {
  return rpc<InstitutionProgramCohortManagement>(
    "institution_program_cohort_management",
    { p_institution_id: context.institutionId },
  );
}

export async function upsertInstitutionCohort(
  context: InstitutionContext,
  input: InstitutionCohortUpsertInput,
) {
  return rpc<InstitutionProgramManagementCohort>("institution_cohort_upsert", {
    p_institution_id: context.institutionId,
    p_cohort_id: input.cohortId ?? null,
    p_name: input.name,
    p_program_name: input.programName ?? null,
    p_trade_id: input.tradeId ?? null,
    p_term: input.term ?? null,
    p_graduation_date: input.graduationDate ?? null,
    p_status: input.status ?? "active",
  });
}

export async function previewInstitutionMicroCertAssignment(
  context: InstitutionContext,
  input: InstitutionAssignmentInput,
) {
  return rpc<InstitutionAssignmentPreview>(
    "institution_micro_cert_assignment_preview",
    {
      p_institution_id: context.institutionId,
      p_micro_cert_id: input.microCertId,
      p_target_type: input.targetType,
      p_program_key: input.programKey ?? null,
      p_cohort_id: input.cohortId ?? null,
      p_student_ids: input.studentIds ?? [],
    },
  );
}

export async function assignInstitutionMicroCert(
  context: InstitutionContext,
  input: InstitutionAssignmentInput,
) {
  return rpc<InstitutionAssignmentResult>("institution_micro_cert_assign", {
    p_institution_id: context.institutionId,
    p_micro_cert_id: input.microCertId,
    p_target_type: input.targetType,
    p_program_key: input.programKey ?? null,
    p_cohort_id: input.cohortId ?? null,
    p_student_ids: input.studentIds ?? [],
    p_notify_students: input.notifyStudents ?? true,
  });
}

export async function listInstitutionMicroCertAssignments(
  context: InstitutionContext,
  filters: InstitutionAssignmentFilters = {},
) {
  return rpc<InstitutionMicroCertAssignment[]>(
    "institution_micro_cert_assignment_search",
    {
      p_institution_id: context.institutionId,
      p_status: filters.status ?? null,
      p_student_id: filters.studentId ?? null,
      p_query: filters.query ?? null,
      p_employer_id: filters.employerId ?? null,
      p_micro_cert_id: filters.microCertId ?? null,
      p_program_name: filters.programName ?? null,
      p_cohort_id: filters.cohortId ?? null,
      p_company_badge_id: filters.companyBadgeId ?? null,
    },
  );
}

export async function getInstitutionMicroCertAssignmentDetail(
  context: InstitutionContext,
  assignmentId: string,
) {
  return rpc<InstitutionAssignmentDetail>(
    "institution_micro_cert_assignment_detail",
    {
      p_institution_id: context.institutionId,
      p_assignment_id: assignmentId,
    },
  );
}

export async function listInstitutionCompanyBadgeEvidence(
  context: InstitutionContext,
) {
  return rpc<InstitutionCompanyBadgeEvidence[]>(
    "institution_company_badge_evidence",
    { p_institution_id: context.institutionId },
  );
}

export async function getInstitutionWorkforceSummary(
  context: InstitutionContext,
) {
  return rpc<InstitutionWorkforceSummary>("institution_workforce_summary", {
    p_institution_id: context.institutionId,
  });
}

export async function getInstitutionStudentReadinessSummary(
  context: InstitutionContext,
  studentId: string,
) {
  return rpc<InstitutionStudentReadinessSummary>(
    "institution_student_readiness_summary",
    {
      p_institution_id: context.institutionId,
      p_student_id: studentId,
    },
  );
}

export async function getInstitutionStudentReadinessEvidence(
  context: InstitutionContext,
  studentId: string,
) {
  return rpc<StudentReadinessEvidence>("student_profile_readiness_evidence", {
    p_student_id: studentId,
    p_institution_id: context.institutionId,
  });
}

export async function cancelInstitutionMicroCertAssignment(
  context: InstitutionContext,
  assignmentId: string,
  reason?: string | null,
) {
  return rpc<InstitutionMicroCertAssignment>(
    "institution_micro_cert_assignment_cancel",
    {
      p_institution_id: context.institutionId,
      p_assignment_id: assignmentId,
      p_reason: reason ?? null,
    },
  );
}

export async function getInstitutionReferralCreateContext(
  context: InstitutionContext,
) {
  return rpc<InstitutionReferralCreateContext>(
    "institution_referral_create_context",
    { p_institution_id: context.institutionId },
  );
}

export async function listInstitutionReferrals(
  context: InstitutionContext,
  filters: { status?: string | null; studentId?: string | null } = {},
) {
  return rpc<InstitutionReferralSummary[]>("institution_referrals_list", {
    p_institution_id: context.institutionId,
    p_status: filters.status ?? null,
    p_student_id: filters.studentId ?? null,
  });
}

export async function getInstitutionReferralDetail(
  context: InstitutionContext,
  referralId: string,
) {
  return rpc<InstitutionReferralDetail>("institution_referral_detail", {
    p_institution_id: context.institutionId,
    p_referral_id: referralId,
  });
}

export async function createInstitutionReferral(
  context: InstitutionContext,
  input: InstitutionReferralCreateInput,
) {
  return rpc<InstitutionReferralCreateResult>("institution_create_referral", {
    p_institution_id: context.institutionId,
    p_student_id: input.studentId,
    p_employer_id: input.employerId,
    p_hiring_need_id: input.hiringNeedId ?? null,
    p_note: input.note ?? null,
  });
}

export async function listInstitutionEmployers(context: InstitutionContext) {
  return rpc<InstitutionEmployerDirectoryItem[]>(
    "institution_employers_directory",
    { p_institution_id: context.institutionId },
  );
}

export async function getInstitutionEmployerDetail(
  context: InstitutionContext,
  employerId: string,
) {
  return rpc<InstitutionEmployerDetail>("institution_employer_detail", {
    p_institution_id: context.institutionId,
    p_employer_id: employerId,
  });
}
