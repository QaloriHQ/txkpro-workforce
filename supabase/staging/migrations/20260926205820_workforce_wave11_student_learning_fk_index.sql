-- W11-07: cover lesson_progress.lesson_id FK for runtime lookups and deletes.

create index if not exists idx_wf_micro_cert_lesson_progress_lesson
  on public.wf_micro_cert_lesson_progress(lesson_id,assignment_id);
