alter table public.wf_public_pages
  drop constraint if exists wf_public_pages_entity_type_check;

alter table public.wf_public_pages
  add constraint wf_public_pages_entity_type_check
  check (entity_type in (
    'student','educator','staff','employer','institution',
    'course','lesson','credential','post'
  ));
