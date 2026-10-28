-- #368: reusable employer-owned crews for Directory and incentive authoring.
-- Crew creation grants no role, program enrollment, reward or provider action.
create table public.wf_employer_crews (
  id uuid primary key default gen_random_uuid(),
  employer_id text not null references public.contractors(contractor_id),
  name text not null check (
    name = btrim(name) and length(name) between 1 and 100
  ),
  description text check (
    description is null or length(description) between 1 and 500
  ),
  created_by text not null references public.users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index wf_employer_crews_name
  on public.wf_employer_crews(employer_id, lower(name));
create index wf_employer_crews_creator
  on public.wf_employer_crews(created_by);

create table public.wf_employer_crew_members (
  crew_id uuid not null references public.wf_employer_crews(id) on delete cascade,
  user_id text not null references public.users(user_id),
  assigned_by text not null references public.users(user_id),
  assigned_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index wf_employer_crew_members_user
  on public.wf_employer_crew_members(user_id);
create index wf_employer_crew_members_assigner
  on public.wf_employer_crew_members(assigned_by);

alter table public.wf_employer_crews enable row level security;
alter table public.wf_employer_crew_members enable row level security;
revoke all on public.wf_employer_crews,
  public.wf_employer_crew_members from public, anon, authenticated, service_role;

create function security.employer_crew_workspace(p_employer text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor text := security.pro_actor();
  can_manage boolean;
begin
  if not exists (
    select 1
    from public.contractors c
    where c.contractor_id = p_employer
      and lower(c.account_status) = 'active'
      and lower(c.approval_status) = 'approved'
  ) or not security.has_employer_role(
    p_employer,
    array['employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only']
  ) then
    raise exception 'Crew workspace scope denied' using errcode='42501';
  end if;

  can_manage := security.has_employer_role(
    p_employer,
    array['employer_owner','employer_admin']
  );

  return jsonb_build_object(
    'employerId', p_employer,
    'canManage', can_manage,
    'people', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'userId', person.user_id,
          'name', person.name,
          'role', person.role
        )
        order by person.name, person.user_id
      )
      from (
        select distinct on (u.user_id)
          u.user_id,
          coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Team member') name,
          m.role
        from public.app_role_memberships m
        join public.users u on u.user_id = m.user_id
        where m.scope_id = p_employer
          and m.scope_type in ('employer','contractor')
          and lower(m.status) = 'active'
          and lower(u.status) = 'active'
          and m.role in (
            'employer_owner','employer_admin','recruiter','hiring_manager',
            'employer_read_only','employer_employee','contractor_owner','contractor_recruiter'
          )
        order by u.user_id,
          case m.role
            when 'employer_owner' then 1
            when 'contractor_owner' then 2
            when 'employer_admin' then 3
            when 'recruiter' then 4
            when 'contractor_recruiter' then 5
            when 'hiring_manager' then 6
            when 'employer_employee' then 7
            else 8
          end
        limit 500
      ) person
    ), '[]'::jsonb),
    'crews', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', crew.id,
          'name', crew.name,
          'description', crew.description,
          'memberCount', (
            select count(*)::integer
            from public.wf_employer_crew_members count_member
            where count_member.crew_id = crew.id
          ),
          'members', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'userId', u.user_id,
                'name', coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Team member'),
                'role', coalesce(active_membership.role, 'former_member'),
                'active', active_membership.role is not null and lower(u.status) = 'active'
              )
              order by u.first_name, u.last_name, u.user_id
            )
            from public.wf_employer_crew_members member
            join public.users u on u.user_id = member.user_id
            left join lateral (
              select membership.role
              from public.app_role_memberships membership
              where membership.user_id = u.user_id
                and membership.scope_id = p_employer
                and membership.scope_type in ('employer','contractor')
                and lower(membership.status) = 'active'
                and membership.role in (
                  'employer_owner','employer_admin','recruiter','hiring_manager',
                  'employer_read_only','employer_employee','contractor_owner','contractor_recruiter'
                )
              order by case membership.role
                when 'employer_owner' then 1
                when 'contractor_owner' then 2
                when 'employer_admin' then 3
                when 'recruiter' then 4
                when 'contractor_recruiter' then 5
                when 'hiring_manager' then 6
                when 'employer_employee' then 7
                else 8
              end
              limit 1
            ) active_membership on true
            where member.crew_id = crew.id
          ), '[]'::jsonb),
          'createdAt', crew.created_at,
          'updatedAt', crew.updated_at
        )
        order by lower(crew.name), crew.id
      )
      from public.wf_employer_crews crew
      where crew.employer_id = p_employer
    ), '[]'::jsonb)
  );
end
$$;

create function security.employer_crew_action(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor text := security.pro_actor();
  employer text := input->>'employerId';
  crew_name text := btrim(coalesce(input->>'name', ''));
  crew_description text := nullif(btrim(coalesce(input->>'description', '')), '');
  member_ids text[];
  created_id uuid;
  created_crew jsonb;
begin
  if jsonb_typeof(input) is distinct from 'object'
    or input->>'op' is distinct from 'create'
    or length(crew_name) not between 1 and 100
    or (crew_description is not null and length(crew_description) > 500)
    or jsonb_typeof(input->'memberUserIds') is distinct from 'array'
    or jsonb_array_length(input->'memberUserIds') > 500 then
    raise exception 'Check crew details';
  end if;

  if not exists (
    select 1
    from public.contractors c
    where c.contractor_id = employer
      and lower(c.account_status) = 'active'
      and lower(c.approval_status) = 'approved'
  ) or not security.has_employer_role(
    employer,
    array['employer_owner','employer_admin']
  ) then
    raise exception 'Crew management scope denied' using errcode='42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(input->'memberUserIds') value
    where length(btrim(value)) not between 1 and 100
  ) or exists (
    select 1
    from jsonb_array_elements_text(input->'memberUserIds') value
    group by value
    having count(*) > 1
  ) then
    raise exception 'Check crew members';
  end if;

  member_ids := array(
    select jsonb_array_elements_text(input->'memberUserIds')
  );
  if exists (
    select 1
    from unnest(member_ids) member_id
    where not exists (
      select 1
      from public.app_role_memberships membership
      join public.users u on u.user_id = membership.user_id
      where membership.user_id = member_id
        and membership.scope_id = employer
        and membership.scope_type in ('employer','contractor')
        and lower(membership.status) = 'active'
        and lower(u.status) = 'active'
        and membership.role in (
          'employer_owner','employer_admin','recruiter','hiring_manager',
          'employer_read_only','employer_employee','contractor_owner','contractor_recruiter'
        )
    )
  ) then
    raise exception 'Crew member scope denied' using errcode='42501';
  end if;

  insert into public.wf_employer_crews(
    employer_id, name, description, created_by
  ) values (
    employer, crew_name, crew_description, actor
  ) returning id into created_id;

  insert into public.wf_employer_crew_members(
    crew_id, user_id, assigned_by
  )
  select created_id, member_id, actor
  from unnest(member_ids) member_id;

  insert into public.platform_audit_events(
    actor_auth_user_id, actor_user_id, action, entity_type, entity_id,
    source, employer_id, result, after_json
  ) values (
    auth.uid(), actor, 'EMPLOYER_CREW_CREATED', 'employer_crew',
    created_id::text, 'workforce-employer-directory', employer, 'success',
    jsonb_build_object(
      'name', crew_name,
      'memberCount', cardinality(member_ids)
    )
  );

  select item into created_crew
  from jsonb_array_elements(
    security.employer_crew_workspace(employer)->'crews'
  ) item
  where item->>'id' = created_id::text;
  return jsonb_build_object('crew', created_crew);
end
$$;

create function public.employer_crew_workspace(p_employer text)
returns jsonb
language sql
security invoker
set search_path=''
as $$select security.employer_crew_workspace(p_employer)$$;

create function public.employer_crew_action(p_input jsonb)
returns jsonb
language sql
security invoker
set search_path=''
as $$select security.employer_crew_action(p_input)$$;

revoke all on function security.employer_crew_workspace(text),
  security.employer_crew_action(jsonb),
  public.employer_crew_workspace(text),
  public.employer_crew_action(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function security.employer_crew_workspace(text),
  security.employer_crew_action(jsonb),
  public.employer_crew_workspace(text),
  public.employer_crew_action(jsonb)
  to authenticated;

-- Validate reusable crew links at the same checked dispatcher used by all
-- program writes. Older program-only crews remain readable and editable.
alter function security.incentive_action(jsonb)
  rename to incentive_action_before_employer_crews;
revoke all on function security.incentive_action_before_employer_crews(jsonb)
  from public, anon, authenticated, service_role;

create function security.incentive_action(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  operation text := input->>'op';
  employer text;
  definition jsonb;
  crew jsonb;
begin
  perform security.pro_actor();
  if operation = 'create' then
    employer := input->>'ownerId';
    if not security.pro_owner_access('employer', employer) then
      raise exception 'Program scope denied' using errcode='42501';
    end if;
    definition := input->'definition';
  elsif operation in ('save','publish','crew_assignment') then
    select program.owner_id into employer
    from public.wf_incentive_programs program
    where program.id = (input->>'programId')::uuid
      and program.owner_type = 'employer';
    if employer is null
      or not security.pro_owner_access('employer', employer) then
      raise exception 'Program scope denied' using errcode='42501';
    end if;
    if operation = 'save' then
      definition := input->'definition';
    elsif operation = 'publish' then
      select config.draft into definition
      from public.wf_incentive_definitions config
      where config.program_id = (input->>'programId')::uuid;
    else
      select config.published into definition
      from public.wf_incentive_definitions config
      where config.program_id = (input->>'programId')::uuid;
    end if;
  end if;

  if jsonb_typeof(definition->'teams') = 'array' then
    for crew in select * from jsonb_array_elements(definition->'teams') loop
      if nullif(crew->>'directoryCrewId', '') is not null and (
        crew->>'id' is distinct from crew->>'directoryCrewId'
        or not exists (
          select 1
          from public.wf_employer_crews directory_crew
          where directory_crew.id = (crew->>'directoryCrewId')::uuid
            and directory_crew.employer_id = employer
        )
      ) then
        raise exception 'Crew scope denied' using errcode='42501';
      end if;
    end loop;
  end if;

  return security.incentive_action_before_employer_crews(input);
end
$$;

create or replace function public.incentive_action(p_input jsonb)
returns jsonb
language sql
security invoker
set search_path=''
as $$select security.incentive_action(p_input)$$;
revoke all on function security.incentive_action(jsonb),
  public.incentive_action(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function security.incentive_action(jsonb),
  public.incentive_action(jsonb)
  to authenticated;
