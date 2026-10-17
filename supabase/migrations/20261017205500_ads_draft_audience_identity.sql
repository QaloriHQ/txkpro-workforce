-- Preserve the exact saved-audience identity when an advertiser reopens a campaign draft.
-- The enterprise context is RPC-only and remains advertiser scoped by security.advertiser_can.

create or replace function public.advertiser_enterprise_context(p_advertiser_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not security.advertiser_can(p_advertiser_id,null) then
    raise exception 'ADVERTISER_ACCESS_DENIED' using errcode='42501';
  end if;

  return jsonb_build_object(
    'businessManagers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',bm.business_manager_id,
        'name',bm.name,
        'status',bm.status
      ))
      from public.wf_ad_business_manager_accounts ba
      join public.wf_ad_business_managers bm using(business_manager_id)
      where ba.advertiser_id=p_advertiser_id
    ),'[]'::jsonb),
    'adGroups',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',g.ad_group_id,
        'campaignId',g.campaign_id,
        'name',g.name,
        'status',g.status,
        'deliveryEnabled',g.delivery_enabled,
        'buyingModel',g.buying_model,
        'bidMinor',g.bid_minor,
        'pacingMode',g.pacing_mode,
        'frequencyCap',g.daily_frequency_cap,
        'roleFamily',g.role_family,
        'topic',g.topic,
        'broadGeography',g.broad_geography,
        'timezone',g.schedule_timezone,
        'dayparting',g.dayparting,
        'placements',coalesce((
          select jsonb_agg(p.placement order by p.placement)
          from public.wf_ad_group_placements p
          where p.ad_group_id=g.ad_group_id and p.enabled
        ),'[]'::jsonb),
        'audienceId',g.audience_id
      ) order by g.created_at)
      from public.wf_ad_groups g
      join public.wf_ad_campaigns c using(campaign_id)
      where c.advertiser_id=p_advertiser_id
    ),'[]'::jsonb),
    'creativeVersions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',v.creative_version_id,
        'creativeId',v.creative_id,
        'version',v.version_number,
        'status',v.status,
        'createdAt',v.created_at
      ) order by v.created_at desc)
      from public.wf_ad_creative_versions v
      join public.wf_ad_creatives cr using(creative_id)
      join public.wf_ad_campaigns c using(campaign_id)
      where c.advertiser_id=p_advertiser_id
    ),'[]'::jsonb),
    'audit',coalesce((
      select jsonb_agg(jsonb_build_object(
        'action',e.action,
        'entityType',e.entity_type,
        'entityId',e.entity_id,
        'createdAt',e.created_at,
        'before',e.before_json,
        'after',e.after_json
      ) order by e.created_at desc)
      from (
        select *
        from public.platform_audit_events
        where entity_type in ('ad_campaign','ad_group','ad_creative','ad_bulk_operation')
          and (
            after_json->>'advertiserId'=p_advertiser_id
            or entity_id in (
              select campaign_id
              from public.wf_ad_campaigns
              where advertiser_id=p_advertiser_id
            )
          )
        order by created_at desc
        limit 100
      ) e
    ),'[]'::jsonb)
  );
end $$;

revoke all on function public.advertiser_enterprise_context(text)
  from public,anon,authenticated;
grant execute on function public.advertiser_enterprise_context(text)
  to authenticated;
