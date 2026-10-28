import test from "node:test";
import assert from "node:assert/strict";
import {
  integrationHash,
  validWorkerSecret,
  integrationEnvelope,
} from "../lib/incentives/integration-contracts.ts";
test("worker secrets fail closed and event envelopes reject stale/replayed transport timestamps", () => {
  assert.equal(validWorkerSecret("Bearer secret", undefined), false);
  assert.equal(validWorkerSecret("Bearer wrong", "secret"), false);
  assert.equal(validWorkerSecret("Bearer secret", "secret"), true);
  assert.equal(integrationHash("secret").length, 64);
  const now = Date.now();
  assert.throws(() =>
    integrationEnvelope(
      { eventId: "a", sentAt: new Date(now - 301000).toISOString() },
      now,
    ),
  );
  assert.throws(() =>
    integrationEnvelope({ eventId: "a", sentAt: "not-a-date" }, now),
  );
  const event = integrationEnvelope(
    {
      eventId: "a",
      sentAt: new Date(now).toISOString(),
      values: { reviews: 1 },
      privateUnmappedField: "must not pass the transport contract",
    },
    now,
  );
  assert.equal("privateUnmappedField" in event, false);
});
