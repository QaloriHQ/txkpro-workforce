import {
  fundingDiagnostic,
  validFundingDiagnostic,
} from "../lib/rewards/funding-diagnostics.ts";
import { fundingPaymentObservation } from "../lib/rewards/funding-contracts.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fundingAvailability } from "../lib/rewards/funding-availability.ts";
const env = {
  STRIPE_SANDBOX_SECRET_KEY: "rk_test_example",
  STRIPE_SANDBOX_PUBLISHABLE_KEY: "pk_test_example",
  STRIPE_SANDBOX_WEBHOOK_SECRET: "whsec_example",
  REWARDS_SANDBOX_APP_ORIGIN: "https://staging-workforce.txkpro.com",
  REWARDS_PRICING_VERSION: "test-fixture",
  REWARDS_CARD_THIRD_PARTY_BPS: "0",
  REWARDS_CARD_THIRD_PARTY_FIXED_CENTS: "0",
  REWARDS_CARD_PAYMENT_METHOD_CONFIGURATION: "pmc_example",
};
test("readiness is fail-closed, method-specific and contains no credentials", () => {
  assert.deepEqual(fundingAvailability({}), { card: false, ach: false });
  assert.deepEqual(fundingAvailability(env), { card: true, ach: false });
  for (const key of Object.keys(env)) {
    assert.equal(
      fundingAvailability({ ...env, [key]: undefined }).card,
      false,
      key,
    );
  }
  assert.equal(
    fundingAvailability({
      ...env,
      STRIPE_SANDBOX_SECRET_KEY: "sk_live_example",
    }).card,
    false,
  );
  assert.equal(
    fundingAvailability({ ...env, REWARDS_CARD_THIRD_PARTY_BPS: "invalid" })
      .card,
    false,
  );
  assert.equal(
    JSON.stringify(fundingAvailability(env)).includes("example"),
    false,
  );
});

const request = {
  id: "funding",
  total_cents: 1650000,
  stripe_session_id: "session",
  status: "pending",
};
const session = {
  id: "session",
  client_reference_id: "funding",
  metadata: { funding_id: "funding" },
  amount_total: 1650000,
  currency: "usd",
  livemode: false,
  status: "open",
  payment_status: "unpaid",
  payment_intent: null,
};
test("payment recovery only resumes a verified, open unpaid session", () => {
  assert.equal(fundingPaymentObservation(request, session).canResume, true);
  for (const change of [
    { status: "complete" },
    { status: "expired" },
    { payment_status: "paid" },
    { payment_intent: { status: "processing" } },
    { payment_intent: { status: "succeeded" } },
    { payment_intent: "unexpanded" },
  ]) {
    assert.equal(
      fundingPaymentObservation(request, { ...session, ...change }).canResume,
      false,
    );
  }
  for (const status of ["paid", "backed", "hold", "failed", "expired"])
    assert.equal(
      fundingPaymentObservation({ ...request, status }, session).canResume,
      false,
    );
});
test("payment observation rejects another request, altered price/currency and live mode", () => {
  for (const change of [
    { id: "other" },
    { client_reference_id: "other" },
    { metadata: { funding_id: "other" } },
    { amount_total: 1 },
    { currency: "eur" },
    { livemode: true },
  ]) {
    assert.throws(() =>
      fundingPaymentObservation(request, { ...session, ...change }),
    );
  }
});

test("checkout diagnostic is a fixed category and never returns raw errors or credentials", () => {
  assert.deepEqual(
    fundingDiagnostic(
      "confirmation",
      new TypeError("checkout.confirm is not a function"),
    ),
    { stage: "confirmation", category: "sdk_unavailable" },
  );
  const diagnostic = fundingDiagnostic("validation", {
    name: "IntegrationError",
    message:
      "customer@example.test sk_test_SECRET cs_test_SECRET card 4242424242424242",
  });
  assert.deepEqual(diagnostic, {
    stage: "validation",
    category: "integration",
  });
  assert.equal(validFundingDiagnostic(diagnostic), true);
  assert.equal(
    validFundingDiagnostic({
      stage: "confirmation",
      category: "sk_test_SECRET",
    }),
    false,
  );
  assert.equal(
    validFundingDiagnostic({ stage: "raw_secret", category: "unexpected" }),
    false,
  );
});

test("trusted event recovery rejects unrelated, unpaid, altered and live events", async () => {
  const { fundingEventMatches } = await import("../lib/rewards/funding-documents.ts");
  const paid = { ...session, payment_status: "paid", status: "complete" };
  const event = { type: "checkout.session.completed", livemode: false, data: { object: paid } };
  assert.equal(fundingEventMatches(request, event), true);
  assert.equal(fundingEventMatches(request, { ...event, type: "checkout.session.async_payment_succeeded" }), true);
  for (const change of [{ id: "other" }, { client_reference_id: "other" }, { metadata: { funding_id: "other" } }, { amount_total: 1 }, { currency: "eur" }, { livemode: true }, { payment_status: "unpaid" }])
    assert.equal(fundingEventMatches(request, { ...event, data: { object: { ...paid, ...change } } }), false);
  assert.equal(fundingEventMatches(request, { ...event, livemode: true }), false);
  assert.equal(fundingEventMatches(request, { ...event, type: "payment_intent.succeeded" }), false);
  assert.equal(fundingEventMatches(request, { ...event, data: { object: null } }), false);
});

test("payment documents expose only bound paid Stripe URLs, never provider payloads", async () => {
  const { fundingDocuments } = await import("../lib/rewards/funding-documents.ts");
  const paid = { ...session, payment_status: "paid", payment_intent: {
    id: "intent", status: "succeeded", amount: request.total_cents, currency: "usd", livemode: false,
    client_secret: "must-not-leak", latest_charge: {
      payment_intent: "intent", amount: request.total_cents, currency: "usd", livemode: false, paid: true,
      receipt_url: "https://pay.stripe.com/receipts/fixture",
    },
  }, invoice: { amount_paid: request.total_cents, currency: "usd", livemode: false, status: "paid", hosted_invoice_url: "https://invoice.stripe.com/i/fixture", invoice_pdf: "https://pay.stripe.com/invoice/fixture/pdf" } };
  const d = fundingDocuments(request, paid);
  assert.equal(d.receiptUrl, paid.payment_intent.latest_charge.receipt_url);
  assert.equal(d.invoiceUrl, paid.invoice.hosted_invoice_url);
  assert.ok(d.invoicePdfUrl);
  assert.equal(JSON.stringify(d).includes("must-not-leak"), false);
  assert.throws(() => fundingDocuments({ ...request, id: "other" }, paid));
  for (const change of [{ id: "other" }, { amount_total: 1 }, { currency: "eur" }, { livemode: true }])
    assert.throws(() => fundingDocuments(request, { ...paid, ...change }));
  assert.equal(fundingDocuments(request, { ...paid, payment_status: "unpaid" }).receiptUrl, null);
  assert.equal(fundingDocuments(request, { ...paid, invoice: null }).invoiceUrl, null);
  for (const change of [{ payment_intent: "other" }, { amount: 1 }, { currency: "eur" }, { livemode: true }, { paid: false }])
    assert.equal(fundingDocuments(request, { ...paid, payment_intent: { ...paid.payment_intent, latest_charge: { ...paid.payment_intent.latest_charge, ...change } } }).receiptUrl, null);
  for (const url of ["javascript:alert(1)", "https://evil.test/receipt", "https://pay.stripe.com.evil.test/receipt", "https://user:pass@pay.stripe.com/receipt", "http://pay.stripe.com/receipt"])
    assert.equal(fundingDocuments(request, { ...paid, payment_intent: { ...paid.payment_intent, latest_charge: { ...paid.payment_intent.latest_charge, receipt_url: url } } }).receiptUrl, null);
  assert.equal(fundingDocuments(request, { ...paid, invoice: { ...paid.invoice, amount_paid: 1 } }).invoiceUrl, null);
});
