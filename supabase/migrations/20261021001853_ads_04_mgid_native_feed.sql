-- ADS-04: external records are separate from funded advertiser campaigns.
create table public.wf_external_ad_deliveries (
  delivery_id uuid primary key,
  event_token uuid not null default gen_random_uuid(),
  provider text not null default 'mgid' check (provider='mgid'),
  placement text not null check (placement in ('in_feed','in_comments','in_article','multiplex')),
  request_fingerprint text not null check (length(request_fingerprint)=64),
  creative_id text,
  snapshot jsonb,
  created_at timestamptz not null default now()
);
create index wf_external_ad_requests_rate_idx on public.wf_external_ad_deliveries(request_fingerprint,created_at desc);
create table public.wf_external_ad_events (
  delivery_id uuid not null references public.wf_external_ad_deliveries on delete cascade,
  event_type text not null check (event_type in ('served','viewable','clicked')),
  created_at timestamptz not null default now(),
  primary key(delivery_id,event_type)
);
create index wf_external_ad_retention_idx on public.wf_external_ad_deliveries(created_at);
create index wf_external_ad_event_counts_idx on public.wf_external_ad_events(event_type,created_at);
alter table public.wf_external_ad_deliveries enable row level security;
alter table public.wf_external_ad_events enable row level security;
revoke all on public.wf_external_ad_deliveries,public.wf_external_ad_events from public,anon,authenticated;
grant select,insert,update,delete on public.wf_external_ad_deliveries,public.wf_external_ad_events to service_role;

-- Serialize reservations per short-lived daily HMAC; no raw IP/UA is persisted.
create function public.external_ad_reserve(p_delivery_id uuid,p_fingerprint text,p_placement text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_token uuid;
begin
  delete from public.wf_external_ad_deliveries where delivery_id in (select delivery_id from public.wf_external_ad_deliveries where created_at<now()-interval '30 days' limit 100);
  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint,0));
  if (select count(*) from public.wf_external_ad_deliveries where request_fingerprint=p_fingerprint
      and created_at>now()-interval '1 minute')>=10 then return null; end if;
  insert into public.wf_external_ad_deliveries(delivery_id,request_fingerprint,placement)
  values(p_delivery_id,p_fingerprint,p_placement) on conflict do nothing returning event_token into v_token;
  return v_token;
end;
$$;
revoke all on function public.external_ad_reserve(uuid,text,text) from public,anon,authenticated;
grant execute on function public.external_ad_reserve(uuid,text,text) to service_role;

create function public.external_ad_report(p_delivery_id uuid,p_event_token uuid,p_reason text,p_details text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor text:=security.community_actor(); v_case text; v_report text; v_snapshot jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  if p_reason not in ('spam','scam','harassment','hate','threat','privacy','impersonation','misinformation','unsafe','illegal','other')
    or char_length(coalesce(p_details,''))>2000 then raise exception 'INVALID_REPORT' using errcode='22023'; end if;
  select snapshot into v_snapshot from public.wf_external_ad_deliveries
  where delivery_id=p_delivery_id and event_token=p_event_token and snapshot is not null;
  if not found then raise exception 'AD_DELIVERY_NOT_FOUND' using errcode='22023'; end if;
  insert into public.wf_community_moderation_cases(target_type,target_id,automation_state,severity,priority_score)
  values('ad',p_delivery_id::text,'needs_review','medium',60)
  on conflict(target_type,target_id) do update set last_reported_at=now(),updated_at=now(),closed_at=null,status='submitted',automation_state='needs_review'
  returning case_id into v_case;
  insert into security.wf_community_moderation_evidence(case_id,content_type,content_snapshot,content_hash)
  values(v_case,'ad',v_snapshot,md5(v_snapshot::text)) on conflict(case_id) do nothing;
  insert into public.wf_community_reports(reporter_user_id,reason,case_id,details,target_type,target_id)
  values(v_actor,p_reason,v_case,nullif(btrim(p_details),''),'ad',p_delivery_id::text)
  on conflict(reporter_user_id,case_id) where case_id is not null do update set reason=excluded.reason,details=excluded.details,status='submitted',updated_at=now()
  returning report_id into v_report;
  update public.wf_community_moderation_cases set report_count=(select count(*) from public.wf_community_reports where case_id=v_case),last_reported_at=now(),updated_at=now() where case_id=v_case;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
  values(auth.uid(),v_actor,'COMMUNITY_REPORT_SUBMITTED','community_moderation_case',v_case,'workforce-domain-event',
    jsonb_build_object('reportId',v_report,'targetType','ad','targetId',p_delivery_id::text,'reason',p_reason,'provider','mgid'));
  return jsonb_build_object('reported',true,'reportId',v_report,'caseId',v_case);
end;
$$;
revoke all on function public.external_ad_report(uuid,uuid,text,text) from public,anon,service_role;
grant execute on function public.external_ad_report(uuid,uuid,text,text) to authenticated;
