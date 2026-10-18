import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requirePlatformSuperAdmin, writeSupportAudit } from "@/lib/admin/platform-support";
import { getPlatformAccount } from "@/lib/admin/platform-users";
import {
  IMPERSONATION_COOKIE, IMPERSONATION_TTL_SECONDS,
  registryIsActive, validMembershipKey, validUuid,
  type ImpersonationRegistryRecord, type ImpersonationSubject,
} from "./session-contract";

function opaqueHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

type Actor = Awaited<ReturnType<typeof requirePlatformSuperAdmin>>;

async function verifiedActor(): Promise<{ actor: Actor; auth: ImpersonationSubject }> {
  const actor = await requirePlatformSuperAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const authSessionId = claims?.session_id;
  if (error || !validUuid(authSessionId) || claims?.sub !== actor.authUserId) {
    throw new Response("Verified administrator session required.", { status: 401 });
  }
  return { actor, auth: { authUserId: actor.authUserId, authSessionId } };
}

export async function createImpersonationRegistrySession(input: {
  targetAuthUserId: string;
  membershipKey: string;
}) {
  const { actor, auth } = await verifiedActor();
  if (!validUuid(input.targetAuthUserId) || !validMembershipKey(input.membershipKey)) {
    throw new Response("Invalid target or scope.", { status: 400 });
  }
  if (actor.authUserId === input.targetAuthUserId) {
    throw new Response("Cannot impersonate the active administrator identity.", { status: 409 });
  }

  const target = await getPlatformAccount(input.targetAuthUserId);
  const membership = target?.memberships.find(m =>
    m.key === input.membershipKey && m.status.toLowerCase() === "active",
  );
  if (!target || !membership) throw new Response("No active target membership.", { status: 404 });

  // Secure 256-bit capability token. Database stores only a one-way hash.
  const token = randomBytes(32).toString("base64url");
  const token_hash = opaqueHash(token);
  const now = new Date();
  const expires_at = new Date(now.getTime() + IMPERSONATION_TTL_SECONDS * 1000).toISOString();
  const client = createAdminClient();

  // Deny start if the operator's audit event cannot be committed. Never expose
  // an untracked impersonation context with high-risk capabilities.
  await writeSupportAudit({
    actor, targetAuthUserId: target.authUserId,
    action: "platform_impersonation_session_requested",
    reason: "", outcome: "success",
    details: {
      originalAuthSessionId: auth.authSessionId,
      targetMembershipKey: membership.key,
      grantedCapabilities: "none_until_SEC_IMP_02_certified",
    },
  });

  // Multiple-tab start: revoke old actor sessions first. They are no longer valid.
  const old = await client.from("wf_super_admin_impersonation_sessions")
    .update({ state: "revoked", revoked_at: now.toISOString() })
    .eq("actor_auth_user_id", actor.authUserId)
    .eq("actor_auth_session_id", auth.authSessionId)
    .eq("state", "active");
  if (old.error) throw new Response("Unable to revoke previous session.", { status: 503 });

  const inserted = await client.from("wf_super_admin_impersonation_sessions").insert({
    token_hash,
    actor_auth_user_id: actor.authUserId,
    actor_auth_session_id: auth.authSessionId,
    target_auth_user_id: target.authUserId,
    target_membership_key: membership.key,
    created_at: now.toISOString(),
    expires_at,
  }).select("id").single();
  if (inserted.error) throw new Response("Impersonation registry unavailable.", { status: 503 });

  // The cookie is HttpOnly, Secure and host-only. Do not place bearer target
  // credentials, refresh tokens or login links in this cookie, ever.
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: IMPERSONATION_TTL_SECONDS,
  });
  return {
    sessionId: inserted.data.id as string,
    targetAuthUserId: target.authUserId,
    targetName: target.name,
    targetMembershipKey: membership.key,
    expiresAt: expires_at,
  };
}

export async function getImpersonationRegistrySession() {
  const { actor, auth } = await verifiedActor();
  const jar = await cookies();
  const token = jar.get(IMPERSONATION_COOKIE)?.value;
  if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return null;
  const client = createAdminClient();
  const { data, error } = await client.from("wf_super_admin_impersonation_sessions")
    .select("id,token_hash,actor_auth_user_id,actor_auth_session_id,target_auth_user_id,target_membership_key,state,created_at,expires_at,revoked_at")
    .eq("token_hash", opaqueHash(token))
    .maybeSingle();
  if (error || !data) return null;
  const session = data as ImpersonationRegistryRecord;
  if (!registryIsActive(session, auth, Date.now())) return null;
  const target = await getPlatformAccount(session.target_auth_user_id);
  if (!target || !target.memberships.some(m =>
    m.key === session.target_membership_key && m.status.toLowerCase() === "active",
  )) return null;
  return { actor, session, target };
}

export async function exitImpersonationRegistrySession() {
  // Exit must clear cookies even if the original actor auth has expired.
  const jar = await cookies();
  const token = jar.get(IMPERSONATION_COOKIE)?.value;
  jar.delete(IMPERSONATION_COOKIE);
  if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return;
  try {
    const { actor, auth } = await verifiedActor();
    const client = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await client.from("wf_super_admin_impersonation_sessions")
      .update({ state: "revoked", revoked_at: now })
      .eq("token_hash", opaqueHash(token))
      .eq("actor_auth_user_id", auth.authUserId)
      .eq("actor_auth_session_id", auth.authSessionId)
      .eq("state", "active").select("id,target_auth_user_id").maybeSingle();
    if (error) throw error;
    if (data) {
      await writeSupportAudit({
        actor, targetAuthUserId: data.target_auth_user_id,
        action: "platform_impersonation_session_exited",
        reason: "", outcome: "success", details: { sessionId: data.id },
      }).catch(() => console.warn("[impersonation] exit audit pending"));
    }
  } catch {
    // The user must never be trapped in an impersonation UI on logout.
    console.warn("[impersonation] session cookie cleared; server revocation pending expiry");
  }
}
