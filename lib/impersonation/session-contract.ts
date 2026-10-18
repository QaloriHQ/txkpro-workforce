/**
 * SEC-IMP-01: issuer-independent, dependency-light contracts.
 * This registry is not a Supabase Auth session and grants ZERO target access.
 *
 * IMPORTANT: This compile-time stop is deliberate. Changing an env var alone
 * must never enable target-auth session issuance or cross-user data access.
 * Set true only in a separately reviewed SEC-IMP-02 commit once browser calls,
 * SSR, RLS, API routes, ordinary action attribution and the complete HIGH-RISK DENY contract are proven end-to-end.
 */
export const IMPERSONATION_DATA_PLANE_CERTIFIED = false as boolean;

export const IMPERSONATION_COOKIE = "__Host-txkpro-admin-impersonation";
export const IMPERSONATION_TTL_SECONDS = 15 * 60;

export type ImpersonationRegistryRecord = {
  id: string;
  token_hash: string;
  actor_auth_user_id: string;
  actor_auth_session_id: string;
  target_auth_user_id: string;
  target_membership_key: string;
  state: "active" | "revoked";
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export type ImpersonationSubject = {
  authUserId: string;
  authSessionId: string;
};

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new Response("Origin rejected.", { status: 403 });
  }
}

export function validUuid(input: unknown): input is string {
  return typeof input === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input);
}

export function validMembershipKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 &&
    /^(workforce|advertiser):[a-zA-Z0-9_-]+$/.test(value);
}

export function impersonationEnabled() {
  return IMPERSONATION_DATA_PLANE_CERTIFIED &&
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "staging" &&
    process.env.TXKPRO_IMPERSONATION_ENABLED === "true";
}

export function registryIsActive(
  row: ImpersonationRegistryRecord,
  actor: ImpersonationSubject,
  atMs: number,
): boolean {
  return row.state === "active" && row.revoked_at === null &&
    row.actor_auth_user_id === actor.authUserId &&
    row.actor_auth_session_id === actor.authSessionId &&
    new Date(row.expires_at).getTime() > atMs &&
    new Date(row.created_at).getTime() <= atMs;
}
