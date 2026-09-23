create index if not exists wf_interview_evaluations_employer_idx
  on public.wf_interview_evaluations(employer_id);
create index if not exists wf_placements_interview_idx
  on public.wf_placements(interview_request_id)
  where interview_request_id is not null;
