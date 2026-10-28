-- #368: additive employer program authoring and confidential operational cases.
-- Reuses canonical programs, participants, review and reward ledgers. No provider calls or funds minted.
alter table public.wf_incentive_activities add column engine_key text;
create unique index wf_incentive_activities_engine_key on public.wf_incentive_activities(program_id,engine_key) where engine_key is not null;
create table public.wf_incentive_definitions (
 program_id uuid primary key references public.wf_incentive_programs(id),
 revision integer not null default 1 check(revision>0), draft jsonb not null,
 published jsonb, paused boolean not null default false, archived boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.wf_incentive_definition_versions (
 program_id uuid not null references public.wf_incentive_programs(id), revision integer not null,
 definition jsonb not null, actor text not null references public.users(user_id), created_at timestamptz not null default now(),
 primary key(program_id,revision)
);
create table public.wf_incentive_cases (
 id uuid primary key default gen_random_uuid(), program_id uuid not null references public.wf_incentive_programs(id),
 actor text not null references public.users(user_id), recipient_id uuid references public.wf_incentive_participants(id),
 kind text not null check(kind in ('safety','dispute','recognition')),
 source_key text not null check(length(source_key) between 1 and 100),
 body text not null check(length(body) between 1 and 4000),
 status text not null default 'pending' check(status in ('pending','verified','declined','resolved','appealed')),
 appeal_used boolean not null default false, history jsonb not null default '[]',
 reason text, reviewed_by text references public.users(user_id),
 created_at timestamptz not null default now(), deadline timestamptz, resolved_at timestamptz,
 unique(program_id,actor,kind,source_key)
);
create table public.wf_incentive_crew_assignments (
 program_id uuid not null references public.wf_incentive_programs(id), crew_id text not null,
 member_ids uuid[] not null default '{}', revision integer not null default 1,
 updated_by text not null references public.users(user_id), updated_at timestamptz not null default now(),
 primary key(program_id,crew_id),check(cardinality(member_ids)<=1000)
);
create index wf_incentive_crew_assignments_actor on public.wf_incentive_crew_assignments(updated_by);
create index wf_incentive_cases_program on public.wf_incentive_cases(program_id,created_at);
create index wf_incentive_cases_recipient on public.wf_incentive_cases(recipient_id);
create index wf_incentive_cases_actor on public.wf_incentive_cases(actor);
create index wf_incentive_cases_reviewer on public.wf_incentive_cases(reviewed_by);
do $$ declare t text; begin
 foreach t in array array['wf_incentive_definitions','wf_incentive_definition_versions','wf_incentive_cases','wf_incentive_crew_assignments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function security.incentive_validate(d jsonb, publishing boolean) returns void language plpgsql set search_path='' as $$
declare k text; t jsonb; m jsonb; c jsonb; n integer;begin
 if octet_length(d::text)>100000 or jsonb_typeof(d) is distinct from 'object' or (d->>'schemaVersion') is distinct from '1' then raise exception 'Invalid program definition'; end if;
 if length(btrim(coalesce(d->>'name',''))) not between 1 and 100 or length(coalesce(d->>'description',''))>1000 or length(coalesce(d->>'terms',''))>4000 then raise exception 'Check program name and terms'; end if;
 if d->>'blueprint' is null or d->>'blueprint' not in ('quality','delivery','safety','recognition','retention','combined') then raise exception 'Choose a blueprint'; end if;
 if not exists(select 1 from pg_timezone_names where name=d->>'timezone') then raise exception 'Choose a valid timezone'; end if;
 if (d->>'startsAt')::timestamptz is null or (d->>'endsAt')::timestamptz is null or (d->>'endsAt')::timestamptz<=(d->>'startsAt')::timestamptz then raise exception 'Check program dates'; end if;
 foreach k in array array['budgetCents','creditsPerBlock','centsPerBlock','minimumCredits','safetyPoints','givingAllowance','recipientMonthlyCap','departureDays'] loop
 if jsonb_typeof(d->k) is distinct from 'number' or (d->>k)!~'^[0-9]+$' or (d->>k)::numeric>100000000 then raise exception 'Check integral reward values'; end if;
 end loop;
 if (d->>'creditsPerBlock')::int<1 or (d->>'centsPerBlock')::int<1 or (d->>'minimumCredits')::int<1 or (d->>'departureDays')::int not between 1 and 3650 then raise exception 'Check reward policy'; end if;
 if d->>'expiryMonths' is not null and ((d->>'expiryMonths')!~'^[0-9]+$' or (d->>'expiryMonths')::int not between 1 and 120) then raise exception 'Check expiration'; end if;
 if coalesce(d->>'departure','') not in ('retain','window') or coalesce(d->>'safetyMode','') not in ('immediate','bank','bank_and_redeem') then raise exception 'Check reward policy'; end if;
 if jsonb_typeof(d->'publicRecognition') is distinct from 'boolean' then raise exception 'Check recognition visibility';end if;
 if jsonb_typeof(d->'teams') is distinct from 'array' or jsonb_array_length(d->'teams')>50 or jsonb_typeof(d->'milestones') is distinct from 'array' or jsonb_array_length(d->'milestones')>50 then raise exception 'Check teams and milestones';end if;
 for t in select * from jsonb_array_elements(d->'teams') loop
 if length(coalesce(t->>'id','')) not between 1 and 100 or length(btrim(coalesce(t->>'name',''))) not between 1 and 100 or jsonb_typeof(t->'participantIds') is distinct from 'array' then raise exception 'Check crew roster';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(d->'teams') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate crew';end if;
 for m in select * from jsonb_array_elements(d->'milestones') loop
 if length(coalesce(m->>'id','')) not between 1 and 100 or length(btrim(coalesce(m->>'title',''))) not between 1 and 100 or coalesce(m->>'recipient','') not in ('individual','crew') or coalesce(m->>'match','') not in ('all','any') or coalesce(m->>'approval','') not in ('manager','safety_then_manager') or coalesce(m->>'points','')!~'^[0-9]+$' then raise exception 'Check milestone';end if;
 n:=(m->>'points')::int;
 if n not between 1 and 1000000 or jsonb_typeof(m->'safetyRequired') is distinct from 'boolean' or jsonb_typeof(m->'conditions') is distinct from 'array' or jsonb_array_length(m->'conditions') not between 1 and 10 then raise exception 'Check milestone conditions';end if;
 for c in select * from jsonb_array_elements(m->'conditions') loop
 if coalesce(c->>'metric','') not in ('budget_percent','delay_hours','reviews','training_count','service_days','qualifying_projects') or coalesce(c->>'operator','') not in ('gte','lte') or jsonb_typeof(c->'value') is distinct from 'number' or (c->>'value')::numeric not between 0 and 1000000 then raise exception 'Check milestone condition';end if;
 end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(d->'milestones') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate milestone';end if;
 if publishing and (length(btrim(coalesce(d->>'terms','')))=0 or jsonb_array_length(d->'milestones')=0 or (d->>'endsAt')::timestamptz<=now()) then raise exception 'Add terms, milestones and future end date';end if;
end $$;

create function security.incentive_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor text:=security.pro_actor(); op text:=input->>'op'; p public.wf_incentive_programs%rowtype;
 cfg public.wf_incentive_definitions%rowtype; item public.wf_incentive_cases%rowtype;
 definition jsonb:=input->'definition'; target uuid; result jsonb; reviewer text; manager boolean; participant uuid; recipient uuid; roster jsonb; crew jsonb; milestone jsonb; crew_revision integer; members uuid[];
begin
 reviewer:=actor;
 if op='create' then
 if not security.pro_owner_access('employer',input->>'ownerId') then raise exception 'Program scope denied' using errcode='42501';end if;
 perform security.incentive_validate(definition,false);
 result:=security.pro_action(jsonb_build_object('op','create_program','ownerType','employer','ownerId',input->>'ownerId','name',definition->>'name','template','combined','startsAt',definition->>'startsAt','endsAt',definition->>'endsAt','terms',coalesce(nullif(definition->>'terms',''),'Draft — terms pending'),'leaderboardVisible',false));
 target:=(result->>'id')::uuid;
 insert into public.wf_incentive_definitions(program_id,draft) values(target,definition);
 return jsonb_build_object('id',target,'revision',1);
 end if;
 select * into p from public.wf_incentive_programs where id=(input->>'programId')::uuid and owner_type='employer' for update;
 if not found then raise exception 'Program scope denied' using errcode='42501';end if;
 manager:=security.pro_owner_access('employer',p.owner_id);
 select id into participant from public.wf_incentive_participants where program_id=p.id and user_id=actor and status='active' and accepted_version=p.terms_version;
 if not manager and participant is null then raise exception 'Program scope denied' using errcode='42501';end if;
 select * into cfg from public.wf_incentive_definitions where program_id=p.id for update;
 if op='crew_assignment' then
 if not manager then raise exception 'Program management scope denied' using errcode='42501';end if;
 if cfg.published is null or not exists(select 1 from jsonb_array_elements(cfg.published->'teams') t where t->>'id'=input->>'crewId') then raise exception 'Published crew required';end if;
 select revision into crew_revision from public.wf_incentive_crew_assignments where program_id=p.id and crew_id=input->>'crewId';
 if (input->>'revision')::integer is distinct from coalesce(crew_revision,0) then raise exception 'Revision conflict' using errcode='40001';end if;
 if jsonb_typeof(input->'memberIds') is distinct from 'array' or jsonb_array_length(input->'memberIds')>1000 then raise exception 'Check crew roster';end if;
 members:=array(select distinct jsonb_array_elements_text(input->'memberIds')::uuid);
 if exists(select 1 from unnest(members) member where not exists(select 1 from public.wf_incentive_participants r join public.users u on u.user_id=r.user_id where r.id=member and r.program_id=p.id and r.status='active' and r.accepted_version=p.terms_version and u.status='active')) then raise exception 'Crew member scope denied' using errcode='42501';end if;
 insert into public.wf_incentive_crew_assignments(program_id,crew_id,member_ids,updated_by) values(p.id,input->>'crewId',members,actor) on conflict(program_id,crew_id) do update set member_ids=excluded.member_ids,revision=wf_incentive_crew_assignments.revision+1,updated_by=excluded.updated_by,updated_at=now();
 insert into public.wf_incentive_audit(program_id,actor,event,target_id) values(p.id,actor,'INCENTIVE_CREW_ASSIGNED',p.id);
 return jsonb_build_object('id',p.id,'revision',coalesce(crew_revision,0)+1);
 end if;
 if op in ('save','publish','pause','resume','archive','restore') then
 if not manager then raise exception 'Program management scope denied' using errcode='42501';end if;
 if op='save' then
 perform security.incentive_validate(definition,false);
 -- A legacy program is adopted explicitly with expected revision zero.
 if cfg.program_id is null then
 if (input->>'revision')::int is distinct from 0 then raise exception 'Revision conflict' using errcode='40001';end if;
 insert into public.wf_incentive_definitions(program_id,draft) values(p.id,definition) returning * into cfg;
 else
 if (input->>'revision')::int is distinct from cfg.revision then raise exception 'Revision conflict' using errcode='40001';end if;
 update public.wf_incentive_definitions set draft=definition,revision=revision+1,updated_at=now() where program_id=p.id returning * into cfg;
 end if;
 if p.status='draft' and cfg.published is null then update public.wf_incentive_programs set name=definition->>'name',starts_at=(definition->>'startsAt')::timestamptz,ends_at=(definition->>'endsAt')::timestamptz,terms=coalesce(nullif(definition->>'terms',''),'Draft — terms pending') where id=p.id;end if;
 elsif op='publish' then
 if cfg.program_id is null or cfg.archived or (input->>'revision')::int is distinct from cfg.revision then raise exception 'Revision conflict' using errcode='40001';end if;
 perform security.incentive_validate(cfg.draft,true);
 -- Never replace terms for an active or previously accepted cohort.
 if p.status<>'draft' or exists(select 1 from public.wf_incentive_participants where program_id=p.id and accepted_version is not null) then raise exception 'Duplicate program for changed published terms';end if;
 for crew in select * from jsonb_array_elements(cfg.draft->'teams') loop
 for roster in select * from jsonb_array_elements(crew->'participantIds') loop
 if not exists(select 1 from public.wf_incentive_participants where id=(roster#>>'{}')::uuid and program_id=p.id) then raise exception 'Crew member scope denied' using errcode='42501';end if;
 end loop;end loop;
 -- Publish reviewable canonical activities without converting reward points into private scores.
 for milestone in select * from jsonb_array_elements(cfg.draft->'milestones') loop
 insert into public.wf_incentive_activities(program_id,engine_key,title,kind,audience,instructions,private_points,repeat_period,daily_cap,weekly_cap)
 values(p.id,milestone->>'id',milestone->>'title','milestone','all',
 'Provide evidence for '||(milestone->>'title')||'. Proposed reward: '||(milestone->>'points')||' points after verified conditions, approvals and funded activation. Conditions: '||
 coalesce((select string_agg((x->>'metric')||' '||case when x->>'operator'='gte' then 'at least' else 'at most' end||' '||(x->>'value'),case when milestone->>'match'='any' then ' OR ' else ' AND ' end) from jsonb_array_elements(milestone->'conditions') x),'')||
 case when (milestone->>'safetyRequired')::boolean then '. Safety and quality checks required.' else '.' end,
 0,'once',1,1)
 on conflict(program_id,engine_key) where engine_key is not null do update set title=excluded.title,instructions=excluded.instructions,enabled=true,version=wf_incentive_activities.version+1;
 end loop;
 update public.wf_incentive_activities set enabled=false where program_id=p.id and engine_key is not null and not exists(select 1 from jsonb_array_elements(cfg.draft->'milestones') m where m->>'id'=engine_key);
 insert into public.wf_incentive_definition_versions(program_id,revision,definition,actor) values(p.id,cfg.revision,cfg.draft,actor);
 update public.wf_incentive_definitions set published=draft,updated_at=now() where program_id=p.id;
 update public.wf_incentive_programs set name=cfg.draft->>'name',starts_at=(cfg.draft->>'startsAt')::timestamptz,ends_at=(cfg.draft->>'endsAt')::timestamptz,terms=cfg.draft->>'terms' where id=p.id;
 -- Existing activation/funding validation remains authoritative; this publishes rules, not money.
 elsif op in ('pause','resume') then
 if cfg.program_id is null or p.status<>'active' then raise exception 'Active configured program required';end if;
 update public.wf_incentive_definitions set paused=(op='pause'),updated_at=now() where program_id=p.id;
 elsif op in ('archive','restore') then
 if cfg.program_id is null then raise exception 'Configure program first';end if;
 if op='archive' and p.status='active' then raise exception 'End program before archiving';end if;
 update public.wf_incentive_definitions set archived=(op='archive'),updated_at=now() where program_id=p.id;
 end if;
 insert into public.wf_incentive_audit(program_id,actor,event,target_id,detail) values(p.id,actor,'INCENTIVE_'||upper(op),p.id,jsonb_build_object('revision',cfg.revision));
 return jsonb_build_object('id',p.id,'revision',cfg.revision);
 elsif op in ('safety','dispute','recognition') then
 if participant is null then raise exception 'Accepted participant required' using errcode='42501';end if;
 if cfg.published is null then raise exception 'Published program required';end if;
 if op<>'dispute' and (p.status<>'active' or p.ends_at<=now() or p.starts_at>now() or cfg.paused or cfg.archived) then raise exception 'Program not accepting new activity';end if;
 if op='recognition' then
 recipient:=nullif(input->>'recipientId','')::uuid;
 if recipient is null then select r.id into recipient from public.wf_incentive_participants r join public.users u on u.user_id=r.user_id where r.program_id=p.id and lower(u.email)=lower(btrim(input->>'recipientEmail')) and u.status='active' and r.status='active' and r.accepted_version=p.terms_version;end if;
 if recipient=participant or not exists(select 1 from public.wf_incentive_participants where id=recipient and program_id=p.id and status='active' and accepted_version=p.terms_version) then raise exception 'Peer nomination scope denied' using errcode='42501';end if;
 -- Recognition text is accepted; funded nominations remain unavailable until activation contract is resolved.
 end if;
 if op='dispute' then
 if not exists(select 1 from public.wf_incentive_submissions s join public.wf_incentive_activities a on a.id=s.activity_id where s.id=(input->>'sourceKey')::uuid and a.program_id=p.id and s.participant_id=participant and s.status='declined' and s.reviewed_at>=now()-interval '48 hours') then raise exception 'Eligible decision within 48 hours required';end if;
 end if;
 insert into public.wf_incentive_cases(program_id,actor,recipient_id,kind,source_key,body,deadline) values(p.id,actor,recipient,op,input->>'sourceKey',btrim(input->>'body'),case when op='safety' then now()+interval '24 hours' end) returning id into target;
 -- No reporter identifying detail is copied into participant-visible program activity.
 return jsonb_build_object('id',target);
 elsif op in ('verify','decline_case','resolve','appeal') then
 select * into item from public.wf_incentive_cases where id=(input->>'caseId')::uuid and program_id=p.id for update;
 if not found then raise exception 'Case scope denied' using errcode='42501';end if;
 if length(btrim(coalesce(input->>'reason',''))) not between 1 and 1000 then raise exception 'Review reason required';end if;
 if op='appeal' then
 if item.actor<>actor or item.kind<>'dispute' or item.status<>'declined' or item.appeal_used then raise exception 'Appeal unavailable';end if;
 else
 if not manager or item.actor=actor then raise exception 'Independent reviewer required' using errcode='42501';end if;
 if not ((op in ('verify','decline_case') and item.status in ('pending','appealed')) or (op='resolve' and item.kind='safety' and item.status='verified')) then raise exception 'Invalid case transition';end if;
 end if;
 update public.wf_incentive_cases set status=case op when 'verify' then 'verified' when 'resolve' then 'resolved' when 'appeal' then 'appealed' else 'declined' end,reason=input->>'reason',appeal_used=appeal_used or op='appeal',history=history||jsonb_build_array(jsonb_build_object('op',op,'reason',input->>'reason','actor',reviewer,'at',now())),reviewed_by=case when op='appeal' then reviewed_by else reviewer end,resolved_at=case when op='resolve' then now() else resolved_at end where id=item.id;
 insert into public.wf_incentive_audit(program_id,actor,event,target_id) values(p.id,actor,'INCENTIVE_CASE_'||upper(op),item.id);
 return jsonb_build_object('id',item.id);
 elsif op in ('award','redeem','fund','peer_points') then
 raise exception 'Funded engine activation required' using errcode='42501';
 end if;
 raise exception 'Unsupported incentive action';
end $$;

create function security.incentive_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=security.pro_actor(); result jsonb;begin
 select jsonb_build_object(
 'configs',coalesce((select jsonb_agg(jsonb_build_object('programId',c.program_id,'revision',c.revision,'draft',case when security.pro_owner_access(p.owner_type,p.owner_id) then c.draft else c.published end,'published',c.published,'paused',c.paused,'archived',c.archived,'updatedAt',c.updated_at)) from public.wf_incentive_definitions c join public.wf_incentive_programs p on p.id=c.program_id where p.owner_type='employer' and (security.pro_owner_access(p.owner_type,p.owner_id) or exists(select 1 from public.wf_incentive_participants r where r.program_id=p.id and r.user_id=v_actor and r.status='active' and r.accepted_version=p.terms_version))),'[]'),
 'assignments',coalesce((select jsonb_object_agg(x.program_id,x.items) from(select a.program_id,jsonb_agg(jsonb_build_object('crewId',a.crew_id,'memberIds',a.member_ids,'revision',a.revision)) items from public.wf_incentive_crew_assignments a join public.wf_incentive_programs p on p.id=a.program_id where security.pro_owner_access(p.owner_type,p.owner_id) group by a.program_id)x),'{}'),
 'cases',coalesce((select jsonb_object_agg(x.program_id,x.items) from (select c.program_id,jsonb_agg(to_jsonb(c) order by c.created_at desc) items from public.wf_incentive_cases c join public.wf_incentive_programs p on p.id=c.program_id where security.pro_owner_access(p.owner_type,p.owner_id) or c.actor=v_actor or (c.kind='recognition' and exists(select 1 from public.wf_incentive_participants recipient where recipient.id=c.recipient_id and recipient.user_id=v_actor)) group by c.program_id)x),'{}'),
 'audit',coalesce((select jsonb_object_agg(x.program_id,x.items) from(select a.program_id,jsonb_agg(jsonb_build_object('event',a.event,'created_at',a.created_at) order by a.created_at desc) items from public.wf_incentive_audit a join public.wf_incentive_programs p on p.id=a.program_id where p.owner_type='employer' and security.pro_owner_access(p.owner_type,p.owner_id) group by a.program_id)x),'{}')) into result;
 return result;
end $$;
create function public.incentive_action(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.incentive_action(p_input)$$;
create function public.incentive_workspace() returns jsonb language sql security invoker set search_path='' as $$select security.incentive_workspace()$$;
revoke all on function security.incentive_validate(jsonb,boolean),security.incentive_action(jsonb),security.incentive_workspace(),public.incentive_action(jsonb),public.incentive_workspace() from public,anon,authenticated,service_role;
grant execute on function security.incentive_action(jsonb),security.incentive_workspace(),public.incentive_action(jsonb),public.incentive_workspace() to authenticated;

-- Guard legacy direct activity calls too; hiding controls alone is insufficient.
alter function security.pro_action(jsonb) rename to pro_action_before_incentive_368;
revoke all on function security.pro_action_before_incentive_368(jsonb) from public,anon,authenticated,service_role;
create function security.pro_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.wf_incentive_definitions%rowtype;begin
 perform security.pro_actor();
 if input->>'programId' is not null then
 select * into c from public.wf_incentive_definitions where program_id=(input->>'programId')::uuid;
 if found and input->>'op'='set_status' and input->>'status'='active' and c.published is null then raise exception 'Publish program rules before activation';end if;
 if found and input->>'op' in ('submit','invite','accept') and (c.paused or c.archived) then raise exception 'Program paused or archived';end if;
 end if;
 return security.pro_action_before_incentive_368(input);
end $$;
revoke all on function security.pro_action(jsonb) from public,anon,authenticated,service_role;
grant execute on function security.pro_action(jsonb) to authenticated;
-- Rebind SQL wrapper after rename, including installations that tracked the old function OID.
create or replace function public.pro_action(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.pro_action(p_input)$$;
create function security.incentive_employer_workspace(owner text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u text:=security.pro_actor(); programs jsonb;begin
 if not security.has_employer_role(owner,array['employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only']) then raise exception 'Employer scope denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(j order by created_at desc),'[]') into programs from(select p.created_at,
 jsonb_build_object('id',p.id,'name',p.name,'ownerType',p.owner_type,'template',p.template,'status',p.status,'startsAt',p.starts_at,'endsAt',p.ends_at,'terms',p.terms,'termsVersion',p.terms_version,'leaderboardVisible',p.leaderboard_visible,'canManage',security.pro_owner_access(p.owner_type,p.owner_id),
 'participation',(select jsonb_build_object('id',id,'kind',kind,'status',case when status='pending' and expires_at<=now() then 'expired' else status end,'acceptedVersion',accepted_version,'points',coalesce((select sum(l.points) from public.wf_incentive_score_ledger l where l.participant_id=wf_incentive_participants.id),0)) from public.wf_incentive_participants where program_id=p.id and user_id=u),
 'participants',case when security.pro_owner_access(p.owner_type,p.owner_id) then (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'userId',r.user_id,'name',concat_ws(' ',usr.first_name,usr.last_name),'kind',r.kind,'status',case when r.status='pending' and r.expires_at<=now() then 'expired' else r.status end,'score',coalesce((select sum(points) from public.wf_incentive_score_ledger where participant_id=r.id),0))),'[]') from public.wf_incentive_participants r join public.users usr on usr.user_id=r.user_id where r.program_id=p.id) else '[]'::jsonb end,
 'leaderboard',case when p.leaderboard_visible and exists(select 1 from public.wf_incentive_participants me where me.program_id=p.id and me.user_id=u and me.status='active') then (select coalesce(jsonb_agg(jsonb_build_object('rank',v.rank,'name',v.name,'score',v.score)),'[]') from(select rank() over(order by coalesce(sum(l.points),0) desc) rank,concat_ws(' ',usr.first_name,left(usr.last_name,1)) name,coalesce(sum(l.points),0) score from public.wf_incentive_participants r join public.users usr on usr.user_id=r.user_id left join public.wf_incentive_score_ledger l on l.participant_id=r.id where r.program_id=p.id and r.status='active' group by r.id,usr.first_name,usr.last_name) v) else '[]'::jsonb end,
 'activities',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'kind',a.kind,'audience',a.audience,'instructions',a.instructions,'points',a.private_points,'repeat',a.repeat_period,'dailyCap',a.daily_cap,'weeklyCap',a.weekly_cap,'weekdays',a.weekdays,'options',a.options,'enabled',a.enabled,'submissions',
 (select coalesce(jsonb_agg(jsonb_build_object('id',z.id,'participantName',concat_ws(' ',usr.first_name,usr.last_name),'status',z.status,'evidence',z.evidence,'reason',z.reason,'submittedAt',z.submitted_at)),'[]') from (select * from public.wf_incentive_submissions where activity_id=a.id and (security.pro_owner_access(p.owner_type,p.owner_id) or participant_id in(select id from public.wf_incentive_participants where user_id=u)) order by submitted_at desc limit 100) z join public.wf_incentive_participants r on r.id=z.participant_id join public.users usr on usr.user_id=r.user_id where security.pro_owner_access(p.owner_type,p.owner_id) or r.user_id=u)) order by a.created_at),'[]') from public.wf_incentive_activities a where a.program_id=p.id and (security.pro_owner_access(p.owner_type,p.owner_id) or exists(select 1 from public.wf_incentive_participants me where me.program_id=p.id and me.user_id=u and me.status='active' and (a.audience='all' or a.audience=me.kind))))) j
 from public.wf_incentive_programs p where p.owner_type='employer' and p.owner_id=owner and (security.pro_owner_access(p.owner_type,p.owner_id) or exists(select 1 from public.wf_incentive_participants r where r.program_id=p.id and r.user_id=u))
 order by p.created_at desc) rows;
 return jsonb_build_object('summary',null,'owners',case when security.pro_owner_access('employer',owner) then jsonb_build_array(jsonb_build_object('type','employer','id',owner,'name',(select business_name from public.contractors where contractor_id=owner))) else '[]'::jsonb end,'programs',programs,'ledger','[]'::jsonb,'canManageLevels',false,'levelVersions','[]'::jsonb);
end $$;
create function public.incentive_employer_workspace(p_owner text) returns jsonb language sql security invoker set search_path='' as $$select security.incentive_employer_workspace(p_owner)$$;
revoke all on function security.incentive_employer_workspace(text),public.incentive_employer_workspace(text) from public,anon,authenticated,service_role;
grant execute on function security.incentive_employer_workspace(text),public.incentive_employer_workspace(text) to authenticated;

-- Banking read API reuses the existing append-only credits and request reservations.
-- A reserved request has already debited the credit ledger; never subtract it twice.
create function security.incentive_bank() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor text:=security.pro_actor();begin
 return jsonb_build_object('unit','reward_points','accounts',coalesce((select jsonb_agg(jsonb_build_object(
 'participantId',r.id,'programId',r.program_id,
 'available',greatest(0,security.reward_credit_balance(r.id)),
 'reservedForRedemption',coalesce((select sum(x.credits) from public.wf_reward_requests x where x.participant_id=r.id and x.status in ('pending','approved','processing','provider_pending','reconciliation_required')),0),
 'redeemed',coalesce((select sum(x.credits) from public.wf_reward_requests x where x.participant_id=r.id and x.status='issued'),0),
 'transactions',coalesce((select jsonb_agg(v) from (select jsonb_build_object('id',c.id,'points',c.credits,'reason',c.reason,'occurredAt',c.created_at) v from public.wf_reward_credits c where c.participant_id=r.id order by c.created_at desc limit 100) history),'[]')
 )) from public.wf_incentive_participants r join public.wf_incentive_programs p on p.id=r.program_id where p.owner_type='employer' and r.user_id=actor and r.accepted_version is not null),'[]'));
end $$;
create function public.incentive_bank() returns jsonb language sql security invoker set search_path='' as $$select security.incentive_bank()$$;
revoke all on function security.incentive_bank(),public.incentive_bank() from public,anon,authenticated,service_role;
grant execute on function security.incentive_bank(),public.incentive_bank() to authenticated;
create index wf_incentive_definition_versions_actor on public.wf_incentive_definition_versions(actor);
