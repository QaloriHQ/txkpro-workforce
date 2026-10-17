-- ADS-06 follow-up indexes for review and creative foreign-key access paths.
create index if not exists wf_ad_creatives_campaign_idx
  on public.wf_ad_creatives(campaign_id);

create index if not exists wf_ad_reviews_campaign_idx
  on public.wf_ad_reviews(campaign_id,created_at desc)
  where campaign_id is not null;

create index if not exists wf_ad_reviews_creative_idx
  on public.wf_ad_reviews(creative_id,created_at desc)
  where creative_id is not null;

create index if not exists wf_ad_reviews_reviewer_idx
  on public.wf_ad_reviews(reviewed_by_user_id)
  where reviewed_by_user_id is not null;
