-- W12-01: canonical Institution roles, approval authority, and scope resolution.

create table if not exists public.wf_institution_scope_bindings (
  id uuid primary key default gen_random_uuid(),
  binding_id text not null unique default security.new_legacy_id('ISB'),
  institution_id text not null references public.wf_institutions(institution_id) on delete cascade,
  scope_type text not null check (scope_type in ('department','program','cohort')),
  scope_id text not null,
  display_name text,
  parent_scope_type text check (parent_scope_type is null or parent_scope_type in ('department','program')),
  parent_scope_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_institution_scope_bindings_parent_pair check (
    (parent_scope_type is null and parent_scope_id is null)
    or (parent_scope_type is not null and parent_scope_id is not null)
  ),
  unique (institution_id,scope_type,scope_id)
);

create index if not exists wf_institution_scope_bindings_parent_idx
  on public.wf_institution_scope_bindings(
    institution_id,parent_scope_type,parent_scope_id,scope_type,scope_id
  ) where active=true;

alter table public.wf_institution_scope_bindings enable row level security;
revoke all on public.wf_institution_scope_bindings from public,anon,authenticated;
grant select,insert,update,delete on public.wf_institution_scope_bindings to service_role;

create or replace function security.canonical_institution_role(p_role text)
returns text
language sql
immutable
set search_path=''
as $$
  select case lower(btrim(coalesce(p_role,'')))
    when 'institution' then 'instructor'
    when 'educator' then 'instructor'
    else lower(btrim(coalesce(p_role,'')))
  end;
$$;

create or replace function security.institution_role_scope_valid(
  p_role text,
  p_scope_type text
)
returns boolean
language sql
immutable
set search_path=''
as $$
  select case security.canonical_institution_role(p_role)
    when 'institution_super_admin' then lower(p_scope_type)='institution'
    when 'institution_admin' then lower(p_scope_type)='institution'
    when 'department_head' then lower(p_scope_type) in ('institution','department')
    when 'program_coordinator' then lower(p_scope_type) in ('institution','program','cohort')
    when 'instructor' then lower(p_scope_type) in ('institution','program','cohort')
    when 'assistant_instructor' then lower(p_scope_type) in ('institution','program','cohort')
    when 'career_services' then lower(p_scope_type) in ('institution','department','program','cohort')
    when 'read_only_analyst' then lower(p_scope_type) in ('institution','department','program','cohort')
    else false
  end;
$$;

create or replace function security.institution_scope_matches(
  p_institution_id text,
  p_scope_type text,
  p_scope_id text,
  p_cohort_id text default null
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(case lower(p_scope_type)
    when 'institution' then p_scope_id=p_institution_id
    when 'cohort' then exists(
      select 1 from public.wf_cohorts c
      where c.cohort_id=p_scope_id
        and c.institution_id=p_institution_id
        and (p_cohort_id is null or c.cohort_id=p_cohort_id)
    )
    when 'program' then exists(
      select 1 from public.wf_cohorts c
      where c.institution_id=p_institution_id
        and (
          lower(coalesce(c.trade_id,''))=lower(p_scope_id)
          or lower(coalesce(c.program_name,''))=lower(p_scope_id)
        )
        and (p_cohort_id is null or c.cohort_id=p_cohort_id)
    )
    when 'department' then exists(
      select 1
      from public.wf_institution_scope_bindings d
      where d.institution_id=p_institution_id
        and d.scope_type='department'
        and lower(d.scope_id)=lower(p_scope_id)
        and d.active=true
        and (
          p_cohort_id is null
          or exists(
            select 1
            from public.wf_cohorts c
            where c.cohort_id=p_cohort_id
              and c.institution_id=p_institution_id
              and (
                exists(
                  select 1
                  from public.wf_institution_scope_bindings b
                  where b.institution_id=p_institution_id
                    and b.active=true
                    and b.parent_scope_type='department'
                    and lower(b.parent_scope_id)=lower(d.scope_id)
                    and (
                      (b.scope_type='cohort' and b.scope_id=c.cohort_id)
                      or (
                        b.scope_type='program'
                        and (
                          lower(b.scope_id)=lower(coalesce(c.trade_id,''))
                          or lower(b.scope_id)=lower(coalesce(c.program_name,''))
                        )
                      )
                    )
                )
              )
          )
        )
    )
    else false
  end,false);
$$;

create or replace function security.institution_scope_contains(
  p_institution_id text,
  p_actor_scope_type text,
  p_actor_scope_id text,
  p_target_scope_type text,
  p_target_scope_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.institution_scope_matches(
      p_institution_id,p_target_scope_type,p_target_scope_id,null
    )
    and case lower(p_actor_scope_type)
      when 'institution' then p_actor_scope_id=p_institution_id
      when 'department' then
        (
          lower(p_target_scope_type)='department'
          and lower(p_target_scope_id)=lower(p_actor_scope_id)
        )
        or exists(
          select 1
          from public.wf_institution_scope_bindings b
          where b.institution_id=p_institution_id
            and b.active=true
            and b.parent_scope_type='department'
            and lower(b.parent_scope_id)=lower(p_actor_scope_id)
            and (
              (
                lower(p_target_scope_type)=b.scope_type
                and lower(p_target_scope_id)=lower(b.scope_id)
              )
              or (
                lower(p_target_scope_type)='cohort'
                and b.scope_type='program'
                and exists(
                  select 1
                  from public.wf_cohorts c
                  where c.institution_id=p_institution_id
                    and c.cohort_id=p_target_scope_id
                    and (
                      lower(coalesce(c.trade_id,''))=lower(b.scope_id)
                      or lower(coalesce(c.program_name,''))=lower(b.scope_id)
                    )
                )
              )
            )
        )
      when 'program' then
        (
          lower(p_target_scope_type)='program'
          and lower(p_target_scope_id)=lower(p_actor_scope_id)
        )
        or (
          lower(p_target_scope_type)='cohort'
          and exists(
            select 1
            from public.wf_cohorts c
            where c.institution_id=p_institution_id
              and c.cohort_id=p_target_scope_id
              and (
                lower(coalesce(c.trade_id,''))=lower(p_actor_scope_id)
                or lower(coalesce(c.program_name,''))=lower(p_actor_scope_id)
              )
          )
        )
      when 'cohort' then
        lower(p_target_scope_type)='cohort'
        and p_target_scope_id=p_actor_scope_id
      else false
    end,
    false
  );
$$;

create or replace function security.guard_institution_membership_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text:=security.canonical_institution_role(new.role);
begin
  -- read_only_analyst is also a platform role. Preserve that existing role when
  -- it is explicitly platform-scoped.
  if v_role='read_only_analyst' and lower(new.scope_type)='platform' then
    return new;
  end if;

  if v_role in (
    'institution_super_admin','institution_admin','department_head',
    'program_coordinator','instructor','assistant_instructor',
    'career_services','read_only_analyst'
  ) then
    if new.scope_id is null
       or not security.institution_role_scope_valid(v_role,new.scope_type) then
      raise exception 'Invalid Institution role and scope combination';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_institution_membership_scope
  on public.app_role_memberships;
create trigger trg_guard_institution_membership_scope
before insert or update of role,scope_type,scope_id
on public.app_role_memberships
for each row execute function security.guard_institution_membership_scope();

create or replace function security.has_institution_learning_role(
  p_institution_id text,
  p_cohort_id text,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.is_admin()
    or exists (
      select 1
      from public.app_role_memberships r
      where r.auth_user_id=(select auth.uid())
        and lower(r.status)='active'
        and security.institution_role_scope_valid(r.role,r.scope_type)
        and (
          security.canonical_institution_role(r.role)=any(
            select security.canonical_institution_role(x) from unnest(p_roles) x
          )
          or (
            security.canonical_institution_role(r.role)='institution_super_admin'
            and 'institution_admin'=any(
              select security.canonical_institution_role(x) from unnest(p_roles) x
            )
          )
        )
        and security.institution_scope_matches(
          p_institution_id,r.scope_type,r.scope_id,p_cohort_id
        )
    ),
    false
  );
$$;

create or replace function security.institution_learning_has_any_scope(
  p_institution_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.is_admin()
    or exists(
      select 1
      from public.app_role_memberships r
      where r.auth_user_id=(select auth.uid())
        and lower(r.status)='active'
        and security.canonical_institution_role(r.role) in (
          'institution_super_admin','institution_admin','department_head',
          'program_coordinator','instructor','assistant_instructor',
          'career_services','read_only_analyst'
        )
        and security.institution_role_scope_valid(r.role,r.scope_type)
        and security.institution_scope_matches(
          p_institution_id,r.scope_type,r.scope_id,null
        )
    ),
    false
  );
$$;

create or replace function security.can_invite_institution_member(
  p_institution_id text,
  p_target_role text,
  p_target_scope_type text,
  p_target_scope_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.institution_role_scope_valid(p_target_role,p_target_scope_type)
    and security.institution_scope_matches(
      p_institution_id,p_target_scope_type,p_target_scope_id,null
    )
    and (
      security.is_admin()
      or exists(
        select 1
        from public.app_role_memberships r
        where r.auth_user_id=(select auth.uid())
          and lower(r.status)='active'
          and security.canonical_institution_role(r.role) in (
            'institution_super_admin','institution_admin',
            'department_head','program_coordinator'
          )
          and security.institution_role_scope_valid(r.role,r.scope_type)
          and security.institution_scope_contains(
            p_institution_id,r.scope_type,r.scope_id,
            p_target_scope_type,p_target_scope_id
          )
      )
    ),
    false
  );
$$;

create or replace function security.can_approve_institution_member(
  p_institution_id text,
  p_target_role text,
  p_target_scope_type text default 'institution',
  p_target_scope_id text default null
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    case
      when security.canonical_institution_role(p_target_role)='institution_super_admin'
        then security.is_admin()
      when security.canonical_institution_role(p_target_role) in (
        'institution_admin','department_head','program_coordinator',
        'instructor','assistant_instructor','career_services',
        'read_only_analyst'
      ) then
        security.institution_role_scope_valid(
          p_target_role,
          coalesce(nullif(p_target_scope_type,''),'institution')
        )
        and security.institution_scope_matches(
          p_institution_id,
          coalesce(nullif(p_target_scope_type,''),'institution'),
          coalesce(nullif(p_target_scope_id,''),p_institution_id),
          null
        )
        and (
          security.is_admin()
          or exists(
        select 1
        from public.app_role_memberships r
        where r.auth_user_id=(select auth.uid())
          and lower(r.status)='active'
          and (
            security.canonical_institution_role(r.role)='institution_super_admin'
            or security.canonical_institution_role(r.role)='institution_admin'
          )
          and security.institution_role_scope_valid(r.role,r.scope_type)
          and security.institution_scope_contains(
            p_institution_id,
            r.scope_type,
            r.scope_id,
            coalesce(nullif(p_target_scope_type,''),'institution'),
            coalesce(nullif(p_target_scope_id,''),p_institution_id)
          )
          )
        )
    end,
    false
  );
$$;

create or replace function public.institution_learning_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authenticated Institution user required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'institutionId',x.institution_id,
      'institutionName',x.institution_name,
      'roles',x.roles,
      'scopes',x.scopes
    ) order by x.institution_name,x.institution_id)
    from (
      select
        i.institution_id,
        coalesce(i.name,i.short_name,i.institution_id) as institution_name,
        jsonb_agg(distinct security.canonical_institution_role(r.role)) as roles,
        jsonb_agg(distinct jsonb_build_object(
          'scopeType',lower(r.scope_type),
          'scopeId',r.scope_id,
          'role',security.canonical_institution_role(r.role)
        )) as scopes
      from public.app_role_memberships r
      join public.wf_institutions i
        on i.active=true
       and security.institution_scope_matches(
         i.institution_id,r.scope_type,r.scope_id,null
       )
      where r.auth_user_id=(select auth.uid())
        and lower(r.status)='active'
        and security.canonical_institution_role(r.role) in (
          'institution_super_admin','institution_admin','department_head',
          'program_coordinator','instructor','assistant_instructor',
          'career_services','read_only_analyst'
        )
        and security.institution_role_scope_valid(r.role,r.scope_type)
      group by i.institution_id,i.name,i.short_name
    ) x
  ),'[]'::jsonb);
end;
$$;

revoke all on function security.canonical_institution_role(text)
  from public,anon,authenticated;
revoke all on function security.institution_role_scope_valid(text,text)
  from public,anon,authenticated;
revoke all on function security.institution_scope_matches(text,text,text,text)
  from public,anon,authenticated;
revoke all on function security.institution_scope_contains(text,text,text,text,text)
  from public,anon,authenticated;
revoke all on function security.guard_institution_membership_scope()
  from public,anon,authenticated;
revoke all on function security.has_institution_learning_role(text,text,text[])
  from public,anon,authenticated;
revoke all on function security.institution_learning_has_any_scope(text)
  from public,anon,authenticated;
revoke all on function security.can_invite_institution_member(text,text,text,text)
  from public,anon,authenticated;
revoke all on function security.can_approve_institution_member(text,text)
  from public,anon,authenticated;
revoke all on function security.can_approve_institution_member(text,text,text,text)
  from public,anon,authenticated;

grant execute on function security.canonical_institution_role(text) to service_role;
grant execute on function security.institution_role_scope_valid(text,text) to service_role;
grant execute on function security.institution_scope_matches(text,text,text,text) to service_role;
grant execute on function security.institution_scope_contains(text,text,text,text,text) to service_role;
grant execute on function security.guard_institution_membership_scope() to service_role;
grant execute on function security.has_institution_learning_role(text,text,text[]) to service_role;
grant execute on function security.institution_learning_has_any_scope(text) to service_role;
grant execute on function security.can_invite_institution_member(text,text,text,text) to service_role;
grant execute on function security.can_approve_institution_member(text,text) to service_role;
grant execute on function security.can_approve_institution_member(text,text,text,text) to service_role;

revoke all on function public.institution_learning_access_context()
  from public,anon;
grant execute on function public.institution_learning_access_context()
  to authenticated,service_role;

comment on table public.wf_institution_scope_bindings is
  'W12-01 server-controlled department/program/cohort hierarchy used to resolve Institution membership scope. Direct client access is closed.';
comment on function security.can_invite_institution_member(text,text,text,text) is
  'W12-01 policy: Institution Super Admin/Admin, Department Head, and Program Coordinator may invite only into a role and scope contained by their own active scope.';
comment on function security.can_approve_institution_member(text,text) is
  'D-01/W12-01 compatibility wrapper: educator approval is allowed for TXKPRO Admin or scoped Institution Admin/Super Admin when the target scope is contained by the approver scope.';
comment on function security.can_approve_institution_member(text,text,text,text) is
  'D-01/W12-01 policy: TXKPRO Admin and scoped Institution Admin/Super Admin can approve educator access; target role/scope must be valid, contained, server-checked, and audited by the application action.';
