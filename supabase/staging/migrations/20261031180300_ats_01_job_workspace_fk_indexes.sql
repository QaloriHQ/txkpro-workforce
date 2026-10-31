-- ATS-01 / #332: cover assignment actor foreign keys for maintenance queries.
create index wf_ats_job_hiring_team_assigned_by
  on public.wf_ats_job_hiring_team(assigned_by);

create index wf_ats_job_crews_assigned_by
  on public.wf_ats_job_crews(assigned_by);
