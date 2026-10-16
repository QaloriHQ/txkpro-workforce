-- ADS-03: aggregate advertising analytics, pacing and append-only corrections.
-- Budget is an allocation ceiling. Spend is recognized only from a replay-safe
-- provider reconciliation record; delivery counts never fabricate spend.

create unique index if not exists wf_ad_budget_ledger_spend_reference_idx
  on public.wf_ad_budget_ledger(campaign_id,entry_type,reference)
  where entry_type='spend_recorded';

create index if not exists wf_ad_provider_reconciliation_campaign_idx
  on public.wf_ad_provider_reconciliation(campaign_id,reconciled_at desc);
create index if not exists wf_ad_campaigns_advertiser_idx
  on public.wf_ad_campaigns(advertiser_id,created_at desc);
create index if not exists wf_ad_reviews_advertiser_idx
  on public.wf_ad_reviews(advertiser_id,created_at desc);
create index if not exists wf_advertiser_memberships_user_idx
  on public.wf_advertiser_memberships(user_id) where user_id is not null;
create index if not exists wf_advertiser_memberships_inviter_idx
  on public.wf_advertiser_memberships(invited_by_user_id) where invited_by_user_id is not null;
create index if not exists wf_ad_budget_ledger_creator_idx
  on public.wf_ad_budget_ledger(created_by_user_id) where created_by_user_id is not null;

create or replace function public.advertiser_analytics(
  p_advertiser_id text,
  p_campaign_id text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_export boolean default false
)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
  v_actor text;
  v_from timestamptz:=coalesce(p_from,now()-interval '30 days');
  v_to timestamptz:=coalesce(p_to,now());
  v_result jsonb;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_creative','advertiser_analyst']) then
    raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501';
  end if;
  if v_to<=v_from or v_to-v_from>interval '366 days' then
    raise exception 'INVALID_ANALYTICS_RANGE' using errcode='22023';
  end if;
  if p_campaign_id is not null and not exists(
    select 1 from public.wf_ad_campaigns c where c.campaign_id=p_campaign_id and c.advertiser_id=p_advertiser_id
  ) then raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0002'; end if;

  with campaign_scope as (
    select c.* from public.wf_ad_campaigns c
    where c.advertiser_id=p_advertiser_id and (p_campaign_id is null or c.campaign_id=p_campaign_id)
  ), served_groups as (
    select e.* from public.wf_ad_delivery_events e join campaign_scope c using(campaign_id)
    where e.event_type='served'
  ), valid_groups as (
    select s.* from served_groups s where not exists(
      select 1 from public.wf_ad_delivery_events x
      where x.delivery_group_id=s.delivery_group_id and x.event_type='invalidated'
    )
  ), valid_events as (
    select e.* from public.wf_ad_delivery_events e join valid_groups g using(delivery_group_id)
    where e.event_type in ('served','viewable','clicked') and e.occurred_at>=v_from and e.occurred_at<v_to
  ), invalid_groups as (
    select distinct e.delivery_group_id,e.campaign_id from public.wf_ad_delivery_events e
    join campaign_scope c using(campaign_id)
    where e.event_type='invalidated' and e.occurred_at>=v_from and e.occurred_at<v_to
  ), reconciled_groups as (
    select distinct e.delivery_group_id,e.campaign_id from public.wf_ad_delivery_events e
    join campaign_scope c using(campaign_id)
    where e.event_type='provider_reconciled' and e.occurred_at>=v_from and e.occurred_at<v_to
  )
  select jsonb_build_object(
    'range',jsonb_build_object('from',v_from,'to',v_to,'timezone','UTC'),
    'definitions',jsonb_build_object(
      'served','Eligible sponsored response returned by the server.',
      'viewable','A separately recorded viewability event; asset load alone is not viewability.',
      'uniqueReach','Distinct signed-in actors among valid served deliveries; anonymous reach is not inferred.',
      'spend','Append-only reconciled provider evidence only; budget and delivery counts do not imply spend.'
    ),
    'summary',jsonb_build_object(
      'served',(select count(*) from valid_events where event_type='served'),
      'viewable',(select count(*) from valid_events where event_type='viewable'),
      'clicked',(select count(*) from valid_events where event_type='clicked'),
      'uniqueReach',(select count(distinct actor_user_id) from valid_events where event_type='served' and actor_user_id is not null),
      'invalidated',(select count(*) from invalid_groups),
      'providerReconciled',(select count(*) from reconciled_groups),
      'allocatedMinor',coalesce((select sum(case when l.entry_type='allocation_revoked' then -abs(l.amount_minor) else l.amount_minor end)
        from public.wf_ad_budget_ledger l join campaign_scope c using(campaign_id)
        where l.entry_type in ('allocation_authorized','allocation_revoked','adjustment')),0),
      'spentMinor',coalesce((select sum(l.amount_minor) from public.wf_ad_budget_ledger l join campaign_scope c using(campaign_id)
        where l.entry_type='spend_recorded'),0),
      'currency','USD'
    ),
    'campaigns',coalesce((select jsonb_agg(jsonb_build_object(
      'campaignId',c.campaign_id,'name',c.name,'status',c.status,'startsAt',c.starts_at,'endsAt',c.ends_at,
      'budgetMinor',c.budget_minor,'currency',c.currency,
      'allocatedMinor',coalesce((select sum(case when l.entry_type='allocation_revoked' then -abs(l.amount_minor) else l.amount_minor end) from public.wf_ad_budget_ledger l where l.campaign_id=c.campaign_id and l.entry_type in ('allocation_authorized','allocation_revoked','adjustment')),0),
      'spentMinor',coalesce((select sum(l.amount_minor) from public.wf_ad_budget_ledger l where l.campaign_id=c.campaign_id and l.entry_type='spend_recorded'),0),
      'served',(select count(*) from valid_events e where e.campaign_id=c.campaign_id and e.event_type='served'),
      'viewable',(select count(*) from valid_events e where e.campaign_id=c.campaign_id and e.event_type='viewable'),
      'clicked',(select count(*) from valid_events e where e.campaign_id=c.campaign_id and e.event_type='clicked'),
      'uniqueReach',(select count(distinct e.actor_user_id) from valid_events e where e.campaign_id=c.campaign_id and e.event_type='served' and e.actor_user_id is not null),
      'invalidated',(select count(*) from invalid_groups e where e.campaign_id=c.campaign_id),
      'providerReconciled',(select count(*) from reconciled_groups e where e.campaign_id=c.campaign_id)
    ) order by c.created_at desc) from campaign_scope c),'[]'::jsonb),
    'byPlacement',coalesce((select jsonb_agg(row_data order by row_data->>'placement') from (
      select jsonb_build_object('placement',e.placement,'served',count(*) filter(where e.event_type='served'),'viewable',count(*) filter(where e.event_type='viewable'),'clicked',count(*) filter(where e.event_type='clicked'),'uniqueReach',count(distinct e.actor_user_id) filter(where e.event_type='served' and e.actor_user_id is not null)) row_data
      from valid_events e group by e.placement
    ) q),'[]'::jsonb),
    'byProvider',coalesce((select jsonb_agg(row_data order by row_data->>'provider') from (
      select jsonb_build_object('provider',e.provider,'served',count(*) filter(where e.event_type='served'),'viewable',count(*) filter(where e.event_type='viewable'),'clicked',count(*) filter(where e.event_type='clicked')) row_data
      from valid_events e group by e.provider
    ) q),'[]'::jsonb),
    'byCreative',coalesce((select jsonb_agg(row_data order by row_data->>'headline') from (
      select jsonb_build_object('creativeId',e.creative_id,'headline',cr.headline,'served',count(*) filter(where e.event_type='served'),'viewable',count(*) filter(where e.event_type='viewable'),'clicked',count(*) filter(where e.event_type='clicked')) row_data
      from valid_events e join public.wf_ad_creatives cr using(creative_id) group by e.creative_id,cr.headline
    ) q),'[]'::jsonb),
    'byDay',coalesce((select jsonb_agg(row_data order by row_data->>'date') from (
      select jsonb_build_object('date',(e.occurred_at at time zone 'UTC')::date,'served',count(*) filter(where e.event_type='served'),'viewable',count(*) filter(where e.event_type='viewable'),'clicked',count(*) filter(where e.event_type='clicked')) row_data
      from valid_events e group by (e.occurred_at at time zone 'UTC')::date
    ) q),'[]'::jsonb)
  ) into v_result;

  if p_export then
    v_actor:=security.advertiser_actor();
    insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
    values(auth.uid(),v_actor,'REPORT_EXPORTED','advertiser_analytics',p_advertiser_id,'workforce-domain-event',
      jsonb_build_object('campaignId',p_campaign_id,'from',v_from,'to',v_to,'format','csv'));
  end if;
  return v_result;
end $$;

create or replace function public.advertiser_admin_delivery_correction(
  p_delivery_id uuid,
  p_action text,
  p_reason text,
  p_provider_reference text default null,
  p_amount_minor bigint default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_actor text;
  v_served public.wf_ad_delivery_events%rowtype;
  v_action text:=lower(btrim(p_action));
  v_created boolean:=false;
  v_reconciliation uuid;
begin
  if not security.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  select * into v_served from public.wf_ad_delivery_events
  where delivery_group_id=p_delivery_id and event_type='served';
  if not found then raise exception 'AD_DELIVERY_NOT_FOUND' using errcode='P0002'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 4 and 240 then
    raise exception 'CORRECTION_REASON_REQUIRED' using errcode='22023';
  end if;
  v_actor:=security.advertiser_actor();

  if v_action='invalidate' then
    insert into public.wf_ad_delivery_events(
      delivery_group_id,request_key,campaign_id,creative_id,placement,event_type,
      actor_user_id,public_content_id,provider,metadata
    ) values(
      v_served.delivery_group_id,v_served.request_key,v_served.campaign_id,v_served.creative_id,
      v_served.placement,'invalidated',v_served.actor_user_id,v_served.public_content_id,v_served.provider,
      jsonb_build_object('reason',btrim(p_reason),'sourceDeliveryEventId',v_served.delivery_event_id)
    ) on conflict(delivery_group_id,event_type) do nothing returning true into v_created;
    v_created:=coalesce(v_created,false);
    if v_created then
      insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
      values(auth.uid(),v_actor,'AD_DELIVERY_INVALIDATED','ad_delivery',p_delivery_id::text,'workforce-domain-event',
        jsonb_build_object('campaignId',v_served.campaign_id,'creativeId',v_served.creative_id,'placement',v_served.placement,'reason',btrim(p_reason)));
    end if;
  elsif v_action='reconcile' then
    if char_length(btrim(coalesce(p_provider_reference,''))) not between 4 and 240 or coalesce(p_amount_minor,-1)<0 then
      raise exception 'INVALID_PROVIDER_RECONCILIATION' using errcode='22023';
    end if;
    select reconciliation_id into v_reconciliation from public.wf_ad_provider_reconciliation
    where provider=v_served.provider and provider_reference=btrim(p_provider_reference);
    if v_reconciliation is not null and not exists(
      select 1 from public.wf_ad_provider_reconciliation r
      where r.reconciliation_id=v_reconciliation and r.campaign_id=v_served.campaign_id
        and r.amount_minor=p_amount_minor and r.currency='USD'
        and r.metadata->>'deliveryId'=p_delivery_id::text
    ) then raise exception 'PROVIDER_RECONCILIATION_MISMATCH' using errcode='23505'; end if;
    if v_reconciliation is null then
      insert into public.wf_ad_provider_reconciliation(campaign_id,provider,provider_reference,amount_minor,currency,metadata)
      values(v_served.campaign_id,v_served.provider,btrim(p_provider_reference),p_amount_minor,'USD',
        jsonb_build_object('deliveryId',p_delivery_id,'reason',btrim(p_reason)))
      returning reconciliation_id into v_reconciliation;
      insert into public.wf_ad_budget_ledger(campaign_id,entry_type,amount_minor,currency,reference,created_by_user_id)
      values(v_served.campaign_id,'spend_recorded',p_amount_minor,'USD',v_served.provider||':'||btrim(p_provider_reference),v_actor)
      on conflict(campaign_id,entry_type,reference) where entry_type='spend_recorded' do nothing;
      v_created:=true;
    end if;
    insert into public.wf_ad_delivery_events(
      delivery_group_id,request_key,campaign_id,creative_id,placement,event_type,
      actor_user_id,public_content_id,provider,metadata
    ) values(
      v_served.delivery_group_id,v_served.request_key,v_served.campaign_id,v_served.creative_id,
      v_served.placement,'provider_reconciled',v_served.actor_user_id,v_served.public_content_id,v_served.provider,
      jsonb_build_object('providerReference',btrim(p_provider_reference),'amountMinor',p_amount_minor,'reason',btrim(p_reason))
    ) on conflict(delivery_group_id,event_type) do nothing;
    if v_created then
      insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
      values(auth.uid(),v_actor,'AD_PROVIDER_RECONCILED','ad_delivery',p_delivery_id::text,'workforce-domain-event',
        jsonb_build_object('campaignId',v_served.campaign_id,'provider',v_served.provider,'providerReference',btrim(p_provider_reference),'amountMinor',p_amount_minor));
    end if;
  else raise exception 'INVALID_CORRECTION_ACTION' using errcode='22023'; end if;
  return jsonb_build_object('deliveryId',p_delivery_id,'action',v_action,'recorded',v_created,'replayed',not v_created,'reconciliationId',v_reconciliation);
end $$;

revoke all on function public.advertiser_analytics(text,text,timestamptz,timestamptz,boolean),
  public.advertiser_admin_delivery_correction(uuid,text,text,text,bigint)
from public,anon,authenticated;
grant execute on function public.advertiser_analytics(text,text,timestamptz,timestamptz,boolean) to authenticated;
grant execute on function public.advertiser_admin_delivery_correction(uuid,text,text,text,bigint) to authenticated,service_role;

comment on function public.advertiser_analytics(text,text,timestamptz,timestamptz,boolean) is
  'ADS-03 advertiser-scoped aggregate analytics. Invalidated delivery groups are excluded; unique reach never infers anonymous identity; spend requires reconciliation evidence.';
comment on function public.advertiser_admin_delivery_correction(uuid,text,text,text,bigint) is
  'ADS-03 append-only admin correction. Replay is idempotent and original delivery evidence is never rewritten.';
