-- #368 execution; additive, employer-sponsored sandbox fulfillment only.
create table public.wf_incentive_execution (
 program_id uuid primary key references public.wf_incentive_programs(id),
 enabled boolean not null default true, sandbox_only boolean not null default true check(sandbox_only),
 policy jsonb not null, terms_version integer not null, auto_redeem boolean not null default false,
 created_by text not null references public.users(user_id), created_at timestamptz not null default now()
);
create table public.wf_incentive_events (
 id uuid primary key default gen_random_uuid(), program_id uuid not null references public.wf_incentive_programs(id),
 source_key text not null check(length(source_key) between 1 and 200), milestone_id text not null,
 subject_key text not null, recipients uuid[] not null check(cardinality(recipients) between 1 and 1000),
 rule jsonb not null, metrics jsonb not null, evidence text not null check(length(evidence) between 1 and 4000),
 safety_complete boolean not null, source_actor text references public.users(user_id),
 status text not null check(status in ('safety_review','review','approved','rejected','disputed','budget_wait')),
 safety_approved boolean not null default false, safety_by text references public.users(user_id), reviewed_by text references public.users(user_id),
 reason text, reserved_cents bigint not null default 0 check(reserved_cents>=0),
 created_at timestamptz not null default now(), notified_at timestamptz not null default now(),
 dispute_until timestamptz not null default now()+interval '48 hours', appeal_used boolean not null default false,
 history jsonb not null default '[]', unique(program_id,source_key,milestone_id,subject_key)
);
create index wf_incentive_events_program on public.wf_incentive_events(program_id,status,created_at);
create index wf_incentive_events_actor on public.wf_incentive_events(source_actor);
create index wf_incentive_events_safety on public.wf_incentive_events(safety_by);
create index wf_incentive_events_reviewer on public.wf_incentive_events(reviewed_by);
create table public.wf_incentive_allowances (
 program_id uuid not null references public.wf_incentive_programs(id), participant_id uuid not null references public.wf_incentive_participants(id),
 period date not null, points integer not null check(points>=0), spent integer not null default 0 check(spent>=0 and spent<=points),
 reserved_cents bigint not null check(reserved_cents>=0), expires_at timestamptz not null,
 primary key(program_id,participant_id,period)
);
create index wf_incentive_allowances_participant on public.wf_incentive_allowances(participant_id);
create table public.wf_incentive_lots (
 id uuid primary key default gen_random_uuid(), program_id uuid not null references public.wf_incentive_programs(id),
 participant_id uuid not null references public.wf_incentive_participants(id), event_id uuid references public.wf_incentive_events(id),
 points integer not null check(points>0), consumed integer not null default 0 check(consumed>=0 and consumed<=points),
 policy jsonb not null, expires_at timestamptz, created_at timestamptz not null default now(), source_key text not null unique
);
create index wf_incentive_lots_program on public.wf_incentive_lots(program_id);
create index wf_incentive_lots_participant on public.wf_incentive_lots(participant_id,expires_at);
create index wf_incentive_lots_event on public.wf_incentive_lots(event_id);
alter table public.wf_reward_requests add column incentive_safety_lot uuid references public.wf_incentive_lots(id);
create index wf_reward_requests_incentive_safety_lot on public.wf_reward_requests(incentive_safety_lot);
create table public.wf_incentive_request_lots (
 request_id uuid not null references public.wf_reward_requests(id), lot_id uuid not null references public.wf_incentive_lots(id),
 points integer not null check(points>0), restored boolean not null default false, primary key(request_id,lot_id)
);
create index wf_incentive_request_lots_lot on public.wf_incentive_request_lots(lot_id);
create table public.wf_incentive_employment (
 participant_id uuid primary key references public.wf_incentive_participants(id), started_on date not null, ended_on date,
 source text not null check(source in ('confirmed_placement','employer_verified','hrms')),
 source_key text not null, verified_by text references public.users(user_id), updated_at timestamptz not null default now(),
 check(ended_on is null or ended_on>=started_on)
);
create index wf_incentive_employment_verifier on public.wf_incentive_employment(verified_by);
create table public.wf_incentive_preferences (
 participant_id uuid primary key references public.wf_incentive_participants(id), public_recognition boolean not null default false
);
create table public.wf_incentive_tiers (
 id uuid primary key default gen_random_uuid(), program_id uuid not null references public.wf_incentive_programs(id),
 title text not null check(length(title) between 1 and 100), milestone_id text not null,
 threshold integer not null check(threshold between 1 and 100000), perk text not null check(length(perk) between 1 and 1000),
 capacity integer not null check(capacity between 1 and 100000), unique(program_id,title)
);
create table public.wf_incentive_perks (
 id uuid primary key default gen_random_uuid(), tier_id uuid not null references public.wf_incentive_tiers(id),
 participant_id uuid not null references public.wf_incentive_participants(id),
 status text not null default 'unlocked' check(status in ('unlocked','requested','approved','fulfilled','declined')),
 note text, updated_by text references public.users(user_id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tier_id,participant_id)
);
create index wf_incentive_perks_participant on public.wf_incentive_perks(participant_id);
create index wf_incentive_perks_updater on public.wf_incentive_perks(updated_by);
create table security.wf_incentive_integrations (
 id uuid primary key default gen_random_uuid(), program_id uuid not null references public.wf_incentive_programs(id),
 name text not null check(length(name) between 1 and 100), token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),
 mapping jsonb not null, active boolean not null default true, created_by text not null references public.users(user_id), created_at timestamptz not null default now()
);
create index wf_incentive_integrations_program on security.wf_incentive_integrations(program_id);
create index wf_incentive_integrations_actor on security.wf_incentive_integrations(created_by);
create table security.wf_incentive_bindings (
 integration_id uuid not null references security.wf_incentive_integrations(id), external_id text not null check(length(external_id) between 1 and 100),
 participant_id uuid not null references public.wf_incentive_participants(id), primary key(integration_id,external_id)
);
create index wf_incentive_bindings_participant on security.wf_incentive_bindings(participant_id);
create table security.wf_incentive_ingestion (
 integration_id uuid not null references security.wf_incentive_integrations(id), event_key text not null,
 status text not null check(status in ('accepted','quarantined','retry_ready')), payload_hash text not null, attempts integer not null default 1,history jsonb not null default '[]', reason text, created_at timestamptz not null default now(),
 primary key(integration_id,event_key)
);
create table security.wf_incentive_jobs (
 request_id uuid primary key references public.wf_reward_requests(id), attempts integer not null default 0,
 next_attempt timestamptz not null default now(), lease_until timestamptz, last_error text
);
create table public.wf_incentive_notices (
 id uuid primary key default gen_random_uuid(), program_id uuid not null references public.wf_incentive_programs(id),
 user_id text not null references public.users(user_id), source_key text not null unique, title text not null,
 body text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create index wf_incentive_notices_user on public.wf_incentive_notices(user_id,created_at);
create index wf_incentive_notices_program on public.wf_incentive_notices(program_id);
-- New data stays RPC-only, including private integrations, bindings and outbox jobs.
do $$declare t text;begin
 foreach t in array array['wf_incentive_execution','wf_incentive_events','wf_incentive_allowances','wf_incentive_lots','wf_incentive_request_lots','wf_incentive_employment','wf_incentive_preferences','wf_incentive_tiers','wf_incentive_perks','wf_incentive_notices'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);end loop;
 foreach t in array array['wf_incentive_integrations','wf_incentive_bindings','wf_incentive_ingestion','wf_incentive_jobs'] loop execute format('alter table security.%I enable row level security',t);execute format('revoke all on security.%I from public,anon,authenticated,service_role',t);end loop;
end $$;

create function security.incentive_conditions(rule jsonb,metrics jsonb,safe boolean) returns boolean language plpgsql immutable set search_path='' as $$
declare c jsonb; pass boolean; n integer:=0; hits integer:=0;begin
 if jsonb_typeof(metrics) is distinct from 'object' or jsonb_typeof(rule->'conditions') is distinct from 'array' then return false;end if;
 if coalesce((rule->>'safetyRequired')::boolean,false) and not coalesce(safe,false) then return false;end if;
 for c in select * from jsonb_array_elements(rule->'conditions') loop
 n:=n+1;pass:=false;
 if jsonb_typeof(metrics->(c->>'metric'))='number' and (metrics->>(c->>'metric'))::numeric>=0 then pass:=case c->>'operator' when 'gte' then (metrics->>(c->>'metric'))::numeric>=(c->>'value')::numeric when 'lte' then (metrics->>(c->>'metric'))::numeric<=(c->>'value')::numeric else false end;end if;
 if pass then hits:=hits+1;end if;
 end loop;
 return n>0 and case when rule->>'match'='any' then hits>0 else hits=n end;
end $$;
-- All old financial mutations see outstanding new reservations too.
alter function security.reward_liability(uuid) rename to reward_liability_before_engine;
revoke all on function security.reward_liability_before_engine(uuid) from public,anon,authenticated,service_role;
create function security.reward_liability(pid uuid) returns bigint language sql stable security definer set search_path='' as $$
 select security.reward_liability_before_engine(pid)+coalesce((select sum(reserved_cents) from public.wf_incentive_events where program_id=pid),0)+coalesce((select sum(reserved_cents) from public.wf_incentive_allowances where program_id=pid and expires_at>now()),0)
$$;

create function security.incentive_expire(pid uuid) returns void language plpgsql security definer set search_path='' as $$
declare l record; expire_at timestamptz; n integer;begin
 perform 1 from public.wf_incentive_programs where id=pid for update;
 for l in select lot.*,emp.ended_on from public.wf_incentive_lots lot left join public.wf_incentive_employment emp on emp.participant_id=lot.participant_id where lot.program_id=pid and lot.consumed<lot.points for update of lot loop
 expire_at:=l.expires_at;
 if l.ended_on is not null and l.policy->>'departure'='window' then expire_at:=least(expire_at,((l.ended_on+(l.policy->>'departureDays')::int)::timestamp at time zone (l.policy->>'timezone')));end if;
 if expire_at is not null and expire_at<=now() then
 n:=l.points-l.consumed;
 insert into public.wf_reward_credits(participant_id,credits,source_key,reason) values(l.participant_id,-n,'engine-expire:'||l.id||':'||l.consumed,'Published reward availability period ended');
 update public.wf_incentive_lots set consumed=points where id=l.id;
 end if;
 end loop;
end $$;
create function security.incentive_grant(pid uuid,recipient uuid,n integer,k text,eid uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare cfg public.wf_incentive_execution%rowtype;q public.wf_reward_policies%rowtype;lot uuid; cost bigint;balance bigint;begin
 perform 1 from public.wf_incentive_programs where id=pid for update;
 select * into cfg from public.wf_incentive_execution where program_id=pid and enabled;
 select * into q from public.wf_reward_policies where program_id=pid;
 if cfg.program_id is null or q.program_id is null or exists(select 1 from security.wf_reward_accounts a join public.wf_incentive_programs p on p.owner_type=a.owner_type and p.owner_id=a.owner_id where p.id=pid and a.frozen) or n<=0 or n>1000000 then raise exception 'Execution or funded policy unavailable';end if;
 select id into lot from public.wf_incentive_lots where source_key=k;
 if found then return lot;end if;
 if not exists(select 1 from public.wf_incentive_participants r join public.users u on u.user_id=r.user_id where r.id=recipient and r.program_id=pid and r.status='active' and r.accepted_version=cfg.terms_version and u.status='active') then raise exception 'Accepted recipient required' using errcode='42501';end if;
 if exists(select 1 from public.wf_incentive_employment where participant_id=recipient and ended_on is not null) then raise exception 'Employment ended; new awards unavailable';end if;
 perform security.incentive_expire(pid);
 balance:=greatest(0,security.reward_credit_balance(recipient));
 cost:=ceil((balance+n)::numeric*q.cents_per_block/q.credits_per_block)-ceil(balance::numeric*q.cents_per_block/q.credits_per_block);
 if security.reward_liability(pid)+cost>least(q.allocated_cents,(cfg.policy->>'budgetCents')::bigint) then raise exception 'Program budget insufficient';end if;
 insert into public.wf_incentive_lots(program_id,participant_id,event_id,points,policy,source_key,expires_at) values(pid,recipient,eid,n,cfg.policy,k,case when cfg.policy->>'expiryMonths' is not null then ((now() at time zone (cfg.policy->>'timezone'))+make_interval(months=>(cfg.policy->>'expiryMonths')::int)) at time zone (cfg.policy->>'timezone') end) returning id into lot;
 insert into public.wf_reward_credits(participant_id,credits,source_key,reason) values(recipient,n,'engine:'||lot,'Verified employer incentive award');
 insert into public.wf_incentive_notices(program_id,user_id,source_key,title,body) select pid,user_id,'award:'||lot,'Reward points earned',n||' reward points are available under your published program terms.' from public.wf_incentive_participants where id=recipient;
 return lot;
end $$;
-- Reserve bank lots before any legacy or new redemption debit. Refunds restore the same lots.
create function security.incentive_request_lots() returns trigger language plpgsql security definer set search_path='' as $$
declare pid uuid;n integer:=new.credits;l record;take integer;begin
 select program_id into pid from public.wf_incentive_participants where id=new.participant_id;
 if not exists(select 1 from public.wf_incentive_execution where program_id=pid) then return new;end if;
 perform security.incentive_expire(pid);
 if (select coalesce(sum(points-consumed),0) from public.wf_incentive_lots where participant_id=new.participant_id)<n then raise exception 'Available reward lots insufficient';end if;
 for l in select * from public.wf_incentive_lots where participant_id=new.participant_id and consumed<points order by (id=new.incentive_safety_lot) desc nulls last,expires_at nulls last,created_at,id for update loop
 take:=least(n,l.points-l.consumed);if take=0 then continue;end if;
 update public.wf_incentive_lots set consumed=consumed+take where id=l.id;
 insert into public.wf_incentive_request_lots(request_id,lot_id,points) values(new.id,l.id,take);
 n:=n-take;exit when n=0;
 end loop;
 return new;
end $$;
-- AFTER INSERT permits the request FK, while remaining atomic with the original ledger debit.
create trigger incentive_request_lots after insert on public.wf_reward_requests for each row execute function security.incentive_request_lots();
create function security.incentive_restore_lots() returns trigger language plpgsql security definer set search_path='' as $$
declare a record;begin
 if new.status in ('cancelled','rejected') and old.status not in ('cancelled','rejected') then
 for a in select * from public.wf_incentive_request_lots where request_id=new.id and not restored for update loop
 update public.wf_incentive_lots set consumed=consumed-a.points where id=a.lot_id;
 update public.wf_incentive_request_lots set restored=true where request_id=a.request_id and lot_id=a.lot_id;
 end loop;
 end if;return new;
end $$;
create trigger incentive_restore_lots after update of status on public.wf_reward_requests for each row execute function security.incentive_restore_lots();
create function security.incentive_redemption(recipient uuid,n integer,k uuid,immediate boolean default false,safety_lot uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.wf_incentive_participants%rowtype;p public.wf_incentive_programs%rowtype;q public.wf_reward_policies%rowtype;u public.users%rowtype;rid uuid;begin
 select * into r from public.wf_incentive_participants where id=recipient;
 select * into p from public.wf_incentive_programs where id=r.program_id for update;
 select id into rid from public.wf_reward_requests where request_key=k and participant_id=recipient and credits=n;
 if found then return rid;end if;
 select * into q from public.wf_reward_policies where program_id=p.id;
 select * into u from public.users where user_id=r.user_id and status='active';
 if immediate and not exists(select 1 from public.wf_incentive_lots l join public.wf_incentive_events e on e.id=l.event_id where l.id=safety_lot and l.participant_id=recipient and e.milestone_id='safety-report' and l.policy->>'safetyMode' in ('immediate','bank_and_redeem') and l.points-l.consumed>=n) then raise exception 'Available safety reward required for minimum override';end if;
 if q.program_id is null or u.user_id is null or u.email is null or n<1 or (not immediate and n<q.minimum_credits) or (n::bigint*q.cents_per_block)%q.credits_per_block<>0 then raise exception 'Eligible amount and whole-cent conversion required';end if;
 if not exists(select 1 from public.wf_incentive_execution x where x.program_id=p.id and x.enabled and x.terms_version=r.accepted_version) then raise exception 'Accepted execution terms required';end if;
 if not exists(select 1 from security.wf_reward_eligibility where user_id=r.user_id and country='US' and born_on<=(now() at time zone 'UTC')::date-interval '18 years') then return null;end if;
 if exists(select 1 from security.wf_reward_accounts where owner_type=p.owner_type and owner_id=p.owner_id and frozen) then return null;end if;
 perform security.incentive_expire(p.id);
 if n>security.reward_credit_balance(recipient) then raise exception 'Available reward points insufficient';end if;
 insert into public.wf_reward_requests(participant_id,request_key,credits,cents,product_id,status,recipient_email,recipient_name,requested_by,incentive_safety_lot) values(recipient,k,n,n::bigint*q.cents_per_block/q.credits_per_block,q.product_id,'approved',u.email,concat_ws(' ',u.first_name,u.last_name),u.user_id,case when immediate then safety_lot end) returning id into rid;
 insert into public.wf_reward_credits(participant_id,credits,source_key,reason) values(recipient,-n,'request:'||rid,'Reserved for sandbox incentive fulfillment');
 insert into security.wf_incentive_jobs(request_id) values(rid);
 return rid;
end $$;
create table public.wf_incentive_roles (
 program_id uuid not null references public.wf_incentive_programs(id),user_id text not null references public.users(user_id),
 role text not null check(role in ('safety_reviewer','crew_lead')),crew_id text not null default '',primary key(program_id,user_id,role,crew_id)
);
create index wf_incentive_roles_user on public.wf_incentive_roles(user_id);
alter table public.wf_incentive_roles enable row level security;revoke all on public.wf_incentive_roles from public,anon,authenticated,service_role;

create function security.incentive_event(pid uuid,k text,mid text,recipient uuid,crew text,metrics jsonb,evidence text,safe boolean,source_actor text,automatic boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.wf_incentive_programs%rowtype;cfg public.wf_incentive_execution%rowtype;q public.wf_reward_policies%rowtype;m jsonb;ids uuid[];eid uuid;subject text;cost bigint;eligible boolean;state text;begin
 select * into p from public.wf_incentive_programs where id=pid for update;
 select * into cfg from public.wf_incentive_execution where program_id=pid and enabled;
 if cfg.program_id is null or not exists(select 1 from public.contractors where contractor_id=p.owner_id and approval_status='approved' and account_status='active') or p.status<>'active' or now()<p.starts_at or now()>=p.ends_at or exists(select 1 from public.wf_incentive_definitions where program_id=pid and (paused or archived)) then raise exception 'Active execution program required';end if;
 if jsonb_typeof(metrics) is distinct from 'object' or exists(select 1 from jsonb_each(metrics) v where v.key not in ('budget_percent','delay_hours','reviews','training_count','service_days','qualifying_projects') or jsonb_typeof(v.value)<>'number' or (v.value::text)::numeric not between 0 and 1000000) then raise exception 'Known bounded numeric metrics required';end if;
 if length(k) not between 1 and 200 or length(btrim(evidence)) not between 1 and 4000 then raise exception 'Source key and evidence required';end if;
 select value into m from jsonb_array_elements(cfg.policy->'milestones') where value->>'id'=mid;
 if m is null then raise exception 'Published milestone unavailable';end if;
 subject:=case when m->>'recipient'='crew' then 'crew:'||crew else 'person:'||recipient end;
 select id into eid from public.wf_incentive_events where program_id=pid and source_key=k and milestone_id=mid and subject_key=subject;
 if found then
 if not exists(select 1 from public.wf_incentive_events where id=eid and wf_incentive_events.metrics=incentive_event.metrics and safety_complete=safe and wf_incentive_events.evidence=incentive_event.evidence) then raise exception 'Event replay conflicts';end if;return eid;
 end if;
 if m->>'recipient'='crew' then select member_ids into ids from public.wf_incentive_crew_assignments where program_id=pid and crew_id=crew;else ids:=array[recipient];end if;
 if ids is null or cardinality(ids)=0 or exists(select 1 from unnest(ids) x where not exists(select 1 from public.wf_incentive_participants r join public.users u on u.user_id=r.user_id where r.id=x and r.program_id=pid and r.status='active' and r.accepted_version=cfg.terms_version and u.status='active')) then raise exception 'Eligible roster required' using errcode='42501';end if;
 ids:=array(select x from unnest(ids) x order by x);
 select * into q from public.wf_reward_policies where program_id=pid;
 cost:=ceil((m->>'points')::numeric*q.cents_per_block/q.credits_per_block)+cardinality(ids);
 eligible:=security.incentive_conditions(m,metrics,safe);
 state:=case when not eligible then 'rejected' when automatic and m->>'approval'<>'safety_then_manager' then 'approved' when m->>'approval'='safety_then_manager' then 'safety_review' else 'review' end;
 if security.reward_liability(pid)+cost>least(q.allocated_cents,(cfg.policy->>'budgetCents')::bigint) then cost:=0;if eligible then state:='budget_wait';end if;end if;
 insert into public.wf_incentive_events(program_id,source_key,milestone_id,subject_key,recipients,rule,metrics,evidence,safety_complete,source_actor,status,reserved_cents,reason)
 values(pid,k,mid,subject,ids,m,metrics,evidence,safe,source_actor,state,cost,case when not eligible then 'Published conditions not met' when state='budget_wait' then 'Funding capacity required; original intent preserved' end) returning id into eid;
 insert into public.wf_incentive_notices(program_id,user_id,source_key,title,body) select pid,r.user_id,'event:'||eid||':'||r.id,case when state='rejected' then 'Milestone decision available' else 'Milestone under review' end,case when state='rejected' then 'You have 48 hours from this in-app notice to request an exception review.' else 'Your program milestone has been recorded.' end from public.wf_incentive_participants r where r.id=any(ids);
 return eid;
end $$;
create function security.incentive_complete(eid uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.wf_incentive_events%rowtype;cfg public.wf_incentive_execution%rowtype;i integer:=0;n integer;share integer;recipient uuid;lot uuid;rid uuid;available integer;step integer;q public.wf_reward_policies%rowtype;begin
 select * into e from public.wf_incentive_events where id=eid;
 perform 1 from public.wf_incentive_programs where id=e.program_id for update;
 select * into e from public.wf_incentive_events where id=eid for update;
 if e.status<>'approved' then return;end if;
 if exists(select 1 from public.wf_incentive_definitions where program_id=e.program_id and (paused or archived)) then update public.wf_incentive_events set status='budget_wait',reason='Program paused; approved intent retained' where id=e.id;return;end if;
 if exists(select 1 from public.wf_incentive_lots where event_id=e.id) then return;end if;
 if coalesce(e.rule->>'repeat',case when exists(select 1 from jsonb_array_elements(coalesce(e.rule->'conditions','[]')) c where c->>'metric' in ('service_days','qualifying_projects')) then 'once' else 'per_source' end)='once' and exists(select 1 from public.wf_incentive_events prior join public.wf_incentive_lots awarded on awarded.event_id=prior.id where prior.program_id=e.program_id and prior.milestone_id=e.milestone_id and prior.subject_key=e.subject_key and prior.id<>e.id) then update public.wf_incentive_events set status='rejected',reserved_cents=0,reason='This one-time milestone was already awarded' where id=e.id;return;end if;
 select * into cfg from public.wf_incentive_execution where program_id=e.program_id;
 n:=(e.rule->>'points')::integer;
 begin
 update public.wf_incentive_events set reserved_cents=0 where id=e.id;
 foreach recipient in array e.recipients loop
 i:=i+1;share:=n/cardinality(e.recipients)+case when i<=n%cardinality(e.recipients) then 1 else 0 end;
 if share=0 then continue;end if;
 lot:=security.incentive_grant(e.program_id,recipient,share,'milestone:'||e.id||':'||recipient,e.id);
 if cfg.auto_redeem then
 begin
 select * into q from public.wf_reward_policies where program_id=e.program_id;
 step:=q.credits_per_block/gcd(q.credits_per_block,q.cents_per_block);
 available:=least(1000000,security.reward_credit_balance(recipient))::integer/step*step;
 if available>=q.minimum_credits then rid:=security.incentive_redemption(recipient,available,lot,false);end if;
 exception when raise_exception then null;end;
 end if;
 end loop;
 exception when raise_exception then
 update public.wf_incentive_events set status='budget_wait',reason='Award cannot be allocated yet; review funding and recipient eligibility' where id=e.id;
 end;
end $$;
create function security.incentive_allowance(pid uuid,recipient uuid) returns void language plpgsql security definer set search_path='' as $$
declare cfg public.wf_incentive_execution%rowtype;q public.wf_reward_policies%rowtype;v_period date;n integer;cost bigint;begin
 perform 1 from public.wf_incentive_programs where id=pid for update;
 select * into cfg from public.wf_incentive_execution where program_id=pid and enabled;
 v_period:=date_trunc('month',now() at time zone (cfg.policy->>'timezone'))::date;
 if cfg.program_id is null or exists(select 1 from public.wf_incentive_allowances where program_id=pid and participant_id=recipient and wf_incentive_allowances.period=v_period) then return;end if;
 if not exists(select 1 from public.wf_incentive_participants where id=recipient and program_id=pid and status='active' and accepted_version=cfg.terms_version) then return;end if;
 n:=(cfg.policy->>'givingAllowance')::int;if n<=0 then return;end if;
 select * into q from public.wf_reward_policies where program_id=pid;
 -- Reserve a worst-case whole-cent cost for every point, including fragmented transfers.
 cost:=n*ceil(q.cents_per_block::numeric/q.credits_per_block);
 if security.reward_liability(pid)+cost>least(q.allocated_cents,(cfg.policy->>'budgetCents')::bigint) then return;end if;
 insert into public.wf_incentive_allowances(program_id,participant_id,period,points,reserved_cents,expires_at) values(pid,recipient,v_period,n,cost,((v_period+interval '1 month')::timestamp at time zone (cfg.policy->>'timezone')));
end $$;
create function security.incentive_peer(pid uuid,sender uuid,recipient uuid,n integer,k text,note text,reviewed boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare cfg public.wf_incentive_execution%rowtype;a public.wf_incentive_allowances%rowtype;v_period date;eid uuid;cost bigint;used bigint;q public.wf_reward_policies%rowtype;flagged boolean;begin
 perform 1 from public.wf_incentive_programs where id=pid for update;
 select * into cfg from public.wf_incentive_execution where program_id=pid and enabled;
 if cfg.program_id is null or sender=recipient or n<1 or n>1000000 or length(btrim(note)) not between 1 and 1000 then raise exception 'Valid peer nomination required';end if;
 if exists(select 1 from public.wf_incentive_employment where participant_id in (sender,recipient) and ended_on is not null) then raise exception 'Active coworkers required';end if;
 v_period:=date_trunc('month',now() at time zone (cfg.policy->>'timezone'))::date;
 select id into eid from public.wf_incentive_events where program_id=pid and source_key='peer:'||sender||':'||k and milestone_id='peer';
 if found then
 if not exists(select 1 from public.wf_incentive_events where id=eid and recipients=array[recipient] and (rule->>'points')::int=n and evidence=note) then raise exception 'Nomination replay conflicts';end if;return eid;
 end if;
 if not exists(select 1 from public.wf_incentive_participants where id=sender and program_id=pid and status='active' and accepted_version=cfg.terms_version) or not exists(select 1 from public.wf_incentive_participants where id=recipient and program_id=pid and status='active' and accepted_version=cfg.terms_version) then raise exception 'Peer scope denied' using errcode='42501';end if;
 perform security.incentive_allowance(pid,sender);
 select * into a from public.wf_incentive_allowances where program_id=pid and participant_id=sender and wf_incentive_allowances.period=v_period for update;
 if a.participant_id is null or a.spent+n>a.points then raise exception 'Monthly giving allowance insufficient';end if;
 select coalesce(sum((e.rule->>'points')::int),0) into used from public.wf_incentive_events e where e.program_id=pid and e.milestone_id='peer' and e.recipients=array[recipient] and e.status<>'rejected' and (e.created_at at time zone (cfg.policy->>'timezone'))::date>=v_period;
 if used+n>(cfg.policy->>'recipientMonthlyCap')::int then raise exception 'Recipient monthly limit reached';end if;
 flagged:=exists(select 1 from public.wf_incentive_events e join public.wf_incentive_participants s on s.user_id=e.source_actor where e.program_id=pid and e.milestone_id='peer' and s.id=recipient and e.recipients=array[sender] and e.created_at>=now()-interval '30 days') or exists(select 1 from public.wf_incentive_events e where e.program_id=pid and e.milestone_id='peer' and e.source_actor=(select user_id from public.wf_incentive_participants where id=sender) and e.recipients=array[recipient] and e.created_at>=now()-interval '30 days');
 select * into q from public.wf_reward_policies where program_id=pid;cost:=n*ceil(q.cents_per_block::numeric/q.credits_per_block);
 update public.wf_incentive_allowances set spent=spent+n,reserved_cents=reserved_cents-cost where program_id=pid and participant_id=sender and wf_incentive_allowances.period=v_period;
 insert into public.wf_incentive_events(program_id,source_key,milestone_id,subject_key,recipients,rule,metrics,evidence,safety_complete,source_actor,status,reserved_cents,reason)
 values(pid,'peer:'||sender||':'||k,'peer','person:'||recipient,array[recipient],jsonb_build_object('id','peer','points',n,'approval','manager'),jsonb_build_object('senderId',sender),note,true,(select user_id from public.wf_incentive_participants where id=sender),'review',cost,case when flagged then 'Reciprocal or concentrated nominations require independent review' else 'Peer validation required' end) returning id into eid;
 -- Store the note after validation; blank evidence is never persisted (constraint-safe below).
 return eid;
end $$;
create function security.incentive_unlock(pid uuid) returns void language plpgsql security definer set search_path='' as $$
declare t record;r record;total bigint;begin
 perform 1 from public.wf_incentive_programs where id=pid for update;
 for t in select * from public.wf_incentive_tiers where program_id=pid loop
 for r in select * from public.wf_incentive_participants where program_id=pid and status='active' loop
 select count(distinct e.id) into total from public.wf_incentive_events e where e.program_id=pid and e.status='approved' and e.milestone_id=t.milestone_id and r.id=any(e.recipients) and exists(select 1 from public.wf_incentive_lots where event_id=e.id and participant_id=r.id);
 if total>=t.threshold then
 insert into public.wf_incentive_perks(tier_id,participant_id) values(t.id,r.id) on conflict do nothing;
 end if;
 end loop;end loop;
end $$;

create function security.incentive_engine_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor text:=security.pro_actor();op text:=input->>'op';p public.wf_incentive_programs%rowtype;
 cfg public.wf_incentive_execution%rowtype;d jsonb;q public.wf_reward_policies%rowtype;e public.wf_incentive_events%rowtype;
 r public.wf_incentive_participants%rowtype;pk public.wf_incentive_perks%rowtype;t public.wf_incentive_tiers%rowtype;
 manager boolean;recipient uuid;target uuid;rid uuid;proof text;decision text;member text;redeem_points integer;begin
 select * into p from public.wf_incentive_programs where id=(input->>'programId')::uuid and owner_type='employer' for update;
 if not found or not exists(select 1 from public.contractors where contractor_id=p.owner_id and approval_status='approved' and account_status='active') then raise exception 'Employer program unavailable' using errcode='42501';end if;
 manager:=security.pro_owner_access(p.owner_type,p.owner_id);
 select * into cfg from public.wf_incentive_execution where program_id=p.id;
 select * into r from public.wf_incentive_participants where program_id=p.id and user_id=actor and status='active';
 if not manager and r.id is null and not (op='engine_redeem' and exists(select 1 from public.wf_incentive_participants where program_id=p.id and user_id=actor and status='cancelled' and accepted_version=cfg.terms_version)) and not exists(select 1 from public.wf_incentive_roles where program_id=p.id and user_id=actor and exists(select 1 from public.wf_incentive_participants part where part.program_id=p.id and part.user_id=actor and part.status='active' and part.accepted_version=cfg.terms_version)) then raise exception 'Program scope denied' using errcode='42501';end if;
 if op='engine_setup' then
 if not manager or p.status<>'draft' or cfg.program_id is not null or exists(select 1 from public.wf_incentive_participants where program_id=p.id and accepted_version is not null) then raise exception 'Configure execution before participant acceptance' using errcode='42501';end if;
 select published into d from public.wf_incentive_definitions where program_id=p.id;
 if d is null then raise exception 'Publish rules first';end if;
 perform security.incentive_validate(d,true);
 if exists(select 1 from jsonb_array_elements(d->'milestones') m where coalesce(m->>'repeat','per_source') not in ('once','per_source')) then raise exception 'Invalid milestone repetition';end if;
 if ((d->>'minimumCredits')::bigint*(d->>'centsPerBlock')::bigint)%(d->>'creditsPerBlock')::bigint<>0 then raise exception 'Redemption minimum requires whole-cent conversion';end if;
 if d->>'safetyMode' in ('immediate','bank_and_redeem') and ((d->>'safetyPoints')::bigint*(d->>'centsPerBlock')::bigint)%(d->>'creditsPerBlock')::bigint<>0 then raise exception 'Immediate safety reward requires whole-cent conversion';end if;
 if exists(select 1 from public.wf_reward_credits c join public.wf_incentive_participants part on part.id=c.participant_id where part.program_id=p.id and c.credits<>0) then raise exception 'Existing rewarded programs retain their original ledger contract';end if;
 if length(coalesce(input->>'productId','')) not between 4 and 40 then raise exception 'Select a sandbox reward product';end if;
 insert into public.wf_reward_policies(program_id,cents_per_block,credits_per_block,minimum_credits,approval,product_id) values(p.id,(d->>'centsPerBlock')::int,(d->>'creditsPerBlock')::int,(d->>'minimumCredits')::int,'automatic',input->>'productId') on conflict(program_id) do update set cents_per_block=excluded.cents_per_block,credits_per_block=excluded.credits_per_block,minimum_credits=excluded.minimum_credits,approval='automatic',product_id=excluded.product_id;
 update public.wf_incentive_programs set starts_at=((d->>'startsAt')::date::timestamp at time zone (d->>'timezone')),ends_at=(((d->>'endsAt')::date+1)::timestamp at time zone (d->>'timezone'))-interval '1 microsecond',terms=(d->>'terms')||E'\nSandbox execution terms: '||(d->>'creditsPerBlock')||' points = '||(d->>'centsPerBlock')||' USD cents per block. Earned points: '||case when d->>'expiryMonths' is null then 'indefinite' else (d->>'expiryMonths')||' months after award' end||'. Departure policy: '||(d->>'departure')||case when d->>'departure'='window' then ' for '||(d->>'departureDays')||' days' else '' end||'. Safety rewards: '||(d->>'safetyMode')||'. Automatic sandbox redemption: '||coalesce(input->>'autoRedeem','false')||'. Gift-card eligibility, whole-cent conversion, available funded budget and provider terms apply. Financial terms are snapshotted per award. No live payouts.',terms_version=terms_version+1 where id=p.id returning terms_version into p.terms_version;
 insert into public.wf_incentive_execution(program_id,policy,terms_version,auto_redeem,created_by) values(p.id,d,p.terms_version,coalesce((input->>'autoRedeem')::boolean,false),actor);
 elsif op='metric_event' then
 if not manager then raise exception 'Metric source scope denied' using errcode='42501';end if;
 target:=security.incentive_event(p.id,'manual:'||(input->>'sourceKey'),input->>'milestoneId',nullif(input->>'participantId','')::uuid,input->>'crewId',input->'metrics',input->>'evidence',coalesce((input->>'safetyComplete')::boolean,false),actor,false);
 elsif op='review_event' then
 select * into e from public.wf_incentive_events where id=(input->>'eventId')::uuid and program_id=p.id for update;
 if not found or e.status not in ('safety_review','review','disputed','budget_wait') then raise exception 'Reviewable event required';end if;
 if exists(select 1 from public.wf_incentive_participants where id=any(e.recipients) and user_id=actor) or (e.milestone_id='peer' and e.source_actor=actor) then raise exception 'Independent reviewer required' using errcode='42501';end if;
 if length(btrim(coalesce(input->>'reason',''))) not between 1 and 1000 then raise exception 'Review explanation required';end if;
 if input->>'decision' not in ('approve','reject') then raise exception 'Select review decision';end if;
 if input->>'decision'='approve' and coalesce((e.rule->>'safetyRequired')::boolean,false) and not e.safety_complete then raise exception 'Safety checks cannot be waived by an exception';end if;
 if e.rule->>'approval'='safety_then_manager' and not e.safety_approved then
 if not manager and not exists(select 1 from public.wf_incentive_roles where program_id=p.id and user_id=actor and role='safety_reviewer') then raise exception 'Safety reviewer scope denied' using errcode='42501';end if;
 decision:=case when input->>'decision'='approve' then 'review' else 'rejected' end;
 update public.wf_incentive_events set status=decision,safety_approved=(decision='review'),safety_by=actor,reason=input->>'reason',history=history||jsonb_build_array(jsonb_build_object('stage','safety','decision',decision,'actor',actor,'reason',input->>'reason','at',now())) where id=e.id;
 else
 if not manager or e.safety_by=actor then raise exception 'Separate manager approval required' using errcode='42501';end if;
 if input->>'decision' not in ('approve','reject') then raise exception 'Select review decision';end if;
 decision:=case when input->>'decision'='approve' then 'approved' else 'rejected' end;
 -- Exception approval preserves original metrics and appends the review reason; no silent rewrite.
 update public.wf_incentive_events set status=decision,reviewed_by=actor,reason=input->>'reason',reserved_cents=case when decision='rejected' and e.milestone_id='peer' then 0 else reserved_cents end,history=history||jsonb_build_array(jsonb_build_object('stage','manager','actor',actor,'decision',decision,'reason',input->>'reason','at',now())) where id=e.id;
 if decision='rejected' and e.milestone_id='peer' then
 update public.wf_incentive_allowances set spent=greatest(0,spent-(e.rule->>'points')::int),reserved_cents=reserved_cents+case when expires_at>now() then e.reserved_cents else 0 end where program_id=p.id and participant_id=(e.metrics->>'senderId')::uuid and period=date_trunc('month',e.created_at at time zone (cfg.policy->>'timezone'))::date;
 end if;
 if decision='approved' then perform security.incentive_complete(e.id);end if;
 end if;
 if decision='rejected' and e.milestone_id<>'peer' then
 update public.wf_incentive_events set notified_at=now(),dispute_until=now()+interval '48 hours' where id=e.id;
 insert into public.wf_incentive_notices(program_id,user_id,source_key,title,body) select p.id,part.user_id,'decision:'||e.id||':'||jsonb_array_length(e.history)||':'||part.id,'Milestone decision available','Your reviewer declined this milestone. You have 48 hours from this in-app notice to request an exception. Original evidence and available funding reservation are retained.' from public.wf_incentive_participants part where part.id=any(e.recipients);
 end if;target:=e.id;
 elsif op='event_dispute' then
 select * into e from public.wf_incentive_events where id=(input->>'eventId')::uuid and program_id=p.id for update;
 if e.id is null or e.milestone_id='peer' or e.status<>'rejected' or (e.dispute_until<now() and not (input->>'appeal'='true' and not e.appeal_used)) then raise exception 'Dispute window unavailable';end if;
 if r.id is null or not r.id=any(e.recipients) or (e.subject_key like 'crew:%' and not exists(select 1 from public.wf_incentive_roles where program_id=p.id and user_id=actor and role='crew_lead' and crew_id=substr(e.subject_key,6))) then raise exception 'Dispute claimant scope denied' using errcode='42501';end if;
 if coalesce((input->>'appeal')::boolean,false) and e.appeal_used then raise exception 'Appeal already used';end if;
 if length(btrim(coalesce(input->>'reason',''))) not between 1 and 1000 then raise exception 'Exception evidence required';end if;
 update public.wf_incentive_events set status='disputed',appeal_used=appeal_used or coalesce((input->>'appeal')::boolean,false),history=history||jsonb_build_array(jsonb_build_object('stage','dispute','actor',actor,'reason',input->>'reason','at',now())) where id=e.id;target:=e.id;
 elsif op='peer_points' then
 if r.id is null or cfg.program_id is null or p.status<>'active' or now()<p.starts_at or now()>=p.ends_at or exists(select 1 from public.wf_incentive_definitions where program_id=p.id and (paused or archived)) then raise exception 'Active accepted program required';end if;
 select part.id into recipient from public.wf_incentive_participants part join public.users u on u.user_id=part.user_id where part.program_id=p.id and lower(u.email)=lower(btrim(input->>'recipientEmail')) and u.status='active' and part.status='active';
 target:=security.incentive_peer(p.id,r.id,recipient,(input->>'points')::int,input->>'requestKey',input->>'note');
 elsif op='engine_redeem' then
 if r.id is null then
 select * into r from public.wf_incentive_participants where program_id=p.id and user_id=actor and accepted_version=cfg.terms_version and status='cancelled';end if;
 if r.id is null then raise exception 'Own accepted reward account required' using errcode='42501';end if;
 redeem_points:=(input->>'points')::int;
 target:=security.incentive_redemption(r.id,redeem_points,(input->>'requestKey')::uuid,
 exists(select 1 from public.wf_incentive_lots l join public.wf_incentive_events safety_event on safety_event.id=l.event_id where l.id=nullif(input->>'safetyLot','')::uuid and l.participant_id=r.id and safety_event.milestone_id='safety-report' and l.policy->>'safetyMode' in ('immediate','bank_and_redeem') and l.points-l.consumed>=redeem_points),nullif(input->>'safetyLot','')::uuid);
 if target is null then raise exception 'Reward eligibility or sponsor funding requires review';end if;
 elsif op='employment' then
 if not manager then raise exception 'Employment verification scope denied' using errcode='42501';end if;
 recipient:=(input->>'participantId')::uuid;
 if exists(select 1 from public.wf_incentive_participants where id=recipient and user_id=actor) then raise exception 'Independent employment verifier required' using errcode='42501';end if;
 if not exists(select 1 from public.wf_incentive_participants where id=recipient and program_id=p.id) or (input->>'startedOn')::date>(now() at time zone (cfg.policy->>'timezone'))::date or length(btrim(coalesce(input->>'evidence',''))) not between 1 and 1000 then raise exception 'Verified employment evidence required';end if;
 if exists(select 1 from public.wf_incentive_employment where participant_id=recipient and started_on<>(input->>'startedOn')::date) then raise exception 'Confirmed employment start is immutable';end if;
 insert into public.wf_incentive_employment(participant_id,started_on,ended_on,source,source_key,verified_by) values(recipient,(input->>'startedOn')::date,nullif(input->>'endedOn','')::date,'employer_verified',input->>'evidence',actor) on conflict(participant_id) do update set ended_on=coalesce(excluded.ended_on,wf_incentive_employment.ended_on),updated_at=now();
 elsif op in ('grant_role','revoke_role') then
 if not manager then raise exception 'Role management scope denied' using errcode='42501';end if;
 select user_id into member from public.wf_incentive_participants where id=(input->>'participantId')::uuid and program_id=p.id;
 if member is null then raise exception 'Active participant required';end if;
 if op='revoke_role' then
 delete from public.wf_incentive_roles where program_id=p.id and user_id=member and role=input->>'role' and crew_id=coalesce(input->>'crewId','');
 else
 if not exists(select 1 from public.wf_incentive_participants where program_id=p.id and user_id=member and status='active' and accepted_version=cfg.terms_version) then raise exception 'Active accepted participant required';end if;
 if input->>'role'='crew_lead' and not exists(select 1 from public.wf_incentive_crew_assignments a join public.wf_incentive_participants part on part.user_id=member and part.program_id=p.id where a.program_id=p.id and a.crew_id=input->>'crewId' and part.id=any(a.member_ids)) then raise exception 'Crew lead must belong to assigned crew';end if;
 insert into public.wf_incentive_roles(program_id,user_id,role,crew_id) values(p.id,member,input->>'role',case when input->>'role'='crew_lead' then input->>'crewId' else '' end) on conflict do nothing;end if;
 elsif op='tier' then
 if not manager or length(btrim(coalesce(input->>'perk',''))) not between 1 and 1000 or not exists(select 1 from jsonb_array_elements(cfg.policy->'milestones') m where m->>'id'=input->>'milestoneId') then raise exception 'Published tier criteria and perk required' using errcode='42501';end if;
 insert into public.wf_incentive_tiers(program_id,title,milestone_id,threshold,perk,capacity) values(p.id,input->>'title',input->>'milestoneId',(input->>'threshold')::int,input->>'perk',(input->>'capacity')::int) returning id into target;
 elsif op='perk' then
 select * into pk from public.wf_incentive_perks where id=(input->>'perkId')::uuid for update;
 select * into t from public.wf_incentive_tiers where id=pk.tier_id and program_id=p.id;
 if t.id is null then raise exception 'Perk scope denied' using errcode='42501';end if;
 decision:=input->>'status';
 if decision='requested' then
 if pk.participant_id is distinct from r.id or pk.status<>'unlocked' then raise exception 'Own unlocked perk required' using errcode='42501';end if;
 else
 if not manager then raise exception 'Perk fulfillment scope denied' using errcode='42501';end if;
 if not ((pk.status='requested' and decision in ('approved','declined')) or (pk.status='approved' and decision in ('fulfilled','declined'))) then raise exception 'Invalid perk transition';end if;
 if decision='approved' and (select count(*) from public.wf_incentive_perks where tier_id=t.id and status in ('approved','fulfilled'))>=t.capacity then raise exception 'Perk inventory exhausted';end if;
 if length(btrim(coalesce(input->>'note',''))) not between 1 and 1000 then raise exception 'Fulfillment explanation required';end if;
 end if;
 update public.wf_incentive_perks set status=decision,note=input->>'note',updated_by=actor,updated_at=now() where id=pk.id;target:=pk.id;
 elsif op='recognition_consent' then
 if r.id is null then raise exception 'Own accepted participation required' using errcode='42501';end if;
 insert into public.wf_incentive_preferences(participant_id,public_recognition) values(r.id,(input->>'enabled')::boolean) on conflict(participant_id) do update set public_recognition=excluded.public_recognition;
 elsif op='integration' then
 if not manager or input->>'tokenHash'!~'^[a-f0-9]{64}$' or jsonb_typeof(input->'mapping') is distinct from 'object' or octet_length((input->'mapping')::text)>4000 then raise exception 'Valid scoped integration required' using errcode='42501';end if;
 insert into security.wf_incentive_integrations(program_id,name,token_hash,mapping,created_by) values(p.id,input->>'name',input->>'tokenHash',input->'mapping',actor) returning id into target;
 elsif op='bind_integration' then
 if not manager or not exists(select 1 from security.wf_incentive_integrations where id=(input->>'integrationId')::uuid and program_id=p.id and active) or not exists(select 1 from public.wf_incentive_participants where id=(input->>'participantId')::uuid and program_id=p.id) then raise exception 'Integration binding scope denied' using errcode='42501';end if;
 insert into security.wf_incentive_bindings(integration_id,external_id,participant_id) values((input->>'integrationId')::uuid,input->>'externalId',(input->>'participantId')::uuid) on conflict(integration_id,external_id) do update set participant_id=excluded.participant_id;
 elsif op='retry_ingestion' then
 if not manager or length(btrim(coalesce(input->>'reason',''))) not between 1 and 1000 then raise exception 'Reconciliation explanation required' using errcode='42501';end if;
 update security.wf_incentive_ingestion x set status='retry_ready',history=history||jsonb_build_array(jsonb_build_object('op','retry_authorized','actor',actor,'reason',input->>'reason','at',now())) from security.wf_incentive_integrations i where i.id=x.integration_id and i.program_id=p.id and i.id=(input->>'integrationId')::uuid and x.event_key=input->>'eventKey' and x.status='quarantined';
 if not found then raise exception 'Quarantined event unavailable';end if;
 elsif op='disable_integration' then
 if not manager then raise exception 'Integration management scope denied' using errcode='42501';end if;
 update security.wf_incentive_integrations set active=false where id=(input->>'integrationId')::uuid and program_id=p.id;
 elsif op='tick' then
 if not manager then raise exception 'Automation management scope denied' using errcode='42501';end if;
 perform security.incentive_tick(p.id);
 else raise exception 'Unsupported engine action';end if;
 perform security.incentive_unlock(p.id);
 insert into public.wf_incentive_audit(program_id,actor,event,target_id,detail) values(p.id,actor,'ENGINE_'||upper(op),coalesce(target,p.id),jsonb_build_object('sandbox',true));
 return jsonb_build_object('id',target,'ok',true);
end $$;
create function security.incentive_tick(pid uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare p record;r record;m jsonb;emp public.wf_incentive_employment%rowtype;native record;today date;due date;eid uuid;handled integer:=0;begin
 for p in select prog.*,x.policy from public.wf_incentive_programs prog join public.wf_incentive_execution x on x.program_id=prog.id where x.enabled and (pid is null or prog.id=pid) order by prog.id loop
 perform 1 from public.wf_incentive_programs where id=p.id for update;
 -- Import only explicitly confirmed native employment, never scheduled starts or invitations.
 for r in select part.* from public.wf_incentive_participants part where part.program_id=p.id and part.accepted_version is not null loop
 select placement.employment_start_date,placement.ended_at,placement.placement_id into native from public.wf_placements placement join public.wf_student_profiles student on student.student_id=placement.student_id where student.user_id=r.user_id and placement.employer_id=p.owner_id and placement.employment_start_date is not null and placement.start_confirmed_at is not null and placement.status in ('active','ended') order by placement.employment_start_date desc limit 1;
 if found then
 insert into public.wf_incentive_employment(participant_id,started_on,ended_on,source,source_key) values(r.id,native.employment_start_date,(native.ended_at at time zone (p.policy->>'timezone'))::date,'confirmed_placement',native.placement_id) on conflict(participant_id) do update set ended_on=coalesce(excluded.ended_on,wf_incentive_employment.ended_on),updated_at=now() where wf_incentive_employment.started_on=excluded.started_on;
 end if;
 end loop;
 perform security.incentive_expire(p.id);
 if not exists(select 1 from public.contractors where contractor_id=p.owner_id and approval_status='approved' and account_status='active') or p.status<>'active' or now()<p.starts_at or now()>=p.ends_at or exists(select 1 from public.wf_incentive_definitions where program_id=p.id and (paused or archived)) then continue;end if;
 today:=(now() at time zone (p.policy->>'timezone'))::date;
 for r in select * from public.wf_incentive_participants where program_id=p.id and status='active' loop
 perform security.incentive_allowance(p.id,r.id);
 select * into emp from public.wf_incentive_employment where participant_id=r.id and ended_on is null;
 if not found then continue;end if;
 for m in select * from jsonb_array_elements(p.policy->'milestones') where value->>'recipient'='individual' and not exists(select 1 from jsonb_array_elements(value->'conditions') c where c->>'metric'<>'service_days' or c->>'operator'<>'gte') loop
 select emp.started_on+max((c->>'value')::int) into due from jsonb_array_elements(m->'conditions') c;
 if due is null or due>today or due<(p.starts_at at time zone (p.policy->>'timezone'))::date then continue;end if;
 eid:=security.incentive_event(p.id,'retention:'||r.id||':'||emp.started_on,m->>'id',r.id,null,jsonb_build_object('service_days',due-emp.started_on),'Verified service anniversary: '||emp.source||' / '||emp.source_key,not coalesce((m->>'safetyRequired')::boolean,false),null,true);
 perform security.incentive_complete(eid);handled:=handled+1;
 end loop;end loop;
 -- A missed remediation target escalates once, never resumes or resets crew progress.
 insert into public.wf_incentive_notices(program_id,user_id,source_key,title,body)
 select p.id,p.created_by,'safety-overdue:'||c.id,'Safety remediation overdue','An open confidential safety case passed its remediation target. Progress remains protected until resolution.' from public.wf_incentive_cases c where c.program_id=p.id and c.kind='safety' and c.status in ('pending','verified') and c.deadline<now() on conflict(source_key) do nothing;
 update public.wf_incentive_events set reserved_cents=0 where program_id=p.id and status='rejected' and dispute_until<now();
 perform security.incentive_unlock(p.id);
 end loop;
 return jsonb_build_object('processed',handled,'sandbox',true);
end $$;

create function security.incentive_ingest(token_hash text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare link security.wf_incentive_integrations%rowtype;binding uuid;mapped jsonb:='{}';pair record;v_key text;v_hash text;prior security.wf_incentive_ingestion%rowtype;eid uuid;typ text;v text;begin
 select * into link from security.wf_incentive_integrations where wf_incentive_integrations.token_hash=incentive_ingest.token_hash and active;
 if not found then raise exception 'Integration authentication denied' using errcode='42501';end if;
 v_key:=payload->>'eventId';typ:=coalesce(payload->>'type','metric');
 if length(coalesce(v_key,'')) not between 1 and 100 or octet_length(payload::text)>32000 then raise exception 'Bounded integration event required';end if;
 v_hash:=encode(sha256(convert_to((payload-'sentAt')::text,'UTF8')),'hex');
 select * into prior from security.wf_incentive_ingestion where integration_id=link.id and wf_incentive_ingestion.event_key=v_key;
 if found and prior.status<>'retry_ready' then
 if prior.payload_hash<>v_hash then raise exception 'Integration replay conflicts';end if;
 return jsonb_build_object('duplicate',true,'quarantined',prior.status='quarantined');end if;
 if not exists(select 1 from jsonb_array_elements_text(coalesce(link.mapping->'types','["metric"]')) x where x=typ) then raise exception 'Integration event type not authorized' using errcode='42501';end if;
 select participant_id into binding from security.wf_incentive_bindings where integration_id=link.id and external_id=payload->>'employeeId';
 begin
 if binding is null then raise exception 'Unmapped employee identifier';end if;
 if typ='employment' then
 if nullif(payload->>'startedOn','')::date is null or (payload->>'startedOn')::date>current_date then raise exception 'Actual employment start required';end if;
 if exists(select 1 from public.wf_incentive_employment where participant_id=binding and started_on<>(payload->>'startedOn')::date) then raise exception 'Employment start conflicts with verified history';end if;
 insert into public.wf_incentive_employment(participant_id,started_on,ended_on,source,source_key,verified_by) values(binding,(payload->>'startedOn')::date,nullif(payload->>'endedOn','')::date,'hrms',link.id||':'||v_key,link.created_by) on conflict(participant_id) do update set ended_on=coalesce(excluded.ended_on,wf_incentive_employment.ended_on),updated_at=now();
 elsif typ='metric' then
 for pair in select * from jsonb_each_text(coalesce(link.mapping->'metrics','{}')) loop
 if pair.key not in ('budget_percent','delay_hours','reviews','training_count','service_days','qualifying_projects') then raise exception 'Unknown mapped metric';end if;
 if pair.value!~'^[A-Za-z_][A-Za-z0-9_.]{0,100}$' then raise exception 'Invalid metric field path';end if;
 v:=(payload->'values')#>>string_to_array(pair.value,'.');
 if v is null or v!~'^[0-9]+(\.[0-9]+)?$' or v::numeric>1000000 then raise exception 'Invalid mapped metric';end if;
 mapped:=mapped||jsonb_build_object(pair.key,v::numeric);
 end loop;
 eid:=security.incentive_event(link.program_id,'integration:'||link.id||':'||v_key,payload->>'milestoneId',binding,payload->>'crewId',mapped,left(coalesce(payload->>'evidence','Integrated source event'),4000),coalesce((payload->>'safetyComplete')::boolean,false),null,false);
 else raise exception 'Unsupported integration event';end if;
 insert into security.wf_incentive_ingestion(integration_id,event_key,status,payload_hash) values(link.id,v_key,'accepted',v_hash) on conflict(integration_id,event_key) do update set status='accepted',payload_hash=excluded.payload_hash,reason=null,attempts=wf_incentive_ingestion.attempts+1,history=wf_incentive_ingestion.history||jsonb_build_array(jsonb_build_object('priorStatus',wf_incentive_ingestion.status,'at',now()));
 exception when others then
 -- Quarantine only a sanitized reason; arbitrary HRMS payloads and private fields are not persisted.
 insert into security.wf_incentive_ingestion(integration_id,event_key,status,payload_hash,reason) values(link.id,v_key,'quarantined',v_hash,'Check employee binding, mapped numeric fields and program eligibility; reconcile before replay') on conflict(integration_id,event_key) do update set status='quarantined',payload_hash=excluded.payload_hash,attempts=wf_incentive_ingestion.attempts+1,history=wf_incentive_ingestion.history||jsonb_build_array(jsonb_build_object('priorStatus',wf_incentive_ingestion.status,'at',now()));
 return jsonb_build_object('quarantined',true);
 end;
 return jsonb_build_object('accepted',true,'id',eid);
end $$;
create function security.incentive_engine_workspace(pid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor text:=security.pro_actor();p public.wf_incentive_programs%rowtype;manager boolean;me uuid;begin
 select * into p from public.wf_incentive_programs where id=pid and owner_type='employer';
 manager:=security.pro_owner_access('employer',p.owner_id);
 select id into me from public.wf_incentive_participants where program_id=pid and user_id=actor and accepted_version is not null;
 if p.id is null or (not manager and me is null and not exists(select 1 from public.wf_incentive_roles role join public.wf_incentive_participants part on part.program_id=role.program_id and part.user_id=role.user_id and part.status='active' where role.program_id=pid and role.user_id=actor)) then raise exception 'Program scope denied' using errcode='42501';end if;
 return jsonb_build_object(
 'execution',(select jsonb_build_object('enabled',enabled,'autoRedeem',auto_redeem,'sandbox',sandbox_only,'termsVersion',terms_version) from public.wf_incentive_execution where program_id=pid),
 'roles',case when manager then coalesce((select jsonb_agg(jsonb_build_object('participantId',part.id,'role',role.role,'crewId',role.crew_id)) from public.wf_incentive_roles role join public.wf_incentive_participants part on part.program_id=role.program_id and part.user_id=role.user_id where role.program_id=pid),'[]') else '[]'::jsonb end,
 'events',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('canReview',((manager and (e.status<>'review' or e.safety_by is distinct from actor)) or (e.rule->>'approval'='safety_then_manager' and not e.safety_approved and e.status in ('safety_review','budget_wait','disputed') and exists(select 1 from public.wf_incentive_roles role where role.program_id=pid and role.user_id=actor and role.role='safety_reviewer'))) and not coalesce(me=any(e.recipients),false) and not (e.milestone_id='peer' and e.source_actor=actor)) order by e.created_at desc) from (select * from public.wf_incentive_events e where e.program_id=pid and (manager or me=any(e.recipients) or exists(select 1 from public.wf_incentive_roles where program_id=pid and user_id=actor and role='safety_reviewer' and e.rule->>'approval'='safety_then_manager' and not e.safety_approved and e.status in ('safety_review','budget_wait','disputed') and exists(select 1 from public.wf_incentive_participants part where part.program_id=pid and part.user_id=actor and part.status='active'))) order by e.created_at desc limit 100) e),'[]'),
 'lots',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('available',security.incentive_lot_available(l.id))) from public.wf_incentive_lots l where l.program_id=pid and (manager or l.participant_id=me)),'[]'),
 'allowances',coalesce((select jsonb_agg(to_jsonb(a)) from public.wf_incentive_allowances a where a.program_id=pid and a.expires_at>now() and (manager or a.participant_id=me)),'[]'),
 'employment',coalesce((select jsonb_agg(to_jsonb(emp)) from public.wf_incentive_employment emp join public.wf_incentive_participants r on r.id=emp.participant_id where r.program_id=pid and (manager or r.id=me)),'[]'),
 'tiers',coalesce((select jsonb_agg(to_jsonb(t)) from public.wf_incentive_tiers t where t.program_id=pid),'[]'),
 'perks',coalesce((select jsonb_agg(to_jsonb(pk)) from public.wf_incentive_perks pk join public.wf_incentive_tiers t on t.id=pk.tier_id where t.program_id=pid and (manager or pk.participant_id=me)),'[]'),
 'integrations',case when manager then coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'mapping',i.mapping,'active',i.active)) from security.wf_incentive_integrations i where i.program_id=pid),'[]') else '[]'::jsonb end,
 'ingestion',case when manager then coalesce((select jsonb_agg(jsonb_build_object('integrationId',x.integration_id,'eventKey',x.event_key,'status',x.status,'reason',x.reason,'createdAt',x.created_at)) from security.wf_incentive_ingestion x join security.wf_incentive_integrations i on i.id=x.integration_id where i.program_id=pid),'[]') else '[]'::jsonb end,
 'notices',coalesce((select jsonb_agg(to_jsonb(n)) from public.wf_incentive_notices n where n.program_id=pid and n.user_id=actor),'[]'),
 'consent',coalesce((select public_recognition from public.wf_incentive_preferences where participant_id=me),false),
 'progress',coalesce((select jsonb_agg(jsonb_build_object('crewId',g.crew_id,'count',g.progress_count,'paused',exists(select 1 from public.wf_incentive_safety_pauses pause join public.wf_incentive_cases c on c.id=pause.case_id where pause.program_id=pid and pause.crew_id=g.crew_id and c.status in ('pending','verified')))) from public.wf_incentive_safety_progress g where g.program_id=pid and (manager or exists(select 1 from public.wf_incentive_crew_assignments a where a.program_id=pid and a.crew_id=g.crew_id and me=any(a.member_ids)))),'[]'),
 'board',coalesce((select jsonb_agg(jsonb_build_object('name',concat_ws(' ',u.first_name,left(u.last_name,1)),'title',t.title,'issuer','Employer recognition','perk',t.perk)) from public.wf_incentive_perks pk join public.wf_incentive_tiers t on t.id=pk.tier_id join public.wf_incentive_preferences pref on pref.participant_id=pk.participant_id and pref.public_recognition join public.wf_incentive_participants r on r.id=pk.participant_id join public.users u on u.user_id=r.user_id where t.program_id=pid and exists(select 1 from public.wf_incentive_execution x where x.program_id=pid and (x.policy->>'publicRecognition')::boolean)),'[]'));
end $$;
create table public.wf_incentive_safety_progress (
 program_id uuid not null references public.wf_incentive_programs(id),crew_id text not null,
 progress_count bigint not null default 0 check(progress_count>=0),source text,primary key(program_id,crew_id)
);
create table public.wf_incentive_safety_pauses (
 case_id uuid not null references public.wf_incentive_cases(id),program_id uuid not null references public.wf_incentive_programs(id),crew_id text not null,
 primary key(case_id,crew_id)
);
create index wf_incentive_safety_pauses_program on public.wf_incentive_safety_pauses(program_id,crew_id);
alter table public.wf_incentive_safety_progress enable row level security;alter table public.wf_incentive_safety_pauses enable row level security;
revoke all on public.wf_incentive_safety_progress,public.wf_incentive_safety_pauses from public,anon,authenticated,service_role;
create unique index wf_incentive_safety_once on public.wf_incentive_events(program_id,source_key) where milestone_id='safety-report';
create function security.incentive_case_execution() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.wf_incentive_execution%rowtype;recipient uuid;eid uuid;lot uuid;crew text;begin
 if new.kind<>'safety' then return new;end if;
 select * into cfg from public.wf_incentive_execution where program_id=new.program_id and enabled;
 if not found then return new;end if;
 select id into recipient from public.wf_incentive_participants where program_id=new.program_id and user_id=new.actor;
 if tg_op='INSERT' then
 for crew in select crew_id from public.wf_incentive_crew_assignments where program_id=new.program_id and recipient=any(member_ids) union select 'program' where not exists(select 1 from public.wf_incentive_crew_assignments where program_id=new.program_id and recipient=any(member_ids)) loop
 insert into public.wf_incentive_safety_progress(program_id,crew_id) values(new.program_id,crew) on conflict do nothing;
 insert into public.wf_incentive_safety_pauses(case_id,program_id,crew_id) values(new.id,new.program_id,crew) on conflict do nothing;
 end loop;
 elsif new.status='verified' and old.status<>'verified' and (cfg.policy->>'safetyPoints')::int>0 then
 select id into eid from public.wf_incentive_events where program_id=new.program_id and source_key='safety:'||new.source_key and milestone_id='safety-report';
 if found then return new;end if;
 insert into public.wf_incentive_events(program_id,source_key,milestone_id,subject_key,recipients,rule,metrics,evidence,safety_complete,source_actor,status,reviewed_by)
 values(new.program_id,'safety:'||new.source_key,'safety-report','person:'||recipient,array[recipient],jsonb_build_object('id','safety-report','points',(cfg.policy->>'safetyPoints')::int),'{}','Verified confidential safety report',true,new.actor,'approved',new.reviewed_by) returning id into eid;
 perform security.incentive_complete(eid);
 if cfg.policy->>'safetyMode'='immediate' then
 select id into lot from public.wf_incentive_lots where event_id=eid;
 if lot is not null then begin perform security.incentive_redemption(recipient,(cfg.policy->>'safetyPoints')::int,lot,true,lot);exception when raise_exception then null;end;end if;
 end if;
 end if;return new;
end $$;
create trigger incentive_case_execution after insert or update of status on public.wf_incentive_cases for each row execute function security.incentive_case_execution();

-- Existing public actions remain available. New operations have one checked dispatcher.
alter function security.incentive_action(jsonb) rename to incentive_action_before_execution;
revoke all on function security.incentive_action_before_execution(jsonb) from public,anon,authenticated,service_role;
create function security.incentive_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=(input->>'programId')::uuid;actor text:=security.pro_actor();crew text;v bigint;begin
 if input->>'op'='publish' and exists(select 1 from public.wf_incentive_execution where program_id=pid) then raise exception 'Execution terms are immutable; create a new program';end if;
 if input->>'op'='safety_progress' then
 if not exists(select 1 from public.wf_incentive_programs p where p.id=pid and security.pro_owner_access(p.owner_type,p.owner_id)) then raise exception 'Safety progress scope denied' using errcode='42501';end if;
 perform 1 from public.wf_incentive_programs where id=pid for update;
 crew:=input->>'crewId';v:=(input->>'count')::bigint;
 if v<0 or v>1000000000 or length(btrim(coalesce(input->>'evidence',''))) not between 1 and 1000 or not exists(select 1 from public.wf_incentive_crew_assignments where program_id=pid and crew_id=crew) then raise exception 'Verified crew progress required';end if;
 if exists(select 1 from public.wf_incentive_safety_pauses pause join public.wf_incentive_cases c on c.id=pause.case_id where pause.program_id=pid and pause.crew_id=crew and c.status in ('pending','verified')) then raise exception 'Crew progress is frozen during remediation';end if;
 if exists(select 1 from public.wf_incentive_safety_progress where program_id=pid and crew_id=crew and progress_count>v) then raise exception 'Reports never reset earned progress';end if;
 insert into public.wf_incentive_safety_progress(program_id,crew_id,progress_count,source) values(pid,crew,v,input->>'evidence') on conflict(program_id,crew_id) do update set progress_count=excluded.progress_count,source=excluded.source;
 insert into public.wf_incentive_audit(program_id,actor,event,target_id) values(pid,actor,'ENGINE_SAFETY_PROGRESS',pid);
 return jsonb_build_object('ok',true);
 end if;
 if input->>'op' in ('engine_setup','metric_event','review_event','event_dispute','peer_points','engine_redeem','employment','grant_role','revoke_role','tier','perk','recognition_consent','integration','bind_integration','disable_integration','retry_ingestion','tick') then return security.incentive_engine_action(input);end if;
 return security.incentive_action_before_execution(input);
end $$;
create or replace function public.incentive_action(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.incentive_action(p_input)$$;
-- Disable legacy policy changes and unrelated award routes for execution programs.
alter function security.reward_action(jsonb) rename to reward_action_before_execution;
revoke all on function security.reward_action_before_execution(jsonb) from public,anon,authenticated,service_role;
create function security.reward_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if input->>'op' in ('policy','award','finalize_winners') and exists(select 1 from public.wf_incentive_execution where program_id=nullif(input->>'programId','')::uuid) then raise exception 'Execution terms are immutable; use verified engine awards';end if;
 return security.reward_action_before_execution(input);
end $$;
create or replace function public.reward_action(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.reward_action(p_input)$$;

create function security.incentive_jobs_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare jobs jsonb;j record;begin
 if input->>'op' in ('run','claim') then if input->>'op'='run' then perform security.incentive_tick();end if;
 select coalesce(jsonb_agg(x.request_id),'[]') into jobs from(select j.request_id from security.wf_incentive_jobs j join public.wf_reward_requests r on r.id=j.request_id where j.next_attempt<=now() and (j.lease_until is null or j.lease_until<=now()) and j.attempts<10 and r.status in ('approved','processing','provider_pending','reconciliation_required') order by j.next_attempt limit 3 for update of j skip locked) x;
 update security.wf_incentive_jobs set lease_until=now()+interval '5 minutes',attempts=attempts+1 where request_id in(select value::text::uuid from jsonb_array_elements_text(jobs));
 return jsonb_build_object('requests',jobs);
 elsif input->>'op'='finish' then
 update security.wf_incentive_jobs set lease_until=null,next_attempt=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::int)),last_error=case when (input->>'ok')::boolean then null else 'Provider outcome unconfirmed; same immutable request will be reconciled' end where request_id=(input->>'requestId')::uuid;
 return jsonb_build_object('ok',true);
 end if;raise exception 'Unsupported job action';
end $$;
create function public.incentive_engine_workspace(p_program_id uuid) returns jsonb language sql security invoker set search_path='' as $$select security.incentive_engine_workspace(p_program_id)$$;
create function public.incentive_ingest(p_token_hash text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.incentive_ingest(p_token_hash,p_payload)$$;
create function public.incentive_jobs(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.incentive_jobs_action(p_input)$$;
-- Default PUBLIC function execution is revoked for every new helper, including trigger functions.
do $$declare f record;begin
 for f in select p.oid::regprocedure name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='security' and (p.proname like 'incentive_%' or p.proname='reward_action' or p.proname='reward_action_before_execution' or p.proname='reward_liability') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.name);end loop;
end $$;
revoke all on function public.incentive_action(jsonb),public.incentive_engine_workspace(uuid),public.incentive_ingest(text,jsonb),public.incentive_jobs(jsonb) from public,anon,authenticated,service_role;
grant execute on function security.incentive_action(jsonb),security.incentive_workspace(),security.incentive_bank(),security.incentive_employer_workspace(text),security.incentive_engine_workspace(uuid),security.reward_action(jsonb),public.incentive_action(jsonb),public.incentive_engine_workspace(uuid) to authenticated;
grant execute on function security.incentive_ingest(text,jsonb),security.incentive_jobs_action(jsonb),public.incentive_ingest(text,jsonb),public.incentive_jobs(jsonb) to service_role;
create function security.incentive_credit_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare pid uuid;begin
 select program_id into pid from public.wf_incentive_participants where id=new.participant_id;
 if exists(select 1 from public.wf_incentive_execution where program_id=pid) then
 if new.source_key like 'score:%' then return null;end if;
 if new.credits>0 and new.source_key not like 'engine:%' and new.source_key not like 'release:%' then raise exception 'Execution credits require verified award provenance';end if;
 end if;return new;
end $$;
create trigger incentive_credit_guard before insert on public.wf_reward_credits for each row execute function security.incentive_credit_guard();
revoke all on function security.incentive_credit_guard() from public,anon,authenticated,service_role;

create index wf_incentive_execution_creator on public.wf_incentive_execution(created_by);
-- Reads exclude policy-expired value even before the periodic ledger settlement runs.
create function security.incentive_lot_available(lid uuid) returns integer language sql stable security definer set search_path='' as $$
 select coalesce((select case when deadline is null or deadline>now() then points-consumed else 0 end from (
 select l.points,l.consumed,least(l.expires_at,case when e.ended_on is not null and l.policy->>'departure'='window' then ((e.ended_on+(l.policy->>'departureDays')::int)::timestamp at time zone (l.policy->>'timezone')) end) deadline from public.wf_incentive_lots l left join public.wf_incentive_employment e on e.participant_id=l.participant_id where l.id=lid) eligible),0)
$$;
alter function security.incentive_bank() rename to incentive_bank_before_execution;
revoke all on function security.incentive_bank_before_execution() from public,anon,authenticated,service_role;
create function security.incentive_bank() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;accounts jsonb;begin
 result:=security.incentive_bank_before_execution();
 select coalesce(jsonb_agg(case when exists(select 1 from public.wf_incentive_execution where program_id=(a->>'programId')::uuid) then jsonb_set(a,'{available}',to_jsonb(coalesce((select sum(security.incentive_lot_available(l.id)) from public.wf_incentive_lots l where l.participant_id=(a->>'participantId')::uuid),0))) else a end),'[]') into accounts from jsonb_array_elements(result->'accounts') a;
 return jsonb_set(result,'{accounts}',accounts);
end $$;
create or replace function public.incentive_bank() returns jsonb language sql security invoker set search_path='' as $$select security.incentive_bank()$$;
revoke all on function security.incentive_lot_available(uuid),security.incentive_bank() from public,anon,authenticated,service_role;
grant execute on function security.incentive_bank() to authenticated;
