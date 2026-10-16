import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicAppOrigin } from "@/lib/site-url";

type FundingOrder = {
  funding_order_id: string;
  advertiser_id: string;
  campaign_id: string | null;
  amount_minor: number;
  currency: "USD";
  status: "pending" | "paid" | "failed" | "expired";
  stripe_checkout_session_id: string | null;
};

function stripeClient() {
  const secret = process.env.STRIPE_SANDBOX_SECRET_KEY;
  const origin = getPublicAppOrigin();
  if (!secret?.match(/^(sk|rk)_test_/) || origin !== "https://staging-workforce.txkpro.com") {
    throw new Response("Stripe sandbox funding is not configured for staging. No payment was taken.", { status: 503 });
  }
  return new Stripe(secret, {
    maxNetworkRetries: 2,
    timeout: 15000,
    appInfo: { name: "TXKPRO Workforce advertiser funding" },
  });
}

async function fundingService(input: Record<string, unknown>) {
  const { data, error } = await createAdminClient().rpc("advertiser_funding_service", { p_input: input });
  if (error) throw new Response("Advertiser funding could not be confirmed. Refresh before retrying.", { status: 409 });
  return data as FundingOrder;
}

export async function createAdvertiserFundingCheckout(
  supabase: SupabaseClient,
  input: { advertiserId: string; campaignId?: string | null; amountMinor: number },
) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) throw new Response("A verified advertiser email is required.", { status: 403 });
  const { data, error } = await supabase.rpc("advertiser_funding_order_create", {
    p_advertiser_id: input.advertiserId,
    p_campaign_id: input.campaignId || null,
    p_amount_minor: input.amountMinor,
  });
  if (error) throw new Response(error.message, { status: 400 });
  const fundingOrderId = String(data.fundingOrderId);
  const order = await fundingService({ op: "read", fundingOrderId });
  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: `https://staging-workforce.txkpro.com/advertiser?funding=success&order=${fundingOrderId}`,
      cancel_url: `https://staging-workforce.txkpro.com/advertiser?funding=cancelled&order=${fundingOrderId}`,
      client_reference_id: fundingOrderId,
      customer_email: userData.user.email,
      invoice_creation: { enabled: true },
      integration_identifier: "txkpro_ads_qalorihq",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Number(order.amount_minor),
          product_data: { name: "TXKPRO Ads account credit" },
        },
      }],
      metadata: {
        ads_funding_order_id: fundingOrderId,
        advertiser_id: order.advertiser_id,
        campaign_id: order.campaign_id ?? "",
        integration_identifier: "txkpro_ads_qalorihq",
      },
      payment_intent_data: { metadata: { ads_funding_order_id: fundingOrderId } },
    },
    { idempotencyKey: `txkpro-ads-funding-${fundingOrderId}` },
  );
  if (!session.url || session.livemode || session.currency !== "usd" || session.amount_total !== Number(order.amount_minor)) {
    throw new Response("Sandbox checkout details were not confirmed. No payment was taken.", { status: 503 });
  }
  await fundingService({ op: "bind", fundingOrderId, sessionId: session.id });
  return { checkoutUrl: session.url, fundingOrderId };
}

export async function processAdvertiserFundingEvent(event: Stripe.Event, stripe: Stripe) {
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) return false;
  const observed = event.data.object as Stripe.Checkout.Session;
  const fundingOrderId = observed.metadata?.ads_funding_order_id;
  if (!fundingOrderId) return false;
  if (event.livemode) throw new Response("Live advertiser payments are disabled.", { status: 400 });
  const order = await fundingService({ op: "read", fundingOrderId });
  if (!order.stripe_checkout_session_id) throw new Response("Advertiser funding session is not bound.", { status: 409 });
  const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
  if (
    session.id !== observed.id ||
    session.client_reference_id !== fundingOrderId ||
    session.metadata?.ads_funding_order_id !== fundingOrderId ||
    session.metadata?.advertiser_id !== order.advertiser_id ||
    session.livemode ||
    session.currency !== "usd" ||
    session.amount_total !== Number(order.amount_minor)
  ) throw new Response("Advertiser funding evidence mismatch.", { status: 400 });
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    if (session.payment_status !== "paid") return true;
    await fundingService({
      op: "settle",
      fundingOrderId,
      eventId: event.id,
      sessionId: session.id,
      paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
      amountMinor: session.amount_total,
      currency: session.currency,
      livemode: session.livemode,
    });
  } else {
    await fundingService({
      op: "fail",
      fundingOrderId,
      eventId: event.id,
      sessionId: session.id,
      reason: event.type.endsWith("expired") ? "expired" : "failed",
    });
  }
  return true;
}
