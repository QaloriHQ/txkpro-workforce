-- ADS-06 follow-up indexes identified by the staging database advisor.
create index if not exists wf_ad_business_managers_creator_idx on public.wf_ad_business_managers(created_by_user_id) where created_by_user_id is not null;
create index if not exists wf_ad_business_manager_memberships_auth_idx on public.wf_ad_business_manager_memberships(auth_user_id,status,business_manager_id);
create index if not exists wf_ad_business_manager_memberships_user_idx on public.wf_ad_business_manager_memberships(user_id) where user_id is not null;
create index if not exists wf_ad_business_manager_accounts_advertiser_idx on public.wf_ad_business_manager_accounts(advertiser_id,business_manager_id);
create index if not exists wf_ad_business_manager_accounts_creator_idx on public.wf_ad_business_manager_accounts(created_by_user_id) where created_by_user_id is not null;
create index if not exists wf_ad_groups_creator_idx on public.wf_ad_groups(created_by_user_id) where created_by_user_id is not null;
create index if not exists wf_ad_creatives_ad_group_idx on public.wf_ad_creatives(ad_group_id,status,delivery_enabled);
create index if not exists wf_ad_creative_versions_creator_idx on public.wf_ad_creative_versions(created_by_user_id) where created_by_user_id is not null;
create index if not exists wf_ad_creative_versions_reviewer_idx on public.wf_ad_creative_versions(reviewed_by_user_id) where reviewed_by_user_id is not null;
create index if not exists wf_ad_reviews_creative_version_idx on public.wf_ad_reviews(creative_version_id,created_at desc) where creative_version_id is not null;
create index if not exists wf_ad_bulk_operations_actor_idx on public.wf_ad_bulk_operation_receipts(actor_user_id) where actor_user_id is not null;
