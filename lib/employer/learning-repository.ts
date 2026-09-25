import "server-only";

import type { EmployerContext } from "@/lib/employer/types";
import type {
  EmployerMicroCertDetail,
  EmployerMicroCertSummary,
  MicroCertEligibility,
  MicroCertInput,
  MicroCertStatus,
} from "@/lib/employer/learning-types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function learningRpcError(error: { message?: string }) {
  const message = error.message ?? "Employer Learning request failed.";
  if (/denied|approval/i.test(message)) {
    throw new Response(message, { status: 403 });
  }
  if (/not found/i.test(message)) {
    throw new Response(message, { status: 404 });
  }
  if (/VERSION_CONFLICT|IMMUTABLE/i.test(message)) {
    throw new Response(message, { status: 409 });
  }
  if (
    /invalid|required|must be|outside|unknown|eligibility|duration|badge/i.test(
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
  if (error) learningRpcError(error);
  return data as T;
}

export async function listEmployerMicroCerts(
  context: EmployerContext,
  status?: MicroCertStatus | null,
) {
  return rpc<EmployerMicroCertSummary[]>("employer_micro_cert_library", {
    p_employer_id: context.employerId,
    p_status: status ?? null,
  });
}

export async function getEmployerMicroCert(
  context: EmployerContext,
  microCertId: string,
) {
  return rpc<EmployerMicroCertDetail>("employer_micro_cert_detail", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
  });
}

export async function createEmployerMicroCert(
  context: EmployerContext,
  input: MicroCertInput,
) {
  return rpc<EmployerMicroCertDetail>("employer_micro_cert_create", {
    p_employer_id: context.employerId,
    p_payload: input,
  });
}

export async function updateEmployerMicroCert(
  context: EmployerContext,
  microCertId: string,
  input: MicroCertInput,
  expectedVersionNumber?: number,
) {
  return rpc<EmployerMicroCertDetail>("employer_micro_cert_update", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_payload: input,
    p_expected_version_number: expectedVersionNumber ?? null,
  });
}

export async function createEmployerMicroCertVersion(
  context: EmployerContext,
  microCertId: string,
) {
  return rpc<EmployerMicroCertDetail>("employer_micro_cert_create_version", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
  });
}

export async function replaceEmployerMicroCertEligibility(
  context: EmployerContext,
  microCertId: string,
  eligibility: MicroCertEligibility[],
) {
  return rpc<EmployerMicroCertDetail>(
    "employer_micro_cert_replace_eligibility",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
      p_eligibility: eligibility,
    },
  );
}
