import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  RetentionDetail,
  RetentionFilters,
  RetentionQueue,
} from "./types";

export class RetentionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function retentionRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const client = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) throw new RetentionError(401, "Sign in to continue.");
  const { data, error } = await client.rpc(name, args);
  if (error) {
    const status =
      error.code === "42501"
        ? 403
        : error.code === "40001"
          ? 409
          : ["22023", "22P02"].includes(error.code)
            ? 400
            : 500;
    throw new RetentionError(
      status,
      status === 500
        ? "Retention workspace is temporarily unavailable."
        : error.message,
    );
  }
  return data as T;
}
export function listRetentionCases(filters: RetentionFilters = {}) {
  const offset = Number(filters.offset ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new RetentionError(400, "Invalid page.");
  return retentionRpc<RetentionQueue>("retention_cases_list", {
    p_institution_id: filters.institutionId || null,
    p_status: filters.status || "active",
    p_owner: filters.owner || null,
    p_query: filters.q?.slice(0, 100) || null,
    p_offset: offset,
    p_limit: 25,
  });
}
export function getRetentionCase(caseId: string) {
  return retentionRpc<RetentionDetail>("retention_case_detail", {
    p_case_id: caseId,
  });
}
export function retentionErrorResponse(error: unknown) {
  const known = error instanceof RetentionError;
  return Response.json(
    {
      error: known
        ? error.message
        : "Retention workspace is temporarily unavailable.",
    },
    {
      status: known ? error.status : 500,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
