-- #224 post-migration advisor follow-up. Cover all new foreign-key paths.
create index if not exists wf_pro_level_versions_created_by_idx
  on public.wf_pro_level_versions(created_by);
create index if not exists wf_pro_season_finalizations_level_version_idx
  on public.wf_pro_season_finalizations(level_version);
create index if not exists wf_pro_season_finalizations_finalized_by_idx
  on public.wf_pro_season_finalizations(finalized_by);
create index if not exists wf_pro_season_corrections_season_idx
  on public.wf_pro_season_corrections(season);
create index if not exists wf_pro_season_corrections_actor_idx
  on public.wf_pro_season_corrections(actor_user_id);
