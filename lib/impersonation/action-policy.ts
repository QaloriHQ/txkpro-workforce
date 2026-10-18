/**
 * SEC-IMP-02 policy: allow ordinary user activity, deny high-risk actions.
 *
 * THIS IS A POLICY CONTRACT, NOT YET AN AUTHORIZATION ENFORCER.
 * Do not use this classifier to enable impersonation until browser Supabase
 * requests and Postgres RLS/RPC operations are bound to the exact same actor
 * + target session. Unknown writes fail closed, including external actions.
 */
export type ImpersonationActionDecision =
  | "ordinary_read"
  | "ordinary_write"
  | "deny_high_risk"
  | "deny_unreviewed";

/**
 * High-risk categories always excluded by the owner's 2026-10-18 revision.
 * Include security operations, permissions, finance, irreversible account
 * actions, identity verification, and direct admin privilege surfaces.
 */
const BLOCKED_PATHS = [
  /^\/api\/admin(?:\/|$)/,
  /^\/api\/auth(?:\/|$)/,
  /^\/api\/(?:authcard|checkr|screening|rewards|invitations|audit)(?:\/|$)/,
  /^\/api\/advertiser(?:\/|$)/,
  /^\/api\/ads(?:\/|$)/,
  /^\/api\/retention\/run(?:\/|$)/,
  /^\/api\/employer\/learning\/certifications\/awards\//,
  /^\/api\/community\/groups\/[^/]+\/(?:invites|join-requests|members)(?:\/|$)/,
  /^\/api\/community\/groups\/[^/]+\/posts\/[^/]+\/moderate(?:\/|$)/,
  /^\/api\/community\/moderation(?:\/|$)/,
  /^\/api\/organization\/public-profile(?:\/|$)/,
  /^\/api\/placements(?:\/|$)/,
  /^\/api\/onboarding(?:\/|$)/,
  /^\/api\/marketing(?:\/|$)/,
  /^\/api\/skills\/verify(?:\/|$)/,
  /^\/api\/employer\/referrals\/[^/]+\/close(?:\/|$)/,
  /^\/api\/institution\/referrals(?:\/|$)/,
  /^\/api\/retention\/cases(?:\/|$)/,
  /^\/auth(?:\/|$)/,
  /^\/(?:login|reset-password|change-password|settings\/security|billing|payments|checkout)(?:\/|$)/,
];

const BLOCKED_SEGMENTS = /(?:^|\/)(?:delete|remove-account|suspend|ban|deactivate|reset-password|change-password|password|credential|security|mfa|2fa|permissions|roles|membership|funding|refund|payout|stripe|checkout|billing|payment|transfer|balance|wallet|verification|revoke|approve|approval)(?:\/|$)/i;

/** Explicit ordinary-write route families, with exact resource boundaries. */
const ORDINARY_WRITE_PATHS = [
  /^\/api\/community\/(?:posts|drafts|polls|events|conversations|message-requests|messages|media|message-attachments|preferences|authors\/[^/]+\/follow)(?:\/|$)/,
  /^\/api\/community\/groups(?:\/[^/]+\/(?:posts|join|leave|conversation))?\/?$/,
  /^\/api\/student\/employer-training\/assignments\/[^/]+\/(?:start|lessons\/[^/]+\/(?:touch|complete)|checkpoints\/[^/]+|assessments\/[^/]+)$/,
  /^\/api\/student\/(?:portfolio|public-profile)(?:\/|$)/,
  /^\/api\/professional\/(?:profile|customization|images|reviews)(?:\/|$)/,
  /^\/api\/skills\/self-attest$/,
  /^\/api\/employer\/(?:hiring-needs|talent\/[^/]+\/(?:notes|save))(?:\/|$)/,
  /^\/api\/interviews\/[^/]+\/respond$/,
  /^\/api\/classes\/join$/,
  /^\/api\/job-readiness$/,
];

export function classifyImpersonationRequest(method: string, rawPath: string): ImpersonationActionDecision {
  const verb = method.toUpperCase();
  let path: string;
  try {
    const pathname = new URL(rawPath, "https://localhost").pathname;
    path = decodeURIComponent(pathname).replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  } catch {
    return "deny_unreviewed";
  }
  if (!path.startsWith("/") || path.includes("\\") || path.includes("..")) return "deny_unreviewed";
  if (BLOCKED_SEGMENTS.test(path) || BLOCKED_PATHS.some(pattern => pattern.test(path))) return "deny_high_risk";
  if (verb === "GET" || verb === "HEAD") return "ordinary_read";
  if (!["POST", "PUT", "PATCH"].includes(verb)) return "deny_unreviewed";
  return ORDINARY_WRITE_PATHS.some(pattern => pattern.test(path)) ? "ordinary_write" : "deny_unreviewed";
}

export function ordinaryImpersonationActionAllowed(decision: ImpersonationActionDecision) {
  return decision === "ordinary_read" || decision === "ordinary_write";
}
