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
  participant = "20000000-0000-4000-8000-000000000001";
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
async function checkrFixture() {
  const f = await fixture();
  await f.db.exec(`reset role;
 create table public.wf_student_profiles(student_id text,user_id text,school_id text);
 create table public.wf_referrals(student_id text,employer_id text,institution_id text,hiring_need_id text,status text);
 create table public.wf_hiring_needs(hiring_need_id text,assigned_hiring_manager_user_id text);
 create function security.student_referral_consent_status(s text,i text) returns jsonb language sql as $$select '{"allowed":true}'::jsonb$$;
 insert into public.users values('reviewer','00000000-0000-4000-8000-000000000004','reviewer@example.test','Reviewer','One','active');
 insert into public.app_role_memberships values('reviewer','00000000-0000-4000-8000-000000000004','employer','tenant','active','recruiter');
 insert into security.wf_reward_eligibility(user_id,country,born_on) values('student','US','2000-01-01');
 insert into public.wf_screening_permissions values('tenant','owner',true,true,10000,5000),('tenant','reviewer',true,true,10000,5000);
 `);
  await f.db.exec(
    readFileSync(
      new URL(
        "../supabase/staging/migrations/20261006225000_workforce_checkr_sandbox.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const svc = async (input) => {
    await f.db.exec("reset role;set role service_role");
    return (
      await f.db.query("select public.checkr_service($1::jsonb) result", [
        JSON.stringify(input),
      ])
    ).rows[0].result;
  };
  const auth = async (input) =>
    (
      await f.db.query("select public.checkr_authority($1::jsonb) result", [
        JSON.stringify(input),
      ])
    ).rows[0].result;
  await svc({
    op: "connect",
    employerId: "tenant",
    actor: "owner",
    accountId: "acct_fixture",
    sealed: "encrypted-test-only",
  });
  await svc({ op: "credential", employerId: "tenant", credentialed: true });
  return { ...f, svc, auth };
}
const employerId = "tenant";
const qinput = {
  op: "quote",
  employerId,
  actor: "owner",
  subject: "student",
  audience: "employee",
  slug: "basic",
  name: "Basic",
  price: 6000,
  node: "",
  location: { country: "US", state: "TX", city: "Texarkana" },
};
test("Checkr authority isolates tenants, explicit permissions, subjects and secrets", async () => {
  const { db, actor, auth } = await checkrFixture();
  try {
    await actor(owner);
    let v = await auth({ op: "workspace", employerId });
    assert.equal(v.canManage, true);
    assert.equal(v.subjects[0].id, "student");
    assert.equal(JSON.stringify(v).includes("encrypted-test-only"), false);
    await assert.rejects(
      auth({ op: "quote", employerId, subject: "other", audience: "employee" }),
      /subject denied/,
    );
    await actor(student);
    await assert.rejects(auth({ op: "workspace", employerId }), /scope denied/);
    await actor(other);
    await assert.rejects(auth({ op: "workspace", employerId }), /scope denied/);
    await db.exec("reset role;set role authenticated");
    await assert.rejects(
      db.query("select public.checkr_service('{}')"),
      /permission denied/,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select public.checkr_authority('{}')"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test("quote reservation idempotency, independent approval, hard cap and status minimization", async () => {
  const { db, svc } = await checkrFixture();
  try {
    const q = await svc(qinput);
    const o = await svc({
      op: "prepare",
      employerId,
      actor: "owner",
      quoteId: q.id,
    });
    assert.equal(
      (await svc({ op: "prepare", employerId, actor: "owner", quoteId: q.id }))
        .id,
      o.id,
    );
    await assert.rejects(
      svc({ op: "claim", employerId, actor: "owner", orderId: o.id }),
      /Dispatch denied/,
    );
    await assert.rejects(
      svc({ op: "approve", employerId, actor: "owner", orderId: o.id }),
      /approver required/,
    );
    await svc({ op: "approve", employerId, actor: "reviewer", orderId: o.id });
    const q2 = await svc(qinput);
    await assert.rejects(
      svc({ op: "prepare", employerId, actor: "owner", quoteId: q2.id }),
      /limit exceeded/,
    );
    await db.exec(
      "reset role;update public.wf_screening_permissions set can_review=false where user_id='reviewer'",
    );
    await assert.rejects(
      svc({ op: "claim", employerId, actor: "owner", orderId: o.id }),
      /Independent approval required/,
    );
    await db.exec(
      "reset role;update public.wf_screening_permissions set can_review=true where user_id='reviewer'",
    );
    const claim = await svc({
      op: "claim",
      employerId,
      actor: "owner",
      orderId: o.id,
    });
    assert.equal(claim.email, "student@example.test");
    await assert.rejects(
      svc({ op: "claim", employerId, actor: "owner", orderId: o.id }),
      /progress/,
    );
    await svc({
      op: "candidate",
      employerId,
      orderId: o.id,
      candidateId: "candidate_fixture",
    });
    await svc({
      op: "submitted",
      employerId,
      orderId: o.id,
      candidateId: "candidate_fixture",
      invitationId: "invitation_fixture",
    });
    await assert.rejects(
      svc({
        op: "status",
        employerId,
        orderId: o.id,
        invitationId: "wrong",
        candidateId: "candidate_fixture",
      }),
      /binding mismatch/,
    );
    await svc({
      op: "status",
      employerId,
      orderId: o.id,
      invitationId: "invitation_fixture",
      candidateId: "candidate_fixture",
      invitationStatus: "completed",
      reportId: "report_fixture",
      reportStatus: "complete",
    });
    await svc({
      op: "status",
      employerId,
      orderId: o.id,
      invitationId: "invitation_fixture",
      candidateId: "candidate_fixture",
      invitationStatus: "completed",
      reportId: "report_fixture",
      reportStatus: "processing",
    });
    await db.exec("reset role");
    assert.equal(
      (await db.query("select report_status from security.wf_checkr_dispatch"))
        .rows[0].report_status,
      "complete",
    );
    assert.equal(
      (await db.query("select count(*)::int n from public.wf_screening_orders"))
        .rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("minors, expired quotes, revoked permissions and ambiguous old submissions stay blocked", async () => {
  const { db, svc } = await checkrFixture();
  try {
    await db.exec(
      "reset role;update security.wf_reward_eligibility set born_on=current_date-interval '16 years'",
    );
    await assert.rejects(svc(qinput), /Adult eligibility/);
    await db.exec(
      "reset role;update security.wf_reward_eligibility set born_on='2000-01-01'",
    );
    const q = await svc({ ...qinput, price: 1000 });
    await db.exec(
      `reset role;update security.wf_checkr_quotes set expires_at=now()-interval '1 minute'`,
    );
    await assert.rejects(
      svc({ op: "prepare", employerId, actor: "owner", quoteId: q.id }),
      /eligibility changed/,
    );
    const q2 = await svc({ ...qinput, price: 1000 });
    const o = await svc({
      op: "prepare",
      employerId,
      actor: "owner",
      quoteId: q2.id,
    });
    await db.exec(
      "reset role;update public.wf_screening_permissions set can_order=false where user_id='owner'",
    );
    await assert.rejects(
      svc({ op: "claim", employerId, actor: "owner", orderId: o.id }),
      /Dispatch denied/,
    );
    await db.exec(
      "reset role;update public.wf_screening_permissions set can_order=true where user_id='owner';update security.wf_checkr_dispatch set started_at=now()-interval '24 hours'",
    );
    await assert.rejects(
      svc({ op: "claim", employerId, actor: "owner", orderId: o.id }),
      /reconciliation/,
    );
    await assert.rejects(
      svc({ op: "cancel", employerId, actor: "owner", orderId: o.id }),
      /cannot be cancelled/,
    );
  } finally {
    await db.close();
  }
});
test("signed event replay stays reconcilable and only matching account/order is routed", async () => {
  const { db, svc } = await checkrFixture();
  try {
    const q = await svc({ ...qinput, price: 1000 });
    const o = await svc({
      op: "prepare",
      employerId,
      actor: "owner",
      quoteId: q.id,
    });
    await svc({ op: "claim", employerId, actor: "owner", orderId: o.id });
    await svc({
      op: "candidate",
      employerId,
      orderId: o.id,
      candidateId: "candidate_fixture",
    });
    await svc({
      op: "submitted",
      employerId,
      orderId: o.id,
      candidateId: "candidate_fixture",
      invitationId: "invitation_fixture",
    });
    const event = {
      op: "event",
      eventId: "evt_fixture",
      accountId: "acct_fixture",
      objectId: "invitation_fixture",
      kind: "invitation.completed",
    };
    assert.equal((await svc(event)).orderId, o.id);
    assert.equal((await svc(event)).orderId, o.id);
    await db.exec("reset role");
    assert.equal(
      (await db.query("select count(*)::int n from security.wf_checkr_events"))
        .rows[0].n,
      1,
    );
    assert.equal(
      (
        await svc({
          ...event,
          eventId: "evt_foreign",
          accountId: "wrong_account",
        })
      ).ignored,
      true,
    );
  } finally {
    await db.close();
  }
});
