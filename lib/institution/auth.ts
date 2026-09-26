import "server-only";

import { getAccountContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  InstitutionAccessContext,
  InstitutionContext,
} from "@/lib/institution/types";

export async function getInstitutionContexts(): Promise<
  InstitutionAccessContext[]
> {
  const account = await getAccountContext();
  if (!account) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "institution_learning_access_context",
  );
  if (error || !Array.isArray(data)) return [];
  return data as InstitutionAccessContext[];
}

export async function getInstitutionContext(
  preferredInstitutionId?: string | null,
): Promise<InstitutionContext | null> {
  const account = await getAccountContext();
  if (!account) return null;

  const contexts = await getInstitutionContexts();
  if (!contexts.length) return null;

  const selected =
    (preferredInstitutionId
      ? contexts.find(
          (context) => context.institutionId === preferredInstitutionId,
        )
      : null) ?? contexts[0];

  if (!selected) return null;

  return {
    ...selected,
    authUserId: account.authUserId,
    legacyUserId: account.legacyUserId,
    email: account.email,
    firstName: account.firstName,
    lastName: account.lastName,
  };
}

export async function requireInstitutionContext(options?: {
  institutionId?: string | null;
}) {
  const context = await getInstitutionContext(options?.institutionId);
  if (!context) {
    throw new Response("Institution membership required", { status: 403 });
  }
  return context;
}

export function canManageInstitutionLearningAssignments(
  context: InstitutionContext,
) {
  return context.roles.some((role) =>
    [
      "institution_admin",
      "department_head",
      "program_coordinator",
      "career_services",
    ].includes(role.toLowerCase()),
  );
}
