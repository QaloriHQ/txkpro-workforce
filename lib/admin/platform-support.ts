import "server-only";
import { getAccountContext } from "@/lib/auth";
import { isPlatformSuperAdmin } from "@/lib/institutions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AccountContext } from "@/lib/auth";

export async function requirePlatformSuperAdmin(): Promise<AccountContext> {
  const actor = await getAccountContext();
  if (!actor || !isPlatformSuperAdmin(actor)) throw new Response("Forbidden", { status: 403 });
  return actor;
}

export function requireSupportRequest(request: Request, input: { reason?: unknown }) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new Response("Origin rejected", { status: 403 });
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < 12 || reason.length > 240 || /[\u0000-\u001f]/.test(reason)) {
    throw new Response("Provide a support reason of 12–240 characters without control characters.", { status: 400 });
  }
  return reason;
}

export async function enforceSupportRateLimit(actorId: string, action: string, ceiling = 12) {
  const admin = createAdminClient();
  const after = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error } = await admin.from("platform_audit_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_auth_user_id", actorId).eq("action", action)
    .gte("created_at", after);
  if (error) throw new Response("Support audit log is unavailable.", { status: 503 });
  if ((count ?? 0) >= ceiling) throw new Response("Support action rate limit reached. Try again later.", { status: 429 });
}

export async function writeSupportAudit(input: {
  actor: AccountContext;
  targetAuthUserId: string;
  action: string;
  reason: string;
  outcome: "success" | "failed" | "denied";
  details?: Record<string, string>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("platform_audit_events").insert({
    actor_auth_user_id: input.actor.authUserId,
    actor_user_id: input.actor.legacyUserId,
    action: input.action,
    entity_type: "auth_user",
    entity_id: input.targetAuthUserId,
    source: "txkpro_platform_support",
    target_type: "auth_user",
    target_id: input.targetAuthUserId,
    result: input.outcome,
    metadata: { supportReason: input.reason, ...input.details },
  });
  if (error) throw new Response("Support audit log is unavailable.", { status: 503 });
}

export function supportErrorResponse(error: unknown) {
  const code = error instanceof Response ? error.status : 500;
  const message = error instanceof Response && code < 500 ? "Request denied or invalid." : "Unable to complete this support request.";
  return Response.json({ error: message }, { status: code, headers: { "Cache-Control": "private, no-store" } });
}
