-- Advertisers are active immediately. Campaign review remains an admin gate,
-- and submission atomically reserves a fully funded budget from account credit.

alter table public.wf_advertisers alter column status set default 'active';

insert into public.platform_audit_events(action,entity_type,entity_id,source,before_json,after_json)
select 'ADVERTISER_STATUS_CHANGED','advertiser',a.advertiser_id,'workforce-domain-event',
  jsonb_build_object('status','pending_review'),jsonb_build_object('status','active','reason','self-service access enabled')
from public.wf_advertisers a where a.status='pending_review';
update public.wf_advertisers set status='active',review_notes=null,reviewed_at=null,reviewed_by_user_id=null,updated_at=now()
where status='pending_review';

create table public.wf_advertiser_funding_orders (
  funding_order_id uuid primary key default gen_random_uuid(),
  advertiser_id text not null references public.wf_advertisers(advertiser_id) on delete restrict,
  campaign_id text references public.wf_ad_campaigns(campaign_id) on delete set null,
  amount_minor bigint not null check (amount_minor >= 100),
  currency text not null default 'USD' check (currency='USD'),
  status text not null default 'pending' check (status in ('pending','paid','failed','expired')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  last_stripe_event_id text unique,
  created_by_user_id text not null references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index wf_advertiser_funding_orders_advertiser_idx on public.wf_advertiser_funding_orders(advertiser_id,created_at desc);

create table public.wf_advertiser_credit_ledger (
  credit_ledger_id uuid primary key default gen_random_uuid(),
  advertiser_id text not null references public.wf_advertisers(advertiser_id) on delete restrict,
  campaign_id text references public.wf_ad_campaigns(campaign_id) on delete restrict,
  funding_order_id uuid references public.wf_advertiser_funding_orders(funding_order_id) on delete restrict,
  entry_type text not null check (entry_type in ('stripe_funding','campaign_allocation','campaign_release','adjustment')),
  amount_minor bigint not null check (amount_minor <> 0),
  currency text not null default 'USD' check (currency='USD'),
  reference text not null unique check (char_length(btrim(reference)) between 4 and 240),
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index wf_advertiser_credit_ledger_advertiser_idx on public.wf_advertiser_credit_ledger(advertiser_id,created_at desc);

alter table public.wf_advertiser_funding_orders enable row level security;
alter table public.wf_advertiser_credit_ledger enable row level security;
revoke all on table public.wf_advertiser_funding_orders,public.wf_advertiser_credit_ledger from public,anon,authenticated;
grant all on table public.wf_advertiser_funding_orders,public.wf_advertiser_credit_ledger to service_role;

create or replace function security.advertiser_can(p_advertiser_id text,p_roles text[] default null)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.wf_advertiser_memberships m
    join public.wf_advertisers a on a.advertiser_id=m.advertiser_id
    where m.auth_user_id=auth.uid() and m.advertiser_id=p_advertiser_id and m.status='active'
      and (p_roles is null or m.role=any(p_roles)) and a.status='active'
  )
$$;

create or replace function public.advertiser_register(
  p_display_name text,p_legal_name text default null,p_website_url text default null,p_contact_email text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_advertiser text;v_email text;
begin
  v_actor:=security.advertiser_actor();
  if auth.uid() is null or v_actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  v_email:=lower(coalesce(nullif(btrim(p_contact_email),''),auth.jwt()->>'email',''));
  if char_length(btrim(p_display_name)) not between 2 and 120 then raise exception 'INVALID_DISPLAY_NAME' using errcode='22023'; end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_CONTACT_EMAIL' using errcode='22023'; end if;
  if nullif(btrim(p_website_url),'') is not null and btrim(p_website_url) !~ '^https://' then raise exception 'HTTPS_WEBSITE_REQUIRED' using errcode='22023'; end if;
  if exists(select 1 from public.wf_advertiser_memberships where auth_user_id=auth.uid() and status in ('active','invited')) then raise exception 'ADVERTISER_ACCOUNT_EXISTS' using errcode='23505'; end if;
  insert into public.wf_advertisers(display_name,legal_name,website_url,contact_email,status,created_by_user_id)
  values(btrim(p_display_name),nullif(btrim(p_legal_name),''),nullif(btrim(p_website_url),''),v_email,'active',v_actor) returning advertiser_id into v_advertiser;
  insert into public.wf_advertiser_memberships(advertiser_id,auth_user_id,user_id,invite_email,role,status,invited_by_user_id,accepted_at)
  values(v_advertiser,auth.uid(),v_actor,v_email,'advertiser_owner','active',v_actor,now());
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json)
  values(auth.uid(),v_actor,'ADVERTISER_STATUS_CHANGED','advertiser',v_advertiser,'workforce-domain-event',jsonb_build_object('status','active','access','self_service'));
  return jsonb_build_object('advertiserId',v_advertiser,'status','active');
end $$;

create or replace function public.advertiser_funding_order_create(p_advertiser_id text,p_campaign_id text,p_amount_minor bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_id uuid;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  if p_amount_minor<100 then raise exception 'INVALID_FUNDING_AMOUNT' using errcode='22023'; end if;
  if p_campaign_id is not null and not exists(select 1 from public.wf_ad_campaigns where campaign_id=p_campaign_id and advertiser_id=p_advertiser_id and status in ('draft','rejected')) then raise exception 'CAMPAIGN_NOT_FUNDABLE' using errcode='55000'; end if;
  v_actor:=security.advertiser_actor();
  insert into public.wf_advertiser_funding_orders(advertiser_id,campaign_id,amount_minor,created_by_user_id)
  values(p_advertiser_id,p_campaign_id,p_amount_minor,v_actor) returning funding_order_id into v_id;
  return jsonb_build_object('fundingOrderId',v_id,'status','pending');
end $$;

create or replace function public.advertiser_funding_service(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_order public.wf_advertiser_funding_orders%rowtype;v_op text:=p_input->>'op';v_id uuid:=(p_input->>'fundingOrderId')::uuid;
begin
  select * into v_order from public.wf_advertiser_funding_orders where funding_order_id=v_id for update;
  if not found then raise exception 'FUNDING_ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_op='read' then return to_jsonb(v_order); end if;
  if v_op='bind' then
    if v_order.status<>'pending' or v_order.stripe_checkout_session_id is not null then raise exception 'FUNDING_ORDER_NOT_BINDABLE' using errcode='55000'; end if;
    update public.wf_advertiser_funding_orders set stripe_checkout_session_id=p_input->>'sessionId',updated_at=now() where funding_order_id=v_id returning * into v_order;
  elsif v_op='settle' then
    if coalesce((p_input->>'livemode')::boolean,true) then raise exception 'LIVE_PAYMENTS_DISABLED' using errcode='23514'; end if;
    if v_order.stripe_checkout_session_id is distinct from p_input->>'sessionId' or v_order.amount_minor<>(p_input->>'amountMinor')::bigint or v_order.currency<>upper(p_input->>'currency') then raise exception 'FUNDING_EVIDENCE_MISMATCH' using errcode='23514'; end if;
    if v_order.status='paid' then return to_jsonb(v_order); end if;
    if v_order.status<>'pending' then raise exception 'FUNDING_ORDER_NOT_SETTLEABLE' using errcode='55000'; end if;
    insert into public.wf_advertiser_credit_ledger(advertiser_id,campaign_id,funding_order_id,entry_type,amount_minor,reference,created_by_user_id)
    values(v_order.advertiser_id,v_order.campaign_id,v_id,'stripe_funding',v_order.amount_minor,'stripe-event:'||(p_input->>'eventId'),v_order.created_by_user_id);
    update public.wf_advertiser_funding_orders set status='paid',stripe_payment_intent_id=nullif(p_input->>'paymentIntentId',''),last_stripe_event_id=p_input->>'eventId',paid_at=now(),updated_at=now() where funding_order_id=v_id returning * into v_order;
  elsif v_op='fail' then
    if v_order.status='pending' and v_order.stripe_checkout_session_id=p_input->>'sessionId' then update public.wf_advertiser_funding_orders set status=case when p_input->>'reason'='expired' then 'expired' else 'failed' end,last_stripe_event_id=p_input->>'eventId',updated_at=now() where funding_order_id=v_id returning * into v_order; end if;
  else raise exception 'INVALID_FUNDING_OPERATION' using errcode='22023'; end if;
  return to_jsonb(v_order);
end $$;

create or replace function public.advertiser_dashboard(p_advertiser_id text default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_context jsonb;v_advertiser text;
begin
  v_context:=public.advertiser_account_context(p_advertiser_id);v_advertiser:=v_context->>'advertiserId';
  if v_advertiser is null then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  return jsonb_build_object('account',v_context,
    'credit',jsonb_build_object('availableMinor',coalesce((select sum(l.amount_minor) from public.wf_advertiser_credit_ledger l where l.advertiser_id=v_advertiser),0),'currency','USD'),
    'fundingOrders',coalesce((select jsonb_agg(jsonb_build_object('id',o.funding_order_id,'campaignId',o.campaign_id,'amountMinor',o.amount_minor,'status',o.status,'createdAt',o.created_at) order by o.created_at desc) from public.wf_advertiser_funding_orders o where o.advertiser_id=v_advertiser),'[]'::jsonb),
    'team',coalesce((select jsonb_agg(jsonb_build_object('id',m.advertiser_membership_id,'email',m.invite_email,'role',m.role,'status',m.status) order by m.invited_at) from public.wf_advertiser_memberships m where m.advertiser_id=v_advertiser and ((v_context->>'role') in ('advertiser_owner','advertiser_admin') or m.auth_user_id=auth.uid())),'[]'::jsonb),
    'campaigns',coalesce((select jsonb_agg(jsonb_build_object('id',c.campaign_id,'name',c.name,'status',c.status,'budgetMinor',c.budget_minor,'currency',c.currency,'startsAt',c.starts_at,'endsAt',c.ends_at,
      'allocatedMinor',coalesce((select sum(case when l.entry_type='allocation_revoked' then -abs(l.amount_minor) else l.amount_minor end) from public.wf_ad_budget_ledger l where l.campaign_id=c.campaign_id and l.entry_type in ('allocation_authorized','allocation_revoked','adjustment')),0),
      'spentMinor',coalesce((select sum(l.amount_minor) from public.wf_ad_budget_ledger l where l.campaign_id=c.campaign_id and l.entry_type='spend_recorded'),0),
      'served',coalesce((select count(*) from public.wf_ad_delivery_events e where e.campaign_id=c.campaign_id and e.event_type='served'),0),'viewable',coalesce((select count(*) from public.wf_ad_delivery_events e where e.campaign_id=c.campaign_id and e.event_type='viewable'),0),'clicked',coalesce((select count(*) from public.wf_ad_delivery_events e where e.campaign_id=c.campaign_id and e.event_type='clicked'),0),
      'creatives',coalesce((select jsonb_agg(jsonb_build_object('id',cr.creative_id,'status',cr.status,'headline',cr.headline,'body',cr.body,'mediaUrl',cr.media_url,'mediaAlt',cr.media_alt,'destinationUrl',cr.destination_url,'ctaLabel',cr.cta_label) order by cr.created_at) from public.wf_ad_creatives cr where cr.campaign_id=c.campaign_id),'[]'::jsonb),
      'review',coalesce((select jsonb_build_object('decision',r.decision,'notes',r.notes,'createdAt',r.created_at) from public.wf_ad_reviews r where r.campaign_id=c.campaign_id order by r.created_at desc limit 1),'null'::jsonb)) order by c.created_at desc) from public.wf_ad_campaigns c where c.advertiser_id=v_advertiser),'[]'::jsonb));
end $$;

create or replace function public.advertiser_campaign_action(p_advertiser_id text,p_campaign_id text,p_action text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_current text;v_next text;v_budget bigint;v_allocated bigint;v_credit bigint;v_delta bigint;v_ref text;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  perform 1 from public.wf_advertisers where advertiser_id=p_advertiser_id for update;
  select status,budget_minor into v_current,v_budget from public.wf_ad_campaigns where campaign_id=p_campaign_id and advertiser_id=p_advertiser_id for update;
  if p_action='submit' and v_current in ('draft','rejected') then
    if v_budget<=0 then raise exception 'POSITIVE_BUDGET_REQUIRED' using errcode='23514'; end if;
    if not exists(select 1 from public.wf_ad_creatives where campaign_id=p_campaign_id) then raise exception 'CREATIVE_REQUIRED' using errcode='23514'; end if;
    select coalesce(sum(case when entry_type='allocation_revoked' then -abs(amount_minor) else amount_minor end),0) into v_allocated from public.wf_ad_budget_ledger where campaign_id=p_campaign_id and entry_type in ('allocation_authorized','allocation_revoked','adjustment');
    select coalesce(sum(amount_minor),0) into v_credit from public.wf_advertiser_credit_ledger where advertiser_id=p_advertiser_id;
    v_delta:=v_budget-v_allocated;
    if v_delta<0 then raise exception 'CAMPAIGN_BUDGET_BELOW_ALLOCATION' using errcode='23514'; end if;
    if v_credit<v_delta then raise exception 'CAMPAIGN_BUDGET_NOT_FUNDED' using errcode='23514'; end if;
    v_actor:=security.advertiser_actor();v_ref:='campaign-allocation:'||p_campaign_id||':'||gen_random_uuid();
    if v_delta>0 then
      insert into public.wf_advertiser_credit_ledger(advertiser_id,campaign_id,entry_type,amount_minor,reference,created_by_user_id) values(p_advertiser_id,p_campaign_id,'campaign_allocation',-v_delta,v_ref,v_actor);
      insert into public.wf_ad_budget_ledger(campaign_id,entry_type,amount_minor,reference,created_by_user_id) values(p_campaign_id,'allocation_authorized',v_delta,v_ref,v_actor);
      insert into public.wf_ad_funding_authorizations(campaign_id,amount_minor,evidence_reference,authorized_by_user_id) values(p_campaign_id,v_delta,v_ref,v_actor);
    end if;
    update public.wf_ad_creatives set status='submitted',updated_at=now() where campaign_id=p_campaign_id and status in ('draft','rejected');v_next:='submitted';
  elsif p_action='pause' and v_current in ('scheduled','active') then v_next:='paused';
  elsif p_action='resume' and v_current='paused' then
    if not exists(select 1 from public.wf_ad_funding_authorizations where campaign_id=p_campaign_id and revoked_at is null) then raise exception 'FUNDING_AUTHORIZATION_REQUIRED' using errcode='23514'; end if;
    v_next:='active';
  elsif p_action='cancel' and v_current not in ('completed','cancelled') then v_next:='cancelled';
  else raise exception 'INVALID_CAMPAIGN_TRANSITION' using errcode='55000'; end if;
  update public.wf_ad_campaigns set status=v_next,updated_at=now() where campaign_id=p_campaign_id;
  if v_next='submitted' then insert into public.wf_ad_reviews(advertiser_id,campaign_id,decision,notes) values(p_advertiser_id,p_campaign_id,'submitted',null); end if;
  v_actor:=coalesce(v_actor,security.advertiser_actor());
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json) values(auth.uid(),v_actor,'AD_CAMPAIGN_STATUS_CHANGED','ad_campaign',p_campaign_id,'workforce-domain-event',jsonb_build_object('status',v_current),jsonb_build_object('status',v_next));
  return jsonb_build_object('campaignId',p_campaign_id,'status',v_next);
end $$;

create or replace function public.advertiser_admin_queue()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not security.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object(
    'advertisers',coalesce((select jsonb_agg(jsonb_build_object('id',a.advertiser_id,'displayName',a.display_name,'legalName',a.legal_name,'websiteUrl',a.website_url,'contactEmail',a.contact_email,'status',a.status,'createdAt',a.created_at) order by a.created_at) from public.wf_advertisers a where a.status='suspended'),'[]'::jsonb),
    'campaigns',coalesce((select jsonb_agg(jsonb_build_object('id',c.campaign_id,'advertiserId',c.advertiser_id,'advertiserName',a.display_name,'name',c.name,'status',c.status,'budgetMinor',c.budget_minor,'allocatedMinor',coalesce((select sum(case when l.entry_type='allocation_revoked' then -abs(l.amount_minor) else l.amount_minor end) from public.wf_ad_budget_ledger l where l.campaign_id=c.campaign_id and l.entry_type in ('allocation_authorized','allocation_revoked','adjustment')),0),'currency',c.currency,'startsAt',c.starts_at,'endsAt',c.ends_at,'creatives',coalesce((select jsonb_agg(jsonb_build_object('id',cr.creative_id,'headline',cr.headline,'body',cr.body,'mediaUrl',cr.media_url,'destinationUrl',cr.destination_url,'status',cr.status)) from public.wf_ad_creatives cr where cr.campaign_id=c.campaign_id),'[]'::jsonb)) order by c.created_at) from public.wf_ad_campaigns c join public.wf_advertisers a on a.advertiser_id=c.advertiser_id where c.status in ('submitted','in_review')),'[]'::jsonb));
end $$;

create or replace function public.advertiser_admin_review(p_target_type text,p_target_id text,p_decision text,p_notes text default null,p_allocation_minor bigint default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_advertiser text;v_before text;v_after text;v_budget bigint;v_allocated bigint;v_release bigint;v_ref text;
begin
  if not security.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  v_actor:=security.advertiser_actor();
  if p_target_type='advertiser' then
    if p_decision not in ('approved','suspended') then raise exception 'INVALID_ADVERTISER_SAFEGUARD_DECISION' using errcode='22023'; end if;
    select advertiser_id,status into v_advertiser,v_before from public.wf_advertisers where advertiser_id=p_target_id for update;
    v_after:=case p_decision when 'approved' then 'active' else 'suspended' end;
    update public.wf_advertisers set status=v_after,review_notes=nullif(btrim(p_notes),''),reviewed_at=now(),reviewed_by_user_id=v_actor,updated_at=now() where advertiser_id=p_target_id;
    insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json) values(auth.uid(),v_actor,'ADVERTISER_STATUS_CHANGED','advertiser',p_target_id,'workforce-domain-event',jsonb_build_object('status',v_before),jsonb_build_object('status',v_after,'notes',p_notes));
  elsif p_target_type='campaign' then
    if p_decision not in ('approved','rejected','changes_requested') then raise exception 'INVALID_REVIEW_DECISION' using errcode='22023'; end if;
    select advertiser_id,status,budget_minor into v_advertiser,v_before,v_budget from public.wf_ad_campaigns where campaign_id=p_target_id for update;
    if v_before not in ('submitted','in_review') then raise exception 'CAMPAIGN_NOT_REVIEWABLE' using errcode='55000'; end if;
    select coalesce(sum(case when entry_type='allocation_revoked' then -abs(amount_minor) else amount_minor end),0) into v_allocated from public.wf_ad_budget_ledger where campaign_id=p_target_id and entry_type in ('allocation_authorized','allocation_revoked','adjustment');
    if p_decision='approved' then
      if v_allocated<>v_budget or not exists(select 1 from public.wf_ad_funding_authorizations where campaign_id=p_target_id and revoked_at is null) then raise exception 'CAMPAIGN_BUDGET_NOT_FUNDED' using errcode='23514'; end if;
      if (select ends_at from public.wf_ad_campaigns where campaign_id=p_target_id)<=now() then raise exception 'CAMPAIGN_WINDOW_ENDED' using errcode='23514'; end if;
      v_after:=case when (select starts_at from public.wf_ad_campaigns where campaign_id=p_target_id)>now() then 'scheduled' else 'active' end;
      update public.wf_ad_campaigns set status=v_after,updated_at=now() where campaign_id=p_target_id;
      update public.wf_ad_creatives set status='approved',updated_at=now() where campaign_id=p_target_id;
      update public.wf_ad_campaign_placements set enabled=true where campaign_id=p_target_id;
      insert into public.wf_ad_channel_jobs(campaign_id,channel,status) values(p_target_id,'txkpro_direct','published') on conflict(campaign_id,channel) do update set status='published',updated_at=now();
    else
      v_after:=case when p_decision='changes_requested' then 'draft' else 'rejected' end;
      update public.wf_ad_campaigns set status=v_after,updated_at=now() where campaign_id=p_target_id;
      update public.wf_ad_creatives set status=case when p_decision='changes_requested' then 'draft' else 'rejected' end,updated_at=now() where campaign_id=p_target_id;
      v_release:=v_allocated;v_ref:='campaign-release:'||p_target_id||':'||gen_random_uuid();
      if v_release>0 then
        insert into public.wf_advertiser_credit_ledger(advertiser_id,campaign_id,entry_type,amount_minor,reference,created_by_user_id) values(v_advertiser,p_target_id,'campaign_release',v_release,v_ref,v_actor);
        insert into public.wf_ad_budget_ledger(campaign_id,entry_type,amount_minor,reference,created_by_user_id) values(p_target_id,'allocation_revoked',v_release,v_ref,v_actor);
        update public.wf_ad_funding_authorizations set revoked_at=now(),revoked_by_user_id=v_actor where campaign_id=p_target_id and revoked_at is null;
      end if;
    end if;
    insert into public.wf_ad_reviews(advertiser_id,campaign_id,decision,notes,reviewed_by_user_id) values(v_advertiser,p_target_id,p_decision,nullif(btrim(p_notes),''),v_actor);
    insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json) values(auth.uid(),v_actor,'AD_CAMPAIGN_STATUS_CHANGED','ad_campaign',p_target_id,'workforce-domain-event',jsonb_build_object('status',v_before),jsonb_build_object('status',v_after,'decision',p_decision,'notes',p_notes));
  else raise exception 'INVALID_REVIEW_TARGET' using errcode='22023'; end if;
  return jsonb_build_object('targetType',p_target_type,'targetId',p_target_id,'status',v_after);
end $$;

revoke all on function public.advertiser_funding_order_create(text,text,bigint),public.advertiser_funding_service(jsonb) from public,anon,authenticated;
grant execute on function public.advertiser_funding_order_create(text,text,bigint) to authenticated;
grant execute on function public.advertiser_funding_service(jsonb) to service_role;
