import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { seal, unseal } from "../lib/rewards/contracts.ts";
import { sandboxConfigurationIssues } from "../lib/checkr/contracts.ts";
function oauthFixture() {
  const stored = new Map(), connected = [];
  let actor = "owner", allowed = true;
  const env = { CHECKR_SANDBOX_CLIENT_ID: "partner", CHECKR_SANDBOX_CLIENT_SECRET: "secret", CHECKR_SANDBOX_APP_ORIGIN: "https://staging-workforce.txkpro.com", REWARDS_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64") };
  const jar = { set: (key, value, options) => stored.set(key, { value, options }), get: key => stored.get(key), delete: key => stored.delete(key) };
  const mod = { exports: {} };
  const dependencies = {
    "server-only": {}, "next/headers": { cookies: async () => jar }, "node:crypto": crypto,
    "./server": { authority: async () => { if (!allowed) throw new Response("Denied", { status: 403 }); return { actor }; }, connect: async (...args) => connected.push(args) },
    "./contracts": { sandboxConfigurationIssues }, "@/lib/rewards/contracts": { seal, unseal },
  };
  const code = ts.transpileModule(readFileSync(new URL("../lib/checkr/oauth.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: mod.exports, module: mod, require: n => { if (!(n in dependencies)) throw Error(n); return dependencies[n]; }, process: { env }, Date, Buffer, URL, Response, console: { warn() {}, info() {} } });
  return { api: mod.exports, stored, connected, env, actor: a => { actor = a; }, deny: () => { allowed = false; } };
}
test("OAuth binds encrypted secure cookie, state, employer and actor", async () => {
  const f = oauthFixture();
  const { url } = await f.api.beginConnection("tenant");
  const u = new URL(url), cookie = f.stored.get("__Host-checkr-oauth");
  assert.equal(u.origin, "https://partners.checkrhq-staging.net");
  assert.equal(u.searchParams.get("redirect_uri"), "https://staging-workforce.txkpro.com/api/checkr/oauth/callback");
  assert.equal(cookie.options.secure, true); assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.value.includes("tenant"), false);
  await f.api.finishConnection("code", u.searchParams.get("state"));
  assert.deepEqual(f.connected, [["tenant", "code"]]);
  await assert.rejects(f.api.finishConnection("code", u.searchParams.get("state")));
});
test("OAuth denies tampering, wrong actor, expired state and revoked authority", async () => {
  for (const kind of ["state", "actor", "cookie", "expired", "revoked"]) {
    const f = oauthFixture(), { url } = await f.api.beginConnection("tenant");
    let state = new URL(url).searchParams.get("state");
    if (kind === "state") state = "0".repeat(64);
    if (kind === "actor") f.actor("foreign-owner");
    if (kind === "revoked") f.deny();
    const cookie = f.stored.get("__Host-checkr-oauth");
    if (kind === "cookie") cookie.value = "tampered";
    if (kind === "expired") {
      const pending = unseal(cookie.value, f.env.REWARDS_ENCRYPTION_KEY, "checkr:staging:oauth");
      pending.expires = Date.now() - 1;
      cookie.value = seal(pending, f.env.REWARDS_ENCRYPTION_KEY, "checkr:staging:oauth");
    }
    await assert.rejects(f.api.finishConnection("code", state));
    assert.equal(f.connected.length, 0);
  }
});
test("OAuth reports only configuration categories and never credential values", async () => {
  const f = oauthFixture();
  f.env.CHECKR_SANDBOX_APP_ORIGIN = "https://workforce.txkpro.com";
  let failure;
  try { await f.api.beginConnection("tenant"); } catch (error) { failure = error; }
  assert.equal(failure?.status, 503);
  const message = await failure.text();
  assert.match(message, /staging app origin/);
  for (const value of [f.env.CHECKR_SANDBOX_CLIENT_SECRET, f.env.REWARDS_ENCRYPTION_KEY, f.env.CHECKR_SANDBOX_APP_ORIGIN]) assert.equal(message.includes(value), false);
  assert.equal(f.stored.size, 0);
});
test("Checkr return page denies missing/expired employer sessions without a server error or workspace read", async () => {
  let workspaceReads = 0;
  const mod = { exports: {} };
  const component = () => null;
  const dependencies = {
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/link": { default: component },
    "@/components/brand": { Brand: component },
    "@/components/employer/workspace-nav": { EmployerWorkspaceNav: component },
    "@/components/rewards/checkr-panel": { CheckrPanel: component },
    "@/lib/employer/auth": { requireEmployerContext: async () => { throw new Response("Denied", { status: 403 }); } },
    "@/lib/checkr/server": { authority: async () => { workspaceReads++; throw Error("must not read workspace"); } },
    "@/lib/checkr/contracts": { sandboxConfigured: () => true },
  };
  const code = ts.transpileModule(readFileSync(new URL("../app/employer/checkr/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports: mod.exports, module: mod, require: n => { if (!(n in dependencies)) throw Error(n); return dependencies[n]; }, Response });
  const result = await mod.exports.default({ searchParams: Promise.resolve({ connection: "retry" }) });
  assert.match(JSON.stringify(result), /Sign in with an approved employer account/);
  assert.equal(workspaceReads, 0);
});
test("candidate read projection isolates subject and excludes employer-only fields", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema security;
      grant usage on schema security to authenticated;
      create function security.pro_actor() returns text language plpgsql as $$begin if nullif(current_setting('test.actor',true),'') is null then raise exception 'denied' using errcode='42501';end if;return current_setting('test.actor');end$$;
      create table public.contractors(contractor_id text,business_name text);
      create table public.wf_screening_orders(id uuid,employer_id text,subject_user_id text,status text,created_at timestamptz);
      create table security.wf_checkr_quotes(order_id uuid,package_name text);
      create table security.wf_checkr_dispatch(order_id uuid,invitation_id text,invitation_status text,report_status text);
      create table security.wf_checkr_accounts(employer_id text,connected boolean,sealed_token text);
      insert into public.contractors values('tenant','Employer');
      insert into security.wf_checkr_accounts values('tenant',true,'secret');
      insert into public.wf_screening_orders values('00000000-0000-4000-8000-000000000001','tenant','candidate','processing',now());
      insert into security.wf_checkr_quotes values('00000000-0000-4000-8000-000000000001','Basic');
      insert into security.wf_checkr_dispatch values('00000000-0000-4000-8000-000000000001','private-invitation','pending',null);`);
    await db.exec(readFileSync(new URL("../supabase/migrations/20261019194612_ats_05_checkr_candidate_access.sql", import.meta.url), "utf8"));
    const read = async actor => {
      await db.exec("reset role"); await db.query("select set_config('test.actor',$1,false)", [actor]); await db.exec("set role authenticated");
      return (await db.query("select public.checkr_candidate_workspace() as value")).rows[0].value;
    };
    const own = await read("candidate"); assert.equal(own.length, 1); assert.equal(own[0].canOpen, true);
    for (const field of ["sealed_token", "invitation_id", "candidate_id", "result", "quoted_cents", "ordered_by"]) assert.equal(field in own[0], false);
    assert.deepEqual(await read("foreign"), []);
    await assert.rejects(read(""));
    await db.exec("reset role;set role anon"); await assert.rejects(db.query("select public.checkr_candidate_workspace()"));
    await db.exec("reset role;set role service_role"); await assert.rejects(db.query("select public.checkr_candidate_workspace()"));
    await db.exec("reset role;update security.wf_checkr_accounts set connected=false");
    assert.equal((await read("candidate"))[0].canOpen, false);
    await assert.rejects(db.query("select * from security.wf_checkr_accounts"));
  } finally { await db.close(); }
});
