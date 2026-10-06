import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migration = readFileSync(
  new URL(
    "../supabase/staging/migrations/20261006004543_workforce_reward_screening_controls.sql",
    import.meta.url,
  ),
  "utf8",
);
const foundation = readFileSync(
  new URL(
    "../supabase/staging/migrations/20261005214848_workforce_pro_points_programs_badges.sql",
    import.meta.url,
  ),
  "utf8",
);
const helpers = foundation.slice(
  foundation.indexOf("create function security.pro_actor()"),
  foundation.indexOf("create function security.pro_award("),
);
const owner = "00000000-0000-4000-8000-000000000001",
  student = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003";
const program = "10000000-0000-4000-8000-000000000001",
  participant = "20000000-0000-4000-8000-000000000001",
  key = "30000000-0000-4000-8000-000000000001";
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema security;create schema auth;grant usage on schema security,auth to authenticated,service_role,anon;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.auth',true),'')::uuid$$;
 create table public.users(user_id text primary key,auth_user_id uuid,email text,first_name text,last_name text,status text);
 create table public.contractors(contractor_id text primary key,approval_status text,account_status text);
 create table public.wf_institutions(institution_id text primary key,active boolean);
 create table public.app_role_memberships(user_id text,auth_user_id uuid,scope_type text,scope_id text,status text,role text);
 create table public.wf_incentive_programs(id uuid primary key,owner_type text,owner_id text,status text,template text,terms text,terms_version integer);
 create table public.wf_incentive_participants(id uuid primary key,program_id uuid references public.wf_incentive_programs(id),user_id text,status text,accepted_version integer);
 create table public.wf_incentive_score_ledger(id uuid primary key,participant_id uuid,points integer,submission_id uuid,entry_type text);
 create function security.is_admin() returns boolean language sql as $$select false$$;
 create function security.has_employer_role(e text,roles text[]) returns boolean language sql as $$select exists(select 1 from public.app_role_memberships where auth_user_id=auth.uid() and scope_id=e and scope_type in ('employer','contractor') and role=any(roles) and status='active')$$;
 ${helpers}
 insert into public.users values('owner','${owner}','owner@example.test','Owner','One','active'),('student','${student}','student@example.test','Student','One','active'),('other','${other}','other@example.test','Other','One','active');
 insert into public.contractors values('tenant','approved','active'),('other-tenant','approved','active');
 insert into public.wf_institutions values('school',true);
 insert into public.app_role_memberships values('owner','${owner}','employer','tenant','active','employer_owner'),('student','${student}','employer','tenant','active','employer_employee'),('other','${other}','employer','other-tenant','active','employer_owner');
 insert into public.wf_incentive_programs values('${program}','employer','tenant','draft','earn_redeem','Fixture terms',1);
 insert into public.wf_incentive_participants values('${participant}','${program}','student','active',2);`);
  await db.exec(migration);
  async function actor(id) {
    await db.exec(
      `reset role;select set_config('test.auth','${id}',false);set role authenticated`,
    );
  }
  async function action(input) {
    return (
      await db.query("select public.reward_action($1::jsonb) result", [
        JSON.stringify(input),
      ])
    ).rows[0].result;
  }
  await actor(owner);
  await action({ op: "account", ownerType: "employer", ownerId: "tenant" });
  await action({
    op: "policy",
    programId: program,
    centsPerBlock: 100,
    creditsPerBlock: 100,
    minimumCredits: 100,
    approval: "admin",
    productId: "fixture-gift-card",
  });
  await db.exec(
    `reset role;update security.wf_reward_accounts set sealed_tokens='local-test-only',organization_id='fixture-org',balance_cents=500,balance_at=now();`,
  );
  await actor(owner);
  await action({ op: "allocate", programId: program, cents: 500 });
  await db.exec(
    `reset role;update public.wf_incentive_programs set status='active';insert into public.wf_incentive_score_ledger values(gen_random_uuid(),'${participant}',200,gen_random_uuid(),'award');`,
  );
  return { db, actor, action };
}
test("migration, canonical owner scope, minor earning, redemption and service grants", async () => {
  const { db, actor, action } = await fixture();
  try {
    await actor(other);
    await assert.rejects(
      action({ op: "allocate", programId: program, cents: 1 }),
      /Reward scope denied/,
    );
    assert.equal(
      (await db.query("select public.reward_workspace() result")).rows[0].result
        .requests.length,
      0,
    );
    await actor(student);
    await action({ op: "eligibility", country: "US", bornOn: "2014-01-01" });
    await assert.rejects(
      action({
        op: "redeem",
        participantId: participant,
        credits: 100,
        requestKey: key,
      }),
      /eligible US adult/,
    );
    assert.equal(
      (await db.query("select public.reward_workspace() result")).rows[0].result
        .credits[0].credits,
      200,
    );
    await assert.rejects(
      db.query('select public.reward_service(\'{"op":"claim"}\')'),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from public.wf_reward_requests"),
      /permission denied/,
    );
    await action({ op: "eligibility", country: "US", bornOn: "2000-01-01" });
    const first = await action({
      op: "redeem",
      participantId: participant,
      credits: 100,
      requestKey: key,
    });
    assert.equal(first.status, "pending");
    assert.equal(
      (
        await action({
          op: "redeem",
          participantId: participant,
          credits: 100,
          requestKey: key,
        })
      ).id,
      first.id,
    );
    await assert.rejects(
      action({
        op: "redeem",
        participantId: participant,
        credits: 200,
        requestKey: key,
      }),
      /retry conflicts/,
    );
    await actor(owner);
    await action({ op: "approve", requestId: first.id });
    await assert.rejects(
      action({
        op: "policy",
        programId: program,
        centsPerBlock: 200,
        creditsPerBlock: 100,
        minimumCredits: 100,
        approval: "admin",
        productId: "fixture-gift-card",
      }),
      /fixed at activation/,
    );
    await db.exec("reset role;set role service_role");
    const service = async (input) =>
      (
        await db.query("select public.reward_service($1::jsonb) result", [
          JSON.stringify(input),
        ])
      ).rows[0].result;
    let claim = await service({ op: "claim_issue", requestId: first.id });
    await assert.rejects(
      service({ op: "claim_issue", requestId: first.id }),
      /in progress/,
    );
    await service({
      op: "finish",
      accountId: claim.accountId,
      lease: claim.lease,
      requestId: first.id,
      status: "reconciliation_required",
      providerStatus: "UNCONFIRMED",
    });
    claim = await service({ op: "claim_issue", requestId: first.id });
    await service({
      op: "finish",
      accountId: claim.accountId,
      lease: claim.lease,
      requestId: first.id,
      status: "issued",
      providerStatus: "EXECUTED",
      orderId: "fixture-order",
      rewardId: "fixture-reward",
    });
    claim = await service({ op: "claim_issue", requestId: first.id });
    await service({
      op: "finish",
      accountId: claim.accountId,
      lease: claim.lease,
      requestId: first.id,
      status: "reconciliation_required",
      providerStatus: "UNCONFIRMED",
    });
    await actor(student);
    assert.equal(
      (await db.query("select public.reward_workspace() result")).rows[0].result
        .requests[0].status,
      "issued",
    );
    await assert.rejects(
      action({ op: "cancel", requestId: first.id }),
      /require reconciliation/,
    );
    await db.exec("reset role;set role service_role");
    claim = await service({ op: "claim_issue", requestId: first.id });
    await service({
      op: "finish",
      accountId: claim.accountId,
      lease: claim.lease,
      requestId: first.id,
      status: "cancelled",
      providerStatus: "CANCELED",
      orderId: "fixture-order",
      rewardId: "fixture-reward",
    });
    await actor(student);
    const projection = (
      await db.query("select public.reward_workspace() result")
    ).rows[0].result;
    assert.equal(projection.credits[0].credits, 200);
    assert.equal(projection.requests[0].status, "cancelled");
    assert.equal(JSON.stringify(projection).includes("local-test-only"), false);
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select public.reward_workspace()"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test("finite budget preserves points; unfunded award reversal cannot consume earlier credits", async () => {
  const { db } = await fixture();
  try {
    await db.exec(
      `reset role;insert into public.wf_incentive_score_ledger values('40000000-0000-4000-8000-000000000001','${participant}',400,'50000000-0000-4000-8000-000000000001','award');insert into public.wf_incentive_score_ledger values(gen_random_uuid(),'${participant}',-400,'50000000-0000-4000-8000-000000000001','reversal');`,
    );
    assert.equal(
      Number(
        (
          await db.query(
            `select security.reward_credit_balance('${participant}') balance`,
          )
        ).rows[0].balance,
      ),
      200,
    );
    assert.equal(
      Number(
        (
          await db.query(
            `select sum(points) score from public.wf_incentive_score_ledger`,
          )
        ).rows[0].score,
      ),
      200,
    );
  } finally {
    await db.close();
  }
});
test("screening delegation, independent caps, retry binding and unconditional public execution gate", async () => {
  const { db, actor } = await fixture();
  try {
    const screen = async (input) =>
      (
        await db.query("select public.screening_action($1::jsonb) result", [
          JSON.stringify(input),
        ])
      ).rows[0].result;
    await actor(other);
    await assert.rejects(
      screen({
        op: "permission",
        employerId: "tenant",
        userId: "student",
        canOrder: true,
        canReview: false,
        monthlyLimitCents: 1000,
        approvalAboveCents: 200,
      }),
      /scope denied/,
    );
    await actor(owner);
    await screen({
      op: "permission",
      employerId: "tenant",
      userId: "student",
      canOrder: true,
      canReview: false,
      monthlyLimitCents: 1000,
      approvalAboveCents: 200,
    });
    await actor(student);
    await screen({
      op: "bundle",
      employerId: "tenant",
      name: "Draft bundle",
      checks: ["Provider approval required"],
    });
    await assert.rejects(
      screen({ op: "order", employerId: "tenant" }),
      /Employment-approved product/,
    );
    await assert.rejects(
      db.query(
        `select security.screening_reserve('tenant','student','student','employee',array['check'],600,'${key}')`,
      ),
      /permission denied/,
    );
    await db.exec("reset role");
    const reserve = async (cents, retry) =>
      (
        await db.query(
          "select security.screening_reserve('tenant','student','student','employee',array['check'],$1,$2::uuid) id",
          [cents, retry],
        )
      ).rows[0].id;
    const id = await reserve(600, key);
    assert.equal(await reserve(600, key), id);
    await assert.rejects(reserve(601, key), /retry conflicts/);
    assert.equal(
      (
        await db.query(
          "select status from public.wf_screening_orders where id=$1",
          [id],
        )
      ).rows[0].status,
      "pending_approval",
    );
    await assert.rejects(
      reserve(500, "30000000-0000-4000-8000-000000000002"),
      /Monthly screening limit/,
    );
    await reserve(200, "30000000-0000-4000-8000-000000000003");
    assert.equal(
      (
        await db.query(
          "select count(*) n from public.wf_screening_orders where status='reserved'",
        )
      ).rows[0].n,
      1,
    );
    await db.exec(
      "update public.contractors set account_status='suspended' where contractor_id='tenant'",
    );
    await actor(student);
    await assert.rejects(
      db.query("select public.screening_workspace('tenant')"),
      /scope denied/,
    );
  } finally {
    await db.close();
  }
});
