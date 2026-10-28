import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { selectedCrewsToTeams } from "../lib/employer/crew-contracts.ts";
import { EDITOR_HELP } from "../lib/incentives/field-help.ts";

const migration = readFileSync(
  "supabase/staging/migrations/20261028203005_employer_crews.sql",
  "utf8",
);
const OWNER = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-000000000002";
const READER = "00000000-0000-4000-8000-000000000003";
const WORKER = "00000000-0000-4000-8000-000000000004";
const OTHER_OWNER = "00000000-0000-4000-8000-000000000005";
const OTHER_WORKER = "00000000-0000-4000-8000-000000000006";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema security;
    create schema auth;
    grant usage on schema security, auth to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.auth', true), '')::uuid$$;
    create table public.contractors(
      contractor_id text primary key,
      account_status text not null,
      approval_status text not null,
      business_name text not null
    );
    create table public.users(
      user_id text primary key,
      auth_user_id uuid,
      status text not null,
      first_name text,
      last_name text
    );
    create table public.app_role_memberships(
      auth_user_id uuid,
      user_id text not null,
      scope_id text,
      scope_type text not null,
      role text not null,
      status text not null
    );
    create table public.platform_audit_events(
      actor_auth_user_id uuid,
      actor_user_id text,
      action text,
      entity_type text,
      entity_id text,
      source text,
      employer_id text,
      result text,
      after_json jsonb
    );
    create table public.wf_incentive_programs(
      id uuid primary key default gen_random_uuid(),
      owner_type text not null,
      owner_id text not null
    );
    create table public.wf_incentive_definitions(
      program_id uuid primary key references public.wf_incentive_programs(id),
      draft jsonb not null,
      published jsonb
    );
    create function security.pro_actor() returns text language plpgsql stable security definer set search_path='' as $$
    declare actor text;
    begin
      select user_id into actor from public.users
      where auth_user_id=auth.uid() and lower(status)='active';
      if actor is null then raise exception 'Active actor required' using errcode='42501'; end if;
      return actor;
    end $$;
    create function security.has_employer_role(i text, roles text[]) returns boolean language sql stable security definer set search_path='' as $$
      select exists(
        select 1 from public.app_role_memberships membership
        join public.users u on u.user_id=membership.user_id
        where membership.auth_user_id=auth.uid()
          and membership.scope_id=i
          and membership.scope_type in ('employer','contractor')
          and membership.role=any(roles)
          and lower(membership.status)='active'
          and lower(u.status)='active'
      )
    $$;
    create function security.pro_owner_access(kind text, owner text) returns boolean language sql stable security definer set search_path='' as $$
      select kind='employer' and security.has_employer_role(owner,array['employer_owner','employer_admin'])
    $$;
    create function security.incentive_action(input jsonb) returns jsonb language sql security definer set search_path='' as $$
      select jsonb_build_object('accepted', true, 'input', input)
    $$;
    create function public.incentive_action(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$
      select security.incentive_action(p_input)
    $$;
    grant execute on function security.incentive_action(jsonb), public.incentive_action(jsonb) to authenticated;
    insert into public.contractors values
      ('tenant','active','approved','Tenant'),
      ('other','active','approved','Other');
    insert into public.users values
      ('owner','${OWNER}','active','Olivia','Owner'),
      ('admin','${ADMIN}','active','Ari','Admin'),
      ('reader','${READER}','active','Riley','Reader'),
      ('worker','${WORKER}','active','Wren','Worker'),
      ('other-owner','${OTHER_OWNER}','active','Oscar','Other'),
      ('other-worker','${OTHER_WORKER}','active','Owen','Worker');
    insert into public.app_role_memberships values
      ('${OWNER}','owner','tenant','employer','employer_owner','active'),
      ('${ADMIN}','admin','tenant','employer','employer_admin','active'),
      ('${READER}','reader','tenant','employer','employer_read_only','active'),
      ('${WORKER}','worker','tenant','employer','employer_employee','active'),
      ('${OTHER_OWNER}','other-owner','other','employer','employer_owner','active'),
      ('${OTHER_WORKER}','other-worker','other','employer','employer_employee','active');
  `);
  await db.exec(migration);

  async function actor(authId) {
    await db.exec(
      `reset role; select set_config('test.auth','${authId}',false); set role authenticated;`,
    );
  }
  async function create(input) {
    return (
      await db.query("select public.employer_crew_action($1::jsonb) result", [
        JSON.stringify({ op: "create", employerId: "tenant", ...input }),
      ])
    ).rows[0].result.crew;
  }
  async function workspace(employer = "tenant") {
    return (
      await db.query(
        "select public.employer_crew_workspace($1::text) result",
        [employer],
      )
    ).rows[0].result;
  }
  await actor(OWNER);
  return { db, actor, create, workspace };
}

test("owner creates a reusable crew with scoped directory members and audit evidence", async () => {
  const { db, create, workspace } = await fixture();
  try {
    const crew = await create({
      name: "  Service Crew A  ",
      description: " North shift ",
      memberUserIds: ["worker", "admin"],
    });
    assert.equal(crew.name, "Service Crew A");
    assert.equal(crew.description, "North shift");
    assert.equal(crew.memberCount, 2);
    assert.deepEqual(
      new Set(crew.members.map((member) => member.userId)),
      new Set(["worker", "admin"]),
    );
    const data = await workspace();
    assert.equal(data.canManage, true);
    assert.equal(data.crews.length, 1);
    assert.equal(data.people.some((person) => person.userId === "worker"), true);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::integer count from public.platform_audit_events where action='EMPLOYER_CREW_CREATED' and entity_id=$1",
          [crew.id],
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});

test("crew RPCs deny cross-tenant members, employee access, read-only mutation and direct tables", async () => {
  const { db, actor, create, workspace } = await fixture();
  try {
    await assert.rejects(
      create({ name: "Wrong member", memberUserIds: ["other-worker"] }),
      /Crew member scope denied/,
    );
    await create({ name: "Unique crew", memberUserIds: [] });
    await assert.rejects(
      create({ name: "unique CREW", memberUserIds: [] }),
      /duplicate key|unique constraint/i,
    );
    await actor(READER);
    assert.equal((await workspace()).canManage, false);
    await assert.rejects(
      create({ name: "Reader crew", memberUserIds: [] }),
      /Crew management scope denied/,
    );
    await actor(WORKER);
    await assert.rejects(workspace(), /Crew workspace scope denied/);
    await actor(OTHER_OWNER);
    await assert.rejects(workspace(), /Crew workspace scope denied/);
    await actor(OWNER);
    await assert.rejects(
      db.query("select * from public.wf_employer_crews"),
      /permission denied/,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(
      db.query("select public.employer_crew_workspace('tenant')"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("program writes accept own reusable crew links, preserve legacy crews and reject foreign links", async () => {
  const { db, actor, create } = await fixture();
  try {
    const own = await create({ name: "Own crew", memberUserIds: ["worker"] });
    await actor(OTHER_OWNER);
    const foreign = (
      await db.query("select public.employer_crew_action($1::jsonb) result", [
        JSON.stringify({
          op: "create",
          employerId: "other",
          name: "Foreign crew",
          memberUserIds: ["other-worker"],
        }),
      ])
    ).rows[0].result.crew;
    await actor(OWNER);
    const linked = {
      op: "create",
      ownerId: "tenant",
      definition: {
        teams: [
          {
            id: own.id,
            directoryCrewId: own.id,
            name: own.name,
            participantIds: [],
          },
        ],
      },
    };
    assert.equal(
      (
        await db.query("select public.incentive_action($1::jsonb) result", [
          JSON.stringify(linked),
        ])
      ).rows[0].result.accepted,
      true,
    );
    const legacy = structuredClone(linked);
    legacy.definition.teams = [
      { id: "legacy", name: "Legacy program crew", participantIds: [] },
    ];
    assert.equal(
      (
        await db.query("select public.incentive_action($1::jsonb) result", [
          JSON.stringify(legacy),
        ])
      ).rows[0].result.accepted,
      true,
    );
    const crossed = structuredClone(linked);
    crossed.definition.teams[0] = {
      id: foreign.id,
      directoryCrewId: foreign.id,
      name: foreign.name,
      participantIds: [],
    };
    await assert.rejects(
      db.query("select public.incentive_action($1::jsonb)", [
        JSON.stringify(crossed),
      ]),
      /Crew scope denied/,
    );
    await assert.rejects(
      db.query(
        "select security.incentive_action_before_employer_crews($1::jsonb)",
        [JSON.stringify(linked)],
      ),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("crew selection maps only active enrolled participants and preserves older program-only crews", () => {
  const crew = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Service crew",
    description: null,
    memberCount: 3,
    members: [
      { userId: "u1", name: "One", role: "employer_employee", active: true },
      { userId: "u2", name: "Two", role: "employer_employee", active: true },
      { userId: "u3", name: "Three", role: "former_member", active: false },
    ],
    createdAt: "2026-10-28T00:00:00Z",
    updatedAt: "2026-10-28T00:00:00Z",
  };
  const teams = selectedCrewsToTeams(
    [crew],
    [crew.id],
    [
      { id: "p1", userId: "u1", status: "active" },
      { id: "p2", userId: "u2", status: "pending" },
      { id: "p3", userId: "u3", status: "active" },
    ],
    [
      {
        id: "legacy",
        name: "Legacy crew",
        participantIds: ["p-old"],
      },
    ],
  );
  assert.equal(teams.length, 2);
  assert.deepEqual(teams[0], {
    id: "legacy",
    name: "Legacy crew",
    participantIds: ["p-old"],
  });
  assert.equal(teams[1].directoryCrewId, crew.id);
  assert.deepEqual(teams[1].participantIds, ["p1"]);
});

function assertControlsHaveHelp(path) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let controls = 0;
  function walk(node) {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      ["input", "textarea", "select"].includes(node.tagName.getText(source))
    ) {
      controls++;
      let parent = node.parent;
      let helped = false;
      while (parent) {
        if (
          ts.isJsxElement(parent) &&
          ["EditorField", "CheckField"].includes(
            parent.openingElement.tagName.getText(source),
          )
        ) {
          helped = true;
          break;
        }
        parent = parent.parent;
      }
      assert.equal(helped, true, `Missing contextual help: ${node.getText(source)}`);
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
  assert.ok(controls > 0, `No controls found in ${path}`);
}

test("Directory and editor crew flows expose create/select affordances with help on every field", () => {
  assertControlsHaveHelp("components/employer/crew-create-modal.tsx");
  assertControlsHaveHelp("components/incentives/crew-selector.tsx");
  for (const key of [
    "Crew name",
    "Crew description",
    "Find organization members",
    "Organization crew membership",
    "Find existing crews",
    "Existing crew selection",
  ])
    assert.ok(EDITOR_HELP[key]?.length > 40, key);
  assert.match(
    readFileSync("components/incentives/editor.tsx", "utf8"),
    /CrewSelector[\s\S]*CrewCreateModal[\s\S]*Open organization directory/,
  );
  assert.match(
    readFileSync("app\/employer\/directory\/page.tsx", "utf8"),
    /approvalStatus === "approved"[\s\S]*employerCrewWorkspace[\s\S]*EmployerCrewDirectory/,
  );
  assert.match(
    readFileSync("app/api/employer/crews/route.ts", "utf8"),
    /getEmployerContext[\s\S]*canManageCompany[\s\S]*context\.employerId/,
  );
});
