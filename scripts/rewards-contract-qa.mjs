import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import {
  seal,
  unseal,
  validSignature,
  screeningBudget,
  orderPayload,
  reconcileOrder,
  validGiftCard,
} from "../lib/rewards/contracts.ts";
const request = {
  id: "request-id",
  cents: 500,
  credits: 500,
  productId: "gift-card",
  email: "recipient@example.test",
  name: "Recipient",
  providerOrderId: null,
};
const order = {
  id: "order-id",
  external_id: "txkpro-sandbox-request-id",
  status: "EXECUTED",
  rewards: [
    {
      id: "reward-id",
      value: { denomination: 5, currency_code: "USD" },
      recipient: { email: request.email },
      delivery: { status: "FAILED" },
    },
  ],
};
test("encrypted credentials are tenant-bound and tampering fails", () => {
  const key = randomBytes(32).toString("base64");
  const sealed = seal({ token: "fixture" }, key, "tenant-a");
  assert.deepEqual(unseal(sealed, key, "tenant-a"), { token: "fixture" });
  assert.throws(() => unseal(sealed, key, "tenant-b"));
  const bytes = Buffer.from(sealed, "base64");
  bytes[15] ^= 1;
  assert.throws(() => unseal(bytes.toString("base64"), key, "tenant-a"));
});
test("webhook signature authenticates the exact raw bytes", () => {
  const raw = '{"event":"ORDER"}';
  const h = "sha256=" + createHmac("sha256", "key").update(raw).digest("hex");
  assert.equal(validSignature(raw, h, "key"), true);
  assert.equal(validSignature(raw + " ", h, "key"), false);
  assert.equal(validSignature(raw, null, "key"), false);
});
test("retries use immutable order identity and USD cents", () => {
  assert.deepEqual(orderPayload(request), orderPayload({ ...request }));
  assert.equal(orderPayload(request).external_id, order.external_id);
  assert.equal(orderPayload(request).reward.value.denomination, 5);
  assert.throws(() => orderPayload({ ...request, cents: 0 }));
});
test("issuance and email delivery are separate; identity mismatch stays unconfirmed", () => {
  assert.equal(reconcileOrder(order, request).status, "issued");
  assert.equal(reconcileOrder(order, request).deliveryStatus, "FAILED");
  assert.throws(() =>
    reconcileOrder({ ...order, external_id: "another-request" }, request),
  );
  assert.throws(() => reconcileOrder(order, { ...request, cents: 600 }));
  assert.throws(() =>
    reconcileOrder(order, { ...request, email: "other@example.test" }),
  );
});
test("credits are released only after full USD cancellation refund", () => {
  assert.equal(
    reconcileOrder(
      {
        ...order,
        status: "CANCELED",
        payment: { refund: { total: 4, currency_code: "USD" } },
      },
      request,
    ).status,
    "provider_pending",
  );
  assert.equal(
    reconcileOrder(
      {
        ...order,
        status: "CANCELED",
        payment: { refund: { total: 5, currency_code: "USD" } },
      },
      request,
    ).status,
    "cancelled",
  );
  assert.equal(
    reconcileOrder(
      {
        ...order,
        status: "CANCELED",
        payment: { refund: { total: 5, currency_code: "EUR" } },
      },
      request,
    ).status,
    "provider_pending",
  );
});
test("product eligibility rejects cash, other countries/currencies and denomination bands", () => {
  const p = {
    category: "merchant_card",
    currency_codes: ["USD"],
    countries: [{ abbr: "US" }],
    skus: [{ min: 5, max: 100, currency_code: "USD" }],
  };
  assert.equal(validGiftCard(p, 500), true);
  assert.equal(validGiftCard(p, 499), false);
  assert.equal(validGiftCard({ ...p, category: "paypal" }, 500), false);
  assert.equal(
    validGiftCard({ ...p, countries: [{ abbr: "GB" }] }, 500),
    false,
  );
});
test("approval threshold never overrides hard spending cap", () => {
  assert.deepEqual(screeningBudget(600, 500, 1000, 200), {
    withinLimit: false,
    requiresApproval: true,
  });
  assert.deepEqual(screeningBudget(200, 800, 1000, 200), {
    withinLimit: true,
    requiresApproval: false,
  });
  assert.throws(() => screeningBudget(-1, 0, 1000, 100));
});
