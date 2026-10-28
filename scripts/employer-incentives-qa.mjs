import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  initialDefinition,
  validateDefinition,
  evaluateMilestone,
  splitCrew,
  roi,
} from "../lib/incentives/contracts.ts";
const foundation = readFileSync(
  "supabase/staging/migrations/20261005214848_workforce_pro_points_programs_badges.sql",
  "utf8",
);
const central = readFileSync(
  "supabase/staging/migrations/20261006040640_workforce_central_reward_funding.sql",
  "utf8",
);
const migration = readFileSync(
  `supabase/staging/migrations/${readdirSync("supabase/staging/migrations").find((name) => name.endsWith("_employer_incentive_engine.sql"))}`,
  "utf8",
);
const OWNER = "00000000-0000-4000-8000-000000000001",
  OTHER = "00000000-0000-4000-8000-000000000002",
  EMPLOYEE = "00000000-0000-4000-8000-000000000003";
function definition() {
  return {
    ...initialDefinition(),
    name: "Quality",
    terms: "Original employee terms",
    milestones: [
      {
        id: "review",
        title: "Customer appreciation",
        recipient: "individual",
        points: 100,
        match: "all",
        conditions: [{ metric: "reviews", operator: "gte", value: 1 }],
        safetyRequired: true,
        approval: "manager",
      },
    ],
  };
}
export async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema security;create schema auth;grant usage on schema security,auth to authenticated,anon;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.auth',true),'')::uuid$$;
create table public.users(user_id text primary key,auth_user_id uuid,status text,first_name text,last_name text,email text);
create table public.contractors(contractor_id text primary key,approval_status text,account_status text,business_name text default 'Fixture employer');
create table public.app_role_memberships(auth_user_id uuid,scope_id text,scope_type text,role text,status text);
create table public.wf_institutions(institution_id text primary key,active boolean);
create table public.wf_student_profiles(student_id text primary key,user_id text,school_id text);
create function security.is_admin() returns boolean language sql as $$select false$$;
create function security.has_employer_role(i text,r text[]) returns boolean language sql as $$select exists(select 1 from public.app_role_memberships where auth_user_id=auth.uid() and scope_id=i and scope_type='employer' and role=any(r) and status='active')$$;
insert into public.users values('owner','${OWNER}','active','Owner','One','o@test.invalid'),('other','${OTHER}','active','Other','Two','x@test.invalid'),('worker','${EMPLOYEE}','active','Worker','Three','w@test.invalid');
insert into public.contractors(contractor_id,approval_status,account_status) values('tenant','approved','active'),('other','approved','active');
insert into public.app_role_memberships values('${OWNER}','tenant','employer','employer_owner','active'),('${OTHER}','other','employer','employer_owner','active'),('${EMPLOYEE}','tenant','employer','employer_employee','active');`);
  await db.exec(
    foundation.slice(
      foundation.indexOf("create table public.wf_pro_rules"),
      foundation.indexOf("create function security.pro_award("),
    ),
  );
  await db.exec(
    central.slice(
      central.indexOf(
        "create or replace function security.pro_action(input jsonb)",
      ),
    ),
  );
  await db.exec(`create function public.pro_action(p_input jsonb) returns jsonb language sql security invoker as $$select security.pro_action(p_input)$$;grant execute on function public.pro_action(jsonb),security.pro_action(jsonb) to authenticated;
create function security.pro_workspace() returns jsonb language sql as $$select jsonb_build_object('programs','[]'::jsonb,'owners','[]'::jsonb)$$;`);
  await db.exec(
    `create table public.wf_reward_credits(id uuid,participant_id uuid,credits integer,reason text,created_at timestamptz);create table public.wf_reward_requests(id uuid,participant_id uuid,credits integer,status text);create function security.reward_credit_balance(r uuid) returns bigint language sql as $$select coalesce(sum(credits),0) from public.wf_reward_credits where participant_id=r$$;`,
  );
  await db.exec(migration);
  async function actor(id) {
    await db.exec(
      `reset role;select set_config('test.auth','${id}',false);set role authenticated`,
    );
  }
  async function action(input) {
    return (
      await db.query("select public.incentive_action($1::jsonb) result", [
        JSON.stringify(input),
      ])
    ).rows[0].result;
  }
  await actor(OWNER);
  return { db, actor, action };
}
test("typed rules refuse missing evidence, require safety, preserve crew totals and handle ROI zeros", () => {
  const d = definition();
  assert.deepEqual(validateDefinition(d, true), []);
  assert.equal(
    evaluateMilestone(d.milestones[0], { reviews: 1 }, false).eligible,
    false,
  );
  assert.equal(evaluateMilestone(d.milestones[0], {}, true).eligible, false);
  assert.equal(
    evaluateMilestone(d.milestones[0], { reviews: 1 }, true).eligible,
    true,
  );
  assert.deepEqual(
    splitCrew(10, ["b", "a", "c"]).map((x) => x.points),
    [4, 3, 3],
  );
  assert.throws(() => splitCrew(10, ["a", "a"]));
  assert.equal(
    roi({
      departures: 0,
      replacementCost: 0,
      avoidedDepartures: 0,
      incidentCost: 0,
      reduction: 0,
      programCost: 0,
    }).roi,
    null,
  );
  assert.ok(validateDefinition({ ...d, creditsPerBlock: 0 }, true).length);
});
test("owner scoped create/save, concurrency conflict, immutable publication and fail-closed monetary operations", async () => {
  const { db, actor, action } = await fixture();
  try {
    const created = await action({
      op: "create",
      ownerId: "tenant",
      definition: definition(),
    });
    assert.equal(created.revision, 1);
    await actor(OTHER);
    await assert.rejects(
      action({
        op: "save",
        programId: created.id,
        revision: 1,
        definition: definition(),
      }),
      /scope denied/,
    );
    await actor(EMPLOYEE);
    await assert.rejects(
      action({ op: "create", ownerId: "tenant", definition: definition() }),
      /scope denied/,
    );
    await actor(OWNER);
    await assert.rejects(
      action({
        op: "save",
        programId: created.id,
        revision: 0,
        definition: definition(),
      }),
      /Revision conflict/,
    );
    const updated = await action({
      op: "save",
      programId: created.id,
      revision: 1,
      definition: { ...definition(), description: "Saved revision" },
    });
    assert.equal(updated.revision, 2);
    await action({ op: "publish", programId: created.id, revision: 2 });
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*) n from public.wf_incentive_definition_versions",
        )
      ).rows[0].n,
      1,
    );
    await db.exec(
      `update public.wf_incentive_programs set status='active' where id='${created.id}'`,
    );
    await actor(OWNER);
    await assert.rejects(
      action({ op: "publish", programId: created.id, revision: 2 }),
      /changed published terms/,
    );
    await assert.rejects(
      action({ op: "award", programId: created.id }),
      /activation required/,
    );
    await action({ op: "pause", programId: created.id });
    await assert.rejects(
      db.query("select public.pro_action($1::jsonb)", [
        JSON.stringify({ op: "submit", programId: created.id }),
      ]),
      /paused or archived/,
    );
    await assert.rejects(
      db.query("select * from public.wf_incentive_definitions"),
      /permission denied/,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select public.incentive_workspace()"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test("confidential safety evidence, independent review, preserved open remediation and duplicate protection", async () => {
  const { db, actor, action } = await fixture();
  try {
    const { id } = await action({
      op: "create",
      ownerId: "tenant",
      definition: definition(),
    });
    await action({ op: "publish", programId: id, revision: 1 });
    await db.exec(
      `reset role;update public.wf_incentive_programs set status='active' where id='${id}';insert into public.wf_incentive_participants(program_id,user_id,kind,status,invited_by,accepted_version,expires_at) values('${id}','worker','employee','active','owner',1,now()+interval '10 days')`,
    );
    await actor(EMPLOYEE);
    const report = await action({
      op: "safety",
      programId: id,
      sourceKey: "hazard-1",
      body: "Cable across walkway",
    });
    await assert.rejects(
      action({
        op: "safety",
        programId: id,
        sourceKey: "hazard-1",
        body: "Duplicate",
      }),
      /duplicate key/,
    );
    await assert.rejects(
      action({
        op: "verify",
        programId: id,
        caseId: report.id,
        reason: "Self approval",
      }),
      /Independent reviewer/,
    );
    await actor(OTHER);
    const hidden = (
      await db.query("select public.incentive_workspace() result")
    ).rows[0].result;
    assert.equal(Object.keys(hidden.cases).length, 0);
    await assert.rejects(
      action({
        op: "verify",
        programId: id,
        caseId: report.id,
        reason: "Wrong tenant",
      }),
      /scope denied/,
    );
    await actor(OWNER);
    await action({
      op: "verify",
      programId: id,
      caseId: report.id,
      reason: "Verified hazard; remedy assigned",
    });
    await db.exec(
      `reset role;update public.wf_incentive_cases set deadline=now()-interval '1 hour' where id='${report.id}'`,
    );
    await actor(OWNER);
    const open = (await db.query("select public.incentive_workspace() result"))
      .rows[0].result;
    assert.equal(open.cases[id][0].status, "verified");
    await action({
      op: "resolve",
      programId: id,
      caseId: report.id,
      reason: "Hazard removed and checked",
    });
    await assert.rejects(
      action({
        op: "verify",
        programId: id,
        caseId: report.id,
        reason: "Repeat",
      }),
      /Invalid case transition/,
    );
  } finally {
    await db.close();
  }
});
test("dispute window, immutable decision, single appeal and own bank reservations", async () => {
  const { db, actor, action } = await fixture();
  try {
    const { id } = await action({
      op: "create",
      ownerId: "tenant",
      definition: definition(),
    });
    await action({ op: "publish", programId: id, revision: 1 });
    await db.exec(
      `reset role;update public.wf_incentive_programs set status='active' where id='${id}';insert into public.wf_incentive_participants(program_id,user_id,kind,status,invited_by,accepted_version,expires_at) values('${id}','worker','employee','active','owner',1,now()+interval '10 days');insert into public.wf_incentive_activities(program_id,title,kind,audience,instructions,private_points,repeat_period,daily_cap,weekly_cap) values('${id}','Project','milestone','employee','Evidence',10,'once',100,100);insert into public.wf_incentive_submissions(activity_id,participant_id,period_key,activity_version,terms_version,evidence,status,reviewed_by,reviewed_at) select a.id,r.id,'once',1,1,'Recorded delay','declined','owner',now() from public.wf_incentive_activities a join public.wf_incentive_participants r on r.program_id=a.program_id where a.program_id='${id}' and a.engine_key is null;`,
    );
    const decision = (
      await db.query(
        "select id,participant_id from public.wf_incentive_submissions",
      )
    ).rows[0];
    await actor(EMPLOYEE);
    const c = await action({
      op: "dispute",
      programId: id,
      sourceKey: decision.id,
      body: "Supplier delay, delivery receipt attached",
    });
    await actor(OWNER);
    await action({
      op: "decline_case",
      programId: id,
      caseId: c.id,
      reason: "Insufficient supporting evidence",
    });
    await actor(EMPLOYEE);
    await action({
      op: "appeal",
      programId: id,
      caseId: c.id,
      reason: "Additional delivery confirmation",
    });
    await actor(OWNER);
    await action({
      op: "decline_case",
      programId: id,
      caseId: c.id,
      reason: "Independent final review",
    });
    await actor(EMPLOYEE);
    await assert.rejects(
      action({
        op: "appeal",
        programId: id,
        caseId: c.id,
        reason: "Another appeal",
      }),
      /Appeal unavailable/,
    );
    await db.exec(
      `reset role;update public.wf_incentive_submissions set reviewed_at=now()-interval '49 hours' where id='${decision.id}';insert into public.wf_reward_credits values(gen_random_uuid(),'${decision.participant_id}',1000,'Earned',now()),(gen_random_uuid(),'${decision.participant_id}',-300,'Reserved',now());insert into public.wf_reward_requests values(gen_random_uuid(),'${decision.participant_id}',300,'pending')`,
    );
    await actor(EMPLOYEE);
    await assert.rejects(
      action({
        op: "dispute",
        programId: id,
        sourceKey: decision.id,
        body: "Too late",
      }),
      /within 48 hours/,
    );
    const bank = (await db.query("select public.incentive_bank() result"))
      .rows[0].result;
    assert.equal(bank.accounts[0].available, 700);
    assert.equal(bank.accounts[0].reservedForRedemption, 300);
    await actor(OTHER);
    assert.equal(
      (await db.query("select public.incentive_bank() result")).rows[0].result
        .accounts.length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("gallery includes more than 50 programs in selected employer only", async () => {
  const { db, actor, action } = await fixture();
  try {
    await db.exec(
      `reset role;insert into public.wf_incentive_programs(owner_type,owner_id,name,template,starts_at,ends_at,terms,created_by) select 'employer','tenant','Program '||i,'combined',now(),now()+interval '20 days','Terms','owner' from generate_series(1,55) i;insert into public.wf_incentive_programs(owner_type,owner_id,name,template,starts_at,ends_at,terms,created_by) values('employer','other','Other tenant','combined',now(),now()+interval '20 days','Private','other')`,
    );
    await actor(OWNER);
    const w = (
      await db.query(
        "select public.incentive_employer_workspace('tenant') result",
      )
    ).rows[0].result;
    assert.equal(w.programs.length, 55);
    await assert.rejects(
      db.query("select public.incentive_employer_workspace('other')"),
      /scope denied/,
    );
    assert.ok(w.programs.every((p) => p.name !== "Other tenant"));
    await action({ op: "create", ownerId: "tenant", definition: definition() });
  } finally {
    await db.close();
  }
});
test("crew membership changes are tenant checked and do not rewrite published definitions", async () => {
  const { db, actor, action } = await fixture();
  try {
    const d = {
      ...definition(),
      teams: [{ id: "crew-1", name: "Field crew", participantIds: [] }],
    };
    const { id } = await action({
      op: "create",
      ownerId: "tenant",
      definition: d,
    });
    await action({ op: "publish", programId: id, revision: 1 });
    await db.exec(
      `reset role;update public.wf_incentive_programs set status='active' where id='${id}';insert into public.wf_incentive_participants(program_id,user_id,kind,status,invited_by,accepted_version,expires_at) values('${id}','worker','employee','active','owner',1,now()+interval '10 days')`,
    );
    const member = (
      await db.query("select id from public.wf_incentive_participants")
    ).rows[0].id;
    await actor(OWNER);
    await action({
      op: "crew_assignment",
      programId: id,
      crewId: "crew-1",
      revision: 0,
      memberIds: [member],
    });
    await assert.rejects(
      action({
        op: "crew_assignment",
        programId: id,
        crewId: "crew-1",
        revision: 0,
        memberIds: [],
      }),
      /Revision conflict/,
    );
    await assert.rejects(
      action({
        op: "crew_assignment",
        programId: id,
        crewId: "crew-1",
        revision: 1,
        memberIds: ["00000000-0000-4000-8000-000000000099"],
      }),
      /scope denied/,
    );
    await actor(EMPLOYEE);
    await assert.rejects(
      action({
        op: "crew_assignment",
        programId: id,
        crewId: "crew-1",
        revision: 1,
        memberIds: [],
      }),
      /management scope denied/,
    );
    await actor(OWNER);
    const w = (await db.query("select public.incentive_workspace() result"))
      .rows[0].result;
    assert.deepEqual(w.assignments[id][0].memberIds, [member]);
    assert.deepEqual(w.configs[0].published.teams[0].participantIds, []);
  } finally {
    await db.close();
  }
});
