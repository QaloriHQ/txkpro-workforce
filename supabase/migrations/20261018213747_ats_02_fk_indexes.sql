-- ATS-02 / #329: additive FK covering indexes flagged by staging advisor after schema release.
-- CONCURRENTLY is not used because migration runner may run in transaction; tables are
-- new and currently empty in staging, so regular CREATE INDEX is appropriate.
create index if not exists wf_ats_jobs_pipeline_employer_fk_idx
  on public.wf_ats_job_listings(pipeline_version_id,employer_id)
  where pipeline_version_id is not null;
create index if not exists wf_ats_pipeline_templates_creator_fk_idx
  on public.wf_ats_pipeline_templates(created_by_user_id);
create index if not exists wf_ats_pipeline_versions_publisher_fk_idx
  on public.wf_ats_pipeline_versions(published_by_user_id);
create index if not exists wf_ats_pipeline_versions_template_employer_fk_idx
  on public.wf_ats_pipeline_versions(template_id,employer_id);
