-- ADS-01: provider-neutral native advertising delivery.
-- Direct, approved inventory is eligible first. External-network fallback stays disabled
-- until ADS-04 has a selected provider, reviewed data-sharing contract and credentials.

create table if not exists public.wf_advertisers (
  advertiser_id text primary key default security.new_legacy_id('ADV'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  legal_name text,
  status text not null default 'pending_review'
    check (status in ('pending_review','active','rejected','suspended')),
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wf_ad_campaigns (
  campaign_id text primary key default security.new_legacy_id('ADC'),
  advertiser_id text not null references public.wf_advertisers(advertiser_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  status text not null default 'draft'
    check (status in ('draft','submitted','in_review','approved','scheduled','active','paused','completed','rejected','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  budget_minor bigint not null default 0 check (budget_minor >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  daily_frequency_cap integer not null default 3 check (daily_frequency_cap between 1 and 20),
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.wf_ad_creatives (
  creative_id text primary key default security.new_legacy_id('CRV'),
  campaign_id text not null references public.wf_ad_campaigns(campaign_id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft','submitted','approved','rejected','archived')),
  headline text not null check (char_length(btrim(headline)) between 2 and 120),
  body text not null check (char_length(btrim(body)) between 2 and 500),
  media_url text,
  media_alt text,
  destination_url text not null,
  cta_label text not null default 'Learn more' check (char_length(btrim(cta_label)) between 2 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (media_url is null or media_url ~ '^https://'),
  check (destination_url ~ '^https://'),
  check (media_alt is null or char_length(media_alt) <= 240)
);

create table if not exists public.wf_ad_campaign_placements (
  campaign_id text not null references public.wf_ad_campaigns(campaign_id) on delete cascade,
  creative_id text not null references public.wf_ad_creatives(creative_id) on delete cascade,
  placement text not null check (placement in ('in_feed','in_comments','in_article','multiplex')),
  enabled boolean not null default false,
  priority integer not null default 0 check (priority between -1000 and 1000),
  min_organic_items integer not null default 4 check (min_organic_items between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id,creative_id,placement)
);

create table if not exists public.wf_ad_campaign_audiences (
  audience_id text primary key default security.new_legacy_id('ADA'),
  campaign_id text not null references public.wf_ad_campaigns(campaign_id) on delete cascade,
  role_family text check (role_family is null or role_family in ('student','institution','employer','platform','member')),
  topic text,
  broad_geography text,
  public_group_id text references public.wf_community_groups(group_id) on delete cascade,
  created_at timestamptz not null default now(),
  check (topic is null or char_length(btrim(topic)) between 1 and 64),
  check (broad_geography is null or char_length(btrim(broad_geography)) between 2 and 120),
  check (num_nonnulls(role_family,topic,broad_geography,public_group_id) > 0)
);

create table if not exists public.wf_ad_reviews (
  review_id text primary key default security.new_legacy_id('ADR'),
  advertiser_id text not null references public.wf_advertisers(advertiser_id) on delete cascade,
  campaign_id text references public.wf_ad_campaigns(campaign_id) on delete cascade,
  creative_id text references public.wf_ad_creatives(creative_id) on delete cascade,
  decision text not null check (decision in ('submitted','approved','rejected','changes_requested')),
  notes text,
  reviewed_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  check (notes is null or char_length(notes) <= 4000),
  check (campaign_id is not null or creative_id is not null)
);

create table if not exists public.wf_ad_funding_authorizations (
  funding_authorization_id text primary key default security.new_legacy_id('ADF'),
  campaign_id text not null references public.wf_ad_campaigns(campaign_id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  evidence_reference text not null check (char_length(btrim(evidence_reference)) between 4 and 240),
  authorized_by_user_id text not null references public.users(user_id) on delete restrict,
  authorized_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id text references public.users(user_id) on delete set null,
  check (revoked_at is null or revoked_at >= authorized_at)
);

create table if not exists public.wf_ad_delivery_events (
  delivery_event_id uuid primary key default gen_random_uuid(),
  delivery_group_id uuid not null,
  request_key uuid not null,
  campaign_id text not null references public.wf_ad_campaigns(campaign_id) on delete restrict,
  creative_id text not null references public.wf_ad_creatives(creative_id) on delete restrict,
  placement text not null check (placement in ('in_feed','in_comments','in_article','multiplex')),
  event_type text not null check (event_type in ('served','viewable','clicked','invalidated','provider_reconciled')),
  actor_user_id text references public.users(user_id) on delete set null,
  public_content_id text,
  provider text not null default 'direct' check (provider in ('direct','external_network')),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (delivery_group_id,event_type),
  unique (request_key,event_type)
);

create index if not exists wf_ad_campaigns_delivery_idx
  on public.wf_ad_campaigns(status,starts_at,ends_at,created_at);
create index if not exists wf_ad_placements_delivery_idx
  on public.wf_ad_campaign_placements(placement,enabled,priority desc,campaign_id);
create index if not exists wf_ad_delivery_actor_frequency_idx
  on public.wf_ad_delivery_events(actor_user_id,campaign_id,occurred_at desc)
  where event_type='served' and actor_user_id is not null;
create index if not exists wf_ad_delivery_campaign_time_idx
  on public.wf_ad_delivery_events(campaign_id,event_type,occurred_at desc);

alter table public.wf_advertisers enable row level security;
alter table public.wf_ad_campaigns enable row level security;
alter table public.wf_ad_creatives enable row level security;
alter table public.wf_ad_campaign_placements enable row level security;
alter table public.wf_ad_campaign_audiences enable row level security;
alter table public.wf_ad_reviews enable row level security;
alter table public.wf_ad_funding_authorizations enable row level security;
alter table public.wf_ad_delivery_events enable row level security;

revoke all on table public.wf_advertisers,public.wf_ad_campaigns,public.wf_ad_creatives,
  public.wf_ad_campaign_placements,public.wf_ad_campaign_audiences,public.wf_ad_reviews,
  public.wf_ad_funding_authorizations,public.wf_ad_delivery_events
from public,anon,authenticated;

alter table public.wf_community_moderation_cases
  drop constraint if exists wf_community_moderation_cases_target_type_check;
alter table public.wf_community_moderation_cases
  add constraint wf_community_moderation_cases_target_type_check
  check (target_type in ('post','comment','user','message','ad'));
alter table public.wf_community_reports
  drop constraint if exists wf_community_reports_target_type_check;
alter table public.wf_community_reports
  add constraint wf_community_reports_target_type_check
  check (target_type in ('post','comment','user','message','ad'));

create or replace function security.ad_delivery_role_family(p_auth_user_id uuid)
returns text language sql stable security definer set search_path=''
as $$
  select case
    when exists(select 1 from public.app_role_memberships m where m.auth_user_id=p_auth_user_id and lower(m.status)='active' and m.role='student') then 'student'
    when exists(select 1 from public.app_role_memberships m where m.auth_user_id=p_auth_user_id and lower(m.status)='active' and (m.role like 'institution_%' or m.role in ('department_head','program_coordinator','instructor','assistant_instructor','career_services','educator'))) then 'institution'
    when exists(select 1 from public.app_role_memberships m where m.auth_user_id=p_auth_user_id and lower(m.status)='active' and m.role in ('employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only','employer_employee')) then 'employer'
    when exists(select 1 from public.app_role_memberships m where m.auth_user_id=p_auth_user_id and lower(m.status)='active' and m.role in ('super_admin','admin','support','read_only_analyst')) then 'platform'
    else 'member'
  end;
$$;

create or replace function public.ad_delivery_select(
  p_placement text,
  p_public_content_id text,
  p_request_key uuid,
  p_auth_user_id uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
  v_placement text:=lower(btrim(p_placement));
  v_actor text;
  v_role text:='member';
  v_topic text;
  v_group text;
  v_campaign text;
  v_creative text;
  v_delivery uuid;
  v_result jsonb;
  v_created boolean:=false;
begin
  if v_placement not in ('in_feed','in_comments','in_article','multiplex') or p_request_key is null then
    raise exception 'INVALID_AD_DELIVERY_REQUEST' using errcode='22023';
  end if;

  if p_auth_user_id is not null then
    select u.user_id into v_actor from public.users u
    where u.auth_user_id=p_auth_user_id and lower(u.status)='active';
    if v_actor is not null then v_role:=security.ad_delivery_role_family(p_auth_user_id); end if;
  end if;

  if p_public_content_id is not null then
    select p.topic,a.group_id into v_topic,v_group
    from public.wf_profile_posts p
    join public.users u on u.user_id=p.author_user_id and lower(u.status)='active'
    left join public.wf_community_post_audiences a on a.profile_post_id=p.profile_post_id
    left join public.wf_community_groups g on g.group_id=a.group_id and g.visibility='public' and g.status='active'
    where p.profile_post_id=p_public_content_id and p.status='published' and p.visibility='public'
      and (a.group_id is null or g.group_id is not null)
    limit 1;
    if not found then return jsonb_build_object('ad',null,'reason','invalid_context'); end if;
  end if;

  select e.delivery_group_id,e.campaign_id,e.creative_id into v_delivery,v_campaign,v_creative
  from public.wf_ad_delivery_events e
  where e.request_key=p_request_key and e.event_type='served';

  if v_delivery is null then
    select c.campaign_id,cr.creative_id into v_campaign,v_creative
    from public.wf_ad_campaigns c
    join public.wf_advertisers adv on adv.advertiser_id=c.advertiser_id and adv.status='active'
    join public.wf_ad_campaign_placements cp on cp.campaign_id=c.campaign_id and cp.placement=v_placement and cp.enabled
    join public.wf_ad_creatives cr on cr.creative_id=cp.creative_id and cr.campaign_id=c.campaign_id and cr.status='approved'
    where c.status='active'
      and (c.starts_at is null or c.starts_at<=now())
      and (c.ends_at is null or c.ends_at>now())
      and exists(select 1 from public.wf_ad_funding_authorizations f where f.campaign_id=c.campaign_id and f.revoked_at is null and f.currency=c.currency and f.amount_minor>0)
      and (v_actor is null or (select count(*) from public.wf_ad_delivery_events x where x.actor_user_id=v_actor and x.campaign_id=c.campaign_id and x.event_type='served' and x.occurred_at>=now()-interval '24 hours') < c.daily_frequency_cap)
      and (
        not exists(select 1 from public.wf_ad_campaign_audiences ca where ca.campaign_id=c.campaign_id)
        or exists(select 1 from public.wf_ad_campaign_audiences ca where ca.campaign_id=c.campaign_id
          and (ca.role_family is null or ca.role_family=v_role)
          and (ca.topic is null or lower(ca.topic)=lower(v_topic))
          and (ca.public_group_id is null or ca.public_group_id=v_group)
          and ca.broad_geography is null)
      )
    order by cp.priority desc,c.created_at asc,c.campaign_id asc
    limit 1;

    if v_campaign is null then return jsonb_build_object('ad',null,'reason','no_fill','externalFallback','disabled'); end if;
    v_delivery:=gen_random_uuid();
    insert into public.wf_ad_delivery_events(
      delivery_event_id,delivery_group_id,request_key,campaign_id,creative_id,placement,event_type,
      actor_user_id,public_content_id,provider,metadata
    ) values(
      v_delivery,v_delivery,p_request_key,v_campaign,v_creative,v_placement,'served',
      v_actor,p_public_content_id,'direct',jsonb_build_object('roleFamily',v_role,'topic',v_topic,'publicGroupId',v_group)
    ) on conflict(request_key,event_type) do nothing returning true into v_created;
    select e.delivery_group_id,e.campaign_id,e.creative_id into v_delivery,v_campaign,v_creative
    from public.wf_ad_delivery_events e where e.request_key=p_request_key and e.event_type='served';
    if v_created then
      insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
      values(p_auth_user_id,v_actor,'AD_DELIVERY_RECORDED','ad_delivery',v_delivery::text,'workforce-domain-event',
        jsonb_build_object('campaignId',v_campaign,'creativeId',v_creative,'placement',v_placement,'eventType','served'));
    end if;
  end if;

  select jsonb_build_object('ad',jsonb_build_object(
    'deliveryId',v_delivery,'eventToken',p_request_key,'placement',v_placement,
    'advertiserName',adv.display_name,'headline',cr.headline,'body',cr.body,
    'imageUrl',cr.media_url,'imageAlt',cr.media_alt,'destinationUrl',cr.destination_url,'ctaLabel',cr.cta_label
  )) into v_result
  from public.wf_ad_campaigns c
  join public.wf_advertisers adv on adv.advertiser_id=c.advertiser_id
  join public.wf_ad_creatives cr on cr.creative_id=v_creative
  where c.campaign_id=v_campaign;
  return coalesce(v_result,jsonb_build_object('ad',null,'reason','no_fill'));
end;
$$;

create or replace function public.ad_delivery_record(
  p_delivery_id uuid,p_event_token uuid,p_event_type text
)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_served public.wf_ad_delivery_events%rowtype;v_type text:=lower(btrim(p_event_type));v_id uuid;v_created boolean:=false;
begin
  if v_type not in ('viewable','clicked') then raise exception 'INVALID_AD_EVENT' using errcode='22023'; end if;
  select * into v_served from public.wf_ad_delivery_events
  where delivery_group_id=p_delivery_id and request_key=p_event_token and event_type='served';
  if not found then raise exception 'AD_DELIVERY_NOT_FOUND' using errcode='22023'; end if;
  insert into public.wf_ad_delivery_events(delivery_group_id,request_key,campaign_id,creative_id,placement,event_type,actor_user_id,public_content_id,provider)
  values(v_served.delivery_group_id,v_served.request_key,v_served.campaign_id,v_served.creative_id,v_served.placement,v_type,v_served.actor_user_id,v_served.public_content_id,v_served.provider)
  on conflict(delivery_group_id,event_type) do nothing returning delivery_event_id,true into v_id,v_created;
  v_created:=coalesce(v_created,false);
  if not v_created then
    select delivery_event_id into v_id from public.wf_ad_delivery_events
    where delivery_group_id=p_delivery_id and event_type=v_type;
  else
    insert into public.platform_audit_events(actor_user_id,action,entity_type,entity_id,source,metadata)
    values(v_served.actor_user_id,'AD_DELIVERY_RECORDED','ad_delivery',p_delivery_id::text,'workforce-domain-event',
      jsonb_build_object('campaignId',v_served.campaign_id,'creativeId',v_served.creative_id,'placement',v_served.placement,'eventType',v_type));
  end if;
  return jsonb_build_object('recorded',v_created,'eventType',v_type,'eventId',v_id);
end;
$$;

create or replace function public.ad_delivery_report(
  p_delivery_id uuid,p_event_token uuid,p_reason text,p_details text default null
)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_actor text:=security.community_actor();v_reason text:=lower(btrim(p_reason));v_served public.wf_ad_delivery_events%rowtype;
  v_case text;v_report text;v_snapshot jsonb;
begin
  if v_reason not in ('spam','scam','harassment','hate','threat','privacy','impersonation','misinformation','unsafe','illegal','other')
    then raise exception 'INVALID_REPORT_REASON' using errcode='22023'; end if;
  if char_length(coalesce(p_details,''))>2000 then raise exception 'REPORT_DETAILS_TOO_LONG' using errcode='22023'; end if;
  select * into v_served from public.wf_ad_delivery_events
  where delivery_group_id=p_delivery_id and request_key=p_event_token and event_type='served';
  if not found then raise exception 'AD_DELIVERY_NOT_FOUND' using errcode='22023'; end if;
  select jsonb_build_object('advertiser',adv.display_name,'headline',cr.headline,'body',cr.body,'destinationUrl',cr.destination_url,'campaignId',c.campaign_id,'creativeId',cr.creative_id)
    into v_snapshot from public.wf_ad_campaigns c join public.wf_advertisers adv using(advertiser_id)
    join public.wf_ad_creatives cr on cr.creative_id=v_served.creative_id where c.campaign_id=v_served.campaign_id;
  insert into public.wf_community_moderation_cases(target_type,target_id,automation_state,severity,priority_score)
  values('ad',p_delivery_id::text,'needs_review','medium',60)
  on conflict(target_type,target_id) do update set last_reported_at=now(),updated_at=now(),closed_at=null,status='submitted',automation_state='needs_review'
  returning case_id into v_case;
  insert into security.wf_community_moderation_evidence(case_id,content_type,content_snapshot,content_hash)
  values(v_case,'ad',v_snapshot,md5(v_snapshot::text))
  on conflict(case_id) do update set content_snapshot=excluded.content_snapshot,content_hash=excluded.content_hash,captured_at=now();
  insert into public.wf_community_reports(reporter_user_id,reason,case_id,details,target_type,target_id)
  values(v_actor,v_reason,v_case,nullif(btrim(p_details),''),'ad',p_delivery_id::text)
  on conflict(reporter_user_id,case_id) where case_id is not null do update set reason=excluded.reason,details=excluded.details,status='submitted',updated_at=now()
  returning report_id into v_report;
  update public.wf_community_moderation_cases set report_count=(select count(*) from public.wf_community_reports where case_id=v_case),last_reported_at=now(),updated_at=now() where case_id=v_case;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
  values(auth.uid(),v_actor,'COMMUNITY_REPORT_SUBMITTED','community_moderation_case',v_case,'workforce-domain-event',
    jsonb_build_object('reportId',v_report,'targetType','ad','targetId',p_delivery_id::text,'reason',v_reason));
  return jsonb_build_object('reported',true,'reportId',v_report,'caseId',v_case);
end;
$$;

revoke all on function security.ad_delivery_role_family(uuid) from public,anon,authenticated,service_role;
revoke all on function public.ad_delivery_select(text,text,uuid,uuid),public.ad_delivery_record(uuid,uuid,text)
from public,anon,authenticated;
grant execute on function public.ad_delivery_select(text,text,uuid,uuid),public.ad_delivery_record(uuid,uuid,text)
to service_role;
revoke all on function public.ad_delivery_report(uuid,uuid,text,text) from public,anon;
grant execute on function public.ad_delivery_report(uuid,uuid,text,text) to authenticated;

comment on function public.ad_delivery_select(text,text,uuid,uuid) is
  'ADS-01 curated direct-inventory selector. Uses approved public/coarse context only; private Workforce/community data is excluded.';
comment on table public.wf_ad_delivery_events is
  'Immutable ADS-01 delivery evidence. Asset load is served; viewable and clicked are recorded separately.';
