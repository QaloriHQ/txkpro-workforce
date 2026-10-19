import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as contracts from "../lib/checkr/contracts.ts";
function fixture({
  tokenStatus = 200,
  saveError = false,
  price = 1000,
  wrongInvitation = false,
  reportResult = "consider",
  invitationStatus = "completed",
  invitationUrl = "https://apply.checkrhq-staging.net/invite/test/fixture",
} = {}) {
  const logs = [];
  const calls = [],
    services = [];
  let candidateId = null;
  const view = { actor: "canonical-owner" };
  const service = async (input) => {
    services.push(input);
    if (input.op === "connect" && saveError) throw new Response("secret-database-detail", { status: 409 });
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
    if (path === "/oauth/tokens") return Response.json({ access_token: "access", checkr_account_id: "acct", error: "secret-provider-detail" }, { status: tokenStatus });
    else if (path === "/v1/account")
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
        status: invitationStatus,
        invitation_url: invitationUrl,
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
    URL,
    AbortSignal,
    console: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  return { api: vmModule.exports, calls, services, logs };
}
test("candidate invitation access binds provider object and rejects unsafe or finished links", async () => {
  const own = fixture({ invitationStatus: "pending" });
  assert.equal((await own.api.candidateInvitation("tenant", "order-uuid")).url, "https://apply.checkrhq-staging.net/invite/test/fixture");
  for (const opts of [{ invitationStatus: "completed" }, { invitationStatus: "pending", invitationUrl: "https://evil.example/invite/test" }, { invitationStatus: "pending", invitationUrl: "http://apply.checkrhq-staging.net/invite/test" }])
    await assert.rejects(fixture(opts).api.candidateInvitation("tenant", "order-uuid"));
});
test("OAuth token exchange uses documented client credentials form, not a client ID as an API key", async () => {
  const f = fixture();
  await f.api.connect("tenant", "authorization-code");
  const request = f.calls.find(c => c.url.endsWith("/oauth/tokens"));
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(request.options.body.get("client_id"), "fixture");
  assert.equal(request.options.body.get("client_secret"), "fixture");
  assert.equal(request.options.body.get("code"), "authorization-code");
  const saved = f.services.find(c => c.op === "connect");
  assert.equal(saved.actor, "canonical-owner");
  assert.equal(saved.sealed, "encrypted");
});
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

test("OAuth diagnostics distinguish token rejection, save failure and success without sensitive values", async () => {
  for (const options of [{ tokenStatus: 422 }, { saveError: true }, {}]) {
    const f = fixture(options);
    if (Object.keys(options).length) await assert.rejects(f.api.connect("private-employer", "private-code"));
    else await f.api.connect("private-employer", "private-code");
    const logs = JSON.stringify(f.logs);
    for (const secret of ["private-employer", "private-code", "secret-provider-detail", "secret-database-detail", "canonical-owner", "encrypted"])
      assert.equal(logs.includes(secret), false);
    assert.match(logs, /checkr_oauth_token_response/);
    if (options.tokenStatus) { assert.match(logs, /422/); assert.match(logs, /token_exchange/); assert.equal(f.services.some(s => s.op === "connect"), false); }
    else if (options.saveError) assert.match(logs, /save_connection/);
    else assert.match(logs, /checkr_oauth_connection_saved/);
  }
});
