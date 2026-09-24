create index if not exists wf_retention_messages_recipient_user_idx
  on public.wf_retention_messages(recipient_user_id);
create index if not exists wf_retention_responses_recipient_user_idx
  on public.wf_retention_responses(recipient_user_id);
create index if not exists wf_retention_cases_owner_user_idx
  on public.wf_retention_cases(owner_user_id) where owner_user_id is not null;
create index if not exists wf_retention_case_notes_author_user_idx
  on public.wf_retention_case_notes(author_user_id);
