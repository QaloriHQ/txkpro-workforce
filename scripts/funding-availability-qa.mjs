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
