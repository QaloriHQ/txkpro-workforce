import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InstitutionContext } from "@/lib/institution/types";
import type {
  InstitutionAssignmentInput,
  InstitutionAssignmentPreview,
  InstitutionAssignmentResult,
  InstitutionEmployerLearningContext,
  InstitutionMicroCertAssignment,
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
  status?: string | null,
  microCertId?: string | null,
) {
  return rpc<InstitutionMicroCertAssignment[]>(
    "institution_micro_cert_assignments",
    {
      p_institution_id: context.institutionId,
      p_status: status ?? null,
      p_micro_cert_id: microCertId ?? null,
    },
  );
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
