-- ADS-06: enterprise campaign hierarchy and account controls.
-- This remains a direct TXKPRO inventory foundation: no external networks,
-- behavioral audiences, CRM matching, lookalikes, auctions, or ML bidding.

alter table public.wf_advertiser_memberships
  drop constraint if exists wf_advertiser_memberships_role_check;
alter table public.wf_advertiser_memberships
  add constraint wf_advertiser_memberships_role_check check (role in (
    'advertiser_owner','advertiser_admin','advertiser_campaign_manager',
    'advertiser_creative','advertiser_analyst','advertiser_billing_manager'
  ));

alter table public.wf_ad_campaigns add column objective text not null default 'brand_awareness'
  check (objective in ('brand_awareness','traffic','engagement','leads','conversions'));

create table public.wf_ad_business_managers (
  business_manager_id text primary key default security.new_legacy_id('ABM'),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  status text not null default 'active' check (status in ('active','suspended')),
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.wf_ad_business_manager_memberships (
  business_manager_membership_id text primary key default security.new_legacy_id('ABM'),
  business_manager_id text not null references public.wf_ad_business_managers(business_manager_id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  user_id text references public.users(user_id) on delete cascade,
  role text not null check (role in ('advertiser_owner','advertiser_admin','advertiser_campaign_manager','advertiser_creative','advertiser_analyst','advertiser_billing_manager')),
  status text not null default 'active' check (status in ('active','suspended','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_manager_id,auth_user_id)
);
create table public.wf_ad_business_manager_accounts (
  business_manager_id text not null references public.wf_ad_business_managers(business_manager_id) on delete cascade,
  advertiser_id text not null references public.wf_advertisers(advertiser_id) on delete cascade,
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_manager_id,advertiser_id)
);

do $$
declare r record;v_manager text;
begin
  for r in select a.advertiser_id,a.display_name,a.created_by_user_id,m.auth_user_id,m.user_id from public.wf_advertisers a join public.wf_advertiser_memberships m using(advertiser_id) where m.role='advertiser_owner' and m.status='active' loop
    insert into public.wf_ad_business_managers(name,created_by_user_id) values(r.display_name||' Business Manager',r.created_by_user_id) returning business_manager_id into v_manager;
    insert into public.wf_ad_business_manager_accounts(business_manager_id,advertiser_id,created_by_user_id) values(v_manager,r.advertiser_id,r.created_by_user_id);
    insert into public.wf_ad_business_manager_memberships(business_manager_id,auth_user_id,user_id,role) values(v_manager,r.auth_user_id,r.user_id,'advertiser_owner') on conflict do nothing;
  end loop;
end $$;

create or replace function public.ads_create_default_business_manager()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_manager text;v_name text;
begin
  if new.role<>'advertiser_owner' or new.status<>'active' or new.auth_user_id is null or exists(select 1 from public.wf_ad_business_manager_accounts where advertiser_id=new.advertiser_id) then return new; end if;
  select display_name into v_name from public.wf_advertisers where advertiser_id=new.advertiser_id;
  insert into public.wf_ad_business_managers(name,created_by_user_id) values(v_name||' Business Manager',new.user_id) returning business_manager_id into v_manager;
  insert into public.wf_ad_business_manager_accounts(business_manager_id,advertiser_id,created_by_user_id) values(v_manager,new.advertiser_id,new.user_id);
  insert into public.wf_ad_business_manager_memberships(business_manager_id,auth_user_id,user_id,role) values(v_manager,new.auth_user_id,new.user_id,'advertiser_owner');
  return new;
end $$;
create trigger wf_advertiser_default_business_manager after insert on public.wf_advertiser_memberships for each row execute function public.ads_create_default_business_manager();

create table public.wf_ad_groups (
  ad_group_id text primary key default security.new_legacy_id('ADG'),
  campaign_id text not null references public.wf_ad_campaigns(campaign_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  status text not null default 'draft' check (status in ('draft','submitted','approved','active','paused','rejected','archived')),
  delivery_enabled boolean not null default true,
  disabled_reason text check (disabled_reason is null or char_length(disabled_reason) <= 500),
  buying_model text not null default 'fixed_cpm' check (buying_model in ('fixed_cpm','fixed_cpc')),
  bid_minor bigint not null default 0 check (bid_minor >= 0),
  pacing_mode text not null default 'even' check (pacing_mode in ('even','accelerated')),
  daily_frequency_cap integer not null default 3 check (daily_frequency_cap between 1 and 20),
  role_family text check (role_family is null or role_family in ('student','institution','employer','platform','member')),
  topic text check (topic is null or char_length(btrim(topic)) between 1 and 64),
  broad_geography text check (broad_geography is null or char_length(btrim(broad_geography)) between 2 and 120),
  schedule_timezone text not null default 'UTC' check (char_length(schedule_timezone) between 1 and 64),
  dayparting jsonb not null default '[]'::jsonb check (jsonb_typeof(dayparting)='array'),
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wf_ad_groups_campaign_idx on public.wf_ad_groups(campaign_id,status,delivery_enabled);

create table public.wf_ad_group_placements (
  ad_group_id text not null references public.wf_ad_groups(ad_group_id) on delete cascade,
  placement text not null check (placement in ('in_feed','in_comments','in_article','multiplex')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ad_group_id,placement)
);

alter table public.wf_ad_creatives
  add column ad_group_id text references public.wf_ad_groups(ad_group_id) on delete cascade,
  add column delivery_enabled boolean not null default true,
  add column disabled_reason text check (disabled_reason is null or char_length(disabled_reason) <= 500);

insert into public.wf_ad_groups(campaign_id,name,status,delivery_enabled,buying_model,bid_minor,pacing_mode,daily_frequency_cap,role_family,topic,broad_geography,created_by_user_id,created_at,updated_at)
select c.campaign_id,'Default ad group',case when c.status in ('active','scheduled','approved') then 'approved' when c.status='paused' then 'paused' when c.status in ('submitted','in_review') then 'submitted' when c.status='rejected' then 'rejected' else 'draft' end,
  true,'fixed_cpm',0,'even',c.daily_frequency_cap,a.role_family,a.topic,a.broad_geography,c.created_by_user_id,c.created_at,c.updated_at
from public.wf_ad_campaigns c
left join lateral (select role_family,topic,broad_geography from public.wf_ad_campaign_audiences where campaign_id=c.campaign_id order by created_at limit 1) a on true;
update public.wf_ad_creatives cr set ad_group_id=g.ad_group_id from public.wf_ad_groups g where g.campaign_id=cr.campaign_id and cr.ad_group_id is null;
insert into public.wf_ad_group_placements(ad_group_id,placement,enabled)
select distinct cr.ad_group_id,cp.placement,true from public.wf_ad_campaign_placements cp join public.wf_ad_creatives cr using(creative_id) where cr.ad_group_id is not null on conflict do nothing;
alter table public.wf_ad_creatives alter column ad_group_id set not null;

create table public.wf_ad_creative_versions (
  creative_version_id text primary key default security.new_legacy_id('ACV'),
  creative_id text not null references public.wf_ad_creatives(creative_id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','superseded')),
  headline text not null check (char_length(btrim(headline)) between 2 and 120),
  body text not null check (char_length(btrim(body)) between 2 and 500),
  media_url text check (media_url is null or media_url ~ '^https://'),
  media_alt text check (media_alt is null or char_length(media_alt) <= 240),
  destination_url text not null check (destination_url ~ '^https://'),
  cta_label text not null check (char_length(btrim(cta_label)) between 2 and 40),
  content_hash text not null,
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_by_user_id text references public.users(user_id) on delete set null,
  reviewed_at timestamptz,
  review_notes text check (review_notes is null or char_length(review_notes) <= 4000),
  unique (creative_id,version_number),
  unique (creative_id,content_hash)
);
create table public.wf_ad_creative_version_placements (
  creative_version_id text not null references public.wf_ad_creative_versions(creative_version_id) on delete cascade,
  placement text not null check (placement in ('in_feed','in_comments','in_article','multiplex')),
  primary key (creative_version_id,placement)
);
alter table public.wf_ad_reviews add column creative_version_id text references public.wf_ad_creative_versions(creative_version_id) on delete cascade;
insert into public.wf_ad_creative_versions(creative_id,version_number,status,headline,body,media_url,media_alt,destination_url,cta_label,content_hash,created_at)
select creative_id,1,case status when 'approved' then 'approved' when 'submitted' then 'submitted' when 'rejected' then 'rejected' else 'draft' end,
  headline,body,media_url,media_alt,destination_url,cta_label,
  md5(concat_ws(E'\n',headline,body,coalesce(media_url,''),coalesce(media_alt,''),destination_url,cta_label)),created_at
from public.wf_ad_creatives;
insert into public.wf_ad_creative_version_placements(creative_version_id,placement)
select v.creative_version_id,p.placement from public.wf_ad_creative_versions v join public.wf_ad_campaign_placements p using(creative_id) on conflict do nothing;

create table public.wf_ad_bulk_operation_receipts (
  bulk_operation_id uuid primary key default gen_random_uuid(),
  advertiser_id text not null references public.wf_advertisers(advertiser_id) on delete restrict,
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 8 and 120),
  entity_type text not null check (entity_type in ('campaign','ad_group','ad')),
  action text not null check (action in ('pause','resume','duplicate')),
  requested_ids text[] not null check (cardinality(requested_ids) between 1 and 100),
  result jsonb not null default '{}'::jsonb,
  actor_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (advertiser_id,idempotency_key)
);

alter table public.wf_ad_business_managers enable row level security;
alter table public.wf_ad_business_manager_memberships enable row level security;
alter table public.wf_ad_business_manager_accounts enable row level security;
alter table public.wf_ad_groups enable row level security;
alter table public.wf_ad_group_placements enable row level security;
alter table public.wf_ad_creative_versions enable row level security;
alter table public.wf_ad_creative_version_placements enable row level security;
alter table public.wf_ad_bulk_operation_receipts enable row level security;
revoke all on table public.wf_ad_business_managers,public.wf_ad_business_manager_memberships,public.wf_ad_business_manager_accounts,
  public.wf_ad_groups,public.wf_ad_group_placements,public.wf_ad_creative_versions,public.wf_ad_creative_version_placements,public.wf_ad_bulk_operation_receipts from public,anon,authenticated;
grant all on table public.wf_ad_business_managers,public.wf_ad_business_manager_memberships,public.wf_ad_business_manager_accounts,
  public.wf_ad_groups,public.wf_ad_group_placements,public.wf_ad_creative_versions,public.wf_ad_creative_version_placements,public.wf_ad_bulk_operation_receipts to service_role;

create or replace function security.advertiser_can(p_advertiser_id text,p_roles text[] default null)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.wf_advertisers a where a.advertiser_id=p_advertiser_id and a.status='active' and (
      exists(select 1 from public.wf_advertiser_memberships m where m.auth_user_id=auth.uid() and m.advertiser_id=a.advertiser_id and m.status='active' and (p_roles is null or m.role=any(p_roles)))
      or exists(select 1 from public.wf_ad_business_manager_accounts ba join public.wf_ad_business_managers bm using(business_manager_id) join public.wf_ad_business_manager_memberships mm using(business_manager_id) where ba.advertiser_id=a.advertiser_id and bm.status='active' and mm.auth_user_id=auth.uid() and mm.status='active' and (p_roles is null or mm.role=any(p_roles)))
    )
  )
$$;

create or replace function public.advertiser_account_context(p_advertiser_id text default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_row record;
begin
  select q.* into v_row from (
    select a.*,m.role,1 source_rank from public.wf_advertiser_memberships m join public.wf_advertisers a using(advertiser_id) where m.auth_user_id=auth.uid() and m.status='active'
    union all
    select a.*,mm.role,2 source_rank from public.wf_ad_business_manager_memberships mm join public.wf_ad_business_managers bm using(business_manager_id) join public.wf_ad_business_manager_accounts ba using(business_manager_id) join public.wf_advertisers a using(advertiser_id) where mm.auth_user_id=auth.uid() and mm.status='active' and bm.status='active'
  ) q where p_advertiser_id is null or q.advertiser_id=p_advertiser_id
  order by q.source_rank,case q.role when 'advertiser_owner' then 1 when 'advertiser_admin' then 2 when 'advertiser_campaign_manager' then 3 when 'advertiser_creative' then 4 when 'advertiser_billing_manager' then 5 else 6 end,q.created_at limit 1;
  if not found or v_row.status<>'active' then return null; end if;
  return jsonb_build_object('advertiserId',v_row.advertiser_id,'displayName',v_row.display_name,'legalName',v_row.legal_name,'websiteUrl',v_row.website_url,'contactEmail',v_row.contact_email,'status',v_row.status,'reviewNotes',v_row.review_notes,'role',v_row.role);
end $$;

create or replace function public.advertiser_team_invite(p_advertiser_id text,p_email text,p_role text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_id text;v_email text:=lower(btrim(p_email));
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  if p_role not in ('advertiser_admin','advertiser_campaign_manager','advertiser_creative','advertiser_analyst','advertiser_billing_manager') then raise exception 'INVALID_ADVERTISER_ROLE' using errcode='22023'; end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_EMAIL' using errcode='22023'; end if;
  v_actor:=security.advertiser_actor();
  insert into public.wf_advertiser_memberships(advertiser_id,invite_email,role,status,invited_by_user_id) values(p_advertiser_id,v_email,p_role,'invited',v_actor) returning advertiser_membership_id into v_id;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),v_actor,'ADVERTISER_TEAM_INVITED','advertiser_membership',v_id,'workforce-domain-event',jsonb_build_object('advertiserId',p_advertiser_id,'role',p_role));
  return jsonb_build_object('membershipId',v_id,'status','invited');
end $$;

create or replace function public.advertiser_enterprise_context(p_advertiser_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not security.advertiser_can(p_advertiser_id,null) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  return jsonb_build_object(
    'businessManagers',coalesce((select jsonb_agg(jsonb_build_object('id',bm.business_manager_id,'name',bm.name,'status',bm.status)) from public.wf_ad_business_manager_accounts ba join public.wf_ad_business_managers bm using(business_manager_id) where ba.advertiser_id=p_advertiser_id),'[]'::jsonb),
    'adGroups',coalesce((select jsonb_agg(jsonb_build_object('id',g.ad_group_id,'campaignId',g.campaign_id,'name',g.name,'status',g.status,'deliveryEnabled',g.delivery_enabled,'buyingModel',g.buying_model,'bidMinor',g.bid_minor,'pacingMode',g.pacing_mode,'frequencyCap',g.daily_frequency_cap,'roleFamily',g.role_family,'topic',g.topic,'broadGeography',g.broad_geography,'timezone',g.schedule_timezone,'dayparting',g.dayparting,'placements',coalesce((select jsonb_agg(p.placement order by p.placement) from public.wf_ad_group_placements p where p.ad_group_id=g.ad_group_id and p.enabled),'[]'::jsonb)) order by g.created_at) from public.wf_ad_groups g join public.wf_ad_campaigns c using(campaign_id) where c.advertiser_id=p_advertiser_id),'[]'::jsonb),
    'creativeVersions',coalesce((select jsonb_agg(jsonb_build_object('id',v.creative_version_id,'creativeId',v.creative_id,'version',v.version_number,'status',v.status,'createdAt',v.created_at) order by v.created_at desc) from public.wf_ad_creative_versions v join public.wf_ad_creatives cr using(creative_id) join public.wf_ad_campaigns c using(campaign_id) where c.advertiser_id=p_advertiser_id),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'entityType',e.entity_type,'entityId',e.entity_id,'createdAt',e.created_at,'before',e.before_json,'after',e.after_json) order by e.created_at desc) from (select * from public.platform_audit_events where entity_type in ('ad_campaign','ad_group','ad_creative','ad_bulk_operation') and (after_json->>'advertiserId'=p_advertiser_id or entity_id in (select campaign_id from public.wf_ad_campaigns where advertiser_id=p_advertiser_id)) order by created_at desc limit 100) e),'[]'::jsonb)
  );
end $$;

create or replace function public.advertiser_business_manager_link(p_business_manager_id text,p_advertiser_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;
begin
  if not exists(select 1 from public.wf_ad_business_manager_memberships m join public.wf_ad_business_managers b using(business_manager_id) where m.business_manager_id=p_business_manager_id and m.auth_user_id=auth.uid() and m.status='active' and m.role in ('advertiser_owner','advertiser_admin') and b.status='active') then raise exception 'BUSINESS_MANAGER_ACCESS_DENIED' using errcode='42501'; end if;
  if not exists(select 1 from public.wf_advertiser_memberships m where m.advertiser_id=p_advertiser_id and m.auth_user_id=auth.uid() and m.status='active' and m.role in ('advertiser_owner','advertiser_admin')) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  v_actor:=security.advertiser_actor();insert into public.wf_ad_business_manager_accounts(business_manager_id,advertiser_id,created_by_user_id) values(p_business_manager_id,p_advertiser_id,v_actor) on conflict do nothing;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),v_actor,'AD_BUSINESS_MANAGER_ACCOUNT_LINKED','ad_business_manager',p_business_manager_id,'workforce-domain-event',jsonb_build_object('advertiserId',p_advertiser_id));
  return jsonb_build_object('businessManagerId',p_business_manager_id,'advertiserId',p_advertiser_id,'status','linked');
end $$;

create or replace function public.advertiser_ad_group_save(p_advertiser_id text,p_campaign_id text,p_ad_group_id text,p_name text,p_buying_model text,p_bid_minor bigint,p_pacing_mode text,p_frequency_cap integer,p_role_family text,p_topic text,p_broad_geography text,p_timezone text,p_dayparting jsonb,p_placements text[])
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_group text;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  if not exists(select 1 from public.wf_ad_campaigns where campaign_id=p_campaign_id and advertiser_id=p_advertiser_id and status in ('draft','rejected')) then raise exception 'CAMPAIGN_NOT_EDITABLE' using errcode='55000'; end if;
  if p_buying_model not in ('fixed_cpm','fixed_cpc') or p_pacing_mode not in ('even','accelerated') or p_bid_minor<0 or p_frequency_cap not between 1 and 20 or cardinality(p_placements)=0 or not(p_placements <@ array['in_feed','in_comments','in_article','multiplex']::text[]) then raise exception 'INVALID_AD_GROUP' using errcode='22023'; end if;
  v_actor:=security.advertiser_actor();
  if p_ad_group_id is null then
    insert into public.wf_ad_groups(campaign_id,name,buying_model,bid_minor,pacing_mode,daily_frequency_cap,role_family,topic,broad_geography,schedule_timezone,dayparting,created_by_user_id)
    values(p_campaign_id,btrim(p_name),p_buying_model,p_bid_minor,p_pacing_mode,p_frequency_cap,nullif(p_role_family,''),nullif(btrim(p_topic),''),nullif(btrim(p_broad_geography),''),coalesce(nullif(btrim(p_timezone),''),'UTC'),coalesce(p_dayparting,'[]'::jsonb),v_actor) returning ad_group_id into v_group;
  else
    update public.wf_ad_groups g set name=btrim(p_name),buying_model=p_buying_model,bid_minor=p_bid_minor,pacing_mode=p_pacing_mode,daily_frequency_cap=p_frequency_cap,role_family=nullif(p_role_family,''),topic=nullif(btrim(p_topic),''),broad_geography=nullif(btrim(p_broad_geography),''),schedule_timezone=coalesce(nullif(btrim(p_timezone),''),'UTC'),dayparting=coalesce(p_dayparting,'[]'::jsonb),updated_at=now()
    from public.wf_ad_campaigns c where g.ad_group_id=p_ad_group_id and g.campaign_id=p_campaign_id and c.campaign_id=g.campaign_id and c.advertiser_id=p_advertiser_id and c.status in ('draft','rejected') returning g.ad_group_id into v_group;
    if v_group is null then raise exception 'AD_GROUP_NOT_EDITABLE' using errcode='55000'; end if;
  end if;
  delete from public.wf_ad_group_placements where ad_group_id=v_group;
  insert into public.wf_ad_group_placements(ad_group_id,placement) select v_group,x from unnest(p_placements) x;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),v_actor,'AD_GROUP_DRAFT_SAVED','ad_group',v_group,'workforce-domain-event',jsonb_build_object('advertiserId',p_advertiser_id,'campaignId',p_campaign_id));
  return jsonb_build_object('adGroupId',v_group,'status','draft');
end $$;

create or replace function public.advertiser_campaign_save_v2(p_advertiser_id text,p_campaign_id text,p_name text,p_objective text,p_budget_minor bigint,p_starts_at timestamptz,p_ends_at timestamptz,p_frequency_cap integer default 3,p_placements text[] default array['in_feed'],p_audience jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_campaign text;v_status text;v_created boolean:=false;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  select status into v_status from public.wf_advertisers where advertiser_id=p_advertiser_id;
  if v_status<>'active' then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  if p_objective not in ('brand_awareness','traffic','engagement','leads','conversions') or char_length(btrim(p_name)) not between 2 and 160 or p_budget_minor<0 or p_frequency_cap not between 1 and 20 or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'INVALID_CAMPAIGN' using errcode='22023'; end if;
  if not (p_placements <@ array['in_feed','in_comments','in_article','multiplex']::text[]) then raise exception 'INVALID_PLACEMENT' using errcode='22023'; end if;
  v_actor:=security.advertiser_actor();
  if p_campaign_id is null then
    insert into public.wf_ad_campaigns(advertiser_id,name,objective,budget_minor,starts_at,ends_at,daily_frequency_cap,created_by_user_id) values(p_advertiser_id,btrim(p_name),p_objective,p_budget_minor,p_starts_at,p_ends_at,p_frequency_cap,v_actor) returning campaign_id into v_campaign;v_created:=true;
  else
    update public.wf_ad_campaigns set name=btrim(p_name),objective=p_objective,budget_minor=p_budget_minor,starts_at=p_starts_at,ends_at=p_ends_at,daily_frequency_cap=p_frequency_cap,updated_at=now() where campaign_id=p_campaign_id and advertiser_id=p_advertiser_id and status in ('draft','rejected') returning campaign_id into v_campaign;
    if v_campaign is null then raise exception 'CAMPAIGN_NOT_EDITABLE' using errcode='55000'; end if;
  end if;
  delete from public.wf_ad_campaign_audiences where campaign_id=v_campaign;
  if coalesce(p_audience->>'roleFamily','')<>'' or coalesce(p_audience->>'topic','')<>'' or coalesce(p_audience->>'broadGeography','')<>'' then insert into public.wf_ad_campaign_audiences(campaign_id,role_family,topic,broad_geography) values(v_campaign,nullif(p_audience->>'roleFamily',''),nullif(btrim(p_audience->>'topic'),''),nullif(btrim(p_audience->>'broadGeography'),'')); end if;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),v_actor,'AD_CAMPAIGN_DRAFT_SAVED','ad_campaign',v_campaign,'workforce-domain-event',jsonb_build_object('advertiserId',p_advertiser_id,'created',v_created,'status','draft','objective',p_objective));
  return jsonb_build_object('campaignId',v_campaign,'status','draft');
end $$;

create or replace function public.advertiser_creative_version_save(p_advertiser_id text,p_campaign_id text,p_ad_group_id text,p_creative_id text,p_headline text,p_body text,p_media_url text,p_media_alt text,p_destination_url text,p_cta_label text,p_placements text[])
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_creative text;v_version integer;v_version_id text;v_hash text;v_campaign_status text;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager','advertiser_creative']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  select status into v_campaign_status from public.wf_ad_campaigns where campaign_id=p_campaign_id and advertiser_id=p_advertiser_id;
  if v_campaign_status not in ('draft','rejected','approved','scheduled','active','paused') then raise exception 'CAMPAIGN_NOT_EDITABLE' using errcode='55000'; end if;
  if not exists(select 1 from public.wf_ad_groups where ad_group_id=p_ad_group_id and campaign_id=p_campaign_id) then raise exception 'AD_GROUP_NOT_FOUND' using errcode='P0002'; end if;
  if btrim(p_destination_url) !~ '^https://' or (nullif(btrim(p_media_url),'') is not null and btrim(p_media_url) !~ '^https://') or cardinality(p_placements)=0 then raise exception 'INVALID_CREATIVE' using errcode='22023'; end if;
  v_actor:=security.advertiser_actor();v_hash:=md5(concat_ws(E'\n',btrim(p_headline),btrim(p_body),coalesce(nullif(btrim(p_media_url),''),''),coalesce(nullif(btrim(p_media_alt),''),''),btrim(p_destination_url),btrim(p_cta_label)));
  if p_creative_id is null then
    insert into public.wf_ad_creatives(campaign_id,ad_group_id,headline,body,media_url,media_alt,destination_url,cta_label,status) values(p_campaign_id,p_ad_group_id,btrim(p_headline),btrim(p_body),nullif(btrim(p_media_url),''),nullif(btrim(p_media_alt),''),btrim(p_destination_url),btrim(p_cta_label),'draft') returning creative_id into v_creative;
    v_version:=1;
  else
    select coalesce(max(version_number),0)+1 into v_version from public.wf_ad_creative_versions where creative_id=p_creative_id;
    select creative_id into v_creative from public.wf_ad_creatives where creative_id=p_creative_id and campaign_id=p_campaign_id and ad_group_id=p_ad_group_id;
    if v_creative is null then raise exception 'CREATIVE_NOT_FOUND' using errcode='P0002'; end if;
  end if;
  insert into public.wf_ad_creative_versions(creative_id,version_number,status,headline,body,media_url,media_alt,destination_url,cta_label,content_hash,created_by_user_id)
  values(v_creative,v_version,'draft',btrim(p_headline),btrim(p_body),nullif(btrim(p_media_url),''),nullif(btrim(p_media_alt),''),btrim(p_destination_url),btrim(p_cta_label),v_hash,v_actor)
  on conflict(creative_id,content_hash) do update set created_at=public.wf_ad_creative_versions.created_at returning creative_version_id,version_number into v_version_id,v_version;
  delete from public.wf_ad_creative_version_placements where creative_version_id=v_version_id;
  insert into public.wf_ad_creative_version_placements(creative_version_id,placement) select v_version_id,x from unnest(p_placements) x;
  if v_campaign_status in ('draft','rejected') then
    update public.wf_ad_creatives set headline=btrim(p_headline),body=btrim(p_body),media_url=nullif(btrim(p_media_url),''),media_alt=nullif(btrim(p_media_alt),''),destination_url=btrim(p_destination_url),cta_label=btrim(p_cta_label),status='draft',updated_at=now() where creative_id=v_creative;
    delete from public.wf_ad_campaign_placements where creative_id=v_creative;
    insert into public.wf_ad_campaign_placements(campaign_id,creative_id,placement,enabled) select p_campaign_id,v_creative,x,false from unnest(p_placements) x;
  end if;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),v_actor,'AD_CREATIVE_VERSION_CREATED','ad_creative',v_creative,'workforce-domain-event',jsonb_build_object('advertiserId',p_advertiser_id,'campaignId',p_campaign_id,'version',v_version));
  return jsonb_build_object('creativeId',v_creative,'version',v_version,'status','draft');
end $$;

-- Compatibility entry point for clients deployed before the hierarchy UI.
create or replace function public.advertiser_creative_save(p_advertiser_id text,p_campaign_id text,p_creative_id text,p_headline text,p_body text,p_media_url text,p_media_alt text,p_destination_url text,p_cta_label text,p_placements text[])
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_group text;v_actor text;
begin
  select ad_group_id into v_group from public.wf_ad_groups where campaign_id=p_campaign_id order by created_at limit 1;
  if v_group is null then
    if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager','advertiser_creative']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
    v_actor:=security.advertiser_actor();insert into public.wf_ad_groups(campaign_id,name,daily_frequency_cap,created_by_user_id) select campaign_id,'Default ad group',daily_frequency_cap,v_actor from public.wf_ad_campaigns where campaign_id=p_campaign_id and advertiser_id=p_advertiser_id returning ad_group_id into v_group;
    insert into public.wf_ad_group_placements(ad_group_id,placement) select v_group,x from unnest(p_placements) x;
  end if;
  return public.advertiser_creative_version_save(p_advertiser_id,p_campaign_id,v_group,p_creative_id,p_headline,p_body,p_media_url,p_media_alt,p_destination_url,p_cta_label,p_placements);
end $$;

create or replace function public.advertiser_bulk_action(p_advertiser_id text,p_idempotency_key text,p_entity_type text,p_action text,p_entity_ids text[])
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_result jsonb;v_count integer:=0;v_campaign text;v_group text;v_creative text;r_campaign record;r_group record;r_creative record;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  select result into v_result from public.wf_ad_bulk_operation_receipts where advertiser_id=p_advertiser_id and idempotency_key=p_idempotency_key;
  if found then return v_result; end if;
  if cardinality(p_entity_ids) not between 1 and 100 or p_action not in ('pause','resume','duplicate') then raise exception 'INVALID_BULK_OPERATION' using errcode='22023'; end if;
  if p_entity_type='campaign' and p_action='duplicate' then
    v_actor:=security.advertiser_actor();
    for r_campaign in select * from public.wf_ad_campaigns where advertiser_id=p_advertiser_id and campaign_id=any(p_entity_ids) loop
      insert into public.wf_ad_campaigns(advertiser_id,name,objective,status,starts_at,ends_at,budget_minor,currency,daily_frequency_cap,created_by_user_id)
      values(p_advertiser_id,left('Copy of '||r_campaign.name,160),r_campaign.objective,'draft',r_campaign.starts_at,r_campaign.ends_at,r_campaign.budget_minor,r_campaign.currency,r_campaign.daily_frequency_cap,v_actor) returning campaign_id into v_campaign;
      insert into public.wf_ad_campaign_audiences(campaign_id,role_family,topic,broad_geography,public_group_id) select v_campaign,role_family,topic,broad_geography,public_group_id from public.wf_ad_campaign_audiences where campaign_id=r_campaign.campaign_id;
      for r_group in select * from public.wf_ad_groups where campaign_id=r_campaign.campaign_id loop
        insert into public.wf_ad_groups(campaign_id,name,status,delivery_enabled,buying_model,bid_minor,pacing_mode,daily_frequency_cap,role_family,topic,broad_geography,schedule_timezone,dayparting,created_by_user_id)
        values(v_campaign,r_group.name,'draft',true,r_group.buying_model,r_group.bid_minor,r_group.pacing_mode,r_group.daily_frequency_cap,r_group.role_family,r_group.topic,r_group.broad_geography,r_group.schedule_timezone,r_group.dayparting,v_actor) returning ad_group_id into v_group;
        insert into public.wf_ad_group_placements(ad_group_id,placement,enabled) select v_group,placement,true from public.wf_ad_group_placements where ad_group_id=r_group.ad_group_id;
        for r_creative in select * from public.wf_ad_creatives where ad_group_id=r_group.ad_group_id loop
          insert into public.wf_ad_creatives(campaign_id,ad_group_id,status,headline,body,media_url,media_alt,destination_url,cta_label,delivery_enabled)
          values(v_campaign,v_group,'draft',r_creative.headline,r_creative.body,r_creative.media_url,r_creative.media_alt,r_creative.destination_url,r_creative.cta_label,true) returning creative_id into v_creative;
          insert into public.wf_ad_creative_versions(creative_id,version_number,status,headline,body,media_url,media_alt,destination_url,cta_label,content_hash,created_by_user_id)
          values(v_creative,1,'draft',r_creative.headline,r_creative.body,r_creative.media_url,r_creative.media_alt,r_creative.destination_url,r_creative.cta_label,md5(concat_ws(E'\n',r_creative.headline,r_creative.body,coalesce(r_creative.media_url,''),coalesce(r_creative.media_alt,''),r_creative.destination_url,r_creative.cta_label)),v_actor);
          insert into public.wf_ad_campaign_placements(campaign_id,creative_id,placement,enabled,priority,min_organic_items) select v_campaign,v_creative,placement,false,priority,min_organic_items from public.wf_ad_campaign_placements where creative_id=r_creative.creative_id;
          insert into public.wf_ad_creative_version_placements(creative_version_id,placement) select v.creative_version_id,p.placement from public.wf_ad_creative_versions v join public.wf_ad_campaign_placements p on p.creative_id=v.creative_id where v.creative_id=v_creative;
        end loop;
      end loop;
      v_count:=v_count+1;
    end loop;
  elsif p_entity_type='campaign' and p_action in ('pause','resume') then
    update public.wf_ad_campaigns set status=case when p_action='pause' then 'paused' else case when starts_at>now() then 'scheduled' else 'active' end end,updated_at=now()
    where advertiser_id=p_advertiser_id and campaign_id=any(p_entity_ids) and ((p_action='pause' and status in ('active','scheduled')) or (p_action='resume' and status='paused' and exists(select 1 from public.wf_ad_funding_authorizations f where f.campaign_id=wf_ad_campaigns.campaign_id and f.revoked_at is null)));
    get diagnostics v_count=row_count;
  elsif p_entity_type='ad_group' and p_action in ('pause','resume') then
    update public.wf_ad_groups g set status=case when p_action='pause' then 'paused' else 'active' end,delivery_enabled=(p_action='resume'),disabled_reason=case when p_action='pause' then 'Bulk paused by advertiser' else null end,updated_at=now()
    from public.wf_ad_campaigns c where g.campaign_id=c.campaign_id and c.advertiser_id=p_advertiser_id and g.ad_group_id=any(p_entity_ids);get diagnostics v_count=row_count;
    update public.wf_ad_campaign_placements cp set enabled=(p_action='resume'),updated_at=now()
    from public.wf_ad_creatives cr,public.wf_ad_campaigns c where cp.creative_id=cr.creative_id and cr.ad_group_id=any(p_entity_ids) and cr.campaign_id=c.campaign_id and c.advertiser_id=p_advertiser_id and c.status in ('active','scheduled','approved','paused');
  elsif p_entity_type='ad' and p_action in ('pause','resume') then
    update public.wf_ad_creatives cr set delivery_enabled=(p_action='resume'),disabled_reason=case when p_action='pause' then 'Bulk paused by advertiser' else null end,updated_at=now()
    from public.wf_ad_campaigns c where cr.campaign_id=c.campaign_id and c.advertiser_id=p_advertiser_id and cr.creative_id=any(p_entity_ids);get diagnostics v_count=row_count;
    update public.wf_ad_campaign_placements cp set enabled=(p_action='resume'),updated_at=now()
    from public.wf_ad_creatives cr,public.wf_ad_campaigns c where cp.creative_id=cr.creative_id and cr.creative_id=any(p_entity_ids) and cr.campaign_id=c.campaign_id and c.advertiser_id=p_advertiser_id and c.status in ('active','scheduled','approved','paused');
  else raise exception 'INVALID_BULK_OPERATION' using errcode='22023'; end if;
  v_result:=jsonb_build_object('entityType',p_entity_type,'action',p_action,'requested',cardinality(p_entity_ids),'changed',v_count,'idempotencyKey',p_idempotency_key);
  v_actor:=security.advertiser_actor();insert into public.wf_ad_bulk_operation_receipts(advertiser_id,idempotency_key,entity_type,action,requested_ids,result,actor_user_id) values(p_advertiser_id,p_idempotency_key,p_entity_type,p_action,p_entity_ids,v_result,v_actor);
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),v_actor,'AD_BULK_OPERATION_COMPLETED','ad_bulk_operation',p_idempotency_key,'workforce-domain-event',v_result||jsonb_build_object('advertiserId',p_advertiser_id));
  return v_result;
end $$;

create or replace function public.advertiser_funding_order_create(p_advertiser_id text,p_campaign_id text,p_amount_minor bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_id uuid;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_billing_manager']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  if p_amount_minor<100 then raise exception 'INVALID_FUNDING_AMOUNT' using errcode='22023'; end if;
  if p_campaign_id is not null and not exists(select 1 from public.wf_ad_campaigns where campaign_id=p_campaign_id and advertiser_id=p_advertiser_id and status in ('draft','rejected')) then raise exception 'CAMPAIGN_NOT_FUNDABLE' using errcode='55000'; end if;
  v_actor:=security.advertiser_actor();insert into public.wf_advertiser_funding_orders(advertiser_id,campaign_id,amount_minor,created_by_user_id) values(p_advertiser_id,p_campaign_id,p_amount_minor,v_actor) returning funding_order_id into v_id;
  return jsonb_build_object('fundingOrderId',v_id,'status','pending');
end $$;

create or replace function public.advertiser_campaign_action_v2(p_advertiser_id text,p_campaign_id text,p_action text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_current text;v_next text;v_budget bigint;v_allocated bigint;v_credit bigint;v_delta bigint;v_ref text;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  perform 1 from public.wf_advertisers where advertiser_id=p_advertiser_id for update;
  select status,budget_minor into v_current,v_budget from public.wf_ad_campaigns where campaign_id=p_campaign_id and advertiser_id=p_advertiser_id for update;
  if p_action='submit' and v_current in ('draft','rejected') then
    if v_budget<=0 then raise exception 'POSITIVE_BUDGET_REQUIRED' using errcode='23514'; end if;
    if not exists(select 1 from public.wf_ad_groups where campaign_id=p_campaign_id) then raise exception 'AD_GROUP_REQUIRED' using errcode='23514'; end if;
    if not exists(select 1 from public.wf_ad_creatives where campaign_id=p_campaign_id) then raise exception 'CREATIVE_REQUIRED' using errcode='23514'; end if;
    select coalesce(sum(case when entry_type='allocation_revoked' then -abs(amount_minor) else amount_minor end),0) into v_allocated from public.wf_ad_budget_ledger where campaign_id=p_campaign_id and entry_type in ('allocation_authorized','allocation_revoked','adjustment');
    select coalesce(sum(amount_minor),0) into v_credit from public.wf_advertiser_credit_ledger where advertiser_id=p_advertiser_id;v_delta:=v_budget-v_allocated;
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
    if not exists(select 1 from public.wf_ad_funding_authorizations where campaign_id=p_campaign_id and revoked_at is null) then raise exception 'FUNDING_AUTHORIZATION_REQUIRED' using errcode='23514'; end if;v_next:=case when (select starts_at from public.wf_ad_campaigns where campaign_id=p_campaign_id)>now() then 'scheduled' else 'active' end;
  elsif p_action='cancel' and v_current not in ('completed','cancelled') then v_next:='cancelled';
  else raise exception 'INVALID_CAMPAIGN_TRANSITION' using errcode='55000'; end if;
  update public.wf_ad_campaigns set status=v_next,updated_at=now() where campaign_id=p_campaign_id;
  if v_next='submitted' then insert into public.wf_ad_reviews(advertiser_id,campaign_id,decision,notes) values(p_advertiser_id,p_campaign_id,'submitted',null); end if;
  v_actor:=coalesce(v_actor,security.advertiser_actor());insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json) values(auth.uid(),v_actor,'AD_CAMPAIGN_STATUS_CHANGED','ad_campaign',p_campaign_id,'workforce-domain-event',jsonb_build_object('status',v_current),jsonb_build_object('advertiserId',p_advertiser_id,'status',v_next));
  return jsonb_build_object('campaignId',p_campaign_id,'status',v_next);
end $$;

create or replace function public.advertiser_creative_version_submit(p_advertiser_id text,p_creative_version_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_campaign text;v_creative text;v_status text;
begin
  select c.campaign_id,cr.creative_id,v.status into v_campaign,v_creative,v_status from public.wf_ad_creative_versions v join public.wf_ad_creatives cr using(creative_id) join public.wf_ad_campaigns c using(campaign_id) where v.creative_version_id=p_creative_version_id and c.advertiser_id=p_advertiser_id for update of v;
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager','advertiser_creative']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  if v_status<>'draft' or not exists(select 1 from public.wf_ad_campaigns where campaign_id=v_campaign and status in ('approved','scheduled','active','paused')) then raise exception 'CREATIVE_VERSION_NOT_SUBMITTABLE' using errcode='55000'; end if;
  if not exists(select 1 from public.wf_ad_funding_authorizations where campaign_id=v_campaign and revoked_at is null) then raise exception 'FUNDING_AUTHORIZATION_REQUIRED' using errcode='23514'; end if;
  update public.wf_ad_creative_versions set status='submitted' where creative_version_id=p_creative_version_id;
  insert into public.wf_ad_reviews(advertiser_id,campaign_id,creative_id,creative_version_id,decision) values(p_advertiser_id,v_campaign,v_creative,p_creative_version_id,'submitted');
  v_actor:=security.advertiser_actor();insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),v_actor,'AD_CREATIVE_STATUS_CHANGED','ad_creative_version',p_creative_version_id,'workforce-domain-event',jsonb_build_object('advertiserId',p_advertiser_id,'campaignId',v_campaign,'status','submitted'));
  return jsonb_build_object('creativeVersionId',p_creative_version_id,'status','submitted');
end $$;

create or replace function public.advertiser_admin_version_queue()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not security.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',v.creative_version_id,'version',v.version_number,'advertiserId',c.advertiser_id,'advertiserName',a.display_name,'campaignId',c.campaign_id,'campaignName',c.name,'creativeId',cr.creative_id,'headline',v.headline,'body',v.body,'mediaUrl',v.media_url,'mediaAlt',v.media_alt,'destinationUrl',v.destination_url,'ctaLabel',v.cta_label,'placements',coalesce((select jsonb_agg(p.placement order by p.placement) from public.wf_ad_creative_version_placements p where p.creative_version_id=v.creative_version_id),'[]'::jsonb),'createdAt',v.created_at) order by v.created_at) from public.wf_ad_creative_versions v join public.wf_ad_creatives cr using(creative_id) join public.wf_ad_campaigns c using(campaign_id) join public.wf_advertisers a using(advertiser_id) where v.status='submitted'),'[]'::jsonb);
end $$;

create or replace function public.advertiser_admin_creative_version_review(p_creative_version_id text,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_version public.wf_ad_creative_versions%rowtype;v_campaign text;v_advertiser text;v_after text;
begin
  if not security.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_decision not in ('approved','rejected','changes_requested') then raise exception 'INVALID_REVIEW_DECISION' using errcode='22023'; end if;
  select v.* into v_version from public.wf_ad_creative_versions v where v.creative_version_id=p_creative_version_id for update;
  if not found or v_version.status<>'submitted' then raise exception 'CREATIVE_VERSION_NOT_REVIEWABLE' using errcode='55000'; end if;
  select c.campaign_id,c.advertiser_id into v_campaign,v_advertiser from public.wf_ad_creatives cr join public.wf_ad_campaigns c using(campaign_id) where cr.creative_id=v_version.creative_id;
  if p_decision='approved' then
    if not exists(select 1 from public.wf_ad_funding_authorizations where campaign_id=v_campaign and revoked_at is null) then raise exception 'CAMPAIGN_BUDGET_NOT_FUNDED' using errcode='23514'; end if;
    update public.wf_ad_creative_versions set status='superseded' where creative_id=v_version.creative_id and status='approved';v_after:='approved';
    update public.wf_ad_creatives set headline=v_version.headline,body=v_version.body,media_url=v_version.media_url,media_alt=v_version.media_alt,destination_url=v_version.destination_url,cta_label=v_version.cta_label,status='approved',updated_at=now() where creative_id=v_version.creative_id;
    delete from public.wf_ad_campaign_placements where creative_id=v_version.creative_id;
    insert into public.wf_ad_campaign_placements(campaign_id,creative_id,placement,enabled) select v_campaign,v_version.creative_id,placement,true from public.wf_ad_creative_version_placements where creative_version_id=p_creative_version_id;
  else v_after:=case when p_decision='changes_requested' then 'draft' else 'rejected' end; end if;
  v_actor:=security.advertiser_actor();update public.wf_ad_creative_versions set status=v_after,reviewed_by_user_id=v_actor,reviewed_at=now(),review_notes=nullif(btrim(p_notes),'') where creative_version_id=p_creative_version_id;
  insert into public.wf_ad_reviews(advertiser_id,campaign_id,creative_id,creative_version_id,decision,notes,reviewed_by_user_id) values(v_advertiser,v_campaign,v_version.creative_id,p_creative_version_id,p_decision,nullif(btrim(p_notes),''),v_actor);
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json) values(auth.uid(),v_actor,'AD_CREATIVE_STATUS_CHANGED','ad_creative_version',p_creative_version_id,'workforce-domain-event',jsonb_build_object('status','submitted'),jsonb_build_object('advertiserId',v_advertiser,'campaignId',v_campaign,'status',v_after,'decision',p_decision));
  return jsonb_build_object('creativeVersionId',p_creative_version_id,'status',v_after);
end $$;

create or replace function public.ads_enterprise_review_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.campaign_id is null or new.creative_version_id is not null then return new; end if;
  if new.decision='submitted' then
    update public.wf_ad_groups set status='submitted',updated_at=now() where campaign_id=new.campaign_id;
    update public.wf_ad_creative_versions set status='submitted' where creative_id in (select creative_id from public.wf_ad_creatives where campaign_id=new.campaign_id) and status='draft';
  elsif new.decision in ('approved','rejected','changes_requested') then
    perform public.ads_enterprise_sync_review(new.campaign_id,new.decision,new.reviewed_by_user_id,new.notes);
  end if;
  return new;
end $$;
drop trigger if exists wf_ad_reviews_enterprise_sync on public.wf_ad_reviews;
create trigger wf_ad_reviews_enterprise_sync after insert on public.wf_ad_reviews for each row execute function public.ads_enterprise_review_trigger();

-- Campaign review now carries the hierarchy and immutable version state forward.
create or replace function public.ads_enterprise_sync_review(p_campaign_id text,p_decision text,p_actor text,p_notes text)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not security.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  update public.wf_ad_groups set status=case when p_decision='approved' then 'approved' when p_decision='changes_requested' then 'draft' else 'rejected' end,updated_at=now() where campaign_id=p_campaign_id;
  if p_decision='approved' then
    update public.wf_ad_creative_versions set status='superseded' where creative_id in (select creative_id from public.wf_ad_creatives where campaign_id=p_campaign_id) and status='approved';
    update public.wf_ad_creative_versions v set status='approved',reviewed_by_user_id=p_actor,reviewed_at=now(),review_notes=nullif(btrim(p_notes),'') where v.creative_version_id in (select v2.creative_version_id from public.wf_ad_creative_versions v2 where v2.creative_id=v.creative_id and v2.status in ('draft','submitted') order by v2.version_number desc limit 1);
  else
    update public.wf_ad_creative_versions set status=case when p_decision='changes_requested' then 'draft' else 'rejected' end,reviewed_by_user_id=p_actor,reviewed_at=now(),review_notes=nullif(btrim(p_notes),'') where creative_id in (select creative_id from public.wf_ad_creatives where campaign_id=p_campaign_id) and status in ('draft','submitted');
  end if;
end $$;

revoke all on function public.advertiser_enterprise_context(text),public.advertiser_business_manager_link(text,text),public.advertiser_campaign_save_v2(text,text,text,text,bigint,timestamptz,timestamptz,integer,text[],jsonb),public.advertiser_ad_group_save(text,text,text,text,text,bigint,text,integer,text,text,text,text,jsonb,text[]),public.advertiser_creative_version_save(text,text,text,text,text,text,text,text,text,text,text[]),public.advertiser_creative_version_submit(text,text),public.advertiser_bulk_action(text,text,text,text,text[]),public.advertiser_campaign_action_v2(text,text,text),public.advertiser_admin_version_queue(),public.advertiser_admin_creative_version_review(text,text,text),public.ads_enterprise_sync_review(text,text,text,text),public.ads_enterprise_review_trigger(),public.ads_create_default_business_manager() from public,anon,authenticated;
grant execute on function public.advertiser_enterprise_context(text),public.advertiser_business_manager_link(text,text),public.advertiser_campaign_save_v2(text,text,text,text,bigint,timestamptz,timestamptz,integer,text[],jsonb),public.advertiser_ad_group_save(text,text,text,text,text,bigint,text,integer,text,text,text,text,jsonb,text[]),public.advertiser_creative_version_save(text,text,text,text,text,text,text,text,text,text,text[]),public.advertiser_creative_version_submit(text,text),public.advertiser_bulk_action(text,text,text,text,text[]),public.advertiser_campaign_action_v2(text,text,text) to authenticated;
grant execute on function public.advertiser_admin_version_queue(),public.advertiser_admin_creative_version_review(text,text,text) to authenticated,service_role;
grant execute on function public.ads_enterprise_sync_review(text,text,text,text) to service_role;
