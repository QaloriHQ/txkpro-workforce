import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkMgidPublisherRestApi, checkMgidAdvertiserRestApi, diagnoseMgidApiAccess } from "../lib/mgid/publisher-api.ts";

const valid = { clientId: "123456", token: "test-secret-not-a-real-token" };
const response = (body, status = 200, type = "application/json") =>
  new Response(body, { status, headers: { "content-type": type } });
const repoFile = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("missing or malformed credentials fail closed without upstream requests", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return response("[]"); };
  assert.equal((await checkMgidPublisherRestApi({ clientId: "", token: "", fetcher })).outcome, "missing_configuration");
  assert.equal((await checkMgidPublisherRestApi({ clientId: "123/a", token: valid.token, fetcher })).outcome, "invalid_configuration");
  assert.equal(calls, 0);
});

test("only documented HTTPS publisher report endpoint is requested with server-side bearer authentication", async () => {
  let seenUrl, seenInit;
  const fetcher = async (url, init) => {
    seenUrl = url;
    seenInit = init;
    return response("[]");
  };
  const result = await checkMgidPublisherRestApi({ ...valid, fetcher });
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "authenticated");
  assert.equal(result.openRtbS2S, "not_verified");
  const url = new URL(seenUrl);
  assert.equal(url.origin, "https://api.mgid.com");
  assert.equal(url.pathname, "/v2/pub/account/123456/website-custom-report");
  assert.equal(url.searchParams.get("dateInterval"), "yesterday");
  assert.equal(url.searchParams.get("metrics"), "pageViews");
  assert.equal(url.searchParams.get("limit"), "1");
  assert.equal(seenInit.headers.Authorization, "Bearer " + valid.token);
  assert.equal(seenInit.cache, "no-store");
  assert.equal(seenInit.redirect, "error");
  assert.ok(seenInit.signal instanceof AbortSignal);
  assert.equal(JSON.stringify(result).includes(valid.token), false);
  assert.equal(JSON.stringify(result).includes(valid.clientId), false);
});

test("an empty metrics array still verifies an accepted publisher API request", async () => {
  const value = await checkMgidPublisherRestApi({ ...valid, fetcher: async () => response("[]") });
  assert.deepEqual(value, { ok: true, provider: "mgid", capability: "publisher_rest_reporting", openRtbS2S: "not_verified", outcome: "authenticated", upstreamStatus: 200 });
});

for (const [status, expected] of [[401, "authentication_rejected"], [403, "permission_denied"], [422, "invalid_report_request"], [429, "rate_limited"], [500, "upstream_unavailable"]]) {
  test("HTTP " + status + " is not considered authenticated", async () => {
    const value = await checkMgidPublisherRestApi({
      ...valid, fetcher: async () => response(JSON.stringify({ errors: ["Sensitive message"] }), status),
    });
    assert.equal(value.outcome, expected);
    assert.equal(value.ok, false);
    assert.doesNotMatch(JSON.stringify(value), /Sensitive message/);
  });
}

test("200 with errors, HTML, or oversized JSON cannot produce false authentication", async () => {
  for (const upstream of [
    response('{"errors":["Invalid credentials"]}'),
    response("<html/>", 200, "text/html"),
    response("x".repeat(33_000)),
  ]) {
    const value = await checkMgidPublisherRestApi({ ...valid, fetcher: async () => upstream });
    assert.equal(value.outcome, "unexpected_response");
    assert.equal(value.ok, false);
  }
});

test("timeout and network failure are distinguished without leaking exception details", async () => {
  const timeout = await checkMgidPublisherRestApi({
    ...valid, fetcher: async () => { throw new DOMException("PRIVATE", "TimeoutError"); },
  });
  assert.equal(timeout.outcome, "timed_out");
  assert.equal(JSON.stringify(timeout).includes("PRIVATE"), false);

  const network = await checkMgidPublisherRestApi({
    ...valid, fetcher: async () => { throw new Error("PRIVATE_NETWORK_DETAILS"); },
  });
  assert.equal(network.outcome, "upstream_unavailable");
  assert.equal(JSON.stringify(network).includes("PRIVATE"), false);
});

test("route is staging-only, platform-super-admin only, same-origin, no-store, POST only", () => {
  const route = repoFile("app/api/admin/integrations/mgid/test/route.ts");
  const page = repoFile("app/admin/integrations/mgid/page.tsx");
  const navigation = repoFile("app/admin/page.tsx");
  assert.match(route, /isPlatformSuperAdmin\(account\)/);
  assert.match(route, /VERCEL_ENV !== "preview"/);
  assert.match(route, /VERCEL_GIT_COMMIT_REF !== "staging"/);
  assert.match(route, /request\.headers\.get\("origin"\)/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(page, /isPlatformSuperAdmin\(account\)/);
  assert.match(navigation, /\/admin\/integrations\/mgid/);
});

test("no MGID report values, token, or auction entitlement are exposed to browser", () => {
  const route = repoFile("app/api/admin/integrations/mgid/test/route.ts");
  const client = repoFile("components/admin/mgid-connection-check.tsx");
  assert.match(route, /diagnoseMgidApiAccess/);
  assert.doesNotMatch(client, /MGID_CLIENT_API_TOKEN|MGID_CLIENT_API_ID/);
  assert.match(client, /Native OpenRTB S2S access: Not verified/);
});

test("MGID advertiser endpoint is fixed, read-only, bearer authenticated and checks response account ID", async () => {
  let seenUrl, seenInit;
  const probe = await checkMgidAdvertiserRestApi({
    ...valid, fetcher: async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return response(JSON.stringify({ id: 123456, wallet: { balance: 999999 } }));
    },
  });
  assert.deepEqual(probe, { outcome: "authenticated", upstreamStatus: 200 });
  assert.equal(seenUrl, "https://api.mgid.com/v1/clients/123456");
  assert.equal(seenInit.method, "GET");
  assert.equal(seenInit.cache, "no-store");
  assert.equal(seenInit.redirect, "error");
  assert.equal(seenInit.headers.Authorization, "Bearer " + valid.token);
  assert.ok(seenInit.signal instanceof AbortSignal);
  assert.doesNotMatch(JSON.stringify(probe), /wallet|balance|999999|test-secret/);
});

test("publisher 401 followed by advertiser 200 produces a safe advertiser classification", async () => {
  const urls = [];
  const result = await diagnoseMgidApiAccess({
    ...valid, fetcher: async (url) => {
      urls.push(url);
      return url.includes("/v2/pub/") ? response('{"errors":["bad pub token"]}', 401)
        : response('{"id":123456,"wallet":{"balance":1337}}');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "authentication_rejected");
  assert.equal(result.advertiserProbe?.outcome, "authenticated");
  assert.equal(urls.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /1337|wallet|bad pub token|test-secret/);
});

test("publisher successful auth never probes advertiser API", async () => {
  const urls = [];
  const result = await diagnoseMgidApiAccess({ ...valid, fetcher: async (url) => {
    urls.push(url);
    return response("[]");
  } });
  assert.equal(result.ok, true);
  assert.equal(result.advertiserProbe, undefined);
  assert.equal(urls.length, 1);
});

test("invalid or mismatched advertiser account response is not accepted", async () => {
  const values = [
    response('{"id":999999}'),
    response('{"wallet":{"balance":42}}'),
    response('[]'),
    response('<html/>', 200, 'text/html'),
    response('{"errors":["authentication failed"]}', 200),
  ];
  for (const value of values) {
    const probe = await checkMgidAdvertiserRestApi({ ...valid, fetcher: async () => value });
    assert.equal(probe.outcome, "unexpected_response");
  }
});

test("both API endpoints rejecting 401 does not confirm credentials", async () => {
  const result = await diagnoseMgidApiAccess({ ...valid, fetcher: async () => response('{"errors":"private"}', 401) });
  assert.equal(result.ok, false);
  assert.equal(result.advertiserProbe?.outcome, "authentication_rejected");
  assert.doesNotMatch(JSON.stringify(result), /private/);
});

test("401 diagnostic does not access untrusted hosts or expose environment secret values", () => {
  const route = repoFile("app/api/admin/integrations/mgid/test/route.ts");
  const client = repoFile("components/admin/mgid-connection-check.tsx");
  assert.match(route, /diagnoseMgidApiAccess/);
  assert.match(route, /result\.advertiserProbe\?\.outcome === "authenticated"/);
  assert.match(client, /Advertiser API verified; publisher access not confirmed/);
  assert.doesNotMatch(client, /MGID_CLIENT_API_TOKEN|MGID_CLIENT_API_ID/);
});
