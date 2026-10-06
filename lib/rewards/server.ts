import "server-only";
import { fundingAvailability } from "./funding-availability";
import { providerBalance } from "./funding-contracts";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SANDBOX_ORIGIN,
  validGiftCard,
  orderPayload,
  reconcileOrder,
  unseal,
  type RewardRequest,
} from "./contracts";
export type RewardWorkspace = {
  fundingAvailability: { card: boolean; ach: boolean };
  accounts: {
    ownerType: string;
    ownerId: string;
    setup: boolean;
    frozen: boolean;
    availableCents: number;
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
    winnerRank: number | null;
    winnerCredits: number | null;
    winnersFinalized: boolean;
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
  canFinance: boolean;
  funding: {
    id: string;
    ownerType: string;
    ownerId: string;
    principalCents: number;
    platformFeeCents: number;
    thirdPartyFeeCents: number;
    totalCents: number;
    method: string;
    status: string;
    createdAt: string;
    invoicePending: boolean;
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
  const data = await authenticatedRpc<RewardWorkspace>("reward_workspace");
  return { ...data, fundingAvailability: fundingAvailability(process.env) };
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
export function rewardConfig() {
  const key = process.env.REWARDS_ENCRYPTION_KEY,
    token = process.env.TREMENDOUS_SANDBOX_API_KEY;
  const origin = process.env.REWARDS_SANDBOX_APP_ORIGIN;
  if (
    !token ||
    !key ||
    Buffer.from(key, "base64").length !== 32 ||
    origin !== "https://staging-workforce.txkpro.com"
  )
    throw new Response("TXKPRO sandbox rewards are not configured.", {
      status: 503,
    });
  return { key, token, origin };
}
export async function rewardApi(path: string, body?: unknown) {
  const c = rewardConfig();
  const response = await fetch(`${SANDBOX_ORIGIN}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${c.token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Response("TXKPRO reward provider operation was not confirmed.", {
      status: 503,
    });
  return response.json();
}
// Sponsor identifiers come from canonical authority. Provider credentials stay in TXKPRO.
async function api(path: string, _token: string | null, body?: unknown) {
  return rewardApi(path, body);
}
export async function beginConnect() {
  throw new Response(
    "Customer OAuth is retired. Set up TXKPRO reward funding in your workspace.",
    { status: 410 },
  );
}
export async function completeConnect() {
  throw new Response("Customer OAuth is retired.", { status: 410 });
}
async function tokenFor(claim: Claim) {
  const c = rewardConfig();
  const marker = unseal<{ mode?: string }>(
    claim.sealed,
    c.key,
    context(claim.ownerType, claim.ownerId),
  );
  if (marker.mode !== "central")
    throw new Response("Legacy funding requires explicit migration.", {
      status: 409,
    });
  return c.token;
}
export async function refreshBalance(
  ownerType: string,
  ownerId: string,
  checked = true,
) {
  if (checked) await rewardAction({ op: "account", ownerType, ownerId });
  rewardConfig();
  const claim = await rewardService<Claim>({ op: "claim", ownerType, ownerId });
  try {
    const token = await tokenFor(claim),
      r = await api("/api/v2/funding_sources/BALANCE", token);
    const f = r.funding_source;
    const cents = providerBalance(f);
    await rewardService({
      op: "balance",
      accountId: claim.accountId,
      lease: claim.lease,
      currency: "USD",
      cents,
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
  rewardConfig();
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
  const c = rewardConfig();
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
