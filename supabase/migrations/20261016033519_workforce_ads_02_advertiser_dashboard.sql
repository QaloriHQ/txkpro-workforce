-- ADS-02: advertiser-only accounts and campaign management dashboard.
-- Advertiser memberships are intentionally isolated from app_role_memberships so
-- advertiser-only accounts cannot inherit Workforce tenant or community access.

alter table public.wf_advertisers
  add column if not exists website_url text,
  add column if not exists contact_email text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_user_id text references public.users(user_id) on delete set null,
  add column if not exists review_notes text;

alter table public.wf_advertisers
  drop constraint if exists wf_advertisers_website_url_check,
  add constraint wf_advertisers_website_url_check check (website_url is null or website_url ~ '^https://'),
  drop constraint if exists wf_advertisers_contact_email_check,
  add constraint wf_advertisers_contact_email_check check (contact_email is null or contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  drop constraint if exists wf_advertisers_review_notes_check,
  add constraint wf_advertisers_review_notes_check check (review_notes is null or char_length(review_notes) <= 4000);

create table if not exists public.wf_advertiser_memberships (
  advertiser_membership_id text primary key default security.new_legacy_id('ADM'),
  advertiser_id text not null references public.wf_advertisers(advertiser_id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  user_id text references public.users(user_id) on delete cascade,
  invite_email text not null,
  role text not null check (role in ('advertiser_owner','advertiser_admin','advertiser_creative','advertiser_analyst')),
  status text not null default 'invited' check (status in ('invited','active','suspended','revoked')),
  invited_by_user_id text references public.users(user_id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (advertiser_id,invite_email),
  check ((status='invited' and auth_user_id is null and user_id is null) or status<>'invited')
);
create unique index if not exists wf_advertiser_memberships_scope_auth_idx
  on public.wf_advertiser_memberships(advertiser_id,auth_user_id) where auth_user_id is not null;
create index if not exists wf_advertiser_memberships_auth_idx
  on public.wf_advertiser_memberships(auth_user_id,status,advertiser_id);

create table if not exists public.wf_ad_budget_ledger (
  budget_ledger_id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.wf_ad_campaigns(campaign_id) on delete cascade,
  entry_type text not null check (entry_type in ('allocation_authorized','allocation_revoked','spend_recorded','adjustment')),
  amount_minor bigint not null,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  reference text not null check (char_length(btrim(reference)) between 4 and 240),
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists wf_ad_budget_ledger_campaign_idx on public.wf_ad_budget_ledger(campaign_id,created_at desc);

create table if not exists public.wf_ad_channel_jobs (
  channel_job_id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.wf_ad_campaigns(campaign_id) on delete cascade,
  channel text not null default 'txkpro_direct' check (channel in ('txkpro_direct','external_network')),
  status text not null default 'disabled' check (status in ('disabled','queued','published','paused','failed')),
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id,channel)
);

create table if not exists public.wf_ad_provider_reconciliation (
  reconciliation_id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.wf_ad_campaigns(campaign_id) on delete cascade,
  provider text not null check (provider in ('direct','external_network')),
  provider_reference text not null,
  amount_minor bigint not null default 0,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  metadata jsonb not null default '{}'::jsonb,
  reconciled_at timestamptz not null default now(),
  unique (provider,provider_reference)
);

alter table public.wf_advertiser_memberships enable row level security;
alter table public.wf_ad_budget_ledger enable row level security;
alter table public.wf_ad_channel_jobs enable row level security;
alter table public.wf_ad_provider_reconciliation enable row level security;
revoke all on table public.wf_advertiser_memberships,public.wf_ad_budget_ledger,
  public.wf_ad_channel_jobs,public.wf_ad_provider_reconciliation from public,anon,authenticated;

create or replace function security.advertiser_actor()
returns text language sql stable security definer set search_path=''
as $$ select u.user_id from public.users u where u.auth_user_id=auth.uid() and lower(u.status)='active' limit 1 $$;

create or replace function security.advertiser_can(p_advertiser_id text,p_roles text[] default null)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.wf_advertiser_memberships m
    join public.wf_advertisers a on a.advertiser_id=m.advertiser_id
    where m.auth_user_id=auth.uid() and m.advertiser_id=p_advertiser_id and m.status='active'
      and (p_roles is null or m.role=any(p_roles)) and a.status in ('pending_review','active','suspended')
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
  if exists(select 1 from public.wf_advertiser_memberships where auth_user_id=auth.uid() and status in ('active','invited')) then
    raise exception 'ADVERTISER_ACCOUNT_EXISTS' using errcode='23505';
  end if;
  insert into public.wf_advertisers(display_name,legal_name,website_url,contact_email,status,created_by_user_id)
  values(btrim(p_display_name),nullif(btrim(p_legal_name),''),nullif(btrim(p_website_url),''),v_email,'pending_review',v_actor)
  returning advertiser_id into v_advertiser;
  insert into public.wf_advertiser_memberships(advertiser_id,auth_user_id,user_id,invite_email,role,status,invited_by_user_id,accepted_at)
  values(v_advertiser,auth.uid(),v_actor,v_email,'advertiser_owner','active',v_actor,now());
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json)
  values(auth.uid(),v_actor,'ADVERTISER_STATUS_CHANGED','advertiser',v_advertiser,'workforce-domain-event',jsonb_build_object('status','pending_review'));
  return jsonb_build_object('advertiserId',v_advertiser,'status','pending_review');
end $$;

create or replace function public.advertiser_account_context(p_advertiser_id text default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_row record;
begin
  select a.*,m.role into v_row from public.wf_advertiser_memberships m
  join public.wf_advertisers a on a.advertiser_id=m.advertiser_id
  where m.auth_user_id=auth.uid() and m.status='active' and (p_advertiser_id is null or a.advertiser_id=p_advertiser_id)
  order by case m.role when 'advertiser_owner' then 1 when 'advertiser_admin' then 2 when 'advertiser_creative' then 3 else 4 end,a.created_at limit 1;
  if not found then return null; end if;
  return jsonb_build_object('advertiserId',v_row.advertiser_id,'displayName',v_row.display_name,'legalName',v_row.legal_name,
    'websiteUrl',v_row.website_url,'contactEmail',v_row.contact_email,'status',v_row.status,'reviewNotes',v_row.review_notes,'role',v_row.role);
end $$;

create or replace function public.advertiser_dashboard(p_advertiser_id text default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_context jsonb;v_advertiser text;
begin
  v_context:=public.advertiser_account_context(p_advertiser_id);v_advertiser:=v_context->>'advertiserId';
  if v_advertiser is null then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  return jsonb_build_object('account',v_context,
    'team',coalesce((select jsonb_agg(jsonb_build_object('id',m.advertiser_membership_id,'email',m.invite_email,'role',m.role,'status',m.status) order by m.invited_at) from public.wf_advertiser_memberships m where m.advertiser_id=v_advertiser and ((v_context->>'role') in ('advertiser_owner','advertiser_admin') or m.auth_user_id=auth.uid())),'[]'::jsonb),
    'campaigns',coalesce((select jsonb_agg(jsonb_build_object('id',c.campaign_id,'name',c.name,'status',c.status,'budgetMinor',c.budget_minor,'currency',c.currency,'startsAt',c.starts_at,'endsAt',c.ends_at,
      'allocatedMinor',coalesce((select sum(case when l.entry_type='allocation_revoked' then -abs(l.amount_minor) else l.amount_minor end) from public.wf_ad_budget_ledger l where l.campaign_id=c.campaign_id and l.entry_type in ('allocation_authorized','allocation_revoked','adjustment')),0),
      'spentMinor',coalesce((select sum(l.amount_minor) from public.wf_ad_budget_ledger l where l.campaign_id=c.campaign_id and l.entry_type='spend_recorded'),0),
      'served',coalesce((select count(*) from public.wf_ad_delivery_events e where e.campaign_id=c.campaign_id and e.event_type='served'),0),
      'viewable',coalesce((select count(*) from public.wf_ad_delivery_events e where e.campaign_id=c.campaign_id and e.event_type='viewable'),0),
      'clicked',coalesce((select count(*) from public.wf_ad_delivery_events e where e.campaign_id=c.campaign_id and e.event_type='clicked'),0),
      'creatives',coalesce((select jsonb_agg(jsonb_build_object('id',cr.creative_id,'status',cr.status,'headline',cr.headline,'body',cr.body,'mediaUrl',cr.media_url,'mediaAlt',cr.media_alt,'destinationUrl',cr.destination_url,'ctaLabel',cr.cta_label) order by cr.created_at) from public.wf_ad_creatives cr where cr.campaign_id=c.campaign_id),'[]'::jsonb),
      'review',coalesce((select jsonb_build_object('decision',r.decision,'notes',r.notes,'createdAt',r.created_at) from public.wf_ad_reviews r where r.campaign_id=c.campaign_id order by r.created_at desc limit 1),'null'::jsonb)
    ) order by c.created_at desc) from public.wf_ad_campaigns c where c.advertiser_id=v_advertiser),'[]'::jsonb));
end $$;

create or replace function public.advertiser_team_invite(p_advertiser_id text,p_email text,p_role text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_id text;v_email text:=lower(btrim(p_email));
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  if p_role not in ('advertiser_admin','advertiser_creative','advertiser_analyst') then raise exception 'INVALID_ADVERTISER_ROLE' using errcode='22023'; end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_EMAIL' using errcode='22023'; end if;
  v_actor:=security.advertiser_actor();
  insert into public.wf_advertiser_memberships(advertiser_id,invite_email,role,status,invited_by_user_id)
  values(p_advertiser_id,v_email,p_role,'invited',v_actor) returning advertiser_membership_id into v_id;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json)
  values(auth.uid(),v_actor,'ADVERTISER_TEAM_INVITED','advertiser_membership',v_id,'workforce-domain-event',jsonb_build_object('advertiserId',p_advertiser_id,'role',p_role));
  return jsonb_build_object('membershipId',v_id,'status','invited');
end $$;

create or replace function public.advertiser_invitation_accept()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_email text;v_id text;v_advertiser text;
begin
  v_actor:=security.advertiser_actor();v_email:=lower(coalesce(auth.jwt()->>'email',''));
  if v_actor is null or v_email='' then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  update public.wf_advertiser_memberships set auth_user_id=auth.uid(),user_id=v_actor,status='active',accepted_at=now(),updated_at=now()
  where advertiser_membership_id=(select m.advertiser_membership_id from public.wf_advertiser_memberships m where m.invite_email=v_email and m.status='invited' order by m.invited_at limit 1)
  returning advertiser_membership_id,advertiser_id into v_id,v_advertiser;
  if v_id is null then raise exception 'INVITATION_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json)
  values(auth.uid(),v_actor,'ADVERTISER_TEAM_ACCEPTED','advertiser_membership',v_id,'workforce-domain-event',jsonb_build_object('advertiserId',v_advertiser));
  return jsonb_build_object('membershipId',v_id,'advertiserId',v_advertiser,'status','active');
end $$;

create or replace function public.advertiser_pending_invitation()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.wf_advertiser_memberships m where m.status='invited' and m.invite_email=lower(coalesce(auth.jwt()->>'email','')))
$$;

create or replace function public.advertiser_campaign_save(
  p_advertiser_id text,p_campaign_id text,p_name text,p_budget_minor bigint,p_starts_at timestamptz,p_ends_at timestamptz,
  p_frequency_cap integer default 3,p_placements text[] default array['in_feed'],p_audience jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_campaign text;v_status text;v_created boolean:=false;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_creative']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  select status into v_status from public.wf_advertisers where advertiser_id=p_advertiser_id;
  if v_status<>'active' then raise exception 'ADVERTISER_APPROVAL_REQUIRED' using errcode='42501'; end if;
  if char_length(btrim(p_name)) not between 2 and 160 or p_budget_minor<0 or p_frequency_cap not between 1 and 20 or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'INVALID_CAMPAIGN' using errcode='22023'; end if;
  if not (p_placements <@ array['in_feed','in_comments','in_article','multiplex']::text[]) then raise exception 'INVALID_PLACEMENT' using errcode='22023'; end if;
  v_actor:=security.advertiser_actor();
  if p_campaign_id is null then
    insert into public.wf_ad_campaigns(advertiser_id,name,budget_minor,starts_at,ends_at,daily_frequency_cap,created_by_user_id)
    values(p_advertiser_id,btrim(p_name),p_budget_minor,p_starts_at,p_ends_at,p_frequency_cap,v_actor) returning campaign_id into v_campaign;
    v_created:=true;
  else
    update public.wf_ad_campaigns set name=btrim(p_name),budget_minor=p_budget_minor,starts_at=p_starts_at,ends_at=p_ends_at,daily_frequency_cap=p_frequency_cap,updated_at=now()
    where campaign_id=p_campaign_id and advertiser_id=p_advertiser_id and status in ('draft','rejected') returning campaign_id into v_campaign;
    if v_campaign is null then raise exception 'CAMPAIGN_NOT_EDITABLE' using errcode='55000'; end if;
  end if;
  delete from public.wf_ad_campaign_audiences where campaign_id=v_campaign;
  if coalesce(p_audience->>'roleFamily','')<>'' or coalesce(p_audience->>'topic','')<>'' or coalesce(p_audience->>'broadGeography','')<>'' then
    insert into public.wf_ad_campaign_audiences(campaign_id,role_family,topic,broad_geography)
    values(v_campaign,nullif(p_audience->>'roleFamily',''),nullif(btrim(p_audience->>'topic'),''),nullif(btrim(p_audience->>'broadGeography'),''));
  end if;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json)
  values(auth.uid(),v_actor,'AD_CAMPAIGN_DRAFT_SAVED','ad_campaign',v_campaign,'workforce-domain-event',jsonb_build_object('created',v_created,'status','draft'));
  return jsonb_build_object('campaignId',v_campaign,'status','draft');
end $$;

create or replace function public.advertiser_creative_save(
  p_advertiser_id text,p_campaign_id text,p_creative_id text,p_headline text,p_body text,p_media_url text,p_media_alt text,p_destination_url text,p_cta_label text,p_placements text[]
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_creative text;v_campaign_status text;v_actor text;v_created boolean:=false;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin','advertiser_creative']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  select status into v_campaign_status from public.wf_ad_campaigns where campaign_id=p_campaign_id and advertiser_id=p_advertiser_id;
  if v_campaign_status not in ('draft','rejected') then raise exception 'CAMPAIGN_NOT_EDITABLE' using errcode='55000'; end if;
  if btrim(p_destination_url) !~ '^https://' or (nullif(btrim(p_media_url),'') is not null and btrim(p_media_url) !~ '^https://') then raise exception 'HTTPS_URL_REQUIRED' using errcode='22023'; end if;
  if not (p_placements <@ array['in_feed','in_comments','in_article','multiplex']::text[]) or cardinality(p_placements)=0 then raise exception 'INVALID_PLACEMENT' using errcode='22023'; end if;
  if p_creative_id is null then
    insert into public.wf_ad_creatives(campaign_id,headline,body,media_url,media_alt,destination_url,cta_label)
    values(p_campaign_id,btrim(p_headline),btrim(p_body),nullif(btrim(p_media_url),''),nullif(btrim(p_media_alt),''),btrim(p_destination_url),btrim(p_cta_label)) returning creative_id into v_creative;
    v_created:=true;
  else
    update public.wf_ad_creatives set headline=btrim(p_headline),body=btrim(p_body),media_url=nullif(btrim(p_media_url),''),media_alt=nullif(btrim(p_media_alt),''),destination_url=btrim(p_destination_url),cta_label=btrim(p_cta_label),status='draft',updated_at=now()
    where creative_id=p_creative_id and campaign_id=p_campaign_id and status in ('draft','rejected') returning creative_id into v_creative;
    if v_creative is null then raise exception 'CREATIVE_NOT_EDITABLE' using errcode='55000'; end if;
  end if;
  delete from public.wf_ad_campaign_placements where creative_id=v_creative;
  insert into public.wf_ad_campaign_placements(campaign_id,creative_id,placement,enabled)
  select p_campaign_id,v_creative,x,false from unnest(p_placements) x;
  v_actor:=security.advertiser_actor();
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json)
  values(auth.uid(),v_actor,'AD_CREATIVE_DRAFT_SAVED','ad_creative',v_creative,'workforce-domain-event',jsonb_build_object('campaignId',p_campaign_id,'created',v_created,'status','draft'));
  return jsonb_build_object('creativeId',v_creative,'status','draft');
end $$;

create or replace function public.advertiser_campaign_action(p_advertiser_id text,p_campaign_id text,p_action text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_current text;v_next text;
begin
  if not security.advertiser_can(p_advertiser_id,array['advertiser_owner','advertiser_admin']) then raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501'; end if;
  select status into v_current from public.wf_ad_campaigns where campaign_id=p_campaign_id and advertiser_id=p_advertiser_id for update;
  if p_action='submit' and v_current in ('draft','rejected') then
    if not exists(select 1 from public.wf_ad_creatives where campaign_id=p_campaign_id) then raise exception 'CREATIVE_REQUIRED' using errcode='23514'; end if;
    update public.wf_ad_creatives set status='submitted',updated_at=now() where campaign_id=p_campaign_id and status in ('draft','rejected');v_next:='submitted';
  elsif p_action='pause' and v_current in ('scheduled','active') then v_next:='paused';
  elsif p_action='resume' and v_current='paused' then
    if not exists(select 1 from public.wf_ad_funding_authorizations where campaign_id=p_campaign_id and revoked_at is null) then raise exception 'FUNDING_AUTHORIZATION_REQUIRED' using errcode='23514'; end if;
    v_next:='active';
  elsif p_action='cancel' and v_current not in ('completed','cancelled') then v_next:='cancelled';
  else raise exception 'INVALID_CAMPAIGN_TRANSITION' using errcode='55000'; end if;
  update public.wf_ad_campaigns set status=v_next,updated_at=now() where campaign_id=p_campaign_id;
  if v_next='submitted' then insert into public.wf_ad_reviews(advertiser_id,campaign_id,decision,notes) values(p_advertiser_id,p_campaign_id,'submitted',null); end if;
  v_actor:=security.advertiser_actor();
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json)
  values(auth.uid(),v_actor,'AD_CAMPAIGN_STATUS_CHANGED','ad_campaign',p_campaign_id,'workforce-domain-event',jsonb_build_object('status',v_current),jsonb_build_object('status',v_next));
  return jsonb_build_object('campaignId',p_campaign_id,'status',v_next);
end $$;

create or replace function public.advertiser_admin_queue()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not security.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object(
    'advertisers',coalesce((select jsonb_agg(jsonb_build_object('id',a.advertiser_id,'displayName',a.display_name,'legalName',a.legal_name,'websiteUrl',a.website_url,'contactEmail',a.contact_email,'status',a.status,'createdAt',a.created_at) order by a.created_at) from public.wf_advertisers a where a.status in ('pending_review','suspended')),'[]'::jsonb),
    'campaigns',coalesce((select jsonb_agg(jsonb_build_object('id',c.campaign_id,'advertiserId',c.advertiser_id,'advertiserName',a.display_name,'name',c.name,'status',c.status,'budgetMinor',c.budget_minor,'currency',c.currency,'startsAt',c.starts_at,'endsAt',c.ends_at,'creatives',coalesce((select jsonb_agg(jsonb_build_object('id',cr.creative_id,'headline',cr.headline,'body',cr.body,'mediaUrl',cr.media_url,'destinationUrl',cr.destination_url,'status',cr.status)) from public.wf_ad_creatives cr where cr.campaign_id=c.campaign_id),'[]'::jsonb)) order by c.created_at) from public.wf_ad_campaigns c join public.wf_advertisers a on a.advertiser_id=c.advertiser_id where c.status in ('submitted','in_review')),'[]'::jsonb));
end $$;

create or replace function public.advertiser_admin_review(p_target_type text,p_target_id text,p_decision text,p_notes text default null,p_allocation_minor bigint default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor text;v_advertiser text;v_campaign text;v_before text;v_after text;
begin
  if not security.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_decision not in ('approved','rejected','changes_requested','suspended') then raise exception 'INVALID_REVIEW_DECISION' using errcode='22023'; end if;
  v_actor:=security.advertiser_actor();
  if p_target_type='advertiser' then
    select advertiser_id,status into v_advertiser,v_before from public.wf_advertisers where advertiser_id=p_target_id for update;
    v_after:=case p_decision when 'approved' then 'active' when 'suspended' then 'suspended' else 'rejected' end;
    update public.wf_advertisers set status=v_after,review_notes=nullif(btrim(p_notes),''),reviewed_at=now(),reviewed_by_user_id=v_actor,updated_at=now() where advertiser_id=p_target_id;
    insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json)
    values(auth.uid(),v_actor,'ADVERTISER_STATUS_CHANGED','advertiser',p_target_id,'workforce-domain-event',jsonb_build_object('status',v_before),jsonb_build_object('status',v_after,'notes',p_notes));
  elsif p_target_type='campaign' then
    select advertiser_id,campaign_id,status into v_advertiser,v_campaign,v_before from public.wf_ad_campaigns where campaign_id=p_target_id for update;
    if v_before not in ('submitted','in_review') then raise exception 'CAMPAIGN_NOT_REVIEWABLE' using errcode='55000'; end if;
    v_after:=case p_decision when 'approved' then 'approved' when 'changes_requested' then 'draft' else 'rejected' end;
    update public.wf_ad_campaigns set status=v_after,updated_at=now() where campaign_id=p_target_id;
    update public.wf_ad_creatives set status=case when p_decision='approved' then 'approved' when p_decision='changes_requested' then 'draft' else 'rejected' end,updated_at=now() where campaign_id=p_target_id;
    insert into public.wf_ad_reviews(advertiser_id,campaign_id,decision,notes,reviewed_by_user_id) values(v_advertiser,p_target_id,p_decision,nullif(btrim(p_notes),''),v_actor);
    if p_decision='approved' and coalesce(p_allocation_minor,0)>0 then
      if p_allocation_minor>(select budget_minor from public.wf_ad_campaigns where campaign_id=p_target_id) then raise exception 'ALLOCATION_EXCEEDS_BUDGET' using errcode='23514'; end if;
      if (select ends_at from public.wf_ad_campaigns where campaign_id=p_target_id)<=now() then raise exception 'CAMPAIGN_WINDOW_ENDED' using errcode='23514'; end if;
      insert into public.wf_ad_funding_authorizations(campaign_id,amount_minor,evidence_reference,authorized_by_user_id) values(p_target_id,p_allocation_minor,'manual TXKPRO allocation',v_actor);
      insert into public.wf_ad_budget_ledger(campaign_id,entry_type,amount_minor,reference,created_by_user_id) values(p_target_id,'allocation_authorized',p_allocation_minor,'manual TXKPRO allocation',v_actor);
      update public.wf_ad_campaigns set status=case when starts_at>now() then 'scheduled' else 'active' end where campaign_id=p_target_id;
      update public.wf_ad_campaign_placements set enabled=true where campaign_id=p_target_id;
      insert into public.wf_ad_channel_jobs(campaign_id,channel,status) values(p_target_id,'txkpro_direct','published') on conflict(campaign_id,channel) do update set status='published',updated_at=now();
      v_after:=case when (select starts_at from public.wf_ad_campaigns where campaign_id=p_target_id)>now() then 'scheduled' else 'active' end;
    end if;
    insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json)
    values(auth.uid(),v_actor,'AD_CAMPAIGN_STATUS_CHANGED','ad_campaign',p_target_id,'workforce-domain-event',jsonb_build_object('status',v_before),jsonb_build_object('status',v_after,'decision',p_decision,'notes',p_notes));
  else raise exception 'INVALID_REVIEW_TARGET' using errcode='22023'; end if;
  return jsonb_build_object('targetType',p_target_type,'targetId',p_target_id,'status',v_after);
end $$;

revoke all on function security.advertiser_actor(),security.advertiser_can(text,text[]) from public,anon,authenticated;
grant execute on function security.advertiser_actor(),security.advertiser_can(text,text[]) to service_role;
revoke all on function public.advertiser_register(text,text,text,text),public.advertiser_account_context(text),public.advertiser_dashboard(text),
  public.advertiser_team_invite(text,text,text),public.advertiser_invitation_accept(),public.advertiser_pending_invitation(),public.advertiser_campaign_save(text,text,text,bigint,timestamptz,timestamptz,integer,text[],jsonb),
  public.advertiser_creative_save(text,text,text,text,text,text,text,text,text,text[]),public.advertiser_campaign_action(text,text,text),
  public.advertiser_admin_queue(),public.advertiser_admin_review(text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.advertiser_register(text,text,text,text),public.advertiser_account_context(text),public.advertiser_dashboard(text),
  public.advertiser_team_invite(text,text,text),public.advertiser_invitation_accept(),public.advertiser_pending_invitation(),public.advertiser_campaign_save(text,text,text,bigint,timestamptz,timestamptz,integer,text[],jsonb),
  public.advertiser_creative_save(text,text,text,text,text,text,text,text,text,text[]),public.advertiser_campaign_action(text,text,text) to authenticated;
grant execute on function public.advertiser_admin_queue(),public.advertiser_admin_review(text,text,text,text,bigint) to authenticated,service_role;
