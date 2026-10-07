-- Staging-only KYU/AuthCard. Private candidate data never reaches mock Authenticate.
create table security.wf_authcards (
 user_id text primary key references public.users(user_id), id uuid not null unique default gen_random_uuid(),
 status text not null default 'not_started' check(status in ('not_started','requires_input','processing','verified','cancelled','revoked')),
 payment_status text not null default 'unpaid' check(payment_status in ('unpaid','pending','paid','hold')),
 payment_session text unique, payment_attempt_at timestamptz, payment_lease_until timestamptz, payment_lease uuid,
 identity_session text unique, identity_attempt_at timestamptz, identity_lease_until timestamptz, identity_lease uuid,
 adult_verified boolean not null default false, details_encrypted text, display_name text,
 verified_at timestamptz, updated_at timestamptz not null default now()
);
create table security.wf_authcard_consent_policy (
 id text primary key, name text not null, body text not null, url text, version integer not null default 1 check(version>0), active boolean not null default true
);
insert into security.wf_authcard_consent_policy(id,name,body,url) values
 ('txkpro','TXKPRO','I authorize TXKPRO to administer this specific sandbox order and retain the authorization record.',null),
 ('authenticate','Authenticate (Authenticating.com LLC)','I have reviewed the background disclosure and authorize the checks listed for this order. Sandbox checks use only Authenticate mock identities.','https://cdn.authenticating.com/public/documents/Authorization%2Bto%2BObtain%2Ba%2BConsumer%2BReport%2BSample.pdf'),
 ('transaction','Transaction purpose','I authorize this transaction for the stated purpose. The data will not be used for credit, insurance, employment eligibility, or another FCRA purpose.',null);
create table security.wf_authcard_requests (
 id uuid primary key default gen_random_uuid(),order_id uuid not null unique references security.wf_auth_orders(id),
 purpose text not null check(purpose in ('fraud_prevention','unauthorized_transactions','claims_liability','institutional_risk','consumer_disputes')),
 description text not null default '' check(length(description)<=500), certified_at timestamptz not null default now(),
 share_status text not null default 'pending' check(share_status in ('pending','shared','declined','revoked')),
 shared_at timestamptz, revoked_at timestamptz
);
create table security.wf_authcard_authorizations (
 request_id uuid primary key references security.wf_authcard_requests(id),subject text not null references public.users(user_id),
 snapshot jsonb not null, accepted_ids jsonb not null, authorized_at timestamptz not null default now()
);
create index wf_authcard_authorizations_subject on security.wf_authcard_authorizations(subject);
do $$declare t text;begin foreach t in array array['wf_authcards','wf_authcard_consent_policy','wf_authcard_requests','wf_authcard_authorizations'] loop
 execute format('alter table security.%I enable row level security',t);execute format('revoke all on security.%I from public,anon,authenticated,service_role',t);end loop;end $$;
create function security.authcard_scope_name(t text,i text) returns text language sql stable security definer set search_path='' as $$
 select case when t='employer' then (select business_name from public.contractors where contractor_id=i) else (select name from public.wf_institutions where institution_id=i) end
$$;
create function security.authcard_snapshot(o security.wf_auth_orders) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('orderId',o.id,'ownerType',o.owner_type,'ownerId',o.owner_id,'subject',o.subject,'products',o.products,'totalCents',o.total_cents,'purpose',(select purpose from security.wf_authcard_requests where order_id=o.id),'description',(select description from security.wf_authcard_requests where order_id=o.id),'certifiedBy',o.actor,
 'parties',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'text',body,'url',url,'version',version) order by id) from security.wf_authcard_consent_policy where active),'[]'::jsonb)||jsonb_build_array(jsonb_build_object('id','workspace','name',security.authcard_scope_name(o.owner_type,o.owner_id),'text','I authorize this named workspace to receive my AuthCard platform status and order these checks. No private screening data is displayed on my card.','version',1)))
$$;
create function security.authcard_ready(o security.wf_auth_orders) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from security.wf_authcards c join security.wf_authcard_requests r on r.order_id=o.id join security.wf_authcard_authorizations a on a.request_id=r.id
 where c.user_id=o.subject and c.status='verified' and c.payment_status='paid' and c.adult_verified and c.details_encrypted is not null and r.share_status='shared'
 and a.subject=o.subject and a.snapshot=security.authcard_snapshot(o))
$$;
create function public.authcard_self(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a text:=security.pro_actor();op text:=p_input->>'op';r security.wf_authcard_requests%rowtype;o security.wf_auth_orders%rowtype;c security.wf_authcards%rowtype;s jsonb;begin
 if a is null or not exists(select 1 from public.users where user_id=a and status='active') then raise exception 'Active account required' using errcode='42501';end if;
 insert into security.wf_authcards(user_id) values(a) on conflict do nothing;
 select * into c from security.wf_authcards where user_id=a for update;
 if op in ('share','decline','revoke','authorize') then
 select x.* into r from security.wf_authcard_requests x join security.wf_auth_orders z on z.id=x.order_id where x.id=(p_input->>'requestId')::uuid and z.subject=a for update of x;
 if not found then raise exception 'AuthCard request denied' using errcode='42501';end if;
 select * into o from security.wf_auth_orders where id=r.order_id;
 if op='revoke' then update security.wf_authcard_requests set share_status='revoked',revoked_at=now() where id=r.id;
 elsif op='decline' and r.share_status='pending' then update security.wf_authcard_requests set share_status='declined' where id=r.id;
 elsif op='share' then
 if c.status<>'verified' or c.payment_status<>'paid' or not c.adult_verified or c.details_encrypted is null or r.share_status<>'pending' or not security.auth_subject(o.owner_type,o.owner_id,o.actor,a,o.audience) or not security.auth_allowed(o.owner_type,o.owner_id,o.actor,'order') or o.status='cancelled' then raise exception 'Verified AuthCard and active request required' using errcode='42501';end if;
 update security.wf_authcard_requests set share_status='shared',shared_at=now() where id=r.id;
 elsif op='authorize' then
 if r.share_status<>'shared' or c.status<>'verified' or c.payment_status<>'paid' or not c.adult_verified or c.details_encrypted is null or not security.auth_subject(o.owner_type,o.owner_id,o.actor,a,o.audience) or not security.auth_allowed(o.owner_type,o.owner_id,o.actor,'order') or o.status='cancelled' then raise exception 'Shared active AuthCard required' using errcode='42501';end if;
 s:=security.authcard_snapshot(o);
 if p_input->>'version' is distinct from s::text or jsonb_typeof(p_input->'accepted') is distinct from 'array' then raise exception 'Consent changed; review again';end if;
 if jsonb_array_length(p_input->'accepted')<>jsonb_array_length(s->'parties') or (select count(distinct value) from jsonb_array_elements_text(p_input->'accepted'))<>jsonb_array_length(s->'parties') or exists(select 1 from jsonb_array_elements(s->'parties') z where not (p_input->'accepted' ? (z->>'id'))) then raise exception 'All consent fields required';end if;
 insert into security.wf_authcard_authorizations(request_id,subject,snapshot,accepted_ids) values(r.id,a,s,p_input->'accepted') on conflict do nothing;
 if found and o.checkout_attempted_at is null then update security.wf_auth_orders set expires_at=now()+interval '30 minutes' where id=o.id;end if;
 if not security.authcard_ready(o) then raise exception 'Prior authorization differs; new order required';end if;
 else raise exception 'Request transition denied';end if;
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event,target) values(a,o.owner_type,o.owner_id,'AUTHCARD_'||upper(op),r.id::text);
 elsif op='deactivate' then
 update security.wf_authcards set status='revoked',adult_verified=false,updated_at=now() where user_id=a;
 update security.wf_authcard_requests set share_status='revoked',revoked_at=now() where order_id in (select id from security.wf_auth_orders where subject=a) and share_status='shared';
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event,target) values(a,'platform','txkpro','AUTHCARD_DEACTIVATED',c.id::text);
 elsif op<>'workspace' and op<>'actor' then raise exception 'Unsupported operation';end if;
 return jsonb_build_object('actor',a,'status',(select status from security.wf_authcards where user_id=a),'paid',c.payment_status='paid','ready',c.details_encrypted is not null,'name',c.display_name,
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',security.authcard_scope_name(z.owner_type,z.owner_id),'products',z.products,'totalCents',z.total_cents,'purpose',x.purpose,'description',x.description,'status',x.share_status,'consent',case when v.snapshot=security.authcard_snapshot(z) then 'authorized' when v.request_id is not null then 'changed' else 'pending' end,'parties',security.authcard_snapshot(z)->'parties','version',security.authcard_snapshot(z)::text) order by z.created_at desc) from security.wf_authcard_requests x join security.wf_auth_orders z on z.id=x.order_id left join security.wf_authcard_authorizations v on v.request_id=x.id where z.subject=a),'[]'::jsonb));
end $$;
create function public.authcard_service(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op text:=p_input->>'op';a text:=p_input->>'actor';c security.wf_authcards%rowtype;k uuid;begin
 if op='provider_read' then select * into c from security.wf_authcards where id=(p_input->>'id')::uuid;else
 if not exists(select 1 from public.users where user_id=a and status='active') then raise exception 'Active account required' using errcode='42501';end if;
 select * into c from security.wf_authcards where user_id=a for update;end if;
 if not found then raise exception 'AuthCard not found';end if;
 if op in ('read','provider_read') then return to_jsonb(c);end if;
 if op='details' then
 if length(p_input->>'encrypted') not between 30 and 20000 or length(p_input->>'name') not between 1 and 200 then raise exception 'Details invalid';end if;
 update security.wf_authcards set details_encrypted=p_input->>'encrypted',display_name=p_input->>'name',updated_at=now() where user_id=a;
 elsif op in ('payment_claim','identity_claim') then
 if c.status='revoked' or c.payment_status='hold' then raise exception 'AuthCard unavailable';end if;
 if op='payment_claim' then
 if c.payment_status='paid' then return to_jsonb(c);end if;
 if c.payment_session is not null then return to_jsonb(c);end if;
 if c.payment_lease_until>now() or c.payment_attempt_at<now()-interval '23 hours' then raise exception 'Resume or reconcile the same payment';end if;
 k:=gen_random_uuid();update security.wf_authcards set payment_attempt_at=coalesce(payment_attempt_at,now()),payment_lease=k,payment_lease_until=now()+interval '60 seconds' where user_id=a returning * into c;
 else
 if c.payment_status<>'paid' or c.details_encrypted is null then raise exception 'Paid KYU and private details required';end if;
 if c.identity_session is not null then return to_jsonb(c);end if;
 if c.identity_lease_until>now() or c.identity_attempt_at<now()-interval '23 hours' then raise exception 'Resume or reconcile the same verification';end if;
 k:=gen_random_uuid();update security.wf_authcards set identity_attempt_at=coalesce(identity_attempt_at,now()),identity_lease=k,identity_lease_until=now()+interval '60 seconds' where user_id=a returning * into c;
 end if;return to_jsonb(c);
 elsif op='payment_bind' then
 if c.payment_session is not null or c.payment_lease is distinct from (p_input->>'lease')::uuid then raise exception 'Payment binding mismatch';end if;
 update security.wf_authcards set payment_session=p_input->>'sessionId',payment_status='pending',payment_lease_until=null where user_id=a;
 elsif op='identity_bind' then
 if c.identity_session is not null or c.identity_lease is distinct from (p_input->>'lease')::uuid then raise exception 'Identity binding mismatch';end if;
 update security.wf_authcards set identity_session=p_input->>'sessionId',status='requires_input',identity_lease_until=null where user_id=a;
 elsif op='payment_observe' then
 if c.payment_session is distinct from p_input->>'sessionId' or p_input->>'status' not in ('paid','hold') then raise exception 'Payment observation denied';end if;
 if c.payment_status='hold' or c.payment_status=p_input->>'status' then return '{}'::jsonb;end if;
 update security.wf_authcards set payment_status=p_input->>'status',updated_at=now() where user_id=a;
 elsif op='identity_observe' then
 if c.identity_session is distinct from p_input->>'sessionId' or p_input->>'status' not in ('requires_input','processing','verified','cancelled') then raise exception 'Identity observation denied';end if;
 if c.status='revoked' or (c.status=p_input->>'status' and c.adult_verified=coalesce((p_input->>'adult')::boolean,false)) then return '{}'::jsonb;end if;
 if c.status<>'revoked' then
 update security.wf_authcards set status=case when p_input->>'status'='verified' and (p_input->>'adult')::boolean is distinct from true then 'cancelled' else p_input->>'status' end,adult_verified=coalesce((p_input->>'adult')::boolean,false),verified_at=case when p_input->>'status'='verified' and (p_input->>'adult')::boolean then coalesce(verified_at,now()) else verified_at end,updated_at=now() where user_id=a;
 end if;
 else raise exception 'Unsupported AuthCard service operation';end if;
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event,target) values(a,'platform','txkpro','AUTHCARD_'||upper(op),c.id::text);
 return '{}'::jsonb;
end $$;
-- Every new order records the employer certification before candidate sharing.
alter function public.auth_screening_service(jsonb) rename to auth_screening_service_legacy;
revoke all on function public.auth_screening_service_legacy(jsonb) from public,anon,authenticated,service_role;
create function public.auth_screening_service(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op text:=p_input->>'op';result jsonb;o security.wf_auth_orders%rowtype;r security.wf_authcard_requests%rowtype;begin
 if op='quote' then
 if p_input->>'purpose' not in ('fraud_prevention','unauthorized_transactions','claims_liability','institutional_risk','consumer_disputes') or (p_input->>'transactionCertified')::boolean is distinct from true or (p_input->>'nonEligibilityCertified')::boolean is distinct from true or length(coalesce(p_input->>'description',''))>500 then raise exception 'Intended use and certifications required';end if;
 result:=public.auth_screening_service_legacy(p_input);
 insert into security.wf_authcard_requests(order_id,purpose,description) values((result->>'id')::uuid,p_input->>'purpose',coalesce(p_input->>'description','')) on conflict(order_id) do nothing;
 select * into r from security.wf_authcard_requests where order_id=(result->>'id')::uuid;
 if r.purpose is distinct from p_input->>'purpose' or r.description is distinct from coalesce(p_input->>'description','') then raise exception 'Certification binding mismatch';end if;
 return result;
 end if;
 if op in ('checkout','claim') then
 select * into o from security.wf_auth_orders where id=(p_input->>'orderId')::uuid;
 perform 1 from security.wf_authcards where user_id=o.subject for update;
 perform 1 from security.wf_authcard_requests where order_id=o.id for update;
 if not security.authcard_ready(o) then raise exception 'Candidate AuthCard sharing and order authorization required' using errcode='42501';end if;
 end if;
 return public.auth_screening_service_legacy(p_input);
end $$;
create function public.authcard_order_status(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare authority jsonb;begin
 authority:=public.auth_screening_authority(p_input||jsonb_build_object('op','workspace'));
 return coalesce((select jsonb_object_agg(o.id::text,jsonb_build_object('status',coalesce(r.share_status,'not_requested'),'authorized',security.authcard_ready(o),'verified',case when r.share_status='shared' then c.status='verified' and c.payment_status='paid' and c.adult_verified else false end,'purpose',r.purpose)) from security.wf_auth_orders o left join security.wf_authcard_requests r on r.order_id=o.id left join security.wf_authcards c on c.user_id=o.subject where o.owner_type=p_input->>'ownerType' and o.owner_id=p_input->>'ownerId' and (o.actor=authority->>'actor' or (authority->>'canManage')::boolean or (authority->>'canReview')::boolean)),'{}'::jsonb);
end $$;
revoke all on function security.authcard_scope_name(text,text),security.authcard_snapshot(security.wf_auth_orders),security.authcard_ready(security.wf_auth_orders),public.authcard_self(jsonb),public.authcard_service(jsonb),public.authcard_order_status(jsonb),public.auth_screening_service(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.authcard_self(jsonb),public.authcard_order_status(jsonb) to authenticated;
grant execute on function public.authcard_service(jsonb),public.auth_screening_service(jsonb) to service_role;
