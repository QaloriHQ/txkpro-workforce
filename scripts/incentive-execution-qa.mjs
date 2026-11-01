import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fixture as baseFixture } from "./employer-incentives-qa.mjs";
import { initialDefinition } from "../lib/incentives/contracts.ts";
const migrationPath =
  "supabase/staging/migrations/" +
  readdirSync("supabase/staging/migrations").find((p) =>
    p.endsWith("_incentive_execution.sql"),
  );
const sql = readFileSync(migrationPath, "utf8");
const OWNER = "00000000-0000-4000-8000-000000000001",
  OTHER = "00000000-0000-4000-8000-000000000002",
  WORKER = "00000000-0000-4000-8000-000000000003",
  REVIEWER = "00000000-0000-4000-8000-000000000004";
async function fixture(options = {}) {
  const f = await baseFixture();
  const { db, actor, action } = f;
  await db.exec(
    `reset role;alter table public.app_role_memberships add column user_id text;update public.app_role_memberships m set user_id=u.user_id from public.users u where u.auth_user_id=m.auth_user_id;drop table public.wf_reward_requests;drop table public.wf_reward_credits;drop function security.reward_credit_balance(uuid);grant usage on schema security,auth to service_role;`,
  );
  await db.exec(
    readFileSync(
      "supabase/staging/migrations/20261006010935_workforce_reward_screening_controls.sql",
      "utf8",
    ),
  );
  await db.exec(
    `alter table security.wf_reward_accounts add column frozen boolean not null default false;create table public.wf_placements(placement_id text,employer_id text,student_id text,employment_start_date date,start_confirmed_at timestamptz,status text,ended_at timestamptz);insert into public.users values('reviewer','${REVIEWER}','active','Reviewer','Four','r@test.invalid');insert into public.app_role_memberships(auth_user_id,scope_id,scope_type,role,status,user_id) values('${REVIEWER}','tenant','employer','employer_employee','active','reviewer');`,
  );
  await db.exec(sql);
  await actor(OWNER);
  const d = {
    ...initialDefinition(),
    name: "Execution program",
    startsAt: new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10),
    endsAt: "2028-12-31",
    terms: "Explicit sandbox program terms",
    publicRecognition: true,
    minimumCredits: 100,
    expiryMonths: 12,
    givingAllowance: 100,
    recipientMonthlyCap: 200,
    teams: [{ id: "crew", name: "Crew one", participantIds: [] }],
    milestones: [
      {
        id: "review",
        title: "Verified reviews",
        recipient: options.crew ? "crew" : "individual",
        points: 101,
        match: "all",
        conditions: [{ metric: "reviews", operator: "gte", value: 1 }],
        safetyRequired: true,
        approval: options.safety ? "safety_then_manager" : "manager",
      },
      {
        id: "ninety",
        title: "90-day service",
        recipient: "individual",
        points: 100,
        match: "all",
        conditions: [{ metric: "service_days", operator: "gte", value: 90 }],
        safetyRequired: false,
        approval: "manager",
      },
    ],
  };
  const { id: programId } = await action({
    op: "create",
    ownerId: "tenant",
    definition: d,
  });
  await action({ op: "publish", programId, revision: 1 });
  await action({
    op: "engine_setup",
    programId,
    productId: "fixture-card",
    autoRedeem: false,
  });
  await db.exec(
    `reset role;update public.wf_reward_policies set allocated_cents=10000 where program_id='${programId}';update public.wf_incentive_programs set status='active' where id='${programId}';insert into public.wf_incentive_participants(program_id,user_id,kind,status,invited_by,accepted_version,expires_at) select '${programId}',u,'employee','active','owner',(select terms_version from public.wf_incentive_programs where id='${programId}'),now()+interval '300 days' from unnest(array['worker','reviewer'])u;insert into security.wf_reward_eligibility(user_id,country,born_on) values('worker','US','1990-01-01'),('reviewer','US','1990-01-01');`,
  );
  const participants = (
    await db.query(
      "select id,user_id from public.wf_incentive_participants where program_id=$1",
      [programId],
    )
  ).rows;
  const worker = participants.find((p) => p.user_id === "worker").id;
  const reviewer = participants.find((p) => p.user_id === "reviewer").id;
  await actor(OWNER);
  await action({
    op: "crew_assignment",
    programId,
    crewId: "crew",
    revision: 0,
    memberIds: [worker, reviewer],
  });
  async function engine(input) {
    return action({ programId, ...input });
  }
  async function view() {
    return (
      await db.query("select public.incentive_engine_workspace($1) result", [
        programId,
      ])
    ).rows[0].result;
  }
  return { ...f, engine, view, programId, worker, reviewer };
}
test("execution migration and verified awards, retries, crew splits and budget protection", async () => {
  const { db, actor, engine, view, programId, worker } = await fixture({
    crew: true,
  });
  try {
    const event = await engine({
      op: "metric_event",
      sourceKey: "job-1",
      milestoneId: "review",
      crewId: "crew",
      metrics: { reviews: 1 },
      evidence: "Verified client feedback",
      safetyComplete: true,
    });
    await engine({
      op: "review_event",
      eventId: event.id,
      decision: "approve",
      reason: "Checks verified",
    });
    let w = await view();
    assert.equal(
      w.lots.reduce((n, l) => n + l.points, 0),
      101,
    );
    assert.deepEqual(w.lots.map((l) => l.points).sort(), [50, 51]);
    const retry = await engine({
      op: "metric_event",
      sourceKey: "job-1",
      milestoneId: "review",
      crewId: "crew",
      metrics: { reviews: 1 },
      evidence: "Verified client feedback",
      safetyComplete: true,
    });
    assert.equal(retry.id, event.id);
    assert.equal((await view()).lots.length, 2);
    await actor(OTHER);
    await assert.rejects(
      engine({
        op: "metric_event",
        sourceKey: "wrong",
        milestoneId: "review",
        participantId: worker,
        metrics: { reviews: 1 },
        evidence: "No scope",
        safetyComplete: true,
      }),
      /scope denied/,
    );
    await db.exec(
      `reset role;update public.wf_reward_policies set allocated_cents=102 where program_id='${programId}'`,
    );
    await actor(OWNER);
    const waiting = await engine({
      op: "metric_event",
      sourceKey: "job-2",
      milestoneId: "review",
      crewId: "crew",
      metrics: { reviews: 1 },
      evidence: "Another verified job",
      safetyComplete: true,
    });
    w = await view();
    assert.equal(
      w.events.find((e) => e.id === waiting.id).status,
      "budget_wait",
    );
    assert.equal(w.lots.length, 2);
    await assert.rejects(
      engine({ op: "engine_setup", productId: "different-card" }),
      /before participant acceptance/,
    );
  } finally {
    await db.close();
  }
});
test("two distinct approval stages and own award denial", async () => {
  const { db, actor, engine, view, worker, reviewer } = await fixture({
    safety: true,
  });
  try {
    await engine({
      op: "grant_role",
      participantId: reviewer,
      role: "safety_reviewer",
    });
    const e = await engine({
      op: "metric_event",
      sourceKey: "stage-job",
      milestoneId: "review",
      participantId: worker,
      metrics: { reviews: 1 },
      evidence: "Evidence",
      safetyComplete: true,
    });
    await actor(WORKER);
    await assert.rejects(
      engine({
        op: "review_event",
        eventId: e.id,
        decision: "approve",
        reason: "Self review",
      }),
      /Independent reviewer/,
    );
    await actor(REVIEWER);
    await engine({
      op: "review_event",
      eventId: e.id,
      decision: "approve",
      reason: "Safety checked",
    });
    await assert.rejects(
      engine({
        op: "review_event",
        eventId: e.id,
        decision: "approve",
        reason: "Both stages",
      }),
      /Separate manager/,
    );
    await actor(OWNER);
    await engine({
      op: "review_event",
      eventId: e.id,
      decision: "approve",
      reason: "Manager approval",
    });
    assert.equal((await view()).lots[0].points, 101);
  } finally {
    await db.close();
  }
});
test("monthly peer allowance is reserved once, capped, reviewed independently and never self-issued", async () => {
  const { db, actor, engine, view, worker, reviewer } = await fixture();
  try {
    await engine({ op: "tick" });
    await actor(WORKER);
    const nomination = await engine({
      op: "peer_points",
      recipientEmail: "r@test.invalid",
      points: 40,
      requestKey: "peer-one",
      note: "Mentored the crew",
    });
    let w = await view();
    assert.equal(
      w.allowances.find((a) => a.participant_id === worker).spent,
      40,
    );
    await engine({
      op: "peer_points",
      recipientEmail: "r@test.invalid",
      points: 40,
      requestKey: "peer-one",
      note: "Mentored the crew",
    });
    assert.equal(
      (await view()).allowances.find((a) => a.participant_id === worker).spent,
      40,
    );
    await assert.rejects(
      engine({
        op: "peer_points",
        recipientEmail: "w@test.invalid",
        points: 10,
        requestKey: "self",
        note: "Self",
      }),
      /Valid peer/,
    );
    await assert.rejects(
      engine({
        op: "peer_points",
        recipientEmail: "r@test.invalid",
        points: 90,
        requestKey: "over",
        note: "Too many",
      }),
      /allowance insufficient/,
    );
    await actor(OWNER);
    await engine({
      op: "review_event",
      eventId: nomination.id,
      decision: "approve",
      reason: "Verified contribution",
    });
    assert.equal(
      (await view()).lots.find((l) => l.participant_id === reviewer).points,
      40,
    );
    await actor(REVIEWER);
    const reciprocal = await engine({
      op: "peer_points",
      recipientEmail: "w@test.invalid",
      points: 20,
      requestKey: "reciprocal",
      note: "Thanks back",
    });
    await actor(OWNER);
    assert.match(
      (await view()).events.find((e) => e.id === reciprocal.id).reason,
      /Reciprocal/,
    );
    await engine({
      op: "review_event",
      eventId: reciprocal.id,
      decision: "reject",
      reason: "No separate qualifying contribution",
    });
    assert.equal(
      (await view()).allowances.find((a) => a.participant_id === reviewer)
        .spent,
      0,
    );
  } finally {
    await db.close();
  }
});
test("lot reservation/refund, expiry, termination window and service-only outbox authorization", async () => {
  const { db, actor, engine, view, programId, worker } = await fixture();
  try {
    const e = await engine({
      op: "metric_event",
      sourceKey: "bank",
      milestoneId: "review",
      participantId: worker,
      metrics: { reviews: 1 },
      evidence: "Verified review",
      safetyComplete: true,
    });
    await engine({
      op: "review_event",
      eventId: e.id,
      decision: "approve",
      reason: "Verified",
    });
    await actor(WORKER);
    const request = await engine({
      op: "engine_redeem",
      points: 100,
      requestKey: "10000000-0000-4000-8000-000000000001",
    });
    await assert.rejects(
      engine({
        op: "engine_redeem",
        points: 100,
        requestKey: "10000000-0000-4000-8000-000000000002",
      }),
      /Available reward points insufficient/,
    );
    assert.equal((await view()).lots[0].consumed, 100);
    await assert.rejects(
      db.query('select public.incentive_jobs(\'{"op":"run"}\')'),
      /permission denied/,
    );
    await db.exec(
      `reset role;update public.wf_reward_requests set status='cancelled' where id='${request.id}';insert into public.wf_reward_credits(participant_id,credits,source_key,reason) values('${worker}',100,'release:${request.id}','Verified cancellation')`,
    );
    await actor(WORKER);
    assert.equal((await view()).lots[0].consumed, 0);
    await db.exec(
      `reset role;update public.wf_incentive_lots set expires_at=now()-interval '1 hour' where program_id='${programId}';select security.incentive_tick('${programId}')`,
    );
    await actor(WORKER);
    assert.equal((await view()).lots[0].consumed, 101);
    await db.exec(`reset role`);
    assert.equal(
      (await db.query("select security.reward_credit_balance($1) n", [worker]))
        .rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
test("retention uses verified dates, preserves idempotency across later days and unlocks finite company perks", async () => {
  const { db, actor, engine, view, worker } = await fixture();
  try {
    await engine({
      op: "employment",
      participantId: worker,
      // Use a one-day buffer because the policy evaluates anniversaries in its
      // configured timezone, while this test process and Postgres may be UTC.
      startedOn: new Date(Date.now() - 91 * 86400000)
        .toISOString()
        .slice(0, 10),
      evidence: "HR confirmed employment record",
    });
    await engine({
      op: "tier",
      title: "Company mentor",
      milestoneId: "ninety",
      threshold: 1,
      perk: "Company gear",
      capacity: 1,
    });
    await engine({ op: "tick" });
    await engine({ op: "tick" });
    let w = await view();
    assert.equal(w.lots.filter((l) => l.participant_id === worker).length, 1);
    assert.equal(w.perks.length, 1);
    await actor(WORKER);
    await engine({ op: "perk", perkId: w.perks[0].id, status: "requested" });
    await assert.rejects(
      engine({
        op: "perk",
        perkId: w.perks[0].id,
        status: "fulfilled",
        note: "Self fulfillment",
      }),
      /scope denied/,
    );
    await actor(OWNER);
    await engine({
      op: "perk",
      perkId: w.perks[0].id,
      status: "approved",
      note: "Gear capacity reserved",
    });
    await engine({
      op: "perk",
      perkId: w.perks[0].id,
      status: "fulfilled",
      note: "Gear handed over; receipt recorded",
    });
    assert.equal((await view()).perks[0].status, "fulfilled");
    assert.equal((await view()).board.length, 0);
    await actor(WORKER);
    await engine({ op: "recognition_consent", enabled: true });
  } finally {
    await db.close();
  }
});
test("scoped integration mapping, quarantine, replay identity and credential revocation", async () => {
  const { db, actor, engine, view, worker } = await fixture();
  try {
    const integration = await engine({
      op: "integration",
      name: "HRMS",
      tokenHash: "a".repeat(64),
      mapping: {
        types: ["metric", "employment"],
        metrics: { reviews: "approvedReviewCount" },
      },
    });
    await engine({
      op: "bind_integration",
      integrationId: integration.id,
      externalId: "external-worker",
      participantId: worker,
    });
    await db.exec(`reset role;set role service_role`);
    const payload = {
      eventId: "event-1",
      type: "metric",
      employeeId: "external-worker",
      milestoneId: "review",
      values: { approvedReviewCount: 1 },
      evidence: "Source verification",
      safetyComplete: true,
    };
    let result = (
      await db.query("select public.incentive_ingest($1,$2) result", [
        "a".repeat(64),
        payload,
      ])
    ).rows[0].result;
    assert.equal(result.accepted, true);
    assert.equal(
      (
        await db.query("select public.incentive_ingest($1,$2) result", [
          "a".repeat(64),
          payload,
        ])
      ).rows[0].result.duplicate,
      true,
    );
    result = (
      await db.query("select public.incentive_ingest($1,$2) result", [
        "a".repeat(64),
        { ...payload, eventId: "bad", employeeId: "unmapped" },
      ])
    ).rows[0].result;
    assert.equal(result.quarantined, true);
    await assert.rejects(
      db.query("select public.incentive_ingest($1,$2)", [
        "b".repeat(64),
        payload,
      ]),
      /authentication denied/,
    );
    await actor(OWNER);
    const w = await view();
    assert.ok(w.integrations.every((i) => !("token_hash" in i)));
    await engine({ op: "disable_integration", integrationId: integration.id });
    await db.exec("reset role;set role service_role");
    await assert.rejects(
      db.query("select public.incentive_ingest($1,$2)", [
        "a".repeat(64),
        { ...payload, eventId: "revoked" },
      ]),
      /authentication denied/,
    );
  } finally {
    await db.close();
  }
});
test("verified safety reporting freezes crew progress, pays once and permits the published micro-redemption minimum override", async () => {
  const { db, actor, engine, action, view, programId, worker } =
    await fixture();
  try {
    await engine({
      op: "safety_progress",
      crewId: "crew",
      count: 7,
      evidence: "Seven verified safe check-ins",
    });
    const ordinary = await engine({
      op: "metric_event",
      sourceKey: "before-hazard",
      milestoneId: "review",
      participantId: worker,
      metrics: { reviews: 1 },
      evidence: "Verified review before safety award",
      safetyComplete: true,
    });
    await engine({
      op: "review_event",
      eventId: ordinary.id,
      decision: "approve",
      reason: "Ordinary reward verified",
    });
    await actor(WORKER);
    const report = await action({
      op: "safety",
      programId,
      sourceKey: "hazard-shared-reference",
      body: "Verified near-miss evidence",
    });
    await actor(OWNER);
    await assert.rejects(
      engine({
        op: "safety_progress",
        crewId: "crew",
        count: 8,
        evidence: "Attempt during remediation",
      }),
      /frozen/,
    );
    await action({
      op: "verify",
      programId,
      caseId: report.id,
      reason: "Independently verified hazard",
    });
    let w = await view();
    assert.equal(w.progress[0].count, 7);
    assert.equal(w.progress[0].paused, true);
    const lot = w.lots.find((l) =>
      w.events.some(
        (e) => e.id === l.event_id && e.milestone_id === "safety-report",
      ),
    );
    assert.equal(lot.points, 1000);
    await action({
      op: "resolve",
      programId,
      caseId: report.id,
      reason: "Remediation completed",
    });
    assert.equal((await view()).progress[0].paused, false);
    await assert.rejects(
      engine({
        op: "safety_progress",
        crewId: "crew",
        count: 0,
        evidence: "Reset attempt",
      }),
      /never reset/,
    );
    await actor(WORKER);
    const request = await engine({
      op: "engine_redeem",
      points: 1,
      safetyLot: lot.id,
      requestKey: "10000000-0000-4000-8000-000000000010",
    });
    assert.ok(request.id);
    assert.equal((await view()).lots.find((l) => l.id === lot.id).consumed, 1);
    assert.equal(
      (await view()).lots.find((l) => l.event_id === ordinary.id).consumed,
      0,
    );
  } finally {
    await db.close();
  }
});
test("native retention requires confirmed starts and expiry/departure availability is visible before settlement", async () => {
  const { db, actor, engine, view, programId, worker } = await fixture();
  try {
    await db.exec(
      `reset role;insert into public.wf_student_profiles(student_id,user_id,school_id) values('student-worker','worker','school');insert into public.wf_placements(placement_id,employer_id,student_id,employment_start_date,status) values('placement-worker','tenant','student-worker',current_date-91,'active');`,
    );
    await actor(OWNER);
    await engine({ op: "tick" });
    assert.equal((await view()).lots.length, 0);
    await db.exec(
      `reset role;update public.wf_placements set start_confirmed_at=now() where placement_id='placement-worker'`,
    );
    await actor(OWNER);
    await engine({ op: "tick" });
    let w = await view();
    assert.equal(w.lots.length, 1);
    assert.equal(w.employment[0].source, "confirmed_placement");
    await db.exec(
      `reset role;update public.wf_incentive_lots set policy=policy||'{"departure":"window","departureDays":1}'::jsonb where program_id='${programId}';update public.wf_incentive_employment set ended_on=current_date-2 where participant_id='${worker}'`,
    );
    await actor(WORKER);
    w = await view();
    assert.equal(w.lots[0].available, 0);
    const bank = (await db.query("select public.incentive_bank() result"))
      .rows[0].result;
    assert.equal(bank.accounts[0].available, 0);
    await assert.rejects(
      engine({
        op: "engine_redeem",
        points: 100,
        requestKey: "10000000-0000-4000-8000-000000000011",
      }),
      /Available reward/,
    );
  } finally {
    await db.close();
  }
});
test("integration changed replays fail and reconciled quarantined events can be retried once", async () => {
  const { db, actor, engine, worker } = await fixture();
  try {
    const link = await engine({
      op: "integration",
      name: "ERP nested mapping",
      tokenHash: "c".repeat(64),
      mapping: {
        types: ["metric"],
        metrics: { reviews: "job.verifiedReviews" },
      },
    });
    await db.exec("reset role;set role service_role");
    const event = {
      eventId: "recoverable",
      employeeId: "bound-later",
      type: "metric",
      milestoneId: "review",
      values: { job: { verifiedReviews: 1 } },
      evidence: "Source evidence",
      safetyComplete: true,
    };
    assert.equal(
      (
        await db.query("select public.incentive_ingest($1,$2) result", [
          "c".repeat(64),
          event,
        ])
      ).rows[0].result.quarantined,
      true,
    );
    await actor(OWNER);
    await engine({
      op: "bind_integration",
      integrationId: link.id,
      externalId: "bound-later",
      participantId: worker,
    });
    await engine({
      op: "retry_ingestion",
      integrationId: link.id,
      eventKey: "recoverable",
      reason: "Employee binding corrected; original payload will be replayed",
    });
    await db.exec("reset role;set role service_role");
    assert.equal(
      (
        await db.query("select public.incentive_ingest($1,$2) result", [
          "c".repeat(64),
          event,
        ])
      ).rows[0].result.accepted,
      true,
    );
    await assert.rejects(
      db.query("select public.incentive_ingest($1,$2)", [
        "c".repeat(64),
        { ...event, evidence: "Altered evidence" },
      ]),
      /replay conflicts/,
    );
  } finally {
    await db.close();
  }
});

test("funding delays cannot skip safety approval, paused awards wait, and delegated roles can be revoked", async () => {
  const { db, actor, engine, view, programId, worker, reviewer } =
    await fixture({ safety: true });
  try {
    await db.exec(
      `reset role; update public.wf_reward_policies set allocated_cents=0 where program_id='${programId}'`,
    );
    await actor(OWNER);
    const event = await engine({
      op: "metric_event",
      sourceKey: "funding-wait",
      milestoneId: "review",
      participantId: worker,
      metrics: { reviews: 1 },
      evidence: "Verified review",
      safetyComplete: true,
    });
    assert.equal((await view()).events[0].status, "budget_wait");
    await engine({
      op: "grant_role",
      participantId: reviewer,
      role: "safety_reviewer",
    });
    await actor(REVIEWER);
    await engine({
      op: "review_event",
      eventId: event.id,
      decision: "approve",
      reason: "Safety independently verified",
    });
    await actor(OWNER);
    assert.equal((await view()).events[0].status, "review");
    await actor(REVIEWER);
    await assert.rejects(
      engine({
        op: "review_event",
        eventId: event.id,
        decision: "approve",
        reason: "Cannot do both",
      }),
      /Separate manager/,
    );
    await actor(OWNER);
    await db.exec(
      `reset role; update public.wf_reward_policies set allocated_cents=10000 where program_id='${programId}';update public.wf_incentive_definitions set paused=true where program_id='${programId}'`,
    );
    await actor(OWNER);
    await engine({
      op: "review_event",
      eventId: event.id,
      decision: "approve",
      reason: "Manager confirms eligibility",
    });
    assert.equal((await view()).lots.length, 0);
    assert.equal((await view()).events[0].status, "budget_wait");
    await engine({
      op: "revoke_role",
      participantId: reviewer,
      role: "safety_reviewer",
    });
    assert.equal((await view()).roles.length, 0);
    await assert.rejects(
      engine({
        op: "grant_role",
        participantId: reviewer,
        role: "crew_lead",
        crewId: "unassigned",
      }),
      /belong to assigned crew/,
    );
  } finally {
    await db.close();
  }
});

test("a late review starts a fresh notified exception window and retains the award reservation", async () => {
  const { db, actor, engine, view, worker } = await fixture();
  try {
    const event = await engine({
      op: "metric_event",
      sourceKey: "late-review",
      milestoneId: "review",
      participantId: worker,
      metrics: { reviews: 1 },
      evidence: "Verified client feedback",
      safetyComplete: true,
    });
    const reserved = (await view()).events[0].reserved_cents;
    await db.exec(
      `reset role;update public.wf_incentive_events set dispute_until=now()-interval '2 days' where id='${event.id}'`,
    );
    await actor(OWNER);
    await engine({
      op: "review_event",
      eventId: event.id,
      decision: "reject",
      reason: "Third-party delay requires exception evidence",
    });
    const result = (await view()).events[0];
    assert.equal(result.reserved_cents, reserved);
    assert.ok(Date.parse(result.dispute_until) > Date.now() + 47 * 3600000);
    await actor(WORKER);
    assert.ok(
      (await view()).notices.some(
        (n) => n.title === "Milestone decision available",
      ),
    );
    await engine({
      op: "event_dispute",
      eventId: event.id,
      reason: "Supplier delivery log explains delay",
    });
    assert.equal((await view()).events[0].status, "disputed");
  } finally {
    await db.close();
  }
});
