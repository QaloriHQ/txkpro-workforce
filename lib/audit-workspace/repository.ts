import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AuditFilters, AuditQueue } from "./types";

export class AuditError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function auditFilters(params: URLSearchParams): AuditFilters {
  return Object.fromEntries(["institutionId", "eventType", "result", "from", "to", "offset"].map(key => [key, params.get(key) ?? undefined]));
}
export function auditPageFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const scalar = Array.isArray(value) ? value[0] : value;
    if (scalar !== undefined) query.set(key, scalar);
  }
  return auditFilters(query);
}
export async function auditQuery(filters: AuditFilters, exporting = false) {
  const offset = Number(filters.offset || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new AuditError(400, "Invalid page.");
  for (const key of ["eventType", "institutionId"] as const) {
    if ((filters[key]?.length ?? 0) > 100) throw new AuditError(400, "Invalid filter.");
  }
  const client = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (!user || authError) throw new AuditError(401, "Sign in to continue.");
  const { data, error } = await client.rpc(exporting ? "audit_workspace_export" : "audit_workspace_read", {
    p_institution_id: filters.institutionId || null,
    p_filters: { eventType: filters.eventType || null, result: filters.result || null,
      from: filters.from || null, to: filters.to || null, offset },
  });
  if (error) {
    const status = error.code === "42501" ? 403 : ["22023", "22P02", "22007", "22008", "22003"].includes(error.code) ? 400 : 500;
    throw new AuditError(status, status === 500 ? "Audit history is temporarily unavailable." : error.message);
  }
  return data as AuditQueue;
}
export function auditErrorResponse(error: unknown) {
  return Response.json({ error: error instanceof AuditError ? error.message : "Audit history is temporarily unavailable." },
    { status: error instanceof AuditError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });
}
