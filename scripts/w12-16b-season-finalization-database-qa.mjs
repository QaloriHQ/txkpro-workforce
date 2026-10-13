import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const source = readFileSync(
  "supabase/staging/migrations/20261013184924_workforce_w12_16b_season_finalization.sql",
  "utf8",
);
// The production seed correctly starts at the 2026 Q4 launch. Move only the
// fixture seed back one quarter so an ended season can exercise finalization.
const migration = source.replaceAll("date '2026-10-01'", "date '2026-07-01'");
const adminAuth = "00000000-0000-4000-8000-000000000001";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema security; create schema auth;
    grant usage on schema public,security,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.auth',true),'')::uuid$$;
    create table public.users(user_id text primary key,auth_user_id uuid,status text);
    create table public.wf_student_profiles(student_id text primary key,user_id text,school_id text,cohort_id text);
    create table public.wf_pro_rules(code text primary key,category text,points integer,daily_count integer,weekly_count integer,enabled boolean,version integer);
    create table public.wf_pro_ledger(
      id uuid primary key default gen_random_uuid(),student_id text,rule_code text,rule_version integer,
      source_key text,source_ref text,category text,requested_points integer,points integer,
      occurred_at timestamptz,recorded_at timestamptz default now(),local_day date,local_week date,
      season date,entry_type text,reverses uuid,reason text
    );
    create table public.wf_student_portfolio_preferences(student_id text primary key,ranking_scope text,show_progress boolean,show_system_badges boolean);
    create table public.wf_pro_system_badges(student_id text,family text,tier integer,earned_at timestamptz,status text);
    create table public.platform_audit_events(
      actor_auth_user_id uuid,actor_user_id text,action text,entity_type text,entity_id text,
      source text,student_id text,metadata jsonb
    );
    create function security.pro_actor() returns text language plpgsql security definer set search_path='' as $$
      declare v text; begin select user_id into v from public.users where auth_user_id=auth.uid() and status='active';
      if v is null then raise exception 'Active authentication required' using errcode='42501'; end if; return v; end $$;
    create function security.is_admin() returns boolean language sql stable security definer set search_path='' as $$
      select coalesce(current_setting('test.admin',true)='true',false) $$;
    create function security.current_student_id() returns text language sql stable security definer set search_path='' as $$
      select student_id from public.wf_student_profiles where user_id=(select user_id from public.users where auth_user_id=auth.uid()) limit 1 $$;
    create function security.pro_streak(text,text) returns jsonb language sql stable security definer set search_path='' as $$
      select jsonb_build_object('family',$2,'current',0,'longest',0,'available',false) $$;
    create function security.pro_workspace() returns jsonb language sql stable security definer set search_path='' as $$
      select jsonb_build_object('summary',null,'owners','[]'::jsonb,'programs','[]'::jsonb,'ledger','[]'::jsonb) $$;
    create function security.pro_self_summary() returns jsonb language sql stable security definer set search_path='' as $$select '{}'::jsonb$$;
    insert into public.users values
      ('admin','${adminAuth}','active'),('u1',gen_random_uuid(),'active'),('u2',gen_random_uuid(),'active'),('u3',gen_random_uuid(),'active');
    insert into public.wf_student_profiles values
      ('s1','u1','school-a','cohort-a'),('s2','u2','school-a','cohort-a'),('s3','u3','school-b','cohort-b');
    insert into public.wf_pro_rules values('verified_skill','mastery',75,null,2,true,1);
    insert into public.wf_student_portfolio_preferences values('s1','cohort',true,false);
    insert into public.wf_pro_ledger(student_id,rule_code,rule_version,source_key,category,requested_points,points,occurred_at,local_day,local_week,season,entry_type,reason) values
      ('s1','verified_skill',1,'one','mastery',75,75,'2026-07-10','2026-07-10','2026-07-06','2026-07-01','award','fixture'),
      ('s2','verified_skill',1,'two','mastery',75,75,'2026-07-11','2026-07-11','2026-07-06','2026-07-01','award','fixture'),
      ('s3','verified_skill',1,'three','mastery',75,25,'2026-07-12','2026-07-12','2026-07-06','2026-07-01','award','fixture');
  `);
  await db.exec(migration);
  return db;
}

test("ended quarter finalization is idempotent and freezes competition ranks plus memberships", async () => {
  const db = await fixture();
  try {
    const first = (await db.query("select security.pro_finalize_season('2026-07-01',null) result")).rows[0].result;
    assert.equal(first.studentCount, 3);
    assert.equal(first.duplicate, false);
    const standings = (await db.query("select student_id,institution_id,cohort_id,season_points,txkpro_rank from public.wf_pro_season_standings order by student_id")).rows;
    assert.deepEqual(standings.map((r) => Number(r.txkpro_rank)), [1, 1, 3]);
    await db.exec("update public.wf_student_profiles set school_id='school-c',cohort_id='cohort-c' where student_id='s1'");
    const frozen = (await db.query("select institution_id,cohort_id from public.wf_pro_season_standings where student_id='s1'")).rows[0];
    assert.deepEqual(frozen, { institution_id: "school-a", cohort_id: "cohort-a" });
    const duplicate = (await db.query("select security.pro_finalize_season('2026-07-01',null) result")).rows[0].result;
    assert.equal(duplicate.duplicate, true);
    await assert.rejects(db.exec("update public.wf_pro_season_standings set season_points=0"), /immutable/i);
  } finally {
    await db.close();
  }
});

test("a late ledger entry records correction evidence without rewriting standings", async () => {
  const db = await fixture();
  try {
    await db.query("select security.pro_finalize_season('2026-07-01',null)");
    await db.exec(`insert into public.wf_pro_ledger(student_id,rule_code,rule_version,source_key,category,requested_points,points,occurred_at,local_day,local_week,season,entry_type,reason)
      values('s3','verified_skill',1,'late','mastery',75,75,'2026-07-20','2026-07-20','2026-07-20','2026-07-01','award','late correction')`);
    const correction = (await db.query("select student_id,points_delta,entry_type,reason from public.wf_pro_season_corrections")).rows[0];
    assert.deepEqual(correction, { student_id: "s3", points_delta: 75, entry_type: "award", reason: "late correction" });
    assert.equal((await db.query("select season_points from public.wf_pro_season_standings where student_id='s3'")).rows[0].season_points, 25);
  } finally {
    await db.close();
  }
});

test("only an administrator can schedule a strictly increasing future level version", async () => {
  const db = await fixture();
  try {
    await db.exec(`select set_config('test.auth','${adminAuth}',false); set role authenticated`);
    const input = JSON.stringify({ op: "create_level_version", effectiveSeason: "2030-01-01", reason: "Future policy", thresholds: [0, 300, 900, 1800, 3500, 6000, 9000, 13000, 19000, 26000] });
    await assert.rejects(db.query("select public.pro_season_admin($1::jsonb)", [input]), /Platform administrator scope required/);
    await db.exec("select set_config('test.admin','true',false)");
    const created = (await db.query("select public.pro_season_admin($1::jsonb) result", [input])).rows[0].result;
    assert.equal(created.version, 2);
    await assert.rejects(db.query("select public.pro_season_admin($1::jsonb)", [JSON.stringify({ op: "create_level_version", effectiveSeason: "2031-01-01", reason: "Bad", thresholds: [0, 2, 2, 4, 5, 6, 7, 8, 9, 10] })]), /strictly increase/);
    await db.exec("reset role");
    await assert.rejects(db.exec("update public.wf_pro_level_thresholds set minimum_points=1 where version=2 and level=1"), /immutable/i);
  } finally {
    await db.close();
  }
});
