import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SANDBOX_ORIGIN,
  validGiftCard,
  orderPayload,
  reconcileOrder,
  seal,
  unseal,
  type RewardRequest,
} from "./contracts";
export type RewardWorkspace = {
  accounts: {
    ownerType: string;
    ownerId: string;
    connected: boolean;
    balanceCents: number;
    balanceAt: string | null;
  }[];
  policies: {
    programId: string;
    centsPerBlock: number;
    creditsPerBlock: number;
    minimumCredits: number;
    approval: string;
    productId: string;
    allocatedCents: number;
    liabilityCents: number;
  }[];
  credits: { participantId: string; programId: string; credits: number }[];
  requests: {
    id: string;
    programId: string;
    participantId: string;
    credits: number;
    cents: number;
    status: string;
    providerStatus: string | null;
    deliveryStatus: string | null;
    own: boolean;
  }[];
  eligible: boolean;
};
export async function authenticatedRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc(name, args);
  if (error)
    throw new Response(
      error.code === "42501"
        ? "Workspace permission denied."
        : /^(Minimum, available credits and whole-cent conversion required|Program budget insufficient|Refresh confirmed provider funding first|Reward policy is fixed at activation|Redemption requires eligible US adult; points remain available|Employment-approved product and minor consent confirmation required|Select valid check names)$/.test(
              error.message,
            )
          ? error.message
          : "Check the values and current workflow state.",
      { status: error.code === "42501" ? 403 : 400 },
    );
  return data as T;
}
export async function rewardWorkspace() {
  return authenticatedRpc<RewardWorkspace>("reward_workspace");
}
export async function rewardAction(input: Record<string, unknown>) {
  return authenticatedRpc<{
    id: string | null;
    status: string | null;
    ownerType: string;
    ownerId: string;
  }>("reward_action", { p_input: input });
}
export async function rewardService<T = Record<string, unknown>>(
  input: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await createAdminClient().rpc("reward_service", {
    p_input: input,
  });
  if (error)
    throw new Response(
      "Provider operation unavailable; refresh or retry safely.",
      { status: 503 },
    );
  return data as T;
}
type Tokens = {
  access_token: string;
  refresh_token: string;
  expiresAt: number;
  webhookSecret?: string;
};
type Claim = {
  accountId: string;
  ownerType: string;
  ownerId: string;
  sealed: string;
  lease: string;
  request: RewardRequest | null;
};
function context(t: string, i: string) {
  return `tremendous:sandbox:${t}:${i}`;
}
function config() {
  const clientId = process.env.TREMENDOUS_SANDBOX_CLIENT_ID,
    secret = process.env.TREMENDOUS_SANDBOX_CLIENT_SECRET,
    key = process.env.REWARDS_ENCRYPTION_KEY;
  const origin = process.env.REWARDS_SANDBOX_APP_ORIGIN;
  if (
    !clientId ||
    !secret ||
    !key ||
    Buffer.from(key, "base64").length !== 32 ||
    origin !== "https://staging-workforce.txkpro.com"
  )
    throw new Response("Tremendous sandbox credentials are not configured.", {
      status: 503,
    });
  return { clientId, secret, key, origin };
}
async function api(path: string, token: string | null, body?: unknown) {
  const response = await fetch(`${SANDBOX_ORIGIN}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error("Provider operation did not confirm success.");
  return response.json();
}
async function verifiedUser() {
  const c = await createServerSupabaseClient();
  const { data, error } = await c.auth.getUser();
  if (error || !data.user)
    throw new Response("Authentication required", { status: 401 });
  return data.user;
}
export async function beginConnect(ownerType: string, ownerId: string) {
  const c = config();
  const authority = await rewardAction({ op: "account", ownerType, ownerId });
  const user = await verifiedUser();
  const state = randomBytes(32).toString("hex");
  await rewardService({
    op: "oauth_begin",
    ownerType: authority.ownerType,
    ownerId: authority.ownerId,
    actor: user.id,
    stateHash: createHash("sha256").update(state).digest("hex"),
  });
  const url = new URL(`${SANDBOX_ORIGIN}/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: `${c.origin}/api/rewards/callback`,
    response_type: "code",
    scope: "default team_management",
    state,
  }).toString();
  return url.toString();
}
export async function completeConnect(code: string, state: string) {
  const c = config(),
    user = await verifiedUser();
  if (!/^[a-f0-9]{64}$/.test(state) || !code || code.length > 2048)
    throw new Response("OAuth session unavailable", { status: 400 });
  const owner = await rewardService<{ ownerType: string; ownerId: string }>({
    op: "oauth_consume",
    actor: user.id,
    stateHash: createHash("sha256").update(state).digest("hex"),
  });
  await rewardAction({ op: "account", ...owner }); // Recheck current owner permission; revoked authorizations cannot complete linking.
  const token = await api("/oauth/token", null, {
    client_id: c.clientId,
    client_secret: c.secret,
    redirect_uri: `${c.origin}/api/rewards/callback`,
    grant_type: "authorization_code",
    code,
  });
  if (
    typeof token.access_token !== "string" ||
    typeof token.refresh_token !== "string" ||
    !Number.isFinite(token.expires_in)
  )
    throw new Response("Provider connection unavailable", { status: 503 });
  const org = await api("/api/v2/organizations", token.access_token);
  if (
    !Array.isArray(org.organizations) ||
    org.organizations.length !== 1 ||
    !org.organizations[0].id
  )
    throw new Response("Select one workspace account", { status: 400 });
  const tokens: Tokens = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  await rewardService({
    op: "connect",
    ...owner,
    organizationId: org.organizations[0].id,
    sealed: seal(tokens, c.key, context(owner.ownerType, owner.ownerId)),
  });
  const claim = await rewardService<Claim>({ op: "claim", ...owner });
  try {
    const hooks = await api("/api/v2/webhooks", token.access_token);
    // Never overwrite an existing receiver belonging to another integration.
    const expected = `${c.origin}/api/rewards/webhook/${claim.accountId}`;
    if ((hooks.webhooks || []).some((h: { url: string }) => h.url !== expected))
      throw new Error("Existing provider webhook needs coordination.");
    const hook = await api("/api/v2/webhooks", token.access_token, {
      url: expected,
    });
    if (!hook.webhook?.private_key) throw new Error("Webhook unavailable");
    tokens.webhookSecret = hook.webhook.private_key;
    await rewardService({
      op: "token_save",
      accountId: claim.accountId,
      lease: claim.lease,
      sealed: seal(tokens, c.key, context(owner.ownerType, owner.ownerId)),
    });
  } finally {
    await rewardService({
      op: "release",
      accountId: claim.accountId,
      lease: claim.lease,
    });
  }
  return owner.ownerType === "institution"
    ? "/institution/incentives"
    : "/employer/incentives";
}
async function tokenFor(claim: Claim) {
  const c = config();
  let tokens = unseal<Tokens>(
    claim.sealed,
    c.key,
    context(claim.ownerType, claim.ownerId),
  );
  if (tokens.expiresAt < Date.now() + 60000) {
    const refreshed = await api("/oauth/token", null, {
      client_id: c.clientId,
      client_secret: c.secret,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
    if (
      !refreshed.access_token ||
      !refreshed.refresh_token ||
      !Number.isFinite(refreshed.expires_in)
    )
      throw new Error("Token refresh unavailable");
    tokens = {
      ...tokens,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
    };
    await rewardService({
      op: "token_save",
      accountId: claim.accountId,
      lease: claim.lease,
      sealed: seal(tokens, c.key, context(claim.ownerType, claim.ownerId)),
    });
  }
  return tokens.access_token;
}
export async function refreshBalance(
  ownerType: string,
  ownerId: string,
  checked = true,
) {
  if (checked) await rewardAction({ op: "account", ownerType, ownerId });
  config();
  const claim = await rewardService<Claim>({ op: "claim", ownerType, ownerId });
  try {
    const token = await tokenFor(claim),
      r = await api("/api/v2/funding_sources/BALANCE", token);
    const f = r.funding_source;
    if (
      f?.status !== "active" ||
      f?.method !== "balance" ||
      f?.meta?.currency_code !== "USD" ||
      !Number.isSafeInteger(f?.meta?.available_cents) ||
      f.meta.available_cents < 0
    )
      throw new Error("USD balance unavailable");
    await rewardService({
      op: "balance",
      accountId: claim.accountId,
      lease: claim.lease,
      currency: "USD",
      cents: f.meta.available_cents,
    });
  } catch {
    await rewardService({
      op: "release",
      accountId: claim.accountId,
      lease: claim.lease,
    });
    throw new Response("Provider balance unavailable. No funds were added.", {
      status: 503,
    });
  }
}
export async function dispatchReward(id: string, checked = true) {
  if (checked)
    await authenticatedRpc("reward_dispatch_authority", { p_id: id });
  config();
  const claim = await rewardService<Claim>({
    op: "claim_issue",
    requestId: id,
  });
  let attempted = Boolean(claim.request?.providerOrderId);
  try {
    const token = await tokenFor(claim),
      r = claim.request!;
    let order;
    if (r.providerOrderId) {
      order = (
        await api(
          `/api/v2/orders/${encodeURIComponent(r.providerOrderId)}`,
          token,
        )
      ).order;
    } else {
      // The same immutable request ID/body is used on every retry, including after timeout.
      const catalog = await api(
        "/api/v2/products?id=ALL_FEE_FREE&country=US&currency=USD",
        token,
      );
      const product = catalog.products?.find(
        (p: Record<string, unknown>) => p.id === r.productId,
      );
      if (!product || !validGiftCard(product, r.cents))
        throw new Error("Eligible fee-free USD gift card unavailable.");
      attempted = true;
      order = (await api("/api/v2/orders", token, orderPayload(r))).order;
    }
    const result = reconcileOrder(order, r);
    await rewardService({
      op: "finish",
      accountId: claim.accountId,
      lease: claim.lease,
      requestId: id,
      ...result,
    });
  } catch {
    await rewardService({
      op: "finish",
      accountId: claim.accountId,
      lease: claim.lease,
      requestId: id,
      status:
        !attempted && claim.request?.status === "approved"
          ? "approved"
          : "reconciliation_required",
      providerStatus: "UNCONFIRMED",
    });
    throw new Response(
      "Provider result is unconfirmed. Credits remain reserved; retry the same request.",
      { status: 503 },
    );
  }
}
export async function webhookAccount(id: string) {
  const c = config();
  const a = await rewardService<{
    sealed: string;
    ownerType: string;
    ownerId: string;
  }>({ op: "webhook_account", accountId: id });
  return {
    ...a,
    tokens: unseal<Tokens>(a.sealed, c.key, context(a.ownerType, a.ownerId)),
  };
}
