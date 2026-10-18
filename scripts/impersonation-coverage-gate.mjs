import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { IMPERSONATION_DATA_PLANE_CERTIFIED } from "../lib/impersonation/session-contract.ts";
import { classifyImpersonationRequest } from "../lib/impersonation/action-policy.ts";

const project = fileURLToPath(new URL("../", import.meta.url));
const sourceDirectories = ["app", "components", "lib"];
const ignored = new Set(["node_modules", ".next", ".git"]);
const supported = /\.(?:ts|tsx|js|jsx)$/;

function sourceFiles(dir) {
  const result = [];
  const scan = target => {
    for (const item of readdirSync(target)) {
      if (ignored.has(item)) continue;
      const path = join(target, item);
      const stat = statSync(path);
      if (stat.isDirectory()) scan(path);
      else if (stat.isFile() && supported.test(path)) result.push(path);
    }
  };
  scan(join(project, dir));
  return result;
}
const files = sourceDirectories.flatMap(sourceFiles);
const relativePath = path => relative(project, path).split(sep).join("/");
const audit = files.map(path => ({ path: relativePath(path), content: readFileSync(path, "utf8") }));
const routes = audit.filter(x => /^app\/api\/.*\/route\.(?:ts|js)$/.test(x.path));
const exportPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

const mutating = routes.map(route => ({
  path: route.path,
  verbs: [...route.content.matchAll(exportPattern)].map(match => match[1] ?? match[2]),
})).filter(route => route.verbs.some(v => v !== "GET"));

const browser = audit.filter(x =>
  (x.path === "lib/supabase/client.ts" || /^["']use client["'];?/m.test(x.content) || /components\//.test(x.path)) &&
  (/createBrowserSupabaseClient\(/.test(x.content) || /createClient\(/.test(x.content) && x.content.includes("@supabase/supabase-js")),
).map(x => x.path);

const sensitive = mutating.filter(({ path }) =>
  /stripe|payment|payout|fund|checkout|wallet|account|auth|admin|invitation|credit|role|permission|message|moderation|safety|screen|verification|delete|remove|user|suspend|profile|campaign/i.test(path));

const rawReview = readFileSync(new URL("../docs/governance/SEC_IMP_02_ROUTE_REVIEW.json", import.meta.url), "utf8");
const review = JSON.parse(rawReview);
function reviewed(x) {
  const entry = review.routes[x.path];
  if (!entry || !Array.isArray(entry.evidence) || entry.evidence.length === 0) return false;
  if (!entry.verifiedActor || !entry.verifiedTarget || !entry.verifiedRevocation) return false;
  // Each action must have route/RPC evidence. High-risk or unreviewed paths
  // MUST be denied, never just audited while they are still permitted.
  const routePath = "/" + x.path.slice("app/".length).split("/route.")[0]
    .split("/").map(part => part.startsWith("[") && part.endsWith("]") ? "example" : part).join("/");
  const blocked = x.verbs.some(verb => {
    const decision = classifyImpersonationRequest(verb, routePath);
    return decision === "deny_high_risk" || decision === "deny_unreviewed";
  });
  return blocked ? entry.verifiedDeny === true : entry.verifiedOrdinaryWriteAudit === true;
}

test("coverage inventory discovers all Next API routes and direct browser Supabase entry points", () => {
  assert.ok(routes.length >= 100, "Unexpected API route count; inspect discovery before enabling impersonation.");
  assert.ok(mutating.length >= 30, "Mutating routes must be included in the coverage inventory.");
  assert.ok(browser.some(p => p.includes("lib/supabase/client")), "Browser Supabase factory not discovered.");
  assert.ok(sensitive.length > 0, "High risk route classification unexpectedly empty.");
});

test("data plane remains locked until 100% API and browser/RLS review is approved", () => {
  if (IMPERSONATION_DATA_PLANE_CERTIFIED) {
    const missing = mutating.filter(route => !reviewed(route)).map(route => route.path);
    const browserMissing = browser.filter(path => !review.browser[path]?.verifiedActorTarget);
    assert.deepEqual(missing, [], "Cannot certify data plane with unreviewed mutating API routes.");
    assert.deepEqual(browserMissing, [], "Cannot certify data plane with unreviewed browser Supabase entry points.");
    assert.equal(review.rls?.verified, true, "Cannot certify data plane without RLS/RPC actor attribution evidence.");
    assert.equal(review.highRiskDenial?.verified, true, "Cannot certify without high-risk provider/RLS/RPC denial coverage.");
    assert.equal(review.issuer?.verified, true, "Cannot certify without an actor-bound token issuer.");
  } else {
    assert.equal(review.issuer?.verified ?? false, false);
  }
});

test("sensitive route families are covered and the registry is not itself the issuer", () => {
  const contract = readFileSync(new URL("../docs/governance/SEC_IMP_FULL_SESSION_CONTRACT.md", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/admin/impersonation/session/route.ts", import.meta.url), "utf8");
  assert.match(contract, /high-risk/);
  assert.match(route, /if \(!impersonationEnabled\(\)\)/);
  assert.ok(sensitive.length >= 10);
  assert.ok(review.notes.includes("NOT approved"), "Explicit deny-by-default review status required.");
});

console.log(JSON.stringify({
  category: "SEC-IMP-02 impersonation certification inventory",
  apiRoutes: routes.length,
  mutatingApiRoutes: mutating.length,
  highRiskCandidateRoutes: sensitive.length,
  browserSupabaseEntryPoints: browser.length,
  reviewedMutationRoutes: mutating.filter(reviewed).length,
  certified: IMPERSONATION_DATA_PLANE_CERTIFIED,
  status: IMPERSONATION_DATA_PLANE_CERTIFIED ? "certified" : "BLOCKED: actor-aware issuer/browser/RLS and audit coverage not yet verified",
  highRiskSample: sensitive.slice(0, 12).map(x => x.path),
}, null, 2));
