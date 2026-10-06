import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as contracts from "../lib/checkr/contracts.ts";
function fixture({
  price = 1000,
  wrongInvitation = false,
  reportResult = "consider",
} = {}) {
  const calls = [],
    services = [];
  let candidateId = null;
  const view = { actor: "canonical-owner" };
  const service = async (input) => {
    services.push(input);
    switch (input.op) {
      case "account":
        return { sealed: "encrypted", accountId: "acct", credentialed: true };
      case "read":
        return {
          package: "basic",
          node: "",
          baseCents: 1000,
          invitationId: "inv",
          candidateId: "cand",
        };
      case "claim":
        return {
          candidateId,
          email: "recipient@example.test",
          package: "basic",
          node: "",
          location: { country: "US", state: "TX", city: "Texarkana" },
        };
      case "candidate":
        candidateId = input.candidateId;
        return {};
      default:
        return {};
    }
  };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    let data;
    if (path === "/v1/account")
      data = {
        id: "acct",
        authorized: true,
        api_authorized: true,
        purpose: "employment",
      };
    else if (path === "/v1/packages")
      data = {
        data: [
          {
            slug: "basic",
            name: "Basic",
            price,
            screenings: [{ type: "national_criminal_search" }],
          },
        ],
      };
    else if (path === "/v1/nodes")
      return Response.json(
        { error: "Sorry, your account is not enabled for segmentation" },
        { status: 400 },
      );
    else if (path === "/v1/candidates") data = { id: "cand" };
    else if (path === "/v1/invitations")
      data = {
        id: "inv",
        candidate_id: wrongInvitation ? "foreign" : "cand",
        package: "basic",
      };
    else if (path === "/v1/invitations/inv")
      data = {
        id: "inv",
        candidate_id: "cand",
        package: "basic",
        report_id: "report",
        status: "completed",
      };
    else if (path === "/v1/reports/report")
      data = {
        id: "report",
        candidate_id: "cand",
        status: reportResult,
        ssn: "never-return",
        result: reportResult,
      };
    else throw new Error(`Unexpected ${path}`);
    return Response.json(data);
  };
  const vmModule = { exports: {} };
  const env = {
    CHECKR_SANDBOX_CLIENT_ID: "fixture",
    CHECKR_SANDBOX_CLIENT_SECRET: "fixture",
    CHECKR_SANDBOX_APP_ORIGIN: "https://staging-workforce.txkpro.com",
    CHECKR_SANDBOX_ORDERING_ENABLED: "true",
    REWARDS_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  };
  const require = (name) =>
    name === "server-only"
      ? {}
      : name === "@/lib/rewards/server"
        ? { authenticatedRpc: async () => view }
        : name === "@/lib/supabase/admin"
          ? {
              createAdminClient: () => ({
                rpc: async (_name, { p_input }) => ({
                  data: await service(p_input),
                }),
              }),
            }
          : name === "@/lib/rewards/contracts"
            ? {
                unseal: () => ({ token: "secret-access" }),
                seal: () => "encrypted",
              }
            : name === "./contracts"
              ? contracts
              : (() => {
                  throw new Error(`Unexpected dependency ${name}`);
                })();
  const code = ts.transpileModule(
    readFileSync(new URL("../lib/checkr/server.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    module: vmModule,
    exports: vmModule.exports,
    require,
    fetch,
    process: { env },
    Response,
    Buffer,
    URLSearchParams,
    AbortSignal,
    console,
  });
  return { api: vmModule.exports, calls, services };
}
test("provider dispatch uses sandbox origin, canonical actor, stable idempotency and scoped location", async () => {
  const f = fixture();
  await f.api.dispatch("tenant", "order-uuid");
  await f.api.dispatch("tenant", "order-uuid");
  const writes = f.calls.filter((c) => c.options.method === "POST");
  assert.equal(writes.length, 3);
  assert.equal(
    writes[0].options.headers["Idempotency-Key"],
    "order-uuid-candidate",
  );
  assert.equal(
    writes[1].options.headers["Idempotency-Key"],
    "order-uuid-invitation",
  );
  assert.equal(
    writes[2].options.headers["Idempotency-Key"],
    "order-uuid-invitation",
  );
  assert.ok(
    f.calls.every((c) => new URL(c.url).origin === contracts.CHECKR_ORIGIN),
  );
  assert.equal(
    writes[1].options.body.get("work_locations[][city]"),
    "Texarkana",
  );
  assert.equal(
    f.services.find((s) => s.op === "claim").actor,
    "canonical-owner",
  );
});
test("price change and foreign candidate response do not commit an invitation", async () => {
  const price = fixture({ price: 2000 });
  await assert.rejects(
    price.api.dispatch("tenant", "order-uuid"),
    (e) => e.status === 409,
  );
  assert.equal(
    price.calls.filter((c) => c.options.method === "POST").length,
    0,
  );
  const wrong = fixture({ wrongInvitation: true });
  await assert.rejects(
    wrong.api.dispatch("tenant", "order-uuid"),
    (e) => e.status === 503,
  );
  assert.equal(
    wrong.services.some((s) => s.op === "submitted"),
    false,
  );
});
test("API reconciliation writes completion only; findings never enter RPC or response", async () => {
  const f = fixture();
  const result = await f.api.reconcile("tenant", "order-uuid");
  assert.equal(result.confirmed, true);
  const status = f.services.find((s) => s.op === "status");
  assert.equal(status.reportStatus, "complete");
  assert.equal(JSON.stringify(f.services).includes("never-return"), false);
  assert.equal(JSON.stringify(f.services).includes("consider"), false);
});
