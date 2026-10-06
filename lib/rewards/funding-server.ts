import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  authenticatedRpc,
  rewardApi,
  rewardConfig,
  rewardService,
  refreshBalance,
} from "./server";
import { seal, unseal } from "./contracts";
import { fundingQuote, usdCents } from "./funding-contracts";
type Authority = {
  ownerType: string;
  ownerId: string;
  actor: string;
  fundingId?: string;
  canFinance: boolean;
};
export type Funding = {
  id: string;
  owner_type: string;
  owner_id: string;
  principal_cents: number;
  platform_fee_cents: number;
  third_party_fee_cents: number;
  total_cents: number;
  status: string;
  method: string;
  stripe_session_id: string | null;
  provider_invoice_id: string | null;
  invoice_attempted_at: string | null;
  provider_topup_id: string | null;
  provider_funding_source: string | null;
};
async function authority(input: Record<string, unknown>) {
  return authenticatedRpc<Authority>("reward_funding_authority", {
    p_input: input,
  });
}
async function service<T = Funding>(
  input: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await createAdminClient().rpc(
    "reward_funding_service",
    { p_input: input },
  );
  if (error)
    throw new Response(
      "Funding operation was not confirmed. Refresh the same request before retrying.",
      { status: 409 },
    );
  return data as T;
}
function stripeConfig() {
  const secret = process.env.STRIPE_SANDBOX_SECRET_KEY,
    publishableKey = process.env.STRIPE_SANDBOX_PUBLISHABLE_KEY,
    webhook = process.env.STRIPE_SANDBOX_WEBHOOK_SECRET;
  if (
    !secret?.match(/^(sk|rk)_test_/) ||
    !publishableKey?.startsWith("pk_test_") ||
    !webhook?.startsWith("whsec_") ||
    process.env.REWARDS_SANDBOX_APP_ORIGIN !==
      "https://staging-workforce.txkpro.com"
  )
    throw new Response(
      "Stripe sandbox funding is awaiting configuration. No payment was taken.",
      { status: 503 },
    );
  return {
    stripe: new Stripe(secret, {
      maxNetworkRetries: 2,
      timeout: 15000,
      appInfo: { name: "TXKPRO workforce sandbox rewards" },
    }),
    publishableKey,
    webhook,
  };
}
function pricing(method: string) {
  if (!["card", "ach"].includes(method))
    throw new Response("Choose card or ACH.", { status: 400 });
  const prefix = `REWARDS_${method.toUpperCase()}`;
  const b = process.env[`${prefix}_THIRD_PARTY_BPS`],
    f = process.env[`${prefix}_THIRD_PARTY_FIXED_CENTS`];
  const configuration = process.env[`${prefix}_PAYMENT_METHOD_CONFIGURATION`],
    version = process.env.REWARDS_PRICING_VERSION;
  if (
    !b?.match(/^\d+$/) ||
    !f?.match(/^\d+$/) ||
    !configuration?.startsWith("pmc_") ||
    !version
  )
    throw new Response(
      "Funding prices and payment methods are awaiting configuration. No payment was taken.",
      { status: 503 },
    );
  return {
    basisPoints: Number(b),
    fixedCents: Number(f),
    configuration,
    version,
  };
}
export async function setupFunding(input: Record<string, unknown>) {
  const c = rewardConfig();
  const a = await authority({ ...input, op: "setup" });
  const marker = seal(
    { mode: "central" },
    c.key,
    `tremendous:sandbox:${a.ownerType}:${a.ownerId}`,
  );
  const rootMarker = seal(
    { mode: "central" },
    c.key,
    "tremendous:sandbox:platform:txkpro",
  );
  await service({
    op: "setup",
    ...a,
    sealed: marker,
    centralSealed: rootMarker,
  });
  const claim = await rewardService<{
    accountId: string;
    lease: string;
    sealed: string;
  }>({ op: "claim", ownerType: "platform", ownerId: "txkpro" });
  try {
    const existing = unseal<{ mode: string; webhookSecret?: string }>(
      claim.sealed,
      c.key,
      "tremendous:sandbox:platform:txkpro",
    );
    if (!existing.webhookSecret) {
      const url = `${c.origin}/api/rewards/webhook/${claim.accountId}`;
      const hooks = await rewardApi("/api/v2/webhooks");
      if ((hooks.webhooks || []).length)
        throw new Response(
          "TXKPRO provider webhook needs administrator reconciliation. Funding terms were saved.",
          { status: 409 },
        );
      const h = await rewardApi("/api/v2/webhooks", { url });
      if (!h.webhook?.private_key)
        throw new Response("Provider webhook was not confirmed.", {
          status: 503,
        });
      await service({
        op: "central_hook",
        sealed: seal(
          { mode: "central", webhookSecret: h.webhook.private_key },
          c.key,
          "tremendous:sandbox:platform:txkpro",
        ),
      });
    }
  } finally {
    await rewardService({
      op: "release",
      accountId: claim.accountId,
      lease: claim.lease,
    });
  }
  return { ok: true };
}
export async function quoteFunding(input: Record<string, unknown>) {
  const a = await authority(input),
    principal = usdCents(input.amount);
  const method = a.ownerType === "platform" ? "platform" : String(input.method);
  let q, version;
  if (method === "platform") {
    q = {
      principalCents: principal,
      platformFeeCents: 0,
      thirdPartyFeeCents: 0,
      totalCents: principal,
    };
    version = "txkpro-sponsor-v1";
  } else {
    stripeConfig();
    const p = pricing(method);
    q = fundingQuote(principal, p.basisPoints, p.fixedCents);
    version = p.version;
  }
  const f = await service({
    op: "quote",
    ...a,
    ...q,
    method,
    pricingVersion: version,
    requestKey: input.requestKey,
  });
  return {
    id: f.id,
    principalCents: f.principal_cents,
    platformFeeCents: f.platform_fee_cents,
    thirdPartyFeeCents: f.third_party_fee_cents,
    totalCents: f.total_cents,
    status: f.status,
  };
}
export async function createFundingCheckout(id: string) {
  await authority({ fundingId: id });
  const f = await service({ op: "read", fundingId: id });
  if (f.method === "platform")
    throw new Response("TXKPRO funding uses the finance backing workflow.", {
      status: 400,
    });
  const { stripe, publishableKey } = stripeConfig(),
    p = pricing(f.method);
  if (!["quoted", "pending"].includes(f.status))
    throw new Response("This funding request no longer accepts payment.", {
      status: 409,
    });
  const returnUrl = `${rewardConfig().origin}/${f.owner_type === "institution" ? "institution" : "employer"}/incentives?funding=${f.id}`;
  const line = (
    name: string,
    cents: number,
  ): Stripe.Checkout.SessionCreateParams.LineItem => ({
    quantity: 1,
    price_data: { currency: "usd", unit_amount: cents, product_data: { name } },
  });
  const session = f.stripe_session_id
    ? await stripe.checkout.sessions.retrieve(f.stripe_session_id)
    : await stripe.checkout.sessions.create(
        {
          ui_mode: "elements",
          mode: "payment",
          return_url: returnUrl,
          payment_method_configuration: p.configuration,
          client_reference_id: f.id,
          metadata: {
            funding_id: f.id,
            integration_identifier: "txkpro_rewards_abcdefgh",
          },
          payment_intent_data: { metadata: { funding_id: f.id } },
          line_items: [
            line("Workspace Reward Credits", Number(f.principal_cents)),
            line(
              "TXKPRO platform fee (10%, $5 minimum)",
              Number(f.platform_fee_cents),
            ),
            ...(Number(f.third_party_fee_cents) > 0
              ? [
                  line(
                    "Third-party service fees",
                    Number(f.third_party_fee_cents),
                  ),
                ]
              : []),
          ],
        },
        { idempotencyKey: `txkpro-funding-${f.id}` },
      );
  if (
    !session.client_secret ||
    session.livemode ||
    session.currency !== "usd" ||
    session.amount_total !== Number(f.total_cents)
  )
    throw new Response("Sandbox payment details were not confirmed.", {
      status: 503,
    });
  if (!f.stripe_session_id)
    await service({ op: "session", fundingId: f.id, sessionId: session.id });
  return { clientSecret: session.client_secret, publishableKey, returnUrl };
}
export async function reconcileBacking(id: string) {
  const a = await authority({ op: "finance", fundingId: id });
  let f = await service({ op: "read", fundingId: id });
  if (f.status === "backed") return { ok: true };
  if (f.status !== "paid")
    throw new Response(
      "Customer payment must be confirmed before provider backing.",
      { status: 409 },
    );
  const source =
    f.provider_funding_source ||
    process.env.TREMENDOUS_SANDBOX_FUNDING_SOURCE_ID;
  if (!f.provider_invoice_id && source) {
    const fundingSource = (
      await rewardApi(`/api/v2/funding_sources/${encodeURIComponent(source)}`)
    ).funding_source;
    if (
      fundingSource?.status !== "active" ||
      !fundingSource.usage_permissions?.includes("balance_funding")
    )
      throw new Response("TXKPRO provider funding source is not ready.", {
        status: 503,
      });
    f = await service({ op: "topup_bind", fundingId: id, sourceId: source });
    if (!f.provider_topup_id) {
      const key = `txkpro-funding-${f.id}`;
      const listed = await rewardApi("/api/v2/topups");
      const matches = (listed.topups || []).filter(
        (t: { idempotency_key?: string }) => t.idempotency_key === key,
      );
      if (matches.length > 1)
        throw new Response("Provider topup requires finance reconciliation.", {
          status: 409,
        });
      const topup =
        matches.length === 1
          ? matches[0]
          : (
              await rewardApi("/api/v2/topups", {
                funding_source_id: source,
                idempotency_key: key,
                amount: Number(f.principal_cents) / 100,
              })
            ).topup;
      if (!topup?.id)
        throw new Response(
          "Provider topup unconfirmed; retry this same funding request.",
          { status: 503 },
        );
      f = await service({
        op: "topup_bind",
        fundingId: id,
        sourceId: source,
        topupId: topup.id,
      });
    }
    return reconcileProviderFunding(f);
  }
  if (!f.provider_invoice_id) {
    const po = `txkpro-funding-${f.id}`;
    if (f.invoice_attempted_at) {
      // Never blindly re-create after a timeout: reconcile against provider reference instead.
      const listed = await rewardApi("/api/v2/invoices");
      const matches = (listed.invoices || []).filter(
        (i: { po_number?: string }) => i.po_number === po,
      );
      if (matches.length !== 1)
        throw new Response(
          "Provider invoice is unconfirmed; TXKPRO finance must reconcile before retrying.",
          { status: 409 },
        );
      f = await service({
        op: "invoice",
        fundingId: id,
        invoiceId: matches[0].id,
      });
    } else {
      await service({ op: "invoice_claim", fundingId: id });
      const r = await rewardApi("/api/v2/invoices", {
        amount: Number(f.principal_cents) / 100,
        currency_code: "USD",
        po_number: po,
        memo: `TXKPRO sponsor funding ${f.owner_type}:${f.owner_id}`,
      });
      if (!r.invoice?.id)
        throw new Response("Provider invoice was not confirmed.", {
          status: 503,
        });
      f = await service({
        op: "invoice",
        fundingId: id,
        invoiceId: r.invoice.id,
      });
    }
  }
  const { invoice } = await rewardApi(
    `/api/v2/invoices/${encodeURIComponent(f.provider_invoice_id!)}`,
  );
  if (
    invoice?.status !== "PAID" ||
    invoice.currency_code !== "USD" ||
    usdCents(invoice.amount) !== Number(f.principal_cents)
  )
    return {
      ok: true,
      message:
        "Provider invoice created. TXKPRO finance must fund it separately; customer credits remain pending backing.",
    };
  await refreshBalance(f.owner_type, f.owner_id, false);
  await service({
    op: "back",
    fundingId: id,
    invoiceId: invoice.id,
    invoiceStatus: invoice.status,
    currency: invoice.currency_code,
    cents: usdCents(invoice.amount),
    actor: a.actor,
  });
  return {
    ok: true,
    message: "Provider backing confirmed. Sponsor credits are available.",
  };
}
export async function fundingWebhook(raw: string, signature: string) {
  const { stripe, webhook } = stripeConfig();
  const event = stripe.webhooks.constructEvent(raw, signature, webhook);
  if (event.livemode)
    throw new Response("Live payments are disabled.", { status: 400 });
  let fundingId: string | undefined, kind: string | undefined;
  if (
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ].includes(event.type)
  ) {
    const s = event.data.object as Stripe.Checkout.Session;
    fundingId = s.metadata?.funding_id;
    kind = event.type.endsWith("async_payment_failed")
      ? "failed"
      : event.type.endsWith("expired")
        ? "expired"
        : s.payment_status === "paid"
          ? "paid"
          : undefined;
  } else if (
    ["charge.refunded", "charge.dispute.created"].includes(event.type)
  ) {
    const obj = event.data.object as Stripe.Charge | Stripe.Dispute;
    const charge =
      "charge" in obj
        ? await stripe.charges.retrieve(
            typeof obj.charge === "string" ? obj.charge : obj.charge.id,
          )
        : obj;
    const pi = charge.payment_intent;
    if (pi) {
      const payment = await stripe.paymentIntents.retrieve(
        typeof pi === "string" ? pi : pi.id,
      );
      fundingId = payment.metadata.funding_id;
      kind = "hold";
    }
  }
  if (!fundingId || !kind) return;
  const f = await service({ op: "read", fundingId });
  if (!f.stripe_session_id)
    throw new Response("Funding session pending reconciliation.", {
      status: 409,
    });
  const session = await stripe.checkout.sessions.retrieve(f.stripe_session_id);
  if (
    session.metadata?.funding_id !== f.id ||
    session.client_reference_id !== f.id ||
    (kind === "paid" && session.payment_status !== "paid")
  )
    throw new Response("Payment binding mismatch.", { status: 400 });
  await service({
    op: "payment_event",
    fundingId: f.id,
    eventId: event.id,
    kind,
    sessionId: session.id,
    totalCents: session.amount_total,
    currency: session.currency,
    live: session.livemode,
    paymentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id,
  });
}

async function reconcileProviderFunding(f: Funding) {
  const { topup } = await rewardApi(
    `/api/v2/topups/${encodeURIComponent(f.provider_topup_id!)}`,
  );
  if (
    !topup ||
    topup.id !== f.provider_topup_id ||
    topup.idempotency_key !== `txkpro-funding-${f.id}` ||
    topup.funding_source_id !== f.provider_funding_source ||
    topup.currency_code !== "USD" ||
    usdCents(topup.amount) !== Number(f.principal_cents)
  )
    throw new Response("Provider topup identity was not confirmed.", {
      status: 409,
    });
  if (["reversed", "rejected"].includes(topup.status)) {
    await service({ op: "provider_hold", fundingId: f.id });
    return {
      ok: true,
      message: "Provider funding is on hold; balances are retained.",
    };
  }
  if (topup.status !== "fully_credited")
    return {
      ok: true,
      message:
        "Provider funding is processing. Credits remain unavailable until fully backed.",
    };
  await refreshBalance(f.owner_type, f.owner_id, false);
  await service({
    op: "topup_back",
    fundingId: f.id,
    topupId: topup.id,
    topupStatus: topup.status,
    currency: topup.currency_code,
    cents: usdCents(topup.amount),
  });
  return {
    ok: true,
    message: "Provider backing confirmed. Sponsor credits are available.",
  };
}
export async function providerFundingWebhook(resourceId: string) {
  const f = await service<Funding | null>({
    op: "provider_lookup",
    resourceId,
  });
  if (f?.provider_topup_id) await reconcileProviderFunding(f);
  // Invoices require an explicit finance reconciliation. An event alone never proves funding.
}
