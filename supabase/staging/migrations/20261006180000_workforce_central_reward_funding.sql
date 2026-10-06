-- Central TXKPRO sandbox sponsorship. Customer collections and provider backing are distinct.
-- No expiration column/job exists for funding or awarded credits.
alter table security.wf_reward_accounts drop constraint wf_reward_accounts_owner_type_check;
alter table security.wf_reward_accounts add constraint wf_reward_accounts_owner_type_check check(owner_type in ('platform','institution','employer'));
alter table security.wf_reward_accounts drop constraint wf_reward_accounts_organization_id_key;
alter table security.wf_reward_accounts add column account_mode text not null default 'legacy' check(account_mode in ('legacy','central'));
alter table security.wf_reward_accounts add column setup_at timestamptz;
alter table security.wf_reward_accounts add column setup_by text references public.users(user_id);
alter table security.wf_reward_accounts add column terms_version integer;
alter table security.wf_reward_accounts add column backed_cents bigint not null default 0 check(backed_cents>=0);
alter table security.wf_reward_accounts add column frozen boolean not null default false;
insert into security.wf_reward_accounts(owner_type,owner_id,account_mode) values('platform','txkpro','central');
create table security.wf_reward_funding (
 id uuid primary key default gen_random_uuid(), request_key uuid not null unique,
 owner_type text not null,owner_id text not null,created_by text not null references public.users(user_id),
 principal_cents bigint not null check(principal_cents between 100 and 10000000),
 platform_fee_cents bigint not null check(platform_fee_cents>=0), third_party_fee_cents bigint not null check(third_party_fee_cents>=0),
 total_cents bigint not null, method text not null check(method in ('card','ach','platform')),
 pricing_version text not null check(length(pricing_version) between 1 and 100),
 status text not null default 'quoted' check(status in ('quoted','pending','paid','backed','failed','expired','hold')),
 stripe_session_id text unique,stripe_payment_id text unique,provider_invoice_id text unique,provider_topup_id text unique,provider_funding_source text,
 invoice_attempted_at timestamptz,paid_at timestamptz,backed_at timestamptz,created_at timestamptz not null default now(),
 foreign key(owner_type,owner_id) references security.wf_reward_accounts(owner_type,owner_id),
 check(total_cents=principal_cents+platform_fee_cents+third_party_fee_cents),
 check(platform_fee_cents=case when method='platform' then 0 else greatest(500,ceil(principal_cents::numeric/10)) end),
 check((method='platform')=(owner_type='platform'))
);
create index wf_reward_funding_owner on security.wf_reward_funding(owner_type,owner_id,created_at);
create index wf_reward_funding_creator on security.wf_reward_funding(created_by);
create index wf_reward_accounts_setup_by on security.wf_reward_accounts(setup_by);
create table security.wf_reward_payment_events(event_id text primary key,kind text not null,funding_id uuid references security.wf_reward_funding(id),created_at timestamptz not null default now());
create index wf_reward_payment_events_funding on security.wf_reward_payment_events(funding_id);
alter table security.wf_reward_funding enable row level security;
alter table security.wf_reward_payment_events enable row level security;
revoke all on security.wf_reward_funding,security.wf_reward_payment_events from public,anon,authenticated,service_role;
create function security.reward_outstanding() returns bigint language sql stable security definer set search_path='' as $$
 select coalesce(sum(q.allocated_cents-coalesce((select sum(x.cents) from public.wf_reward_requests x join public.wf_incentive_participants r on r.id=x.participant_id where r.program_id=p.id and x.status='issued'),0)),0)
 from public.wf_reward_policies q join public.wf_incentive_programs p on p.id=q.program_id join security.wf_reward_accounts a on a.owner_type=p.owner_type and a.owner_id=p.owner_id where a.account_mode='central' $$;
alter table public.wf_reward_policies add column winner_rank integer check(winner_rank between 1 and 100);
alter table public.wf_reward_policies add column winner_credits integer check(winner_credits between 1 and 1000000);
alter table public.wf_reward_policies add column winners_finalized_at timestamptz;
alter table public.wf_reward_policies add constraint wf_reward_winner_rule_pair check((winner_rank is null)=(winner_credits is null));
create or replace function security.reward_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor text;op text:=input->>'op';p public.wf_incentive_programs%rowtype;q public.wf_reward_policies%rowtype;r public.wf_incentive_participants%rowtype;x public.wf_reward_requests%rowtype;
 t text;i text;n bigint;cost bigint;available bigint;e security.wf_reward_eligibility%rowtype;usr public.users%rowtype;k uuid;winner record;
begin
 actor:=security.pro_actor();
 perform 1 from security.wf_reward_accounts where owner_type='platform' and owner_id='txkpro' for update;
 if op='eligibility' then
 if (input->>'bornOn')::date>current_date or (input->>'bornOn')::date<date '1900-01-01' or input->>'country'<>'US' then raise exception 'US eligibility details required';end if;
 insert into security.wf_reward_eligibility(user_id,country,born_on) values(actor,'US',(input->>'bornOn')::date) on conflict(user_id) do update set country='US',born_on=excluded.born_on,recorded_at=now();
 return jsonb_build_object('ok',true);
 end if;
 if op='account' then
 t:=input->>'ownerType';i:=input->>'ownerId';
 if t not in ('platform','institution','employer') or not security.pro_owner_access(t,i) then raise exception 'Reward scope denied' using errcode='42501';end if;
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
 if not security.pro_owner_access(t,i) or t not in ('platform','institution','employer') then raise exception 'Reward scope denied' using errcode='42501';end if;
 if p.status<>'draft' then raise exception 'Reward policy is fixed at activation';end if;
 insert into public.wf_reward_policies(program_id,cents_per_block,credits_per_block,minimum_credits,approval,product_id)
 values(p.id,(input->>'centsPerBlock')::integer,(input->>'creditsPerBlock')::integer,(input->>'minimumCredits')::integer,input->>'approval',input->>'productId')
 on conflict(program_id) do update set cents_per_block=excluded.cents_per_block,credits_per_block=excluded.credits_per_block,minimum_credits=excluded.minimum_credits,approval=excluded.approval,product_id=excluded.product_id;
 if p.template in ('competition','combined') then
 if input->>'winnerRank' is null or input->>'winnerCredits' is null then raise exception 'Winner rank and prize credits required';end if;
 update public.wf_reward_policies set winner_rank=(input->>'winnerRank')::integer,winner_credits=(input->>'winnerCredits')::integer where program_id=p.id;
 end if;
 update public.wf_incentive_programs set terms=terms||E'
Reward policy: '||(input->>'creditsPerBlock')||' credits = '||(input->>'centsPerBlock')||' USD cents; minimum '||(input->>'minimumCredits')||'; approval '||(input->>'approval')||case when p.template in ('competition','combined') then '; top ranks through '||(input->>'winnerRank')||' with positive scores receive '||(input->>'winnerCredits')||' credits each. Tied scores share rank and each tied winner receives the full prize, subject to full budget coverage before finalization' else '' end||'. Funded credits are limited by available program budget. Points still accrue when budget is exhausted. US adult redemption only; credits have no automatic expiry. Provider reward terms apply.',terms_version=terms_version+1 where id=p.id;
 elsif op='allocate' then
 if not security.pro_owner_access(t,i) then raise exception 'Reward scope denied' using errcode='42501';end if;
 if q.program_id is null or p.status not in ('draft','active','ended') then raise exception 'Configure a draft reward policy first';end if;
 n:=(input->>'cents')::bigint;if n<=0 or n>100000000 then raise exception 'Invalid budget amount';end if;
 select a.backed_cents-coalesce((select sum(pol.allocated_cents) from public.wf_reward_policies pol join public.wf_incentive_programs prog on prog.id=pol.program_id where prog.owner_type=t and prog.owner_id=i),0) into available
 from security.wf_reward_accounts a where a.owner_type=t and a.owner_id=i and a.account_mode='central' and a.setup_at is not null and not a.frozen;
 if exists(select 1 from security.wf_reward_accounts where leased_until>now()) then raise exception 'Account operation in progress';end if;
 if available is null or available<n then raise exception 'Confirmed sponsor funding is insufficient';end if;
 if not exists(select 1 from security.wf_reward_accounts a where a.owner_type='platform' and a.owner_id='txkpro' and a.balance_at>now()-interval '2 minutes' and a.balance_cents>=n+security.reward_outstanding()) then raise exception 'Refresh confirmed provider funding first';end if;
 update public.wf_reward_policies set allocated_cents=allocated_cents+n where program_id=p.id;
 elsif op='release_budget' then
 if not security.pro_owner_access(t,i) or p.status not in ('ended','cancelled') then raise exception 'End or cancel program before releasing unallocated budget';end if;
 update public.wf_reward_policies set allocated_cents=security.reward_liability(p.id) where program_id=p.id;
 elsif op='finalize_winners' then
 if not security.pro_owner_access(t,i) or p.status<>'ended' or p.template not in ('competition','combined') or q.winner_rank is null then raise exception 'Ended cycle and disclosed winner rules required';end if;
 if q.winners_finalized_at is not null then return jsonb_build_object('ok',true);end if;
 -- One transaction awards every tied winner in the snapshot, or none when the budget is insufficient.
 for winner in
 select * from (select part.id,coalesce(sum(score.points),0) score,rank() over(order by coalesce(sum(score.points),0) desc) rank
 from public.wf_incentive_participants part left join public.wf_incentive_score_ledger score on score.participant_id=part.id
 where part.program_id=p.id and part.status='active' group by part.id) ranked where ranked.rank<=q.winner_rank and ranked.score>0
 loop
 cost:=ceil((greatest(0,security.reward_credit_balance(winner.id))+q.winner_credits)::numeric*q.cents_per_block/q.credits_per_block)-ceil(greatest(0,security.reward_credit_balance(winner.id))::numeric*q.cents_per_block/q.credits_per_block);
 if security.reward_liability(p.id)+cost>q.allocated_cents then raise exception 'Program budget insufficient';end if;
 insert into public.wf_reward_credits(participant_id,credits,source_key,reason) values(winner.id,q.winner_credits,'final-winner:'||p.id||':'||winner.id,'Final positive-score rank '||winner.rank||'; tied winners receive full prize');
 end loop;
 update public.wf_reward_policies set winners_finalized_at=now() where program_id=p.id;
 elsif op='award' then
 if q.winner_rank is not null then raise exception 'Use disclosed winner finalization';end if;
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
 if exists(select 1 from security.wf_reward_accounts where owner_type=t and owner_id=i and frozen) then raise exception 'Sponsor funding is on hold; credits are retained';end if;
 if r.user_id is distinct from actor or r.status not in ('active','cancelled') or r.accepted_version is distinct from p.terms_version or q.program_id is null then raise exception 'Accepted reward participation required' using errcode='42501';end if;
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
create or replace function security.reward_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor text;begin actor:=security.pro_actor();return jsonb_build_object(
 'accounts',coalesce((select jsonb_agg(jsonb_build_object('ownerType',a.owner_type,'ownerId',a.owner_id,'connected',a.sealed_tokens is not null,'balanceCents',a.backed_cents,'balanceAt',a.balance_at,'setup',a.setup_at is not null,'frozen',a.frozen,'availableCents',greatest(0,a.backed_cents-coalesce((select sum(q.allocated_cents) from public.wf_reward_policies q join public.wf_incentive_programs p on p.id=q.program_id where p.owner_type=a.owner_type and p.owner_id=a.owner_id),0)))) from security.wf_reward_accounts a where security.pro_owner_access(a.owner_type,a.owner_id)),'[]'),
 'policies',coalesce((select jsonb_agg(jsonb_build_object('programId',q.program_id,'centsPerBlock',q.cents_per_block,'creditsPerBlock',q.credits_per_block,'minimumCredits',q.minimum_credits,'approval',q.approval,'productId',q.product_id,'allocatedCents',q.allocated_cents,'liabilityCents',security.reward_liability(q.program_id),'winnerRank',q.winner_rank,'winnerCredits',q.winner_credits,'winnersFinalized',q.winners_finalized_at is not null)) from public.wf_reward_policies q join public.wf_incentive_programs p on p.id=q.program_id where security.pro_owner_access(p.owner_type,p.owner_id) or exists(select 1 from public.wf_incentive_participants r where r.program_id=p.id and r.user_id=actor and r.status in ('active','cancelled') and r.accepted_version is not null)),'[]'),
 'credits',coalesce((select jsonb_agg(jsonb_build_object('participantId',r.id,'programId',r.program_id,'credits',security.reward_credit_balance(r.id))) from public.wf_incentive_participants r where r.user_id=actor and r.status in ('active','cancelled') and r.accepted_version is not null),'[]'),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'programId',p.id,'participantId',r.id,'credits',x.credits,'cents',x.cents,'status',x.status,'providerStatus',x.provider_status,'deliveryStatus',x.delivery_status,'own',x.requested_by=actor)) from (select req.* from public.wf_reward_requests req join public.wf_incentive_participants part on part.id=req.participant_id join public.wf_incentive_programs prog on prog.id=part.program_id where req.requested_by=actor or security.pro_owner_access(prog.owner_type,prog.owner_id) order by req.created_at desc limit 500) x join public.wf_incentive_participants r on r.id=x.participant_id join public.wf_incentive_programs p on p.id=r.program_id where x.requested_by=actor or security.pro_owner_access(p.owner_type,p.owner_id)),'[]'),
 'canFinance',security.is_admin(),
 'funding',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'ownerType',f.owner_type,'ownerId',f.owner_id,'principalCents',f.principal_cents,'platformFeeCents',f.platform_fee_cents,'thirdPartyFeeCents',f.third_party_fee_cents,'totalCents',f.total_cents,'method',f.method,'status',f.status,'createdAt',f.created_at,'invoicePending',f.invoice_attempted_at is not null and f.provider_invoice_id is null)) from (select * from security.wf_reward_funding where security.pro_owner_access(owner_type,owner_id) or security.is_admin() order by created_at desc limit 200) f),'[]'),
 'eligible',exists(select 1 from security.wf_reward_eligibility where user_id=actor and born_on<=current_date-interval '18 years' and country='US'));
end $$;

alter function security.reward_service(jsonb) rename to reward_service_legacy;
revoke all on function security.reward_service_legacy(jsonb) from public,anon,authenticated,service_role;
create or replace function security.reward_service_legacy(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if not exists(select 1 from public.contractors where p.owner_type='employer' and contractor_id=p.owner_id and approval_status='approved' and account_status='active') and not exists(select 1 from public.wf_institutions where p.owner_type='institution' and institution_id=p.owner_id and active) and not (p.owner_type='platform' and p.owner_id='txkpro') then raise exception 'Active reward workspace required';end if;
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

create function security.reward_service(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op text:=p_input->>'op';a security.wf_reward_accounts%rowtype;c security.wf_reward_accounts%rowtype;res jsonb;begin
 select * into c from security.wf_reward_accounts where owner_type='platform' and owner_id='txkpro' for update;
 if op in ('oauth_begin','oauth_consume','connect') then raise exception 'Customer OAuth is retired';end if;
 if op='claim_issue' and exists(select 1 from public.wf_reward_requests x join public.wf_incentive_participants r on r.id=x.participant_id join public.wf_incentive_programs p on p.id=r.program_id join security.wf_reward_accounts ac on ac.owner_type=p.owner_type and ac.owner_id=p.owner_id where x.id=(p_input->>'requestId')::uuid and (ac.frozen or ac.account_mode<>'central')) then raise exception 'Sponsor funding is on hold';end if;
 if op in ('claim','claim_issue') then
 if c.leased_until>now() then raise exception 'Account operation in progress';end if;
 -- Legacy claim enforces current membership/eligibility, request state, and account lease.
 if op='claim_issue' then
 -- Platform is an active sponsor; legacy check only recognized customer workspaces.
 select ac.* into a from public.wf_reward_requests x join public.wf_incentive_participants r on r.id=x.participant_id join public.wf_incentive_programs p on p.id=r.program_id join security.wf_reward_accounts ac on ac.owner_type=p.owner_type and ac.owner_id=p.owner_id where x.id=(p_input->>'requestId')::uuid;
 end if;
 res:=security.reward_service_legacy(p_input);
 update security.wf_reward_accounts set lease=(res->>'lease')::uuid,leased_until=now()+interval '90 seconds' where account_id=c.account_id;
 return res;
 elsif op='balance' then
 res:=security.reward_service_legacy(p_input);
 update security.wf_reward_accounts set balance_cents=(p_input->>'cents')::bigint,balance_at=now(),lease=null,leased_until=null where account_mode='central';return res;
 elsif op in ('release','finish') then
 res:=security.reward_service_legacy(p_input);
 update security.wf_reward_accounts set lease=null,leased_until=null,balance_at=case when op='finish' then null else balance_at end where account_id=c.account_id and lease=(p_input->>'lease')::uuid;
 return res;
 elsif op='webhook_record' then
 -- One central webhook routes only persisted order/reward IDs; metadata never authorizes a sponsor.
 insert into security.wf_reward_webhooks(event_id,event,resource_id) values((p_input->>'eventId')::uuid,p_input->>'event',p_input->>'resourceId') on conflict do nothing;
 return jsonb_build_object('processed',exists(select 1 from security.wf_reward_webhooks where event_id=(p_input->>'eventId')::uuid and processed_at is not null),'requestId',(select x.id from public.wf_reward_requests x join public.wf_incentive_participants r on r.id=x.participant_id join public.wf_incentive_programs p on p.id=r.program_id join security.wf_reward_accounts ac on ac.owner_type=p.owner_type and ac.owner_id=p.owner_id where ac.account_mode='central' and (x.provider_order_id=p_input->>'resourceId' or x.provider_reward_id=p_input->>'resourceId')));
 end if;
 return security.reward_service_legacy(p_input);
end $$;
-- Rebind public wrapper: renaming preserves dependency OIDs.
create or replace function public.reward_service(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.reward_service(p_input)$$;

create function security.reward_funding_authority(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor text;t text:=input->>'ownerType';i text:=input->>'ownerId';f security.wf_reward_funding%rowtype;begin
 actor:=security.pro_actor();
 if input->>'fundingId' is not null then
 select * into f from security.wf_reward_funding where id=(input->>'fundingId')::uuid;
 if f.id is null then raise exception 'Funding scope denied' using errcode='42501';end if;
 t:=f.owner_type;i:=f.owner_id;
 end if;
 if not security.pro_owner_access(t,i) and not (input->>'op'='finance' and security.is_admin()) then raise exception 'Funding scope denied' using errcode='42501';end if;
 if input->>'op'='finance' and not security.is_admin() then raise exception 'Platform finance permission required' using errcode='42501';end if;
 if t not in ('platform','employer','institution') then raise exception 'Funding scope denied' using errcode='42501';end if;
 if input->>'op'='setup' then
 if input->>'acceptTerms' is distinct from 'true' then raise exception 'Accept funding terms first';end if;
 insert into security.wf_reward_accounts(owner_type,owner_id,account_mode,setup_at,setup_by,terms_version) values(t,i,'central',now(),actor,1)
 on conflict(owner_type,owner_id) do update set account_mode='central',setup_at=coalesce(security.wf_reward_accounts.setup_at,now()),setup_by=coalesce(security.wf_reward_accounts.setup_by,actor),terms_version=1
 where security.wf_reward_accounts.sealed_tokens is null or security.wf_reward_accounts.account_mode='central';
 if not found then raise exception 'Legacy account requires explicit migration';end if;
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event) values(actor,t,i,'CENTRAL_FUNDING_TERMS_ACCEPTED');
 end if;
 return jsonb_build_object('ownerType',t,'ownerId',i,'actor',actor,'fundingId',f.id,'canFinance',security.is_admin());
end $$;
create function public.reward_funding_authority(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.reward_funding_authority(p_input)$$;

create function security.reward_funding_service(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op text:=input->>'op';f security.wf_reward_funding%rowtype;a security.wf_reward_accounts%rowtype;central security.wf_reward_accounts%rowtype;n bigint;begin
 select * into central from security.wf_reward_accounts where owner_type='platform' and owner_id='txkpro' for update;
 if op='setup' then
 update security.wf_reward_accounts set sealed_tokens=input->>'centralSealed',organization_id='TXKPRO' where account_id=central.account_id and sealed_tokens is null;
 update security.wf_reward_accounts set sealed_tokens=case when owner_type='platform' then coalesce(sealed_tokens,input->>'sealed') else input->>'sealed' end,organization_id='TXKPRO',balance_at=null where owner_type=input->>'ownerType' and owner_id=input->>'ownerId' and account_mode='central' and setup_at is not null;
 if not found then raise exception 'Accept funding terms first';end if;
 return jsonb_build_object('accountId',central.account_id,'hookSealed',central.sealed_tokens);
 elsif op='central_hook' then
 update security.wf_reward_accounts set sealed_tokens=input->>'sealed',organization_id='TXKPRO' where account_id=central.account_id;
 return jsonb_build_object('ok',true);
 elsif op='quote' then
 select * into a from security.wf_reward_accounts where owner_type=input->>'ownerType' and owner_id=input->>'ownerId' for update;
 if a.setup_at is null or a.account_mode<>'central' or a.frozen then raise exception 'Set up active sponsor funding first';end if;
 select * into f from security.wf_reward_funding where request_key=(input->>'requestKey')::uuid;
 if found then
 if f.owner_type<>a.owner_type or f.owner_id<>a.owner_id or f.created_by<>input->>'actor' or f.principal_cents<>(input->>'principalCents')::bigint or f.method<>input->>'method' then raise exception 'Funding retry conflicts';end if;
 return to_jsonb(f);end if;
 insert into security.wf_reward_funding(request_key,owner_type,owner_id,created_by,principal_cents,platform_fee_cents,third_party_fee_cents,total_cents,method,pricing_version,status,paid_at)
 values((input->>'requestKey')::uuid,a.owner_type,a.owner_id,input->>'actor',(input->>'principalCents')::bigint,(input->>'platformFeeCents')::bigint,(input->>'thirdPartyFeeCents')::bigint,(input->>'totalCents')::bigint,input->>'method',input->>'pricingVersion',case when a.owner_type='platform' then 'paid' else 'quoted' end,case when a.owner_type='platform' then now() else null end) returning * into f;
 elsif op='provider_lookup' then
 select * into f from security.wf_reward_funding where provider_topup_id=input->>'resourceId' or provider_invoice_id=input->>'resourceId';return to_jsonb(f);
 else
 select * into f from security.wf_reward_funding where id=(input->>'fundingId')::uuid for update;
 if not found then raise exception 'Funding unavailable';end if;
 select * into a from security.wf_reward_accounts where owner_type=f.owner_type and owner_id=f.owner_id for update;
 if op='read' then return to_jsonb(f)||jsonb_build_object('customer_email',(select email from public.users where user_id=f.created_by));end if;
 if op='session' then
 if f.status<>'quoted' or (f.stripe_session_id is not null and f.stripe_session_id<>input->>'sessionId') then raise exception 'Funding session state conflict';end if;
 update security.wf_reward_funding set stripe_session_id=input->>'sessionId',status='pending' where id=f.id;
 elsif op='payment_event' then
 -- Server verifies signature AND retrieves Stripe session. Never accept browser success or supplied prices.
 if f.stripe_session_id is distinct from input->>'sessionId' or (input->>'totalCents')::bigint is distinct from f.total_cents or input->>'currency'<>'usd' or (input->>'live')::boolean is distinct from false then raise exception 'Payment binding mismatch';end if;
 insert into security.wf_reward_payment_events(event_id,kind,funding_id) values(input->>'eventId',input->>'kind',f.id) on conflict do nothing;
 if not found then return to_jsonb(f);end if;
 if input->>'kind'='paid' and f.status in ('pending','failed','expired') then
 update security.wf_reward_funding set status='paid',stripe_payment_id=input->>'paymentId',paid_at=now() where id=f.id;
 elsif input->>'kind' in ('hold','refund','dispute') then
 -- Preserve all balances and freeze spending pending finance resolution. Never expire/forfeit awards.
 update security.wf_reward_funding set status='hold' where id=f.id;
 update security.wf_reward_accounts set frozen=true where owner_type=f.owner_type and owner_id=f.owner_id;
 elsif input->>'kind' in ('failed','expired') and f.status='pending' then update security.wf_reward_funding set status=input->>'kind' where id=f.id;end if;
 elsif op='topup_bind' then
 if f.status<>'paid' or f.invoice_attempted_at is not null or f.provider_invoice_id is not null or (f.provider_funding_source is not null and f.provider_funding_source<>input->>'sourceId') or (f.provider_topup_id is not null and f.provider_topup_id<>input->>'topupId') then raise exception 'Topup binding conflict';end if;
 update security.wf_reward_funding set provider_topup_id=coalesce(provider_topup_id,input->>'topupId'),provider_funding_source=coalesce(provider_funding_source,input->>'sourceId') where id=f.id;
 elsif op='provider_hold' then
 update security.wf_reward_funding set status='hold' where id=f.id;
 update security.wf_reward_accounts set frozen=true where owner_type=f.owner_type and owner_id=f.owner_id;
 elsif op='topup_back' then
 if f.status='backed' then return to_jsonb(f);end if;
 if f.status<>'paid' or f.provider_topup_id is distinct from input->>'topupId' or input->>'topupStatus'<>'fully_credited' or input->>'currency'<>'USD' or (input->>'cents')::bigint is distinct from f.principal_cents or a.frozen then raise exception 'Fully credited provider topup required';end if;
 if central.balance_at is null or central.balance_at<now()-interval '2 minutes' or central.balance_cents < f.principal_cents+(select coalesce(sum(backed_cents),0) from security.wf_reward_accounts where account_mode='central')-coalesce((select sum(cents) from public.wf_reward_requests where status='issued'),0) then raise exception 'Refresh confirmed provider funding first';end if;
 update security.wf_reward_accounts set backed_cents=backed_cents+f.principal_cents where owner_type=f.owner_type and owner_id=f.owner_id;
 update security.wf_reward_funding set status='backed',backed_at=now() where id=f.id;
 elsif op='invoice_claim' then
 if f.status<>'paid' or f.provider_topup_id is not null or f.provider_funding_source is not null or f.provider_invoice_id is not null or f.invoice_attempted_at is not null then raise exception 'Invoice already created or requires reconciliation';end if;
 update security.wf_reward_funding set invoice_attempted_at=now() where id=f.id;
 elsif op='invoice' then
 if f.status<>'paid' or f.invoice_attempted_at is null or (f.provider_invoice_id is not null and f.provider_invoice_id<>input->>'invoiceId') then raise exception 'Invoice binding conflict';end if;
 update security.wf_reward_funding set provider_invoice_id=input->>'invoiceId' where id=f.id;
 elsif op='back' then
 if f.status='backed' then return to_jsonb(f);end if;
 if f.status<>'paid' or f.provider_invoice_id is distinct from input->>'invoiceId' or input->>'invoiceStatus'<>'PAID' or input->>'currency'<>'USD' or (input->>'cents')::bigint is distinct from f.principal_cents or a.frozen then raise exception 'Paid provider invoice required';end if;
 if central.balance_at is null or central.balance_at<now()-interval '2 minutes' or central.balance_cents < f.principal_cents+(select coalesce(sum(backed_cents),0) from security.wf_reward_accounts where account_mode='central')-coalesce((select sum(cents) from public.wf_reward_requests where status='issued'),0) then raise exception 'Refresh confirmed provider funding first';end if;
 update security.wf_reward_accounts set backed_cents=backed_cents+f.principal_cents where owner_type=f.owner_type and owner_id=f.owner_id;
 update security.wf_reward_funding set status='backed',backed_at=now() where id=f.id;
 else raise exception 'Unsupported funding service action';end if;
 select * into f from security.wf_reward_funding where id=f.id;
 end if;
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event,target) values(input->>'actor',f.owner_type,f.owner_id,'FUNDING_'||upper(op),f.id::text);
 return to_jsonb(f);
end $$;
create function public.reward_funding_service(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.reward_funding_service(p_input)$$;
revoke all on function security.reward_outstanding(),security.reward_funding_authority(jsonb),public.reward_funding_authority(jsonb),security.reward_funding_service(jsonb),public.reward_funding_service(jsonb),security.reward_service(jsonb) from public,anon,authenticated,service_role;
grant execute on function security.reward_funding_authority(jsonb),public.reward_funding_authority(jsonb) to authenticated;
grant execute on function security.reward_funding_service(jsonb),public.reward_funding_service(jsonb),security.reward_service(jsonb) to service_role;

create or replace function security.pro_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if (p.owner_type='institution' and typ<>'student') or (p.owner_type='employer' and typ not in ('employee','sponsored_student')) or (p.owner_type='platform' and typ not in ('student','employee')) then raise exception 'Participation type unavailable'; end if;
 if p.owner_type='platform' and typ='employee' and not exists(select 1 from public.app_role_memberships m join public.contractors c on c.contractor_id=m.scope_id where m.user_id=recipient and m.role='employer_employee' and m.scope_type in ('employer','contractor') and m.status='active' and c.approval_status='approved' and c.account_status='active') then raise exception 'Active employee membership required';end if;
 if typ in ('student','sponsored_student') and not exists(select 1 from public.wf_student_profiles s where s.user_id=recipient and (p.owner_type<>'institution' or s.school_id=p.owner_id)) then raise exception 'Eligible Student affiliation required'; end if;
 insert into public.wf_incentive_participants(program_id,user_id,kind,invited_by,expires_at) values(p.id,recipient,typ,u,least(p.ends_at,now()+interval '14 days')) returning id into target;
 elsif op='cancel_participant' then
 update public.wf_incentive_participants set status='cancelled' where id=(input->>'participantId')::uuid and program_id=p.id and status in ('pending','active') returning id into target;
 if target is null then raise exception 'Participant transition unavailable'; end if;
 elsif op='create_activity' then
 if p.status<>'draft' then raise exception 'Activities are fixed at activation; create a new program for changed rules'; end if;
 if (p.owner_type='institution' and input->>'audience' not in ('all','student')) or (p.owner_type='employer' and input->>'audience' not in ('all','employee','sponsored_student')) or (p.owner_type='platform' and input->>'audience' not in ('all','student','employee')) then raise exception 'Invalid audience'; end if;
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

revoke all on function security.pro_action(jsonb) from public,anon;
grant execute on function security.pro_action(jsonb) to authenticated;
