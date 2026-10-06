-- Sandbox-only owner-approved funded reward increment. Screening execution deliberately unavailable.
create table security.wf_reward_accounts (
 owner_type text not null check(owner_type in ('institution','employer')), owner_id text not null,
 organization_id text unique, sealed_tokens text, token_version integer not null default 0,
 balance_cents bigint not null default 0 check(balance_cents>=0), balance_at timestamptz,
 lease uuid, leased_until timestamptz, primary key(owner_type,owner_id)
);
create table security.wf_reward_oauth (
 state_hash text primary key, owner_type text not null, owner_id text not null, actor uuid not null,
 expires_at timestamptz not null default now()+interval '10 minutes', consumed_at timestamptz
);
create table public.wf_reward_policies (
 program_id uuid primary key references public.wf_incentive_programs(id),
 cents_per_block integer not null check(cents_per_block between 1 and 100000),
 credits_per_block integer not null check(credits_per_block between 1 and 1000000),
 minimum_credits integer not null check(minimum_credits between 1 and 1000000),
 approval text not null check(approval in ('admin','automatic')), product_id text not null check(length(product_id) between 4 and 40),
 allocated_cents bigint not null default 0 check(allocated_cents>=0), created_at timestamptz not null default now()
);
create table public.wf_reward_credits (
 id uuid primary key default gen_random_uuid(), participant_id uuid not null references public.wf_incentive_participants(id),
 credits integer not null, source_key text not null unique, reason text not null, created_at timestamptz not null default now()
);
create index wf_reward_credits_participant on public.wf_reward_credits(participant_id);
create table security.wf_reward_eligibility (
 user_id text primary key references public.users(user_id), country text not null check(country='US'),
 born_on date not null check(born_on>=date '1900-01-01'), recorded_at timestamptz not null default now()
);
create table public.wf_reward_requests (
 id uuid primary key default gen_random_uuid(), participant_id uuid not null references public.wf_incentive_participants(id),
 request_key uuid not null unique, credits integer not null check(credits>0), cents bigint not null check(cents>0),
 product_id text not null, status text not null check(status in ('pending','approved','processing','issued','provider_pending','rejected','cancelled','reconciliation_required')),
 provider_order_id text unique, provider_reward_id text unique, provider_status text, delivery_status text,
 recipient_email text not null, recipient_name text not null, requested_by text not null references public.users(user_id),
 reviewed_by text references public.users(user_id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index wf_reward_requests_participant on public.wf_reward_requests(participant_id);
create table security.wf_reward_webhooks (event_id uuid primary key, event text not null, resource_id text not null, created_at timestamptz not null default now());
create table public.wf_reward_audit (id uuid primary key default gen_random_uuid(), actor text, owner_type text, owner_id text, event text not null, target text, created_at timestamptz not null default now());
create index wf_reward_audit_owner on public.wf_reward_audit(owner_type,owner_id,created_at);
create table public.wf_screening_permissions (
 employer_id text not null references public.contractors(contractor_id), user_id text not null references public.users(user_id),
 can_order boolean not null default false, can_review boolean not null default false,
 monthly_limit_cents integer not null check(monthly_limit_cents>=0), approval_above_cents integer not null check(approval_above_cents>=0),
 primary key(employer_id,user_id)
);
create table public.wf_screening_bundles (
 id uuid primary key default gen_random_uuid(), employer_id text not null references public.contractors(contractor_id),
 name text not null check(length(name) between 1 and 100), checks text[] not null check(cardinality(checks) between 1 and 15),
 created_by text not null references public.users(user_id), created_at timestamptz not null default now(),unique(employer_id,name)
);
-- No report, SSN, criminal flags, DOB or email attachment is persisted in screening records.
create table public.wf_screening_orders (
 id uuid primary key default gen_random_uuid(), employer_id text not null references public.contractors(contractor_id),
 ordered_by text not null references public.users(user_id), subject_user_id text not null references public.users(user_id),
 audience text not null check(audience in ('applicant','employee')), checks text[] not null,
 quoted_cents integer not null check(quoted_cents>0), status text not null check(status in ('pending_approval','reserved','processing','complete','cancelled')),
 provider_id text unique, reserved_month date not null, created_at timestamptz not null default now()
);
create index wf_screening_orders_budget on public.wf_screening_orders(employer_id,ordered_by,reserved_month,status);
do $$ declare t text;begin
foreach t in array array['wf_reward_policies','wf_reward_credits','wf_reward_requests','wf_reward_audit','wf_screening_permissions','wf_screening_bundles','wf_screening_orders'] loop
 execute 'alter table public.'||t||' enable row level security';execute 'revoke all on public.'||t||' from public,anon,authenticated';end loop;
foreach t in array array['wf_reward_accounts','wf_reward_oauth','wf_reward_eligibility','wf_reward_webhooks'] loop
 execute 'alter table security.'||t||' enable row level security';execute 'revoke all on security.'||t||' from public,anon,authenticated';end loop;
end $$;
create function security.reward_credit_balance(r uuid) returns bigint language sql stable security definer set search_path='' as $$select coalesce(sum(credits),0) from public.wf_reward_credits where participant_id=r$$;
create function security.reward_liability(pid uuid) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce((select sum(ceil(greatest(0,security.reward_credit_balance(r.id))::numeric*q.cents_per_block/q.credits_per_block)) from public.wf_incentive_participants r join public.wf_reward_policies q on q.program_id=r.program_id where r.program_id=pid),0)
 +coalesce((select sum(x.cents) from public.wf_reward_requests x join public.wf_incentive_participants r on r.id=x.participant_id where r.program_id=pid and x.status not in ('rejected','cancelled')),0)$$;
create function security.reward_score_credit() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.wf_incentive_participants%rowtype;p public.wf_incentive_programs%rowtype;q public.wf_reward_policies%rowtype;n integer;increment bigint;b bigint;
begin
 select * into r from public.wf_incentive_participants where id=new.participant_id;
 select * into p from public.wf_incentive_programs where id=r.program_id for update;
 select * into q from public.wf_reward_policies where program_id=p.id;
 if not found or p.template='competition' then return new;end if;
 n:=new.points;
 if n<0 then
 -- Reverse only credits actually issued for the original award; exhausted awards
 -- have zero monetary credits even though their activity points were positive.
 select -coalesce(sum(c.credits),0) into n from public.wf_incentive_score_ledger original join public.wf_reward_credits c on c.source_key='score:'||original.id where original.submission_id=new.submission_id and original.entry_type='award';
 end if;
 if n>0 then
 b:=greatest(0,security.reward_credit_balance(r.id));
 increment:=ceil((b+n)::numeric*q.cents_per_block/q.credits_per_block)-ceil(b::numeric*q.cents_per_block/q.credits_per_block);
 if security.reward_liability(p.id)+increment>q.allocated_cents then n:=0;end if;
 end if;
 insert into public.wf_reward_credits(participant_id,credits,source_key,reason) values(r.id,n,'score:'||new.id,case when n=0 and new.points>0 then 'Reward budget exhausted; activity points retained' else 'Funded policy score transition' end);
 return new;
end $$;
create trigger wf_reward_score_credit after insert on public.wf_incentive_score_ledger for each row execute function security.reward_score_credit();
create function security.reward_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor text;op text:=input->>'op';p public.wf_incentive_programs%rowtype;q public.wf_reward_policies%rowtype;r public.wf_incentive_participants%rowtype;x public.wf_reward_requests%rowtype;
 t text;i text;n bigint;cost bigint;available bigint;e security.wf_reward_eligibility%rowtype;usr public.users%rowtype;k uuid;
begin
 actor:=security.pro_actor();
 if op='eligibility' then
 if (input->>'bornOn')::date>current_date or (input->>'bornOn')::date<date '1900-01-01' or input->>'country'<>'US' then raise exception 'US eligibility details required';end if;
 insert into security.wf_reward_eligibility(user_id,country,born_on) values(actor,'US',(input->>'bornOn')::date) on conflict(user_id) do update set country='US',born_on=excluded.born_on,recorded_at=now();
 return jsonb_build_object('ok',true);
 end if;
 if op='account' then
 t:=input->>'ownerType';i:=input->>'ownerId';
 if t not in ('institution','employer') or not security.pro_owner_access(t,i) then raise exception 'Reward scope denied' using errcode='42501';end if;
 insert into security.wf_reward_accounts(owner_type,owner_id) values(t,i) on conflict do nothing;
 return jsonb_build_object('ownerType',t,'ownerId',i,'actor',auth.uid());
 end if;
 if op in ('approve','reject','cancel','retry') then
 select * into x from public.wf_reward_requests where id=(input->>'requestId')::uuid;
 select * into r from public.wf_incentive_participants where id=x.participant_id;
 else select * into r from public.wf_incentive_participants where id=(input->>'participantId')::uuid;end if;
 select * into p from public.wf_incentive_programs where id=coalesce(r.program_id,(input->>'programId')::uuid);
 if not found then raise exception 'Reward program unavailable';end if;
 t:=p.owner_type;i:=p.owner_id;
 -- Consistent account -> program -> request locking, including retry/approval.
 perform 1 from security.wf_reward_accounts where owner_type=t and owner_id=i for update;
 select * into p from public.wf_incentive_programs where id=p.id for update;
 select * into q from public.wf_reward_policies where program_id=p.id;
 if op='policy' then
 if not security.pro_owner_access(t,i) or t not in ('institution','employer') then raise exception 'Reward scope denied' using errcode='42501';end if;
 if p.status<>'draft' then raise exception 'Reward policy is fixed at activation';end if;
 insert into public.wf_reward_policies(program_id,cents_per_block,credits_per_block,minimum_credits,approval,product_id)
 values(p.id,(input->>'centsPerBlock')::integer,(input->>'creditsPerBlock')::integer,(input->>'minimumCredits')::integer,input->>'approval',input->>'productId')
 on conflict(program_id) do update set cents_per_block=excluded.cents_per_block,credits_per_block=excluded.credits_per_block,minimum_credits=excluded.minimum_credits,approval=excluded.approval,product_id=excluded.product_id;
 update public.wf_incentive_programs set terms=terms||E'\nReward policy: '||(input->>'creditsPerBlock')||' credits = '||(input->>'centsPerBlock')||' USD cents; minimum '||(input->>'minimumCredits')||'; approval '||(input->>'approval')||'. Funded credits are limited by available program budget. Points still accrue when budget is exhausted. US adult redemption only; credits have no automatic expiry. Provider reward terms apply.',terms_version=terms_version+1 where id=p.id;
 elsif op='allocate' then
 if not security.pro_owner_access(t,i) then raise exception 'Reward scope denied' using errcode='42501';end if;
 if q.program_id is null or p.status not in ('draft','active') then raise exception 'Configure a draft reward policy first';end if;
 n:=(input->>'cents')::bigint;if n<=0 or n>100000000 then raise exception 'Invalid budget amount';end if;
 select a.balance_cents-coalesce((select sum(pol.allocated_cents-coalesce((select sum(req.cents) from public.wf_reward_requests req join public.wf_incentive_participants rr on rr.id=req.participant_id where rr.program_id=prog.id and req.status='issued'),0)) from public.wf_reward_policies pol join public.wf_incentive_programs prog on prog.id=pol.program_id where prog.owner_type=t and prog.owner_id=i),0) into available
 from security.wf_reward_accounts a where a.owner_type=t and a.owner_id=i and a.sealed_tokens is not null and a.balance_at>now()-interval '2 minutes';
 if exists(select 1 from security.wf_reward_accounts where owner_type=t and owner_id=i and leased_until>now()) then raise exception 'Account operation in progress';end if;
 if available is null or available<n then raise exception 'Refresh confirmed funding; available balance is insufficient';end if;
 update public.wf_reward_policies set allocated_cents=allocated_cents+n where program_id=p.id;
 elsif op='release_budget' then
 if not security.pro_owner_access(t,i) or p.status not in ('ended','cancelled') then raise exception 'End or cancel program before releasing unallocated budget';end if;
 update public.wf_reward_policies set allocated_cents=security.reward_liability(p.id) where program_id=p.id;
 elsif op='award' then
 if not security.pro_owner_access(t,i) or p.status<>'ended' or p.template not in ('competition','combined') or r.status<>'active' then raise exception 'Finalized cycle and accepted participant required';end if;
 n:=(input->>'credits')::integer;if n<=0 or n>1000000 or length(btrim(input->>'reason')) not between 1 and 1000 then raise exception 'Valid award and reason required';end if;
 k:=(input->>'requestKey')::uuid;
 if exists(select 1 from public.wf_reward_credits where source_key='winner:'||k) then
 if not exists(select 1 from public.wf_reward_credits where source_key='winner:'||k and participant_id=r.id and credits=n and reason=input->>'reason') then raise exception 'Award retry conflicts';end if;
 return jsonb_build_object('ok',true);end if;
 cost:=ceil((greatest(0,security.reward_credit_balance(r.id))+n)::numeric*q.cents_per_block/q.credits_per_block)-ceil(greatest(0,security.reward_credit_balance(r.id))::numeric*q.cents_per_block/q.credits_per_block);
 if q.program_id is null or security.reward_liability(p.id)+cost>q.allocated_cents then raise exception 'Program budget insufficient';end if;
 insert into public.wf_reward_credits(participant_id,credits,source_key,reason) values(r.id,n,'winner:'||k,input->>'reason');
 elsif op='redeem' then
 if r.user_id is distinct from actor or r.status<>'active' or r.accepted_version is distinct from p.terms_version or q.program_id is null then raise exception 'Accepted reward participation required' using errcode='42501';end if;
 select * into e from security.wf_reward_eligibility where user_id=actor;
 if e.user_id is null or e.country<>'US' or e.born_on>current_date-interval '18 years' then raise exception 'Redemption requires eligible US adult; points remain available';end if;
 n:=(input->>'credits')::integer;k:=(input->>'requestKey')::uuid;
 select * into x from public.wf_reward_requests where request_key=k;
 if found then
 if x.requested_by<>actor or x.participant_id<>r.id or x.credits<>n then raise exception 'Redemption retry conflicts';end if;
 return jsonb_build_object('ok',true,'id',x.id,'status',x.status);end if;
 if n<q.minimum_credits or n>security.reward_credit_balance(r.id) or (n*q.cents_per_block)%q.credits_per_block<>0 then raise exception 'Minimum, available credits and whole-cent conversion required';end if;
 cost:=n*q.cents_per_block/q.credits_per_block;
 select * into usr from public.users where user_id=actor;
 if usr.email is null then raise exception 'Recipient email required';end if;
 insert into public.wf_reward_requests(participant_id,request_key,credits,cents,product_id,status,recipient_email,recipient_name,requested_by)
 values(r.id,k,n,cost,q.product_id,case when q.approval='automatic' then 'approved' else 'pending' end,usr.email,concat_ws(' ',usr.first_name,usr.last_name),actor) returning * into x;
 insert into public.wf_reward_credits(participant_id,credits,source_key,reason) values(r.id,-n,'request:'||x.id,'Reserved for reward request');
 elsif op in ('approve','reject','cancel','retry') then
 select * into x from public.wf_reward_requests where id=x.id for update;
 if op='cancel' then
 if x.requested_by<>actor and not security.pro_owner_access(t,i) then raise exception 'Reward scope denied' using errcode='42501';end if;
 else if not security.pro_owner_access(t,i) then raise exception 'Reward scope denied' using errcode='42501';end if;end if;
 if op='approve' then
 if x.status<>'pending' or x.requested_by=actor then raise exception 'Pending request and different approver required';end if;
 update public.wf_reward_requests set status='approved',reviewed_by=actor,updated_at=now() where id=x.id;
 elsif op='retry' then
 if x.status not in ('approved','processing','reconciliation_required','provider_pending') then raise exception 'Request cannot be retried';end if;
 else
 if x.status not in ('pending','approved') then raise exception 'Provider-submitted requests require reconciliation';end if;
 update public.wf_reward_requests set status=case when op='reject' then 'rejected' else 'cancelled' end,reviewed_by=actor,updated_at=now() where id=x.id;
 insert into public.wf_reward_credits(participant_id,credits,source_key,reason) values(r.id,x.credits,'release:'||x.id,'Unsubmitted request released') on conflict do nothing;
 end if;
 else raise exception 'Unsupported reward action';end if;
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event,target) values(actor,t,i,upper(op),coalesce(x.id::text,p.id::text));
 return jsonb_build_object('ok',true,'id',x.id,'status',(select status from public.wf_reward_requests where id=x.id),'ownerType',t,'ownerId',i);
end $$;
create function security.reward_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor text;begin actor:=security.pro_actor();return jsonb_build_object(
 'accounts',coalesce((select jsonb_agg(jsonb_build_object('ownerType',a.owner_type,'ownerId',a.owner_id,'connected',a.sealed_tokens is not null,'balanceCents',a.balance_cents,'balanceAt',a.balance_at)) from security.wf_reward_accounts a where security.pro_owner_access(a.owner_type,a.owner_id)),'[]'),
 'policies',coalesce((select jsonb_agg(jsonb_build_object('programId',q.program_id,'centsPerBlock',q.cents_per_block,'creditsPerBlock',q.credits_per_block,'minimumCredits',q.minimum_credits,'approval',q.approval,'productId',q.product_id,'allocatedCents',q.allocated_cents,'liabilityCents',security.reward_liability(q.program_id))) from public.wf_reward_policies q join public.wf_incentive_programs p on p.id=q.program_id where security.pro_owner_access(p.owner_type,p.owner_id) or exists(select 1 from public.wf_incentive_participants r where r.program_id=p.id and r.user_id=actor and r.status='active')),'[]'),
 'credits',coalesce((select jsonb_agg(jsonb_build_object('participantId',r.id,'programId',r.program_id,'credits',security.reward_credit_balance(r.id))) from public.wf_incentive_participants r where r.user_id=actor and r.status='active'),'[]'),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'programId',p.id,'participantId',r.id,'credits',x.credits,'cents',x.cents,'status',x.status,'providerStatus',x.provider_status,'deliveryStatus',x.delivery_status,'own',x.requested_by=actor)) from (select req.* from public.wf_reward_requests req join public.wf_incentive_participants part on part.id=req.participant_id join public.wf_incentive_programs prog on prog.id=part.program_id where req.requested_by=actor or security.pro_owner_access(prog.owner_type,prog.owner_id) order by req.created_at desc limit 500) x join public.wf_incentive_participants r on r.id=x.participant_id join public.wf_incentive_programs p on p.id=r.program_id where x.requested_by=actor or security.pro_owner_access(p.owner_type,p.owner_id)),'[]'),
 'eligible',exists(select 1 from security.wf_reward_eligibility where user_id=actor and born_on<=current_date-interval '18 years' and country='US'));
end $$;
create function public.reward_action(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.reward_action(p_input)$$;
create function public.reward_workspace() returns jsonb language sql security invoker set search_path='' as $$select security.reward_workspace()$$;
alter table security.wf_reward_accounts add column account_id uuid not null default gen_random_uuid() unique;
alter table security.wf_reward_webhooks add column processed_at timestamptz;
create function security.reward_service(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op text:=p_input->>'op';a security.wf_reward_accounts%rowtype;s security.wf_reward_oauth%rowtype;x public.wf_reward_requests%rowtype;r public.wf_incentive_participants%rowtype;p public.wf_incentive_programs%rowtype;vlease uuid;
begin
 if op='oauth_begin' then
 insert into security.wf_reward_oauth(state_hash,owner_type,owner_id,actor) values(p_input->>'stateHash',p_input->>'ownerType',p_input->>'ownerId',(p_input->>'actor')::uuid);
 return jsonb_build_object('ok',true);
 elsif op='oauth_consume' then
 select * into s from security.wf_reward_oauth where state_hash=p_input->>'stateHash' for update;
 if not found or s.actor<>(p_input->>'actor')::uuid or s.expires_at<=now() or s.consumed_at is not null then raise exception 'OAuth session unavailable';end if;
 update security.wf_reward_oauth set consumed_at=now() where state_hash=s.state_hash;
 return jsonb_build_object('ownerType',s.owner_type,'ownerId',s.owner_id);
 elsif op='connect' then
 select * into a from security.wf_reward_accounts where owner_type=p_input->>'ownerType' and owner_id=p_input->>'ownerId' for update;
 if not found then raise exception 'Reward account unavailable';end if;
 if a.organization_id is not null and a.organization_id<>p_input->>'organizationId' then raise exception 'Connected organization is immutable; explicit migration required';end if;
 update security.wf_reward_accounts set sealed_tokens=p_input->>'sealed',organization_id=p_input->>'organizationId',token_version=token_version+1,balance_at=null where owner_type=p_input->>'ownerType' and owner_id=p_input->>'ownerId' and (leased_until is null or leased_until<=now());
 if not found then raise exception 'Account busy';end if;
 elsif op='claim' or op='claim_issue' then
 if op='claim_issue' then
 select * into x from public.wf_reward_requests where id=(p_input->>'requestId')::uuid;
 select * into r from public.wf_incentive_participants where id=x.participant_id;
 select * into p from public.wf_incentive_programs where id=r.program_id;
 if not exists(select 1 from public.contractors where p.owner_type='employer' and contractor_id=p.owner_id and approval_status='approved' and account_status='active') and not exists(select 1 from public.wf_institutions where p.owner_type='institution' and institution_id=p.owner_id and active) then raise exception 'Active reward workspace required';end if;
 p_input:=p_input||jsonb_build_object('ownerType',p.owner_type,'ownerId',p.owner_id);
 end if;
 select * into a from security.wf_reward_accounts where owner_type=p_input->>'ownerType' and owner_id=p_input->>'ownerId' for update;
 if not found or a.sealed_tokens is null then raise exception 'Connect sandbox account first';end if;
 if a.leased_until>now() then raise exception 'Account operation in progress';end if;
 vlease:=gen_random_uuid();update security.wf_reward_accounts set lease=vlease,leased_until=now()+interval '90 seconds' where account_id=a.account_id;
 if op='claim_issue' then
 select * into x from public.wf_reward_requests where id=x.id for update;
 if x.status not in ('approved','processing','provider_pending','reconciliation_required','issued') then raise exception 'Request is not approved';end if;
 if not exists(select 1 from security.wf_reward_eligibility e join public.users u on u.user_id=e.user_id where e.user_id=x.requested_by and u.status='active' and e.country='US' and e.born_on<=current_date-interval '18 years') then raise exception 'Redemption eligibility changed';end if;
 update public.wf_reward_requests set status='processing',updated_at=now() where id=x.id and status<>'issued';
 end if;
 return jsonb_build_object('accountId',a.account_id,'ownerType',a.owner_type,'ownerId',a.owner_id,'sealed',a.sealed_tokens,'lease',vlease,'request',case when op='claim_issue' then jsonb_build_object('id',x.id,'cents',x.cents,'credits',x.credits,'productId',x.product_id,'email',x.recipient_email,'name',x.recipient_name,'providerOrderId',x.provider_order_id,'status',x.status) else null end);
 elsif op in ('token_save','balance','finish','release') then
 select * into a from security.wf_reward_accounts where account_id=(p_input->>'accountId')::uuid and lease=(p_input->>'lease')::uuid for update;
 if not found or a.leased_until<=now() then raise exception 'Account lease unavailable';end if;
 if op='token_save' then update security.wf_reward_accounts set sealed_tokens=p_input->>'sealed',token_version=token_version+1 where account_id=a.account_id;
 elsif op='balance' then
 if p_input->>'currency'<>'USD' or (p_input->>'cents')::bigint<0 then raise exception 'USD funding required';end if;
 update security.wf_reward_accounts set balance_cents=(p_input->>'cents')::bigint,balance_at=now(),lease=null,leased_until=null where account_id=a.account_id;
 elsif op='finish' then
 select * into x from public.wf_reward_requests where id=(p_input->>'requestId')::uuid for update;
 select * into r from public.wf_incentive_participants where id=x.participant_id;
 if not exists(select 1 from public.wf_incentive_programs where id=r.program_id and owner_type=a.owner_type and owner_id=a.owner_id) then raise exception 'Request account mismatch';end if;
 if x.status in ('processing','provider_pending','reconciliation_required','issued') then
 if p_input->>'status'='cancelled' then
 insert into public.wf_reward_credits(participant_id,credits,source_key,reason) values(x.participant_id,x.credits,'release:'||x.id,'Provider cancellation and full refund confirmed') on conflict do nothing;
 end if;
 update public.wf_reward_requests set status=case when x.status='issued' and p_input->>'status'='reconciliation_required' then 'issued' else p_input->>'status' end,provider_order_id=coalesce(p_input->>'orderId',provider_order_id),provider_reward_id=coalesce(p_input->>'rewardId',provider_reward_id),provider_status=p_input->>'providerStatus',delivery_status=p_input->>'deliveryStatus',updated_at=now() where id=x.id;
 end if;
 update security.wf_reward_accounts set balance_at=null,lease=null,leased_until=null where account_id=a.account_id;
 insert into public.wf_reward_audit(owner_type,owner_id,event,target) values(a.owner_type,a.owner_id,'PROVIDER_RECONCILED',x.id::text);
 else update security.wf_reward_accounts set lease=null,leased_until=null where account_id=a.account_id;end if;
 elsif op='webhook_account' then
 select * into a from security.wf_reward_accounts where account_id=(p_input->>'accountId')::uuid;
 if a.sealed_tokens is null then raise exception 'Account unavailable';end if;
 return jsonb_build_object('sealed',a.sealed_tokens,'ownerType',a.owner_type,'ownerId',a.owner_id);
 elsif op='webhook_record' then
 insert into security.wf_reward_webhooks(event_id,event,resource_id) values((p_input->>'eventId')::uuid,p_input->>'event',p_input->>'resourceId') on conflict do nothing;
 return jsonb_build_object('processed',exists(select 1 from security.wf_reward_webhooks where event_id=(p_input->>'eventId')::uuid and processed_at is not null),'requestId',(select id from public.wf_reward_requests where status in ('approved','processing','provider_pending','reconciliation_required','issued') and (provider_order_id=p_input->>'resourceId' or provider_reward_id=p_input->>'resourceId') and exists(select 1 from public.wf_incentive_participants part join public.wf_incentive_programs prog on prog.id=part.program_id join security.wf_reward_accounts ac on ac.owner_type=prog.owner_type and ac.owner_id=prog.owner_id where part.id=participant_id and ac.account_id=(p_input->>'accountId')::uuid)));
 elsif op='webhook_done' then update security.wf_reward_webhooks set processed_at=now() where event_id=(p_input->>'eventId')::uuid;
 else raise exception 'Unsupported service operation';end if;
 return jsonb_build_object('ok',true);
end $$;
-- A checked dispatch authority is issued using the current authenticated role, not client tenant fields.
create function public.reward_service(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.reward_service(p_input)$$;
create function security.reward_dispatch_authority(rid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor text;x public.wf_reward_requests%rowtype;p public.wf_incentive_programs%rowtype;begin
 actor:=security.pro_actor();select * into x from public.wf_reward_requests where id=rid;
 select prog.* into p from public.wf_incentive_programs prog join public.wf_incentive_participants r on r.program_id=prog.id where r.id=x.participant_id;
 if x.id is null or (x.requested_by<>actor and not security.pro_owner_access(p.owner_type,p.owner_id)) then raise exception 'Reward scope denied' using errcode='42501';end if;
 if x.status not in ('approved','processing','provider_pending','reconciliation_required') then raise exception 'Request is not approved';end if;
 return jsonb_build_object('requestId',x.id,'ownerType',p.owner_type,'ownerId',p.owner_id);
end $$;
create function public.reward_dispatch_authority(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select security.reward_dispatch_authority(p_id)$$;
-- Screening has no execution switch exposed to any user, admin or application RPC.
create function security.screening_member(e text,uid text) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.app_role_memberships m join public.users u using(user_id) where m.user_id=uid and m.scope_type in ('employer','contractor') and m.scope_id=e and m.status='active' and u.status='active' and m.role in ('employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only','employer_employee'))$$;
create function security.screening_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor text;employer text:=input->>'employerId';op text:=input->>'op';p public.wf_screening_permissions%rowtype;begin
 actor:=security.pro_actor();
 if not exists(select 1 from public.contractors where contractor_id=employer and approval_status='approved' and account_status='active') then raise exception 'Screening scope denied' using errcode='42501';end if;
 if op='permission' then
 if not security.pro_owner_access('employer',employer) or not security.screening_member(employer,input->>'userId') then raise exception 'Screening scope denied' using errcode='42501';end if;
 insert into public.wf_screening_permissions(employer_id,user_id,can_order,can_review,monthly_limit_cents,approval_above_cents)
 values(employer,input->>'userId',(input->>'canOrder')::boolean,(input->>'canReview')::boolean,(input->>'monthlyLimitCents')::integer,(input->>'approvalAboveCents')::integer)
 on conflict(employer_id,user_id) do update set can_order=excluded.can_order,can_review=excluded.can_review,monthly_limit_cents=excluded.monthly_limit_cents,approval_above_cents=excluded.approval_above_cents;
 elsif op='bundle' then
 if not security.screening_member(employer,actor) or (not security.pro_owner_access('employer',employer) and not exists(select 1 from public.wf_screening_permissions where employer_id=employer and user_id=actor and can_order)) then raise exception 'Screening scope denied' using errcode='42501';end if;
 if jsonb_typeof(input->'checks')<>'array' or exists(select 1 from jsonb_array_elements_text(input->'checks') c where length(c) not between 1 and 100) then raise exception 'Select valid check names';end if;
 insert into public.wf_screening_bundles(employer_id,name,checks,created_by) values(employer,btrim(input->>'name'),array(select distinct jsonb_array_elements_text(input->'checks')),actor);
 elsif op='order' then raise exception 'Employment-approved product and minor consent confirmation required';
 else raise exception 'Unsupported screening action';end if;
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event) values(actor,'employer',employer,'SCREENING_'||upper(op));
 return jsonb_build_object('ok',true);
end $$;
create function security.screening_workspace(employer text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor text;admin boolean;begin actor:=security.pro_actor();admin:=security.pro_owner_access('employer',employer);
 if not exists(select 1 from public.contractors where contractor_id=employer and approval_status='approved' and account_status='active') or not security.screening_member(employer,actor) or (not admin and not exists(select 1 from public.wf_screening_permissions where employer_id=employer and user_id=actor and (can_order or can_review))) then raise exception 'Screening scope denied' using errcode='42501';end if;
 return jsonb_build_object('enabled',false,'canManage',admin,'canOrder',exists(select 1 from public.wf_screening_permissions where employer_id=employer and user_id=actor and can_order),'permissions',coalesce((select jsonb_agg(to_jsonb(p)) from public.wf_screening_permissions p where p.employer_id=employer and (admin or p.user_id=actor)),'[]'),
 'members',case when admin then coalesce((select jsonb_agg(jsonb_build_object('userId',u.user_id,'name',concat_ws(' ',u.first_name,u.last_name))) from public.users u where security.screening_member(employer,u.user_id)),'[]') else '[]'::jsonb end,
 'bundles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'checks',checks)) from public.wf_screening_bundles where employer_id=employer),'[]'),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'status',o.status,'audience',o.audience,'createdAt',o.created_at)) from public.wf_screening_orders o where o.employer_id=employer and (admin or o.ordered_by=actor or exists(select 1 from public.wf_screening_permissions where employer_id=employer and user_id=actor and can_review))),'[]'));
end $$;
create function public.screening_workspace(p_employer text) returns jsonb language sql security invoker set search_path='' as $$select security.screening_workspace(p_employer)$$;
create function public.screening_action(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.screening_action(p_input)$$;
do $$declare f record;begin
for f in select p.oid::regprocedure name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='security' and p.proname in ('reward_service','reward_credit_balance','reward_liability','reward_score_credit','reward_action','reward_workspace','reward_dispatch_authority','screening_member','screening_action','screening_workspace')) or (n.nspname='public' and p.proname in ('reward_action','reward_workspace','reward_service','reward_dispatch_authority','screening_action','screening_workspace')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.name);end loop;end $$;
grant execute on function public.reward_service(jsonb),security.reward_service(jsonb) to service_role;
grant execute on function public.reward_action(jsonb),security.reward_action(jsonb),public.reward_workspace(),security.reward_workspace(),public.reward_dispatch_authority(uuid),security.reward_dispatch_authority(uuid),public.screening_action(jsonb),security.screening_action(jsonb),public.screening_workspace(text),security.screening_workspace(text) to authenticated;
-- Independent controls; approval never raises the hard budget. UTC storage, Chicago calendar months.
create function security.screening_budget_decision(quoted bigint,used bigint,ceiling bigint,threshold bigint) returns jsonb language plpgsql immutable set search_path='' as $$
begin if quoted<=0 or least(used,ceiling,threshold)<0 then raise exception 'Invalid screening budget';end if;
return jsonb_build_object('withinLimit',quoted+used<=ceiling,'requiresApproval',quoted>threshold);end $$;
revoke all on function security.screening_budget_decision(bigint,bigint,bigint,bigint) from public,anon,authenticated,service_role;
-- Dormant reservation primitive. No application role can call it, and the public order
-- action remains unconditionally blocked until provider/product/consent verification.
alter table public.wf_screening_orders add column request_key uuid unique;
create function security.screening_reserve(employer text,actor text,subject text,audience text,checks text[],quote_cents integer,retry_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare perm public.wf_screening_permissions%rowtype;prior public.wf_screening_orders%rowtype;month_start date;used bigint;rid uuid;
begin
 select * into perm from public.wf_screening_permissions where employer_id=employer and user_id=actor for update;
 if not found or not perm.can_order or not security.screening_member(employer,actor) then raise exception 'Screening ordering permission required' using errcode='42501';end if;
 if not exists(select 1 from public.contractors where contractor_id=employer and approval_status='approved' and account_status='active') then raise exception 'Active approved employer required';end if;
 if retry_key is null or quote_cents is null or quote_cents<=0 or cardinality(checks) not between 1 and 15 or audience not in ('applicant','employee') then raise exception 'Valid verified quote required';end if;
 select * into prior from public.wf_screening_orders where request_key=retry_key;
 if found then
 if prior.employer_id<>employer or prior.ordered_by<>actor or prior.subject_user_id<>subject or prior.audience<>audience or prior.checks<>checks or prior.quoted_cents<>quote_cents then raise exception 'Screening retry conflicts';end if;
 return prior.id;end if;
 month_start:=date_trunc('month',now() at time zone 'America/Chicago')::date;
 select coalesce(sum(quoted_cents),0) into used from public.wf_screening_orders where employer_id=employer and ordered_by=actor and reserved_month=month_start and status<>'cancelled';
 if used+quote_cents>perm.monthly_limit_cents then raise exception 'Monthly screening limit exceeded';end if;
 insert into public.wf_screening_orders(employer_id,ordered_by,subject_user_id,audience,checks,quoted_cents,status,reserved_month,request_key)
 values(employer,actor,subject,audience,checks,quote_cents,case when quote_cents>perm.approval_above_cents then 'pending_approval' else 'reserved' end,month_start,retry_key) returning id into rid;
 return rid;
end $$;
revoke all on function security.screening_reserve(text,text,text,text,text[],integer,uuid) from public,anon,authenticated,service_role;
create index wf_reward_requests_requested_by on public.wf_reward_requests(requested_by);
create index wf_reward_requests_reviewed_by on public.wf_reward_requests(reviewed_by);
create index wf_screening_permissions_user on public.wf_screening_permissions(user_id);
create index wf_screening_bundles_creator on public.wf_screening_bundles(created_by);
create index wf_screening_orders_orderer on public.wf_screening_orders(ordered_by);
create index wf_screening_orders_subject on public.wf_screening_orders(subject_user_id);
