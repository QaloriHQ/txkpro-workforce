import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migration = readFileSync(
  new URL(
    "../supabase/staging/migrations/20261006010935_workforce_reward_screening_controls.sql",
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
async function fixture(central = false) {
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
  if (central) {
    await db.exec(`create table public.wf_incentive_activities(id uuid,program_id uuid,title text,kind text,audience text,instructions text,points integer,repeat_period text,daily_cap integer,weekly_cap integer,weekdays integer[],options jsonb,version integer,enabled boolean);
      create table public.wf_incentive_submissions(id uuid,activity_id uuid,participant_id uuid,period_key text,activity_version integer,terms_version integer,evidence text,answer integer,status text,reason text,reviewed_at timestamptz,submitted_at timestamptz);
      create table public.wf_pro_ledger(id uuid,student_id text,category text,rule_code text,points integer,source_key text);
      alter table public.wf_incentive_programs add column ends_at timestamptz default now()+interval '30 days';
      alter table public.wf_incentive_participants add column kind text;
      alter table public.wf_incentive_participants add column invited_by text;
      alter table public.wf_incentive_participants add column expires_at timestamptz;
      alter table public.wf_incentive_participants alter column id set default gen_random_uuid();
      create table public.wf_student_profiles(student_id text,user_id text,school_id text);
      create table public.wf_incentive_audit(program_id uuid,actor text,event text,target_id uuid,detail jsonb);`);
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/staging/migrations/20261006040640_workforce_central_reward_funding.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  }
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
  if (central)
    await db.exec(
      "update security.wf_reward_accounts set account_mode='central',webhook_ready=true,setup_at=now(),backed_cents=case when owner_type='employer' then 500 else 0 end",
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

test("central funding isolates sponsors, verifies payment/backing, replays once and retains held balances", async () => {
  const { db, actor, action } = await fixture(true);
  try {
    const auth = async (input) =>
      (
        await db.query(
          "select public.reward_funding_authority($1::jsonb) result",
          [JSON.stringify(input)],
        )
      ).rows[0].result;
    const svc = async (input) =>
      (
        await db.query(
          "select public.reward_funding_service($1::jsonb) result",
          [JSON.stringify(input)],
        )
      ).rows[0].result;
    await actor(student);
    await assert.rejects(
      auth({
        op: "setup",
        ownerType: "employer",
        ownerId: "tenant",
        acceptTerms: true,
      }),
      /scope denied/,
    );
    await assert.rejects(
      db.query("select public.reward_funding_service('{}')"),
      /permission denied/,
    );
    await actor(other);
    await assert.rejects(
      auth({ ownerType: "employer", ownerId: "tenant" }),
      /scope denied/,
    );
    await actor(owner);
    await assert.rejects(
      auth({
        op: "setup",
        ownerType: "employer",
        ownerId: "tenant",
        acceptTerms: false,
      }),
      /Accept funding/,
    );
    await auth({
      op: "setup",
      ownerType: "employer",
      ownerId: "tenant",
      acceptTerms: true,
    });
    await db.exec("reset role;set role service_role");
    const quote = {
      op: "quote",
      ownerType: "employer",
      ownerId: "tenant",
      actor: "owner",
      principalCents: 100,
      platformFeeCents: 500,
      thirdPartyFeeCents: 25,
      totalCents: 625,
      method: "card",
      pricingVersion: "fixture-v1",
      requestKey: key,
    };
    const f = await svc(quote);
    for (const op of ["documents", "reconcile"]) {
      await actor(owner);
      assert.equal((await auth({ op, fundingId: f.id })).ownerId, "tenant");
      for (const denied of [student, other]) {
        await actor(denied);
        await assert.rejects(auth({ op, fundingId: f.id }), /scope denied/);
      }
    }
    await db.exec("reset role;set role service_role");
    assert.equal((await svc(quote)).id, f.id);
    await assert.rejects(
      svc({ ...quote, principalCents: 101 }),
      /retry conflicts/,
    );
    await svc({ op: "session", fundingId: f.id, sessionId: "cs_test_fixture" });
    const paid = {
      op: "payment_event",
      fundingId: f.id,
      sessionId: "cs_test_fixture",
      totalCents: 625,
      currency: "usd",
      live: false,
      eventId: "evt_fixture",
      kind: "paid",
      paymentId: "pi_fixture",
    };
    await assert.rejects(svc({ ...paid, totalCents: 100 }), /binding mismatch/);
    await assert.rejects(svc({ ...paid, live: true }), /binding mismatch/);
    assert.equal((await svc(paid)).status, "paid");
    assert.equal((await svc(paid)).status, "paid");
    const back = {
      op: "back",
      fundingId: f.id,
      invoiceId: "inv_fixture",
      invoiceStatus: "PAID",
      currency: "USD",
      cents: 100,
    };
    await assert.rejects(svc(back), /Paid provider invoice/);
    await svc({ op: "invoice_claim", fundingId: f.id });
    await assert.rejects(
      svc({ op: "invoice_claim", fundingId: f.id }),
      /requires reconciliation/,
    );
    await svc({ op: "invoice", fundingId: f.id, invoiceId: "inv_fixture" });
    await assert.rejects(
      svc({ ...back, invoiceStatus: "OPEN" }),
      /Paid provider invoice/,
    );
    await assert.rejects(svc(back), /Refresh confirmed/);
    await db.exec(
      "reset role;update security.wf_reward_accounts set balance_cents=1000,balance_at=now();set role service_role",
    );
    assert.equal((await svc(back)).status, "backed");
    assert.equal((await svc(back)).status, "backed");
    await actor(owner);
    let view = (await db.query("select public.reward_workspace() result"))
      .rows[0].result;
    assert.equal(
      Number(view.accounts.find((a) => a.ownerId === "tenant").balanceCents),
      600,
    );
    assert.equal(
      Number(view.accounts.find((a) => a.ownerId === "tenant").availableCents),
      100,
    );
    await action({ op: "allocate", programId: program, cents: 100 });
    await assert.rejects(
      action({ op: "allocate", programId: program, cents: 1 }),
      /sponsor funding is insufficient/,
    );
    await db.exec("reset role;set role service_role");
    await svc({ ...paid, eventId: "evt_refund", kind: "hold" });
    await svc({ ...paid, eventId: "evt_stale_paid", kind: "paid" });
    assert.equal((await svc({ op: "read", fundingId: f.id })).status, "hold");
    await actor(owner);
    view = (await db.query("select public.reward_workspace() result")).rows[0]
      .result;
    assert.equal(
      Number(view.accounts.find((a) => a.ownerId === "tenant").balanceCents),
      600,
    );
    assert.equal(
      view.accounts.find((a) => a.ownerId === "tenant").frozen,
      true,
    );
    await actor(student);
    await action({ op: "eligibility", country: "US", bornOn: "2000-01-01" });
    await assert.rejects(
      action({
        op: "redeem",
        participantId: participant,
        credits: 100,
        requestKey: "30000000-0000-4000-8000-000000000010",
      }),
      /on hold/,
    );
    await actor(other);
    view = (await db.query("select public.reward_workspace() result")).rows[0]
      .result;
    assert.equal(view.funding.length, 0);
    await db.exec(
      "reset role;select set_config('test.auth','',false);set role anon",
    );
    await assert.rejects(
      db.query("select public.reward_funding_authority('{}')"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("winner finalization pays equal tied prizes atomically, keeps score separate and cannot repeat", async () => {
  const { db, actor, action } = await fixture(true);
  try {
    await db.exec(
      `reset role;update public.wf_incentive_programs set status='draft',template='competition';insert into public.wf_incentive_participants(id,program_id,user_id,status,accepted_version) values('20000000-0000-4000-8000-000000000002','${program}','other','active',2);insert into public.wf_incentive_score_ledger values(gen_random_uuid(),'20000000-0000-4000-8000-000000000002',200,gen_random_uuid(),'award');`,
    );
    await actor(owner);
    await action({
      op: "policy",
      programId: program,
      centsPerBlock: 100,
      creditsPerBlock: 100,
      minimumCredits: 100,
      approval: "admin",
      productId: "fixture-gift-card",
      winnerRank: 1,
      winnerCredits: 200,
    });
    await db.exec(
      `reset role;update public.wf_incentive_programs set status='ended';`,
    );
    await actor(owner);
    await assert.rejects(
      action({ op: "finalize_winners", programId: program }),
      /budget insufficient/,
    );
    await db.exec(
      "reset role;update public.wf_reward_policies set allocated_cents=1000;update security.wf_reward_accounts set backed_cents=1000 where owner_id='tenant'",
    );
    await actor(owner);
    await action({ op: "finalize_winners", programId: program });
    await action({ op: "finalize_winners", programId: program });
    await assert.rejects(
      action({
        op: "award",
        programId: program,
        participantId: participant,
        credits: 1,
        reason: "extra",
        requestKey: key,
      }),
      /disclosed winner/,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*) n from public.wf_reward_credits where source_key like 'final-winner:%'",
        )
      ).rows[0].n,
      2,
    );
    assert.equal(
      Number(
        (
          await db.query(
            "select sum(points) n from public.wf_incentive_score_ledger",
          )
        ).rows[0].n,
      ),
      400,
    );
    assert.equal(
      Number(
        (
          await db.query(
            "select sum(credits) n from public.wf_reward_credits where source_key like 'final-winner:%'",
          )
        ).rows[0].n,
      ),
      400,
    );
  } finally {
    await db.close();
  }
});

test("PRO invites canonical employees only and gives no operational workspace membership", async () => {
  const { db, actor } = await fixture(true);
  try {
    await db.exec(
      `reset role;create or replace function security.is_admin() returns boolean language sql as $$select auth.uid()='${owner}'::uuid$$;insert into public.wf_incentive_programs(id,owner_type,owner_id,status,template,terms,terms_version) values('10000000-0000-4000-8000-000000000002','platform','txkpro','active','earn_redeem','Terms',1);`,
    );
    const invite = async (email) =>
      db.query("select security.pro_action($1::jsonb)", [
        JSON.stringify({
          op: "invite",
          programId: "10000000-0000-4000-8000-000000000002",
          kind: "employee",
          email,
        }),
      ]);
    await actor(other);
    await assert.rejects(
      invite("student@example.test"),
      /management scope denied/,
    );
    await actor(owner);
    await assert.rejects(
      invite("other@example.test"),
      /employee membership required/,
    );
    await invite("student@example.test");
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*) n from public.app_role_memberships where user_id='student'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select kind from public.wf_incentive_participants where program_id='10000000-0000-4000-8000-000000000002'",
        )
      ).rows[0].kind,
      "employee",
    );
  } finally {
    await db.close();
  }
});

test("topup backing waits for full settlement, is replay safe and cannot reuse aggregate backing", async () => {
  const { db } = await fixture(true);
  try {
    await db.exec("reset role;set role service_role");
    const svc = async (input) =>
      (
        await db.query(
          "select public.reward_funding_service($1::jsonb) result",
          [JSON.stringify(input)],
        )
      ).rows[0].result;
    const f = await svc({
      op: "quote",
      ownerType: "employer",
      ownerId: "tenant",
      actor: "owner",
      principalCents: 500,
      platformFeeCents: 500,
      thirdPartyFeeCents: 0,
      totalCents: 1000,
      method: "ach",
      pricingVersion: "fixture",
      requestKey: "30000000-0000-4000-8000-000000000011",
    });
    await svc({ op: "session", fundingId: f.id, sessionId: "cs_test_topup" });
    await svc({
      op: "payment_event",
      fundingId: f.id,
      sessionId: "cs_test_topup",
      totalCents: 1000,
      currency: "usd",
      live: false,
      eventId: "evt_topup",
      kind: "paid",
      paymentId: "pi_topup",
    });
    await svc({
      op: "topup_bind",
      fundingId: f.id,
      sourceId: "BANK_TEST",
      topupId: "TOPUP_TEST",
    });
    await assert.rejects(
      svc({
        op: "topup_bind",
        fundingId: f.id,
        sourceId: "OTHER",
        topupId: "TOPUP_TEST",
      }),
      /binding conflict/,
    );
    await assert.rejects(
      svc({ op: "invoice_claim", fundingId: f.id }),
      /already created/,
    );
    const back = {
      op: "topup_back",
      fundingId: f.id,
      topupId: "TOPUP_TEST",
      topupStatus: "fully_credited",
      currency: "USD",
      cents: 500,
    };
    await assert.rejects(
      svc({ ...back, topupStatus: "partially_credited" }),
      /Fully credited/,
    );
    await assert.rejects(svc(back), /Refresh confirmed/);
    await db.exec(
      "reset role;update security.wf_reward_accounts set balance_cents=1000,balance_at=now();set role service_role",
    );
    assert.equal((await svc(back)).status, "backed");
    assert.equal((await svc(back)).status, "backed");
    assert.equal(
      (await svc({ op: "provider_lookup", resourceId: "TOPUP_TEST" })).id,
      f.id,
    );
    await svc({ op: "provider_hold", fundingId: f.id });
    await assert.rejects(svc(back), /Fully credited/);
    await db.exec("reset role");
    assert.equal(
      Number(
        (
          await db.query(
            "select backed_cents from security.wf_reward_accounts where owner_id='tenant'",
          )
        ).rows[0].backed_cents,
      ),
      1000,
    );
  } finally {
    await db.close();
  }
});
test("one central lease serializes provider operations across sponsors", async () => {
  const { db, actor } = await fixture(true);
  try {
    await actor(other);
    await db.query("select public.reward_funding_authority($1::jsonb)", [
      JSON.stringify({
        op: "setup",
        ownerType: "employer",
        ownerId: "other-tenant",
        acceptTerms: true,
      }),
    ]);
    await db.exec(
      "reset role;update security.wf_reward_accounts set sealed_tokens='fixture-central-marker' where owner_id='other-tenant';set role service_role",
    );
    const svc = async (input) =>
      (
        await db.query("select public.reward_service($1::jsonb) result", [
          JSON.stringify(input),
        ])
      ).rows[0].result;
    const claim = await svc({
      op: "claim",
      ownerType: "employer",
      ownerId: "tenant",
    });
    await assert.rejects(
      svc({ op: "claim", ownerType: "employer", ownerId: "other-tenant" }),
      /in progress/,
    );
    await svc({
      op: "release",
      accountId: claim.accountId,
      lease: claim.lease,
    });
    const second = await svc({
      op: "claim",
      ownerType: "employer",
      ownerId: "other-tenant",
    });
    await assert.rejects(
      svc({
        op: "balance",
        accountId: claim.accountId,
        lease: claim.lease,
        currency: "USD",
        cents: 99999,
      }),
      /lease unavailable/,
    );
    await svc({
      op: "release",
      accountId: second.accountId,
      lease: second.lease,
    });
  } finally {
    await db.close();
  }
});

test("earned balances remain redeemable after cycle end and accepted participation cancellation",async()=>{
 const {db,actor,action}=await fixture(true);
 try {
  await db.exec("reset role;update public.wf_incentive_programs set status='ended',ends_at=now()-interval '5 years';update public.wf_incentive_participants set status='cancelled'");
  await actor(student);await action({op:"eligibility",country:"US",bornOn:"2000-01-01"});
  const view=(await db.query("select public.reward_workspace() result")).rows[0].result;
  assert.equal(view.credits[0].credits,200);
  assert.equal((await action({op:"redeem",participantId:participant,credits:100,requestKey:key})).status,"pending");
 }finally{await db.close();}
});
