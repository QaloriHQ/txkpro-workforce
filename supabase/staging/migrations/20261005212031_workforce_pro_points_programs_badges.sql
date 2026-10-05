-- Owner-approved #224/#225/#239/#77-79. Additive; no historical awards or spendable value.
create table public.wf_pro_rules (
 code text primary key, category text not null check(category in ('reliability','mastery','community')),
 points integer not null check(points>0), daily_count integer, weekly_count integer,
 enabled boolean not null default false, version integer not null default 1
);
insert into public.wf_pro_rules(code,category,points,daily_count,weekly_count,enabled) values
('check_in','reliability',5,1,null,false),('trivia','reliability',5,1,null,false),
('attendance','reliability',5,1,null,false),('verified_skill','mastery',75,null,2,true),
('training','mastery',50,null,2,true),('lab','mastery',15,null,3,false),
('milestone','mastery',25,null,null,false),('mentoring','community',20,null,2,false),
('trade_tip','community',10,null,1,false);
create table public.wf_pro_ledger (
 id uuid primary key default gen_random_uuid(), student_id text not null references public.wf_student_profiles(student_id),
 rule_code text not null references public.wf_pro_rules(code), rule_version integer not null,
 source_key text not null, source_ref text, category text not null, requested_points integer not null,
 points integer not null, occurred_at timestamptz not null, recorded_at timestamptz not null default now(),
 local_day date not null, local_week date not null, season date not null,
 entry_type text not null check(entry_type in ('award','reversal')),
 reverses uuid references public.wf_pro_ledger(id), reason text not null,
 unique(student_id,rule_code,source_key,entry_type), unique(reverses),
 check((entry_type='award' and points>=0 and reverses is null) or (entry_type='reversal' and points<=0 and reverses is not null))
);
create index wf_pro_ledger_student_period on public.wf_pro_ledger(student_id,local_day,local_week);
create index wf_pro_ledger_season on public.wf_pro_ledger(season,student_id);
create index wf_pro_ledger_rule on public.wf_pro_ledger(rule_code);
create table public.wf_incentive_programs (
 id uuid primary key default gen_random_uuid(), owner_type text not null check(owner_type in ('platform','institution','employer')),
 owner_id text not null, name text not null check(length(name) between 1 and 100),
 template text not null check(template in ('competition','earn_redeem','combined')),
 status text not null default 'draft' check(status in ('draft','active','ended','cancelled')),
 starts_at timestamptz not null, ends_at timestamptz not null, terms text not null check(length(terms) between 1 and 4000),
 terms_version integer not null default 1, leaderboard_visible boolean not null default false,
 created_by text not null references public.users(user_id), created_at timestamptz not null default now(),
 check(ends_at>starts_at), unique(owner_type,owner_id,name)
);
create table public.wf_incentive_participants (
 id uuid primary key default gen_random_uuid(), program_id uuid not null references public.wf_incentive_programs(id),
 user_id text not null references public.users(user_id), kind text not null check(kind in ('student','employee','sponsored_student')),
 status text not null default 'pending' check(status in ('pending','active','declined','expired','cancelled')),
 invited_by text not null references public.users(user_id), accepted_version integer, accepted_at timestamptz,
 expires_at timestamptz not null, created_at timestamptz not null default now(), unique(program_id,user_id)
);
create index wf_incentive_participants_user on public.wf_incentive_participants(user_id,status);
create index wf_incentive_participants_inviter on public.wf_incentive_participants(invited_by);
create table public.wf_incentive_activities (
 id uuid primary key default gen_random_uuid(), program_id uuid not null references public.wf_incentive_programs(id),
 title text not null check(length(title) between 1 and 100),
 kind text not null check(kind in ('check_in','trivia','milestone','lab','mentoring','trade_tip','attendance','training')),
 audience text not null check(audience in ('student','employee','sponsored_student','all')),
 instructions text not null check(length(instructions) between 1 and 4000), private_points integer not null check(private_points between 0 and 1000),
 repeat_period text not null check(repeat_period in ('daily','weekly','once')), daily_cap integer not null check(daily_cap between 1 and 1000),
 weekly_cap integer not null check(weekly_cap between 1 and 1000),
 weekdays integer[] not null default '{1,2,3,4,5,6,7}' check(cardinality(weekdays)>0 and weekdays <@ array[1,2,3,4,5,6,7]),
 options jsonb, answer_index integer, version integer not null default 1, enabled boolean not null default true,
 created_at timestamptz not null default now(),
 check((kind='trivia' and jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 6 and answer_index>=0 and answer_index<jsonb_array_length(options)) or (kind<>'trivia' and answer_index is null))
);
create table public.wf_incentive_submissions (
 id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.wf_incentive_activities(id),
 participant_id uuid not null references public.wf_incentive_participants(id), period_key text not null,
 activity_version integer not null, terms_version integer not null, evidence text not null check(length(evidence)<=4000),
 answer integer, status text not null check(status in ('pending','approved','declined','reversed')),
 reviewed_by text references public.users(user_id), reviewed_at timestamptz, reason text,
 submitted_at timestamptz not null default now(), unique(activity_id,participant_id,period_key)
);
create index wf_incentive_submissions_participant on public.wf_incentive_submissions(participant_id,submitted_at);
create index wf_incentive_submissions_reviewer on public.wf_incentive_submissions(reviewed_by);
create table public.wf_incentive_score_ledger (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.wf_incentive_submissions(id),
 participant_id uuid not null references public.wf_incentive_participants(id), points integer not null,
 entry_type text not null check(entry_type in ('award','reversal')), reason text not null,
 created_at timestamptz not null default now(), unique(submission_id,entry_type),
 check((entry_type='award' and points>=0) or (entry_type='reversal' and points<=0))
);
create index wf_incentive_score_participant on public.wf_incentive_score_ledger(participant_id,created_at);
-- Funding provenance and pool states are scaffolding only. No mutator, conversion rate, checkout or issuance.
create table public.wf_incentive_pool_ledger (
 id uuid primary key default gen_random_uuid(), program_id uuid not null references public.wf_incentive_programs(id),
 entry_type text not null check(entry_type in ('funded','reserved','awarded','redeemed','reversed')),
 units bigint not null check(units>0), provenance text not null, external_key text not null unique,
 created_at timestamptz not null default now()
);
create table public.wf_pro_activity_days (
 student_id text not null references public.wf_student_profiles(student_id), family text not null check(family in ('visit','check_in','engagement')),
 day date not null, valid boolean not null default true, source_key text not null, created_at timestamptz not null default now(),
 primary key(student_id,family,day)
);
create table public.wf_pro_system_badges (
 id uuid primary key default gen_random_uuid(), student_id text not null references public.wf_student_profiles(student_id),
 family text not null check(family in ('visit','check_in','engagement')), tier integer not null check(tier in (3,7,15,30,90,180,395,650,1000)),
 earned_at timestamptz not null default now(), status text not null default 'earned' check(status in ('earned','revoked')),
 unique(student_id,family,tier)
);
create table public.wf_incentive_audit (
 id uuid primary key default gen_random_uuid(), program_id uuid references public.wf_incentive_programs(id),
 actor text references public.users(user_id), event text not null, target_id uuid, detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index wf_incentive_audit_program on public.wf_incentive_audit(program_id,created_at);
create index wf_incentive_audit_actor on public.wf_incentive_audit(actor);
-- All direct table operations are denied. Only checked, bounded RPC projections are exposed.
do $$ declare t text; begin
foreach t in array array['wf_pro_rules','wf_pro_ledger','wf_incentive_programs','wf_incentive_participants','wf_incentive_activities','wf_incentive_submissions','wf_incentive_score_ledger','wf_incentive_pool_ledger','wf_pro_activity_days','wf_pro_system_badges','wf_incentive_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
end loop; end $$;

create function security.pro_actor() returns text language plpgsql stable security definer set search_path='' as $$
declare u text; begin
 select user_id into u from public.users where auth_user_id=auth.uid() and lower(status)='active';
 if u is null then raise exception 'Active authentication required' using errcode='42501'; end if;
 return u; end $$;
create function security.pro_owner_access(t text,i text) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.users u where u.auth_user_id=auth.uid() and lower(u.status)='active') and
(case when t='platform' then i='txkpro' and security.is_admin()
 when t='employer' then security.has_employer_role(i,array['employer_owner','employer_admin']) and exists(select 1 from public.contractors c where c.contractor_id=i and c.approval_status='approved' and c.account_status='active')
 when t='institution' then exists(select 1 from public.wf_institutions institution where institution.institution_id=i and institution.active) and (security.is_admin() or exists(select 1 from public.app_role_memberships r join public.wf_institutions n on n.institution_id=r.scope_id where r.auth_user_id=auth.uid() and lower(r.status)='active' and r.role in ('institution_super_admin','institution_admin') and r.scope_type='institution' and r.scope_id=i and n.active))
 else false end) $$;
create function security.pro_award(s text,code text,k text,happened timestamptz,ref text default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.wf_pro_rules%rowtype; d date; w date; q date; usedday integer; usedweek integer; totalday integer; totalweek integer; n integer; catday integer; catweek integer; dc integer; wc integer;
begin
 select * into r from public.wf_pro_rules where wf_pro_rules.code=pro_award.code and enabled;
 if not found then return; end if;
 perform pg_advisory_xact_lock(hashtextextended('pro:'||s,0));
 if exists(select 1 from public.wf_pro_ledger where student_id=s and rule_code=code and source_key=k and entry_type='award') then return; end if;
 d:=(happened at time zone 'America/Chicago')::date; w:=date_trunc('week',d::timestamp)::date; q:=date_trunc('quarter',d::timestamp)::date;
 select coalesce(sum(points) filter(where local_day=d and category=r.category),0),coalesce(sum(points) filter(where local_week=w and category=r.category),0),coalesce(sum(points) filter(where local_day=d),0),coalesce(sum(points) filter(where local_week=w),0),count(*) filter(where local_day=d and rule_code=code and entry_type='award'),count(*) filter(where local_week=w and rule_code=code and entry_type='award') into usedday,usedweek,totalday,totalweek,dc,wc from public.wf_pro_ledger where student_id=s and local_week=w;
 catday:=case r.category when 'reliability' then 15 when 'mastery' then 150 else 20 end;
 catweek:=case r.category when 'reliability' then 75 when 'mastery' then 250 else 50 end;
 n:=greatest(0,least(r.points,catday-usedday,catweek-usedweek,185-totalday,375-totalweek));
 if (r.daily_count is not null and dc>=r.daily_count) or (r.weekly_count is not null and wc>=r.weekly_count) then n:=0; end if;
 insert into public.wf_pro_ledger(student_id,rule_code,rule_version,source_key,source_ref,category,requested_points,points,occurred_at,local_day,local_week,season,entry_type,reason) values(s,code,r.version,k,ref,r.category,r.points,n,happened,d,w,q,'award',case when n<r.points then 'Capped by approved schedule' else 'Canonical source validated' end);
end $$;
create function security.pro_reverse(s text,code text,k text,why text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('pro:'||s,0));
 insert into public.wf_pro_ledger(student_id,rule_code,rule_version,source_key,category,requested_points,points,occurred_at,local_day,local_week,season,entry_type,reverses,reason)
 select student_id,rule_code,rule_version,source_key,category,requested_points,-points,occurred_at,local_day,local_week,season,'reversal',id,why from public.wf_pro_ledger a where a.student_id=s and a.rule_code=code and a.source_key=k and a.entry_type='award' on conflict do nothing;
end $$;
create function security.pro_skill_source() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then perform security.pro_reverse(old.student_id,'verified_skill',old.skill_id,'Canonical skill removed'); return old; end if;
 if new.status='verified' and new.verified_at is not null and new.verified_by_user_id is not null and new.revoked_at is null and new.provenance='institution_verified' and exists(select 1 from public.users verifier join public.app_role_memberships m on m.auth_user_id=verifier.auth_user_id join public.wf_student_profiles student on student.student_id=new.student_id where verifier.user_id=new.verified_by_user_id and lower(verifier.status)='active' and lower(m.status)='active' and m.role in ('instructor','assistant_instructor','institution_admin','institution_super_admin','department_head','program_coordinator') and security.institution_scope_matches(student.school_id,m.scope_type,m.scope_id,student.cohort_id)) then
 if tg_op='INSERT' or old.status is distinct from 'verified' then perform security.pro_award(new.student_id,'verified_skill',new.skill_id,now(),new.student_skill_id); end if;
 elsif tg_op='UPDATE' then perform security.pro_reverse(old.student_id,'verified_skill',old.skill_id,'Canonical verification invalidated'); end if;
 return new; end $$;
create trigger pro_skill_source after insert or update of status,verified_at,verified_by_user_id,revoked_at,provenance or delete on public.wf_student_skills for each row execute function security.pro_skill_source();
create function security.pro_training_source() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.wf_micro_cert_assignments%rowtype; begin
 if tg_op='DELETE' then select * into a from public.wf_micro_cert_assignments where assignment_id=old.assignment_id;
 if old.outcome='passed' and exists(select 1 from public.wf_pro_ledger where source_ref=old.completion_id and entry_type='award') then perform security.pro_reverse(a.student_id,'training',a.micro_cert_id,'Canonical completion removed'); end if; return old; end if;
 select * into a from public.wf_micro_cert_assignments where assignment_id=new.assignment_id;
 if new.outcome='passed' and exists(select 1 from public.wf_employer_micro_cert_versions v join public.wf_employer_micro_certs c on c.micro_cert_id=v.micro_cert_id where v.micro_cert_version_id=a.micro_cert_version_id and v.status='live' and c.active and a.status<>'cancelled') then
 if tg_op='INSERT' or old.outcome is distinct from 'passed' then perform security.pro_award(a.student_id,'training',a.micro_cert_id,now(),new.completion_id); end if;
 elsif tg_op='UPDATE' and old.outcome='passed' and exists(select 1 from public.wf_pro_ledger where source_ref=old.completion_id and entry_type='award') then perform security.pro_reverse(a.student_id,'training',a.micro_cert_id,'Canonical completion invalidated'); end if;
 return new; end $$;
create trigger pro_training_source after insert or update of outcome or delete on public.wf_micro_cert_completions for each row execute function security.pro_training_source();

create function security.pro_assignment_source() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='cancelled' and old.status is distinct from 'cancelled' and exists(select 1 from public.wf_pro_ledger l join public.wf_micro_cert_completions c on c.completion_id=l.source_ref where c.assignment_id=new.assignment_id and l.student_id=new.student_id and l.rule_code='training' and l.entry_type='award') then
 perform security.pro_reverse(new.student_id,'training',new.micro_cert_id,'Canonical assignment cancelled');
 end if;
 return new;
end $$;
create trigger pro_assignment_source after update of status on public.wf_micro_cert_assignments for each row execute function security.pro_assignment_source();

create function security.pro_streak(s text,f text) returns jsonb language sql stable security definer set search_path='' as $$
with ordered as (select day,day-row_number() over(order by day)::integer grp from public.wf_pro_activity_days where student_id=s and family=f and valid), runs as (select max(day) last,count(*) length from ordered group by grp)
select jsonb_build_object('family',f,'current',coalesce(max(length) filter(where last>=(now() at time zone 'America/Chicago')::date-1),0),'longest',coalesce(max(length),0),'available',f='visit' or (f='check_in' and exists(select 1 from public.wf_incentive_activities a join public.wf_incentive_programs p on p.id=a.program_id where p.owner_type='platform' and a.kind='check_in' and a.repeat_period='daily' and cardinality(a.weekdays)=7 and a.enabled))) from runs $$;
create function security.pro_record_day(s text,f text,d date,k text) returns void language plpgsql security definer set search_path='' as $$
declare longest integer; begin
 perform pg_advisory_xact_lock(hashtextextended('streak:'||s||':'||f,0));
 insert into public.wf_pro_activity_days(student_id,family,day,source_key) values(s,f,d,k) on conflict(student_id,family,day) do update set valid=true,source_key=excluded.source_key;
 longest:=(security.pro_streak(s,f)->>'longest')::integer;
 insert into public.wf_pro_system_badges(student_id,family,tier) select s,f,t from unnest(array[3,7,15,30,90,180,395,650,1000]) t where t<=longest on conflict(student_id,family,tier) do update set status='earned',earned_at=now() where wf_pro_system_badges.status='revoked';
end $$;
create function security.pro_visit() returns void language plpgsql security definer set search_path='' as $$
declare s text; begin
 perform security.pro_actor(); s:=security.current_student_id(); if s is null then return; end if;
 perform security.pro_record_day(s,'visit',(now() at time zone 'America/Chicago')::date,'foreground_workspace');
end $$;

create function security.pro_summary(s text,public_view boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare points bigint; lifetime bigint; q date; rankings jsonb; pref text; sharing boolean; badges boolean; result jsonb;
begin
 q:=date_trunc('quarter',now() at time zone 'America/Chicago')::date;
 select coalesce(sum(l.points) filter(where l.season=q),0),coalesce(sum(l.points),0) into points,lifetime from public.wf_pro_ledger l where l.student_id=s;
 select ranking_scope,show_progress,show_badges into pref,sharing,badges from public.wf_student_portfolio_preferences where student_id=s;
 with scores as(select p.student_id,p.school_id,p.cohort_id,coalesce(sum(l.points),0) pts from public.wf_student_profiles p left join public.wf_pro_ledger l on l.student_id=p.student_id and l.season=q group by p.student_id,p.school_id,p.cohort_id), target as(select * from scores where student_id=s)
 select jsonb_build_object('cohort',case when t.cohort_id is null then null else (select count(*)+1 from scores x where x.cohort_id=t.cohort_id and x.pts>t.pts) end,'institution',case when t.school_id is null then null else (select count(*)+1 from scores x where x.school_id=t.school_id and x.pts>t.pts) end,'txkpro',(select count(*)+1 from scores x where x.pts>t.pts)) into rankings from target t;
 result:=jsonb_build_object('season',q,'seasonEnds',(q+interval '3 months')::date,'points',points,'lifetime',lifetime,'level',(select count(*) from unnest(array[0,250,750,1500,3000,5000,8000,12000,18000,25000]) t where t<=lifetime),'preferredScope',coalesce(pref,'cohort'),'rankings',rankings,'streaks',jsonb_build_array(security.pro_streak(s,'visit'),security.pro_streak(s,'check_in'),security.pro_streak(s,'engagement')));
 if public_view and not coalesce(sharing,false) then result:=null; end if;
 return jsonb_build_object('progress',result,'badges',case when not public_view or coalesce(badges,false) then coalesce((select jsonb_agg(jsonb_build_object('family',family,'tier',tier,'issuer','TXKPRO System','earnedAt',earned_at) order by tier desc) from public.wf_pro_system_badges where student_id=s and status='earned'),'[]') else '[]'::jsonb end);
end $$;
create function security.pro_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u text; s text; owners jsonb; programs jsonb; begin
 u:=security.pro_actor(); s:=security.current_student_id();
 select coalesce(jsonb_agg(v),'[]') into owners from (
 select 'platform' type,'txkpro' id,'TXKPRO' name where security.is_admin()
 union all select 'institution',institution_id,name from public.wf_institutions where active and security.pro_owner_access('institution',institution_id)
 union all select 'employer',contractor_id,business_name from public.contractors where security.pro_owner_access('employer',contractor_id)) v;
 select coalesce(jsonb_agg(j order by created_at desc),'[]') into programs from(select p.created_at,
 jsonb_build_object('id',p.id,'name',p.name,'ownerType',p.owner_type,'template',p.template,'status',p.status,'startsAt',p.starts_at,'endsAt',p.ends_at,'terms',p.terms,'termsVersion',p.terms_version,'leaderboardVisible',p.leaderboard_visible,'canManage',security.pro_owner_access(p.owner_type,p.owner_id),
 'participation',(select jsonb_build_object('id',id,'kind',kind,'status',case when status='pending' and expires_at<=now() then 'expired' else status end,'acceptedVersion',accepted_version) from public.wf_incentive_participants where program_id=p.id and user_id=u),
 'participants',case when security.pro_owner_access(p.owner_type,p.owner_id) then (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',concat_ws(' ',usr.first_name,usr.last_name),'kind',r.kind,'status',case when r.status='pending' and r.expires_at<=now() then 'expired' else r.status end,'score',coalesce((select sum(points) from public.wf_incentive_score_ledger where participant_id=r.id),0))),'[]') from public.wf_incentive_participants r join public.users usr on usr.user_id=r.user_id where r.program_id=p.id) else '[]'::jsonb end,
 'leaderboard',case when p.leaderboard_visible and exists(select 1 from public.wf_incentive_participants me where me.program_id=p.id and me.user_id=u and me.status='active') then (select coalesce(jsonb_agg(jsonb_build_object('rank',v.rank,'name',v.name,'score',v.score)),'[]') from(select rank() over(order by coalesce(sum(l.points),0) desc) rank,concat_ws(' ',usr.first_name,left(usr.last_name,1)) name,coalesce(sum(l.points),0) score from public.wf_incentive_participants r join public.users usr on usr.user_id=r.user_id left join public.wf_incentive_score_ledger l on l.participant_id=r.id where r.program_id=p.id and r.status='active' group by r.id,usr.first_name,usr.last_name) v) else '[]'::jsonb end,
 'activities',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'kind',a.kind,'audience',a.audience,'instructions',a.instructions,'points',a.private_points,'repeat',a.repeat_period,'dailyCap',a.daily_cap,'weeklyCap',a.weekly_cap,'weekdays',a.weekdays,'options',a.options,'enabled',a.enabled,'submissions',
 (select coalesce(jsonb_agg(jsonb_build_object('id',z.id,'participantName',concat_ws(' ',usr.first_name,usr.last_name),'status',z.status,'evidence',z.evidence,'reason',z.reason,'submittedAt',z.submitted_at)),'[]') from (select * from public.wf_incentive_submissions where activity_id=a.id order by submitted_at desc limit 100) z join public.wf_incentive_participants r on r.id=z.participant_id join public.users usr on usr.user_id=r.user_id where security.pro_owner_access(p.owner_type,p.owner_id) or r.user_id=u)) order by a.created_at),'[]') from public.wf_incentive_activities a where a.program_id=p.id and (security.pro_owner_access(p.owner_type,p.owner_id) or exists(select 1 from public.wf_incentive_participants me where me.program_id=p.id and me.user_id=u and (a.audience='all' or a.audience=me.kind))))) j
 from public.wf_incentive_programs p where security.pro_owner_access(p.owner_type,p.owner_id) or exists(select 1 from public.wf_incentive_participants r where r.program_id=p.id and r.user_id=u)
 order by p.created_at desc limit 50) rows;
 return jsonb_build_object('summary',case when s is not null then security.pro_summary(s) else null end,'owners',owners,'programs',programs,'ledger',case when s is not null then coalesce((select jsonb_agg(jsonb_build_object('id',id,'category',category,'rule',rule_code,'points',points,'requested',requested_points,'reason',reason,'occurredAt',occurred_at)) from (select * from public.wf_pro_ledger where student_id=s order by recorded_at desc limit 100) l),'[]') else '[]'::jsonb end);
end $$;
create function security.pro_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u text; op text; p public.wf_incentive_programs%rowtype; a public.wf_incentive_activities%rowtype; r public.wf_incentive_participants%rowtype; z public.wf_incentive_submissions%rowtype;
 target uuid; student text; d date; w date; key text; awarded integer; taken integer; recipient text; typ text; owner text; outcome text;
begin
 u:=security.pro_actor(); op:=input->>'op';
 if op='visit' then perform security.pro_visit(); return jsonb_build_object('ok',true); end if;
 if op='create_program' then
 typ:=input->>'ownerType'; owner:=input->>'ownerId';
 if not security.pro_owner_access(typ,owner) then raise exception 'Owner scope denied' using errcode='42501'; end if;
 insert into public.wf_incentive_programs(owner_type,owner_id,name,template,starts_at,ends_at,terms,leaderboard_visible,created_by)
 values(typ,owner,btrim(input->>'name'),input->>'template',(input->>'startsAt')::timestamptz,(input->>'endsAt')::timestamptz,btrim(input->>'terms'),coalesce((input->>'leaderboardVisible')::boolean,false),u) returning id into target;
 insert into public.wf_incentive_audit(program_id,actor,event,target_id) values(target,u,'PROGRAM_CREATED',target);
 return jsonb_build_object('id',target);
 end if;
 select * into p from public.wf_incentive_programs where id=(input->>'programId')::uuid for update;
 if not found then raise exception 'Program unavailable' using errcode='42501'; end if;
 if op in ('accept','decline') then
 select * into r from public.wf_incentive_participants where program_id=p.id and user_id=u for update;
 if not found or r.status<>'pending' or r.expires_at<=now() or p.status<>'active' or p.ends_at<=now() then raise exception 'Invitation unavailable'; end if;
 if op='accept' and (input->>'termsVersion')::integer<>p.terms_version then raise exception 'Review current terms'; end if;
 update public.wf_incentive_participants set status=case when op='accept' then 'active' else 'declined' end,accepted_version=case when op='accept' then p.terms_version end,accepted_at=case when op='accept' then now() end where id=r.id;
 target:=r.id;
 elsif op='submit' then
 select * into r from public.wf_incentive_participants where program_id=p.id and user_id=u and status='active' for update;
 if not found or p.status<>'active' or now()<p.starts_at or now()>=p.ends_at or r.accepted_version<>p.terms_version then raise exception 'Active accepted participation required' using errcode='42501'; end if;
 select * into a from public.wf_incentive_activities where id=(input->>'activityId')::uuid and program_id=p.id and enabled;
 if not found or (a.audience<>'all' and a.audience<>r.kind) then raise exception 'Activity audience denied' using errcode='42501'; end if;
 d:=(now() at time zone 'America/Chicago')::date; w:=date_trunc('week',d::timestamp)::date;
 if not extract(isodow from d)::integer=any(a.weekdays) then raise exception 'Activity is not scheduled today'; end if;
 key:=case a.repeat_period when 'daily' then d::text when 'weekly' then w::text else 'once' end;
 if exists(select 1 from public.wf_incentive_submissions where activity_id=a.id and participant_id=r.id and period_key=key) then return jsonb_build_object('ok',true,'duplicate',true); end if;
 outcome:='pending';
 if a.kind='trivia' then
 if (input->>'answer') is null or (input->>'answer')::integer<0 or (input->>'answer')::integer>=jsonb_array_length(a.options) then raise exception 'Select a valid answer'; end if;
 outcome:=case when (input->>'answer')::integer=a.answer_index then 'approved' else 'declined' end;
 elsif length(btrim(coalesce(input->>'evidence','')))=0 then raise exception 'Completion evidence required'; end if;
 insert into public.wf_incentive_submissions(activity_id,participant_id,period_key,activity_version,terms_version,evidence,answer,status,reviewed_at,reason)
 values(a.id,r.id,key,a.version,p.terms_version,coalesce(input->>'evidence',''),case when a.kind='trivia' then (input->>'answer')::integer end,outcome,case when a.kind='trivia' then now() end,case when a.kind='trivia' then 'Validated trivia attempt; no retry' end) returning * into z;
 target:=z.id;
 else
 if not security.pro_owner_access(p.owner_type,p.owner_id) then raise exception 'Program management scope denied' using errcode='42501'; end if;
 if op='set_status' then
 outcome:=input->>'status';
 if not ((p.status='draft' and outcome in ('active','cancelled')) or (p.status='active' and outcome in ('ended','cancelled'))) then raise exception 'Invalid program transition'; end if;
 if outcome='active' and p.ends_at<=now() then raise exception 'Program end must be in the future'; end if;
 update public.wf_incentive_programs set status=outcome where id=p.id; target:=p.id;
 elsif op='invite' then
 -- Invitation is program-only, never an employer staff membership or verified employment claim.
 select user_id into recipient from public.users where lower(email)=lower(btrim(input->>'email')) and lower(status)='active';
 if recipient is null then raise exception 'Recipient needs an activated TXKPRO account before program invitation'; end if;
 if p.status<>'active' or p.ends_at<=now() then raise exception 'Active program required'; end if;
 typ:=input->>'kind';
 if (p.owner_type='institution' and typ<>'student') or (p.owner_type='employer' and typ not in ('employee','sponsored_student')) or (p.owner_type='platform' and typ<>'student') then raise exception 'Participation type unavailable'; end if;
 if typ in ('student','sponsored_student') and not exists(select 1 from public.wf_student_profiles s where s.user_id=recipient and (p.owner_type<>'institution' or s.school_id=p.owner_id)) then raise exception 'Eligible Student affiliation required'; end if;
 insert into public.wf_incentive_participants(program_id,user_id,kind,invited_by,expires_at) values(p.id,recipient,typ,u,least(p.ends_at,now()+interval '14 days')) returning id into target;
 elsif op='cancel_participant' then
 update public.wf_incentive_participants set status='cancelled' where id=(input->>'participantId')::uuid and program_id=p.id and status in ('pending','active') returning id into target;
 if target is null then raise exception 'Participant transition unavailable'; end if;
 elsif op='create_activity' then
 if p.status<>'draft' then raise exception 'Activities are fixed at activation; create a new program for changed rules'; end if;
 if (p.owner_type='institution' and input->>'audience' not in ('all','student')) or (p.owner_type='employer' and input->>'audience' not in ('all','employee','sponsored_student')) or (p.owner_type='platform' and input->>'audience' not in ('all','student')) then raise exception 'Invalid audience'; end if;
 if input->>'kind'='trivia' and (jsonb_typeof(input->'options') is distinct from 'array' or exists(select 1 from jsonb_array_elements(input->'options') o where jsonb_typeof(o)<>'string' or length(o#>>'{}') not between 1 and 200)) then raise exception 'Invalid trivia options'; end if;
 insert into public.wf_incentive_activities(program_id,title,kind,audience,instructions,private_points,repeat_period,daily_cap,weekly_cap,weekdays,options,answer_index)
 values(p.id,btrim(input->>'title'),input->>'kind',input->>'audience',btrim(input->>'instructions'),(input->>'points')::integer,input->>'repeat',(input->>'dailyCap')::integer,(input->>'weeklyCap')::integer,array(select distinct jsonb_array_elements_text(input->'weekdays')::integer),case when input->>'kind'='trivia' then input->'options' end,case when input->>'kind'='trivia' then (input->>'answerIndex')::integer end) returning id into target;
 elsif op in ('approve','reject','reverse') then
 select * into z from public.wf_incentive_submissions where id=(input->>'submissionId')::uuid for update;
 select * into a from public.wf_incentive_activities where id=z.activity_id and program_id=p.id;
 if not found then raise exception 'Submission scope denied' using errcode='42501'; end if;
 select * into r from public.wf_incentive_participants where id=z.participant_id for update;
 if r.user_id=u then raise exception 'Self approval denied' using errcode='42501'; end if;
 if length(btrim(coalesce(input->>'reason','')))=0 or length(input->>'reason')>1000 then raise exception 'Review reason required (maximum 1000 characters)'; end if;
 if op='reverse' then
 if z.status<>'approved' then raise exception 'Only approved evidence can be reversed'; end if;
 insert into public.wf_incentive_score_ledger(submission_id,participant_id,points,entry_type,reason)
 select z.id,r.id,-points,'reversal',input->>'reason' from public.wf_incentive_score_ledger where submission_id=z.id and entry_type='award' on conflict do nothing;
 outcome:='reversed';
 if p.owner_type='platform' and a.kind='check_in' and a.repeat_period='daily' and cardinality(a.weekdays)=7 then
 select student_id into student from public.wf_student_profiles where user_id=r.user_id;
 d:=(z.submitted_at at time zone 'America/Chicago')::date;
 if student is not null then
 perform pg_advisory_xact_lock(hashtextextended('streak:'||student||':check_in',0));
 update public.wf_pro_activity_days set valid=false where student_id=student and family='check_in' and day=d and not exists(select 1 from public.wf_incentive_submissions other join public.wf_incentive_activities act on act.id=other.activity_id join public.wf_incentive_programs prog on prog.id=act.program_id join public.wf_incentive_participants part on part.id=other.participant_id where other.id<>z.id and other.status='approved' and part.user_id=r.user_id and prog.owner_type='platform' and act.kind='check_in' and act.repeat_period='daily' and cardinality(act.weekdays)=7 and (other.submitted_at at time zone 'America/Chicago')::date=d);
 update public.wf_pro_system_badges set status='revoked' where student_id=student and family='check_in' and status='earned' and tier>(security.pro_streak(student,'check_in')->>'longest')::integer;
 end if;
 end if;
 else
 if z.status<>'pending' or r.status<>'active' or not exists(select 1 from public.users where user_id=r.user_id and status='active') then raise exception 'Pending submission and active participant required'; end if;
 outcome:=case when op='approve' then 'approved' else 'declined' end;
 end if;
 update public.wf_incentive_submissions set status=outcome,reviewed_by=u,reviewed_at=now(),reason=input->>'reason' where id=z.id;
 z.status:=outcome; target:=z.id;
 else raise exception 'Unsupported action'; end if;
 end if;
 if z.id is not null and z.status='approved' then
 d:=(z.submitted_at at time zone 'America/Chicago')::date; w:=date_trunc('week',d::timestamp)::date;
 select coalesce(sum(l.points) filter(where (src.submitted_at at time zone 'America/Chicago')::date=d),0) into taken from public.wf_incentive_score_ledger l join public.wf_incentive_submissions src on src.id=l.submission_id where l.participant_id=r.id and src.activity_id=a.id;
 awarded:=greatest(0,least(a.private_points,a.daily_cap-taken));
 select coalesce(sum(l.points) filter(where date_trunc('week',src.submitted_at at time zone 'America/Chicago')::date=w),0) into taken from public.wf_incentive_score_ledger l join public.wf_incentive_submissions src on src.id=l.submission_id where l.participant_id=r.id and src.activity_id=a.id;
 awarded:=greatest(0,least(awarded,a.weekly_cap-taken));
 insert into public.wf_incentive_score_ledger(submission_id,participant_id,points,entry_type,reason) values(z.id,r.id,awarded,'award',case when awarded<a.private_points then 'Private activity cap' else 'Validated private activity' end) on conflict do nothing;
 if p.owner_type='platform' and a.kind='check_in' and a.repeat_period='daily' and cardinality(a.weekdays)=7 then
 select student_id into student from public.wf_student_profiles where user_id=r.user_id;
 if student is not null then perform security.pro_record_day(student,'check_in',d,z.id::text); end if;
 end if;
 end if;
 insert into public.wf_incentive_audit(program_id,actor,event,target_id,detail) values(p.id,u,upper(op),target,jsonb_build_object('termsVersion',p.terms_version));
 return jsonb_build_object('ok',true,'id',target);
end $$;
create function public.pro_workspace() returns jsonb language sql security invoker set search_path='' as $$ select security.pro_workspace() $$;
create function public.pro_action(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select security.pro_action(p_input) $$;
-- Service-only public projection: reuse canonical publication gate before resolving the student.
create function security.pro_public(path text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare profile jsonb; s text; begin
 profile:=public.student_public_profile_read(path);
 if not coalesce((profile->>'found')::boolean,false) or coalesce((profile->>'redirect')::boolean,false) then return null; end if;
 select entity_id into s from public.wf_public_pages where canonical_path=path and entity_type='student';
 if s is null then return null; end if;
 return security.pro_summary(s,true);
end $$;
create function public.pro_public(p_path text) returns jsonb language sql security invoker set search_path='' as $$ select security.pro_public(p_path) $$;
revoke all on function public.pro_workspace(), public.pro_action(jsonb), public.pro_public(text) from public,anon,authenticated;
grant execute on function public.pro_workspace(),public.pro_action(jsonb) to authenticated;
grant execute on function public.pro_public(text) to service_role;
do $$ declare f record; begin
 for f in select p.oid::regprocedure name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='security' and p.proname like 'pro_%' loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.name); end loop;
end $$;
grant execute on function security.pro_workspace(),security.pro_action(jsonb) to authenticated;
grant execute on function security.pro_public(text) to service_role;
create function security.pro_program_report(pid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.wf_incentive_programs%rowtype; u text; result jsonb; begin
 u:=security.pro_actor(); select * into p from public.wf_incentive_programs where id=pid;
 if not found or not security.pro_owner_access(p.owner_type,p.owner_id) then raise exception 'Report scope denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('name',concat_ws(' ',usr.first_name,usr.last_name),'kind',r.kind,'status',case when r.status='pending' and r.expires_at<=now() then 'expired' else r.status end,'points',coalesce((select sum(points) from public.wf_incentive_score_ledger where participant_id=r.id),0),'approved',(select count(*) from public.wf_incentive_submissions where participant_id=r.id and status='approved'))),'[]') into result from public.wf_incentive_participants r join public.users usr on usr.user_id=r.user_id where r.program_id=p.id;
 insert into public.wf_incentive_audit(program_id,actor,event,target_id) values(p.id,u,'PROGRAM_REPORT_EXPORTED',p.id);
 return result;
end $$;
create function public.pro_program_report(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select security.pro_program_report(p_id) $$;
revoke all on function public.pro_program_report(uuid),security.pro_program_report(uuid) from public,anon,authenticated,service_role;
grant execute on function public.pro_program_report(uuid),security.pro_program_report(uuid) to authenticated;
create function security.pro_self_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s text; begin perform security.pro_actor(); s:=security.current_student_id(); if s is null then raise exception 'Student self scope required' using errcode='42501'; end if; return security.pro_summary(s); end $$;
create function public.pro_self_summary() returns jsonb language sql security invoker set search_path='' as $$ select security.pro_self_summary() $$;
revoke all on function public.pro_self_summary(),security.pro_self_summary() from public,anon,authenticated,service_role;
grant execute on function public.pro_self_summary(),security.pro_self_summary() to authenticated;

create index wf_incentive_programs_creator on public.wf_incentive_programs(created_by);
create index wf_incentive_activities_program on public.wf_incentive_activities(program_id,created_at);
create index wf_incentive_pool_program on public.wf_incentive_pool_ledger(program_id,created_at);
