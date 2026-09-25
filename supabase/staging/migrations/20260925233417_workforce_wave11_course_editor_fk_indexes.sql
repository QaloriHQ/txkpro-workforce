-- W11-04C follow-up: cover new foreign keys used by cleanup/audit paths.

create index if not exists idx_wf_micro_cert_sections_created_by
  on public.wf_employer_micro_cert_sections(created_by_user_id)
  where created_by_user_id is not null;

create index if not exists idx_wf_reusable_blocks_source_block
  on public.wf_employer_learning_reusable_blocks(source_lesson_block_id)
  where source_lesson_block_id is not null;

create index if not exists idx_wf_reusable_blocks_created_by
  on public.wf_employer_learning_reusable_blocks(created_by_user_id)
  where created_by_user_id is not null;

create index if not exists idx_wf_lesson_templates_source_lesson
  on public.wf_employer_learning_lesson_templates(source_lesson_id)
  where source_lesson_id is not null;

create index if not exists idx_wf_lesson_templates_created_by
  on public.wf_employer_learning_lesson_templates(created_by_user_id)
  where created_by_user_id is not null;
