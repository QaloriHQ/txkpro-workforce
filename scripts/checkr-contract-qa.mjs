import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  validSignature,
  packagesForNode,
  curatePackage,
  operationalStatus,
  retrySafe,
  sandboxConfigured,
} from "../lib/checkr/contracts.ts";
test("Checkr signature compact JSON, wrong key and malformed payload", () => {
  const raw = ' { "id": "evt", "type": "report.completed" } ';
  const sig = createHmac("sha256", "fixture")
    .update(JSON.stringify(JSON.parse(raw)))
    .digest("hex");
  assert.equal(validSignature(raw, sig, "fixture"), true);
  assert.equal(validSignature(raw, sig, "wrong"), false);
  assert.equal(validSignature("not json", sig, "fixture"), false);
  assert.equal(validSignature(raw, "bad", "fixture"), false);
});
test("catalog and node constraints cannot be bypassed", () => {
  const p = curatePackage({
    slug: "basic",
    name: "Basic",
    price: 2999,
    screenings: [{ type: "ssn_trace" }],
    report: "private",
  });
  assert.deepEqual(p, {
    slug: "basic",
    name: "Basic",
    price: 2999,
    screenings: ["ssn trace"],
  });
  assert.throws(() => curatePackage({ slug: "basic", price: null }));
  assert.throws(() =>
    packagesForNode(
      [p],
      [{ id: "division", name: "Division", packages: ["basic"] }],
      "",
    ),
  );
  assert.equal(
    packagesForNode(
      [p],
      [{ id: "division", name: "Division", packages: ["other"] }],
      "division",
    ).length,
    0,
  );
  assert.throws(() => packagesForNode([p], [], "foreign"));
});
test("results are normalized to operational completion without adjudication", () => {
  for (const s of ["clear", "consider", "complete"])
    assert.equal(operationalStatus(s, true), "complete");
  assert.equal(operationalStatus("suspended", true), "processing");
  assert.equal(operationalStatus("expired", false), "expired");
});
test("staging-only configuration and expired idempotency", () => {
  assert.equal(sandboxConfigured({}), false);
  const e = {
    CHECKR_SANDBOX_CLIENT_ID: "fixture",
    CHECKR_SANDBOX_CLIENT_SECRET: "fixture",
    CHECKR_SANDBOX_APP_ORIGIN: "https://staging-workforce.txkpro.com",
    REWARDS_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  };
  assert.equal(sandboxConfigured(e), true);
  assert.equal(
    sandboxConfigured({
      ...e,
      CHECKR_SANDBOX_APP_ORIGIN: "https://workforce.txkpro.com",
    }),
    false,
  );
  assert.equal(retrySafe(new Date(Date.now() - 3600000).toISOString()), true);
  assert.equal(retrySafe(new Date(Date.now() - 86400000).toISOString()), false);
});
