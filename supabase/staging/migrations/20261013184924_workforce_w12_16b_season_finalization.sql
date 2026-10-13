-- W12-16B / #224. Immutable quarterly standings and versioned lifetime levels.
-- Additive staging-only migration. Engagement awards remain owned by #274.

create table public.wf_pro_level_versions (
  version integer primary key check (version > 0),
  effective_season date not null unique,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  created_by text references public.users(user_id),
  created_at timestamptz not null default now(),
  check (effective_season = date_trunc('quarter', effective_season::timestamp)::date)
);

create table public.wf_pro_level_thresholds (
  version integer not null references public.wf_pro_level_versions(version),
  level integer not null check (level between 1 and 10),
  minimum_points bigint not null check (minimum_points >= 0),
  primary key (version, level),
  unique (version, minimum_points)
);

insert into public.wf_pro_level_versions(version,effective_season,reason)
values (1,date '2026-10-01','Owner-approved Version 1 lifetime level thresholds');

insert into public.wf_pro_level_thresholds(version,level,minimum_points) values
  (1,1,0),(1,2,250),(1,3,750),(1,4,1500),(1,5,3000),
  (1,6,5000),(1,7,8000),(1,8,12000),(1,9,18000),(1,10,25000);

create table public.wf_pro_season_finalizations (
  season date primary key,
  season_ends date not null,
  level_version integer not null references public.wf_pro_level_versions(version),
  scoring_snapshot jsonb not null,
  student_count integer not null check (student_count >= 0),
  finalized_by text references public.users(user_id),
  finalized_at timestamptz not null default now(),
  check (season = date_trunc('quarter', season::timestamp)::date),
  check (season_ends = (season + interval '3 months - 1 day')::date)
);

create table public.wf_pro_season_standings (
  season date not null references public.wf_pro_season_finalizations(season),
  student_id text not null references public.wf_student_profiles(student_id),
  institution_id text,
  cohort_id text,
  season_points bigint not null,
  lifetime_points bigint not null,
  lifetime_level integer not null check (lifetime_level between 1 and 10),
  cohort_rank bigint check (cohort_rank is null or cohort_rank > 0),
  institution_rank bigint check (institution_rank is null or institution_rank > 0),
  txkpro_rank bigint not null check (txkpro_rank > 0),
  primary key (season, student_id)
);

create index wf_pro_season_standings_student_idx
  on public.wf_pro_season_standings(student_id,season desc);
create index wf_pro_season_standings_institution_idx
  on public.wf_pro_season_standings(season,institution_id,institution_rank)
  where institution_id is not null;
create index wf_pro_season_standings_cohort_idx
  on public.wf_pro_season_standings(season,cohort_id,cohort_rank)
  where cohort_id is not null;

create table public.wf_pro_season_corrections (
  id uuid primary key default gen_random_uuid(),
  season date not null references public.wf_pro_season_finalizations(season),
  ledger_entry_id uuid not null unique references public.wf_pro_ledger(id),
  student_id text not null references public.wf_student_profiles(student_id),
  points_delta integer not null,
  entry_type text not null check (entry_type in ('award','reversal')),
  reason text not null,
  actor_user_id text references public.users(user_id),
  recorded_at timestamptz not null default now()
);

create index wf_pro_season_corrections_student_idx
  on public.wf_pro_season_corrections(student_id,season,recorded_at desc);

do $$ declare t text; begin
  foreach t in array array[
    'wf_pro_level_versions','wf_pro_level_thresholds',
    'wf_pro_season_finalizations','wf_pro_season_standings',
    'wf_pro_season_corrections'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
  end loop;
end $$;

create function security.pro_immutable_record()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Finalized PRO Points history is immutable' using errcode='55000';
end $$;

create trigger pro_level_versions_immutable before update or delete on public.wf_pro_level_versions
for each row execute function security.pro_immutable_record();
create trigger pro_level_thresholds_immutable before update or delete on public.wf_pro_level_thresholds
for each row execute function security.pro_immutable_record();
create trigger pro_season_finalizations_immutable before update or delete on public.wf_pro_season_finalizations
for each row execute function security.pro_immutable_record();
create trigger pro_season_standings_immutable before update or delete on public.wf_pro_season_standings
for each row execute function security.pro_immutable_record();
create trigger pro_season_corrections_immutable before update or delete on public.wf_pro_season_corrections
for each row execute function security.pro_immutable_record();

create function security.pro_level_version_for(p_season date)
returns integer language sql stable security definer set search_path='' as $$
  select v.version
  from public.wf_pro_level_versions v
  where v.effective_season<=p_season
  order by v.effective_season desc,v.version desc
  limit 1
$$;

create function security.pro_finalize_season(p_season date,p_actor text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_version integer; v_count integer; v_end date; v_existing timestamptz;
begin
  if p_season is null
    or p_season<>date_trunc('quarter',p_season::timestamp)::date
    or p_season>=date_trunc('quarter',now() at time zone 'America/Chicago')::date
  then raise exception 'Only ended calendar-quarter seasons can be finalized' using errcode='22023'; end if;
  if p_actor is not null and not exists(select 1 from public.users u where u.user_id=p_actor and lower(u.status)='active')
  then raise exception 'Finalization actor unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pro-season:'||p_season::text,0));
  select finalized_at into v_existing from public.wf_pro_season_finalizations where season=p_season;
  if found then return jsonb_build_object('season',p_season,'finalizedAt',v_existing,'duplicate',true); end if;
  v_version:=security.pro_level_version_for(p_season);
  if v_version is null then raise exception 'Level configuration unavailable for season'; end if;
  v_end:=(p_season+interval '3 months - 1 day')::date;
  select count(*) into v_count
  from public.wf_student_profiles p join public.users u on u.user_id=p.user_id
  where lower(u.status)='active';
  insert into public.wf_pro_season_finalizations(
    season,season_ends,level_version,scoring_snapshot,student_count,finalized_by
  ) values (
    p_season,v_end,v_version,
    jsonb_build_object(
      'timezone','America/Chicago',
      'competitionRanking','1,1,3',
      'rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.code) from public.wf_pro_rules r),'[]'::jsonb)
    ),v_count,p_actor
  );
  with scores as (
    select p.student_id,p.school_id institution_id,p.cohort_id,
      coalesce(sum(l.points) filter(where l.season=p_season),0)::bigint season_points,
      coalesce(sum(l.points) filter(where l.season<=p_season),0)::bigint lifetime_points
    from public.wf_student_profiles p
    join public.users u on u.user_id=p.user_id and lower(u.status)='active'
    left join public.wf_pro_ledger l on l.student_id=p.student_id
    group by p.student_id,p.school_id,p.cohort_id
  ), ranked as (
    select s.*,
      case when s.cohort_id is null then null else rank() over(partition by s.cohort_id order by s.season_points desc) end cohort_rank,
      case when s.institution_id is null then null else rank() over(partition by s.institution_id order by s.season_points desc) end institution_rank,
      rank() over(order by s.season_points desc) txkpro_rank
    from scores s
  )
  insert into public.wf_pro_season_standings(
    season,student_id,institution_id,cohort_id,season_points,lifetime_points,
    lifetime_level,cohort_rank,institution_rank,txkpro_rank
  )
  select p_season,r.student_id,r.institution_id,r.cohort_id,r.season_points,r.lifetime_points,
    (select count(*)::integer from public.wf_pro_level_thresholds t where t.version=v_version and t.minimum_points<=r.lifetime_points),
    r.cohort_rank,r.institution_rank,r.txkpro_rank
  from ranked r;
  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata
  ) values (
    auth.uid(),p_actor,'PRO_SEASON_FINALIZED','pro_points_season',p_season::text,
    'workforce-domain-event',jsonb_build_object('studentCount',v_count,'levelVersion',v_version,'scoringSnapshot',true)
  );
  return jsonb_build_object('season',p_season,'seasonEnds',v_end,'studentCount',v_count,'levelVersion',v_version,'duplicate',false);
end $$;

create function security.pro_finalize_due_seasons(p_actor text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_start date; v_last date; v_season date; v_results jsonb:='[]'::jsonb;
begin
  select min(effective_season) into v_start from public.wf_pro_level_versions;
  v_last:=(date_trunc('quarter',now() at time zone 'America/Chicago')-interval '3 months')::date;
  if v_start is null or v_last<v_start then return v_results; end if;
  for v_season in select generate_series(v_start::timestamp,v_last::timestamp,interval '3 months')::date loop
    if not exists(select 1 from public.wf_pro_season_finalizations f where f.season=v_season) then
      v_results:=v_results||jsonb_build_array(security.pro_finalize_season(v_season,p_actor));
    end if;
  end loop;
  return v_results;
end $$;

create function security.pro_record_finalized_correction()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare v_actor text;
begin
  if not exists(select 1 from public.wf_pro_season_finalizations f where f.season=new.season) then return new; end if;
  select u.user_id into v_actor from public.users u where u.auth_user_id=auth.uid() and lower(u.status)='active' limit 1;
  insert into public.wf_pro_season_corrections(
    season,ledger_entry_id,student_id,points_delta,entry_type,reason,actor_user_id
  ) values (new.season,new.id,new.student_id,new.points,new.entry_type,new.reason,v_actor)
  on conflict(ledger_entry_id) do nothing;
  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,student_id,metadata
  ) values (
    auth.uid(),v_actor,'PRO_SEASON_CORRECTION_RECORDED','pro_points_ledger',new.id::text,
    'workforce-domain-event',new.student_id,
    jsonb_build_object('season',new.season,'pointsDelta',new.points,'entryType',new.entry_type)
  );
  return new;
end $$;

create trigger pro_finalized_season_correction
after insert on public.wf_pro_ledger
for each row execute function security.pro_record_finalized_correction();

create function security.pro_season_admin(p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text; v_op text; v_effective date; v_thresholds jsonb; v_version integer; v_value bigint; v_previous bigint:=-1; v_count integer:=0;
begin
  v_actor:=security.pro_actor();
  if not coalesce(security.is_admin(),false) then raise exception 'Platform administrator scope required' using errcode='42501'; end if;
  v_op:=p_input->>'op';
  if v_op='finalize_due_seasons' then return jsonb_build_object('finalized',security.pro_finalize_due_seasons(v_actor)); end if;
  if v_op<>'create_level_version' then raise exception 'Unsupported season action'; end if;
  v_effective:=(p_input->>'effectiveSeason')::date; v_thresholds:=p_input->'thresholds';
  if v_effective<>date_trunc('quarter',v_effective::timestamp)::date
    or v_effective<=date_trunc('quarter',now() at time zone 'America/Chicago')::date
  then raise exception 'Level version must start on a future quarter'; end if;
  if jsonb_typeof(v_thresholds)<>'array' or jsonb_array_length(v_thresholds)<>10
  then raise exception 'Provide exactly ten level thresholds'; end if;
  if length(btrim(coalesce(p_input->>'reason','')))=0 then raise exception 'Level version reason required'; end if;
  for v_value in
    select e.value::text::bigint from jsonb_array_elements(v_thresholds) as e(value)
  loop
    v_count:=v_count+1;
    if (v_count=1 and v_value<>0) or v_value<=v_previous then raise exception 'Level thresholds must start at zero and strictly increase'; end if;
    v_previous:=v_value;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('pro-level-versions',0));
  select coalesce(max(version),0)+1 into v_version from public.wf_pro_level_versions;
  insert into public.wf_pro_level_versions(version,effective_season,reason,created_by)
  values(v_version,v_effective,btrim(p_input->>'reason'),v_actor);
  insert into public.wf_pro_level_thresholds(version,level,minimum_points)
  select v_version,e.ordinality::integer,e.value::text::bigint
  from jsonb_array_elements(v_thresholds) with ordinality as e(value,ordinality);
  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata
  ) values (
    auth.uid(),v_actor,'PRO_LEVEL_VERSION_CREATED','pro_points_level_version',v_version::text,
    'workforce-domain-event',jsonb_build_object('effectiveSeason',v_effective,'thresholdCount',10)
  );
  return jsonb_build_object('ok',true,'version',v_version,'effectiveSeason',v_effective);
end $$;

create or replace function security.pro_summary(s text,public_view boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare points bigint; lifetime bigint; q date; rankings jsonb; pref text; sharing boolean; badges boolean; result jsonb;
  v_version integer; v_level integer; v_level_min bigint; v_next_level integer; v_next_min bigint; v_history jsonb;
begin
  q:=date_trunc('quarter',now() at time zone 'America/Chicago')::date;
  select coalesce(sum(l.points) filter(where l.season=q),0),coalesce(sum(l.points),0)
  into points,lifetime from public.wf_pro_ledger l where l.student_id=s;
  select ranking_scope,show_progress,show_system_badges into pref,sharing,badges
  from public.wf_student_portfolio_preferences where student_id=s;
  with scores as (
    select p.student_id,p.school_id,p.cohort_id,coalesce(sum(l.points),0) pts
    from public.wf_student_profiles p join public.users u on u.user_id=p.user_id and lower(u.status)='active'
    left join public.wf_pro_ledger l on l.student_id=p.student_id and l.season=q
    group by p.student_id,p.school_id,p.cohort_id
  ), target as (select * from scores where student_id=s)
  select jsonb_build_object(
    'cohort',case when t.cohort_id is null then null else (select count(*)+1 from scores x where x.cohort_id=t.cohort_id and x.pts>t.pts) end,
    'institution',case when t.school_id is null then null else (select count(*)+1 from scores x where x.school_id=t.school_id and x.pts>t.pts) end,
    'txkpro',(select count(*)+1 from scores x where x.pts>t.pts)
  ) into rankings from target t;
  v_version:=security.pro_level_version_for(q);
  select level,minimum_points into v_level,v_level_min from public.wf_pro_level_thresholds
  where version=v_version and minimum_points<=lifetime order by minimum_points desc limit 1;
  select level,minimum_points into v_next_level,v_next_min from public.wf_pro_level_thresholds
  where version=v_version and minimum_points>lifetime order by minimum_points limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'season',h.season,'seasonEnds',f.season_ends,'points',h.season_points,
    'lifetime',h.lifetime_points,'level',h.lifetime_level,'levelVersion',f.level_version,
    'finalizedAt',f.finalized_at,
    'rankings',jsonb_build_object('cohort',h.cohort_rank,'institution',h.institution_rank,'txkpro',h.txkpro_rank)
  ) order by h.season desc),'[]'::jsonb) into v_history
  from (select * from public.wf_pro_season_standings where student_id=s order by season desc limit 8) h
  join public.wf_pro_season_finalizations f on f.season=h.season;
  result:=jsonb_build_object(
    'season',q,'seasonEnds',(q+interval '3 months - 1 day')::date,
    'points',points,'lifetime',lifetime,'level',coalesce(v_level,1),'levelVersion',v_version,
    'levelMinimum',coalesce(v_level_min,0),'nextLevel',v_next_level,'nextLevelPoints',v_next_min,
    'preferredScope',coalesce(pref,'cohort'),'rankings',coalesce(rankings,jsonb_build_object('cohort',null,'institution',null,'txkpro',null)),
    'pastSeasons',v_history,
    'streaks',jsonb_build_array(security.pro_streak(s,'visit'),security.pro_streak(s,'check_in'),security.pro_streak(s,'engagement'))
  );
  if public_view and not coalesce(sharing,false) then result:=null; end if;
  return jsonb_build_object(
    'progress',result,
    'badges',case when not public_view or coalesce(badges,false) then coalesce((select jsonb_agg(jsonb_build_object('family',family,'tier',tier,'issuer','TXKPRO System','earnedAt',earned_at) order by tier desc) from public.wf_pro_system_badges where student_id=s and status='earned'),'[]') else '[]'::jsonb end
  ) || case when public_view then '{}'::jsonb else jsonb_build_object('shareSystemBadges',coalesce(badges,false)) end;
end $$;

alter function security.pro_workspace() rename to pro_workspace_before_season_finalization;
revoke all on function security.pro_workspace_before_season_finalization() from public,anon,authenticated,service_role;
create function security.pro_workspace()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_base jsonb; v_admin boolean; v_actor text;
begin
  v_actor:=security.pro_actor();
  perform security.pro_finalize_due_seasons(null);
  v_base:=security.pro_workspace_before_season_finalization(); v_admin:=security.is_admin();
  return v_base||jsonb_build_object(
    'canManageLevels',v_admin,
    'levelVersions',case when v_admin then coalesce((select jsonb_agg(jsonb_build_object(
      'version',v.version,'effectiveSeason',v.effective_season,'reason',v.reason,'createdAt',v.created_at,
      'thresholds',(select jsonb_agg(t.minimum_points order by t.level) from public.wf_pro_level_thresholds t where t.version=v.version)
    ) order by v.effective_season desc) from public.wf_pro_level_versions v),'[]'::jsonb) else '[]'::jsonb end
  );
end $$;

create or replace function security.pro_self_summary()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare s text;
begin
  perform security.pro_actor(); perform security.pro_finalize_due_seasons(null);
  s:=security.current_student_id();
  if s is null then raise exception 'Student self scope required' using errcode='42501'; end if;
  return security.pro_summary(s);
end $$;

create function public.pro_season_admin(p_input jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select security.pro_season_admin(p_input)
$$;

revoke all on function
  security.pro_immutable_record(),security.pro_level_version_for(date),
  security.pro_finalize_season(date,text),security.pro_finalize_due_seasons(text),
  security.pro_record_finalized_correction(),security.pro_season_admin(jsonb),
  security.pro_workspace(),security.pro_self_summary(),public.pro_season_admin(jsonb)
from public,anon,authenticated,service_role;
grant execute on function security.pro_workspace(),security.pro_self_summary() to authenticated;
grant execute on function security.pro_finalize_due_seasons(text) to service_role;
grant execute on function security.pro_season_admin(jsonb),public.pro_season_admin(jsonb) to authenticated;

