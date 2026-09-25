create index if not exists wf_micro_certs_current_version_composite_idx
  on public.wf_employer_micro_certs(micro_cert_id,current_version_id)
  where current_version_id is not null;

create index if not exists wf_micro_cert_assignments_cert_version_idx
  on public.wf_micro_cert_assignments(micro_cert_id,micro_cert_version_id);

create index if not exists wf_micro_cert_checkpoint_resp_version_assignment_idx
  on public.wf_micro_cert_checkpoint_responses(micro_cert_version_id,assignment_id);

create index if not exists wf_micro_cert_checkpoint_resp_version_checkpoint_idx
  on public.wf_micro_cert_checkpoint_responses(micro_cert_version_id,checkpoint_id);
