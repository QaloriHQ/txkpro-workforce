-- ADS-07..10: reusable audiences, creative library, asset storage, rate-card
-- estimates, and draft editing support for the enterprise Ads Manager.

alter table public.wf_ad_campaigns
  add column if not exists daily_spend_cap_minor bigint,
  add constraint wf_ad_campaigns_daily_spend_cap_check
    check (daily_spend_cap_minor is null or daily_spend_cap_minor > 0);

create table public.wf_ad_audiences (
  audience_id text primary key default security.new_legacy_id('AUA'),
  advertiser_id text not null references public.wf_advertisers(advertiser_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  audience_type text not null default 'contextual'
    check (audience_type in ('contextual','crm','retargeting','lookalike')),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  role_family text check (role_family is null or role_family in ('student','institution','employer','platform','member')),
  topic text check (topic is null or char_length(btrim(topic)) between 1 and 64),
  broad_geography text check (broad_geography is null or char_length(btrim(broad_geography)) between 2 and 120),
  mapbox_place_id text,
  neighborhood text check (neighborhood is null or char_length(btrim(neighborhood)) between 2 and 160),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  radius_m integer check (radius_m is null or radius_m between 500 and 50000),
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (audience_type <> 'contextual' or num_nonnulls(role_family,topic,broad_geography,neighborhood) > 0),
  check ((longitude is null and latitude is null and radius_m is null) or (longitude is not null and latitude is not null and radius_m is not null)),
  unique (advertiser_id,name)
);

alter table public.wf_ad_groups
  add column if not exists audience_id text references public.wf_ad_audiences(audience_id) on delete set null;

create table public.wf_ad_assets (
  asset_id text primary key default security.new_legacy_id('AST'),
  advertiser_id text not null references public.wf_advertisers(advertiser_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  media_type text not null check (media_type in ('image','video')),
  storage_bucket text not null default 'ad-assets' check (storage_bucket='ad-assets'),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
  byte_size bigint not null check (byte_size between 1 and 104857600),
  alt_text text check (alt_text is null or char_length(alt_text) <= 240),
  status text not null default 'active' check (status in ('active','archived')),
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wf_ad_creative_sets (
  creative_set_id text primary key default security.new_legacy_id('CRS'),
  advertiser_id text not null references public.wf_advertisers(advertiser_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (advertiser_id,name)
);

create table public.wf_ad_creative_variations (
  variation_id text primary key default security.new_legacy_id('VAR'),
  creative_set_id text not null references public.wf_ad_creative_sets(creative_set_id) on delete cascade,
  asset_id text references public.wf_ad_assets(asset_id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  headline text not null check (char_length(btrim(headline)) between 2 and 120),
  body text not null check (char_length(btrim(body)) between 2 and 500),
  destination_url text not null check (destination_url ~ '^https://'),
  cta_label text not null check (char_length(btrim(cta_label)) between 2 and 40),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creative_set_id,name)
);

create table public.wf_ad_group_variations (
  ad_group_id text not null references public.wf_ad_groups(ad_group_id) on delete cascade,
  variation_id text not null references public.wf_ad_creative_variations(variation_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ad_group_id,variation_id)
);

create table public.wf_ad_rate_cards (
  rate_card_id text primary key default security.new_legacy_id('RAT'),
  placement text not null check (placement in ('in_feed','in_comments','in_article','multiplex')),
  buying_model text not null check (buying_model in ('fixed_cpm','fixed_cpc')),
  rate_minor bigint not null check (rate_minor > 0),
  estimated_ctr numeric(8,6) check (estimated_ctr is null or estimated_ctr > 0 and estimated_ctr <= 1),
  status text not null default 'inactive' check (status in ('inactive','active','retired')),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create unique index wf_ad_rate_cards_active_idx
  on public.wf_ad_rate_cards(placement,buying_model) where status='active';
create index wf_ad_audiences_advertiser_idx on public.wf_ad_audiences(advertiser_id,status,created_at desc);
create index wf_ad_assets_advertiser_idx on public.wf_ad_assets(advertiser_id,status,created_at desc);
create index wf_ad_creative_sets_advertiser_idx on public.wf_ad_creative_sets(advertiser_id,status,created_at desc);
create index wf_ad_creative_variations_set_idx on public.wf_ad_creative_variations(creative_set_id,status,created_at);
create index wf_ad_creative_variations_asset_idx on public.wf_ad_creative_variations(asset_id) where asset_id is not null;
create index wf_ad_groups_audience_idx on public.wf_ad_groups(audience_id) where audience_id is not null;
create index wf_ad_group_variations_variation_idx on public.wf_ad_group_variations(variation_id);

alter table public.wf_ad_audiences enable row level security;
alter table public.wf_ad_assets enable row level security;
alter table public.wf_ad_creative_sets enable row level security;
alter table public.wf_ad_creative_variations enable row level security;
alter table public.wf_ad_group_variations enable row level security;
alter table public.wf_ad_rate_cards enable row level security;
revoke all on table public.wf_ad_audiences,public.wf_ad_assets,public.wf_ad_creative_sets,
  public.wf_ad_creative_variations,public.wf_ad_group_variations,public.wf_ad_rate_cards
  from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ad-assets','ad-assets',false,104857600,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.advertiser_manager_context(p_advertiser_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not security.advertiser_can(p_advertiser_id,null) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  return jsonb_build_object(
    'campaignDrafts',coalesce((select jsonb_agg(jsonb_build_object('id',c.campaign_id,'objective',c.objective,'dailySpendCapMinor',c.daily_spend_cap_minor,'frequencyCap',c.daily_frequency_cap,'editable',c.status in ('draft','rejected')) order by c.created_at desc) from public.wf_ad_campaigns c where c.advertiser_id=p_advertiser_id),'[]'::jsonb),
    'audiences',coalesce((select jsonb_agg(jsonb_build_object('id',a.audience_id,'name',a.name,'type',a.audience_type,'status',a.status,'roleFamily',a.role_family,'topic',a.topic,'broadGeography',a.broad_geography,'mapboxPlaceId',a.mapbox_place_id,'neighborhood',a.neighborhood,'longitude',a.longitude,'latitude',a.latitude,'radiusM',a.radius_m) order by a.created_at desc) from public.wf_ad_audiences a where a.advertiser_id=p_advertiser_id),'[]'::jsonb),
    'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.asset_id,'name',a.name,'mediaType',a.media_type,'mimeType',a.mime_type,'byteSize',a.byte_size,'altText',a.alt_text,'url','/api/advertiser/assets/'||a.asset_id,'status',a.status) order by a.created_at desc) from public.wf_ad_assets a where a.advertiser_id=p_advertiser_id),'[]'::jsonb),
    'creativeSets',coalesce((select jsonb_agg(jsonb_build_object('id',s.creative_set_id,'name',s.name,'status',s.status,'variations',coalesce((select jsonb_agg(jsonb_build_object('id',v.variation_id,'name',v.name,'assetId',v.asset_id,'headline',v.headline,'body',v.body,'destinationUrl',v.destination_url,'ctaLabel',v.cta_label,'status',v.status) order by v.created_at) from public.wf_ad_creative_variations v where v.creative_set_id=s.creative_set_id),'[]'::jsonb)) order by s.created_at desc) from public.wf_ad_creative_sets s where s.advertiser_id=p_advertiser_id),'[]'::jsonb),
    'groupVariations',coalesce((select jsonb_agg(jsonb_build_object('adGroupId',l.ad_group_id,'variationId',l.variation_id)) from public.wf_ad_group_variations l join public.wf_ad_groups g using(ad_group_id) join public.wf_ad_campaigns c using(campaign_id) where c.advertiser_id=p_advertiser_id),'[]'::jsonb),
    'rateCards',coalesce((select jsonb_agg(jsonb_build_object('placement',r.placement,'buyingModel',r.buying_model,'rateMinor',r.rate_minor,'estimatedCtr',r.estimated_ctr)) from public.wf_ad_rate_cards r where r.status='active' and r.effective_from<=now() and (r.effective_to is null or r.effective_to>now())),'[]'::jsonb),
    'futureAudienceCapabilities',jsonb_build_object('crmUploads',false,'retargeting',false,'lookalikes',false)
  );
end $$;

create or replace function public.advertiser_audience_save(p_advertiser_id text,p_audience_id text,p_name text,p_role_family text,p_topic text,p_broad_geography text,p_mapbox_place_id text,p_neighborhood text,p_longitude double precision,p_latitude double precision,p_radius_m integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_id text;v_actor text;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  if char_length(btrim(p_name)) not between 2 and 120 or (coalesce(p_role_family,'')='' and coalesce(btrim(p_topic),'')='' and coalesce(btrim(p_broad_geography),'')='' and coalesce(btrim(p_neighborhood),'')='') then raise exception 'INVALID_AUDIENCE' using errcode='22023'; end if;
  if p_role_family is not null and p_role_family not in ('student','institution','employer','platform','member') then raise exception 'INVALID_AUDIENCE' using errcode='22023'; end if;
  if (p_longitude is null)<>(p_latitude is null) or (p_longitude is null)<>(p_radius_m is null) then raise exception 'INVALID_GEOFENCE' using errcode='22023'; end if;
  v_actor:=security.advertiser_actor();
  if p_audience_id is null then
    insert into public.wf_ad_audiences(advertiser_id,name,role_family,topic,broad_geography,mapbox_place_id,neighborhood,longitude,latitude,radius_m,created_by_user_id)
    values(p_advertiser_id,btrim(p_name),nullif(p_role_family,''),nullif(btrim(p_topic),''),nullif(btrim(p_broad_geography),''),nullif(btrim(p_mapbox_place_id),''),nullif(btrim(p_neighborhood),''),p_longitude,p_latitude,p_radius_m,v_actor) returning audience_id into v_id;
  else
    update public.wf_ad_audiences set name=btrim(p_name),role_family=nullif(p_role_family,''),topic=nullif(btrim(p_topic),''),broad_geography=nullif(btrim(p_broad_geography),''),mapbox_place_id=nullif(btrim(p_mapbox_place_id),''),neighborhood=nullif(btrim(p_neighborhood),''),longitude=p_longitude,latitude=p_latitude,radius_m=p_radius_m,updated_at=now() where audience_id=p_audience_id and advertiser_id=p_advertiser_id and audience_type='contextual' returning audience_id into v_id;
    if v_id is null then raise exception 'AUDIENCE_NOT_EDITABLE' using errcode='55000'; end if;
  end if;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),v_actor,'AD_AUDIENCE_SAVED','ad_audience',v_id,'workforce-domain-event',jsonb_build_object('advertiserId',p_advertiser_id,'audienceType','contextual'));
  return jsonb_build_object('audienceId',v_id,'status','draft');
end $$;

create or replace function public.advertiser_asset_register(p_advertiser_id text,p_name text,p_media_type text,p_storage_path text,p_mime_type text,p_byte_size bigint,p_alt_text text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_id text;v_actor text;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager','advertiser_creative']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  if p_storage_path !~ ('^'||p_advertiser_id||'/[0-9a-f-]{36}\.[a-z0-9]+$') or p_media_type not in ('image','video') or p_mime_type not in ('image/jpeg','image/png','image/webp','video/mp4','video/webm') or (p_media_type='image' and p_mime_type not like 'image/%') or (p_media_type='video' and p_mime_type not like 'video/%') then raise exception 'INVALID_ASSET' using errcode='22023'; end if;
  v_actor:=security.advertiser_actor();insert into public.wf_ad_assets(advertiser_id,name,media_type,storage_path,mime_type,byte_size,alt_text,created_by_user_id) values(p_advertiser_id,btrim(p_name),p_media_type,p_storage_path,p_mime_type,p_byte_size,nullif(btrim(p_alt_text),''),v_actor) returning asset_id into v_id;
  return jsonb_build_object('assetId',v_id,'url','/api/advertiser/assets/'||v_id);
end $$;

create or replace function public.advertiser_asset_access(p_asset_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_asset record;
begin
  select a.* into v_asset from public.wf_ad_assets a where a.asset_id=p_asset_id and a.status='active' and security.advertiser_can(a.advertiser_id,null);
  if not found then return null; end if;
  return jsonb_build_object('bucket',v_asset.storage_bucket,'path',v_asset.storage_path,'mimeType',v_asset.mime_type);
end $$;

create or replace function public.advertiser_creative_set_save(p_advertiser_id text,p_creative_set_id text,p_name text,p_variations jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_set text;v_actor text;v_item jsonb;v_variation text;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager','advertiser_creative']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  if char_length(btrim(p_name)) not between 2 and 120 or jsonb_typeof(p_variations)<>'array' or jsonb_array_length(p_variations) not between 1 and 20 then raise exception 'INVALID_CREATIVE_SET' using errcode='22023'; end if;
  v_actor:=security.advertiser_actor();
  if p_creative_set_id is null then insert into public.wf_ad_creative_sets(advertiser_id,name,created_by_user_id) values(p_advertiser_id,btrim(p_name),v_actor) returning creative_set_id into v_set;
  else update public.wf_ad_creative_sets set name=btrim(p_name),updated_at=now() where creative_set_id=p_creative_set_id and advertiser_id=p_advertiser_id and status<>'archived' returning creative_set_id into v_set; if v_set is null then raise exception 'CREATIVE_SET_NOT_EDITABLE' using errcode='55000'; end if; delete from public.wf_ad_creative_variations where creative_set_id=v_set; end if;
  for v_item in select value from jsonb_array_elements(p_variations) loop
    if char_length(btrim(v_item->>'name')) not between 2 and 120 or char_length(btrim(v_item->>'headline')) not between 2 and 120 or char_length(btrim(v_item->>'body')) not between 2 and 500 or coalesce(v_item->>'destinationUrl','') !~ '^https://' or char_length(btrim(v_item->>'ctaLabel')) not between 2 and 40 then raise exception 'INVALID_CREATIVE_VARIATION' using errcode='22023'; end if;
    if nullif(v_item->>'assetId','') is not null and not exists(select 1 from public.wf_ad_assets where asset_id=v_item->>'assetId' and advertiser_id=p_advertiser_id and status='active') then raise exception 'ASSET_NOT_FOUND' using errcode='P0002'; end if;
    insert into public.wf_ad_creative_variations(creative_set_id,asset_id,name,headline,body,destination_url,cta_label,created_by_user_id) values(v_set,nullif(v_item->>'assetId',''),btrim(v_item->>'name'),btrim(v_item->>'headline'),btrim(v_item->>'body'),btrim(v_item->>'destinationUrl'),btrim(v_item->>'ctaLabel'),v_actor) returning variation_id into v_variation;
  end loop;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),v_actor,'AD_CREATIVE_SET_SAVED','ad_creative_set',v_set,'workforce-domain-event',jsonb_build_object('advertiserId',p_advertiser_id,'variationCount',jsonb_array_length(p_variations)));
  return jsonb_build_object('creativeSetId',v_set,'status','draft');
end $$;

create or replace function public.advertiser_group_variation_attach(p_advertiser_id text,p_ad_group_id text,p_variation_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager','advertiser_creative']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  if not exists(select 1 from public.wf_ad_groups g join public.wf_ad_campaigns c using(campaign_id) where g.ad_group_id=p_ad_group_id and c.advertiser_id=p_advertiser_id and c.status in ('draft','rejected')) or not exists(select 1 from public.wf_ad_creative_variations v join public.wf_ad_creative_sets s using(creative_set_id) where v.variation_id=p_variation_id and s.advertiser_id=p_advertiser_id) then raise exception 'VARIATION_ATTACH_DENIED' using errcode='42501'; end if;
  insert into public.wf_ad_group_variations(ad_group_id,variation_id) values(p_ad_group_id,p_variation_id) on conflict do nothing;
  return jsonb_build_object('adGroupId',p_ad_group_id,'variationId',p_variation_id);
end $$;

create or replace function public.advertiser_ad_group_audience_set(p_advertiser_id text,p_ad_group_id text,p_audience_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_group text;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  if p_audience_id is not null and not exists(select 1 from public.wf_ad_audiences where audience_id=p_audience_id and advertiser_id=p_advertiser_id and status<>'archived') then raise exception 'AUDIENCE_NOT_FOUND' using errcode='P0002'; end if;
  update public.wf_ad_groups g set audience_id=p_audience_id,updated_at=now() from public.wf_ad_campaigns c where g.ad_group_id=p_ad_group_id and c.campaign_id=g.campaign_id and c.advertiser_id=p_advertiser_id and c.status in ('draft','rejected') returning g.ad_group_id into v_group;
  if v_group is null then raise exception 'AD_GROUP_NOT_EDITABLE' using errcode='55000'; end if;
  return jsonb_build_object('adGroupId',v_group,'audienceId',p_audience_id);
end $$;

create or replace function public.advertiser_campaign_budget_save(p_advertiser_id text,p_campaign_id text,p_daily_spend_cap_minor bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_budget bigint;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_campaign_manager']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  update public.wf_ad_campaigns set daily_spend_cap_minor=p_daily_spend_cap_minor,updated_at=now() where campaign_id=p_campaign_id and advertiser_id=p_advertiser_id and status in ('draft','rejected') returning budget_minor into v_budget;
  if v_budget is null then raise exception 'CAMPAIGN_NOT_EDITABLE' using errcode='55000'; end if;
  if p_daily_spend_cap_minor is null or p_daily_spend_cap_minor<=0 or p_daily_spend_cap_minor>v_budget then raise exception 'INVALID_DAILY_SPEND_CAP' using errcode='22023'; end if;
  return jsonb_build_object('campaignId',p_campaign_id,'dailySpendCapMinor',p_daily_spend_cap_minor);
end $$;

revoke all on function public.advertiser_manager_context(text),public.advertiser_audience_save(text,text,text,text,text,text,text,text,double precision,double precision,integer),public.advertiser_asset_register(text,text,text,text,text,bigint,text),public.advertiser_asset_access(text),public.advertiser_creative_set_save(text,text,text,jsonb),public.advertiser_group_variation_attach(text,text,text),public.advertiser_ad_group_audience_set(text,text,text),public.advertiser_campaign_budget_save(text,text,bigint) from public,anon,authenticated;
grant execute on function public.advertiser_manager_context(text),public.advertiser_audience_save(text,text,text,text,text,text,text,text,double precision,double precision,integer),public.advertiser_asset_register(text,text,text,text,text,bigint,text),public.advertiser_asset_access(text),public.advertiser_creative_set_save(text,text,text,jsonb),public.advertiser_group_variation_attach(text,text,text),public.advertiser_ad_group_audience_set(text,text,text),public.advertiser_campaign_budget_save(text,text,bigint) to authenticated;
