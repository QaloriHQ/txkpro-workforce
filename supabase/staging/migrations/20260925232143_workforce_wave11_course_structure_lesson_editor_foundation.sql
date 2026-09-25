-- W11-04C: Course overview / structure / lesson editor foundations.
-- Approved product expansion: course-version publishing, Employer-wide reusable content,
-- interactive non-persistent Student Preview.

-- 1) Expand lesson block vocabulary for the dedicated Lesson Editor.
alter table public.wf_employer_micro_cert_lesson_blocks
  drop constraint if exists wf_employer_micro_cert_lesson_blocks_block_type_check;

alter table public.wf_employer_micro_cert_lesson_blocks
  add constraint wf_employer_micro_cert_lesson_blocks_block_type_check
  check (block_type in (
    'text','rich_text','heading','list','callout','safety_note',
    'image','video','document','link','embed','divider','button',
    'download','accordion','columns'
  ));

-- 2) Versioned course sections/modules.
create table if not exists public.wf_employer_micro_cert_sections (
  id uuid primary key default gen_random_uuid(),
  section_id text not null unique default security.new_legacy_id('MCS'),
  micro_cert_version_id text not null
    references public.wf_employer_micro_cert_versions(micro_cert_version_id)
    on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  title text not null check (btrim(title) <> ''),
  description text,
  required boolean not null default true,
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(micro_cert_version_id,sequence_no)
);

alter table public.wf_employer_micro_cert_lessons
  add column if not exists section_id text
  references public.wf_employer_micro_cert_sections(section_id)
  on delete set null;

create index if not exists idx_wf_micro_cert_lessons_section
  on public.wf_employer_micro_cert_lessons(section_id)
  where section_id is not null;

-- 3) Employer-wide reusable blocks.
create table if not exists public.wf_employer_learning_reusable_blocks (
  id uuid primary key default gen_random_uuid(),
  reusable_block_id text not null unique default security.new_legacy_id('ERB'),
  employer_id text not null
    references public.contractors(contractor_id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  block_type text not null check (block_type in (
    'text','rich_text','heading','list','callout','safety_note',
    'image','video','document','link','embed','divider','button',
    'download','accordion','columns'
  )),
  content jsonb not null default '{}'::jsonb,
  source_lesson_block_id text
    references public.wf_employer_micro_cert_lesson_blocks(lesson_block_id)
    on delete set null,
  active boolean not null default true,
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wf_reusable_blocks_employer_active
  on public.wf_employer_learning_reusable_blocks(employer_id,active,updated_at desc);

-- 4) Employer-wide reusable lesson templates.
create table if not exists public.wf_employer_learning_lesson_templates (
  id uuid primary key default gen_random_uuid(),
  lesson_template_id text not null unique default security.new_legacy_id('ELT'),
  employer_id text not null
    references public.contractors(contractor_id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  description text,
  snapshot jsonb not null default '{}'::jsonb,
  source_lesson_id text
    references public.wf_employer_micro_cert_lessons(lesson_id)
    on delete set null,
  active boolean not null default true,
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wf_lesson_templates_employer_active
  on public.wf_employer_learning_lesson_templates(employer_id,active,updated_at desc);

alter table public.wf_employer_micro_cert_sections enable row level security;
alter table public.wf_employer_learning_reusable_blocks enable row level security;
alter table public.wf_employer_learning_lesson_templates enable row level security;

revoke all on table public.wf_employer_micro_cert_sections
  from public,anon,authenticated;
revoke all on table public.wf_employer_learning_reusable_blocks
  from public,anon,authenticated;
revoke all on table public.wf_employer_learning_lesson_templates
  from public,anon,authenticated;

grant all on table public.wf_employer_micro_cert_sections to service_role;
grant all on table public.wf_employer_learning_reusable_blocks to service_role;
grant all on table public.wf_employer_learning_lesson_templates to service_role;

-- 5) Rich component validation.
create or replace function security.validate_employer_learning_block(
  p_block_type text,
  p_content jsonb
)
returns void
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  v_type text:=lower(btrim(coalesce(p_block_type,'')));
begin
  if v_type not in (
    'text','rich_text','heading','list','callout','safety_note',
    'image','video','document','link','embed','divider','button',
    'download','accordion','columns'
  ) then
    raise exception 'Invalid Employer Learning content block type';
  end if;

  if p_content is null or jsonb_typeof(p_content)<>'object' then
    raise exception 'Content block content must be an object';
  end if;

  if v_type in ('text','callout','safety_note') then
    if nullif(btrim(coalesce(p_content->>'text','')),'') is null then
      raise exception 'Text content is required for % block',v_type;
    end if;
  elsif v_type='rich_text' then
    if nullif(btrim(coalesce(p_content->>'html','')),'') is null then
      raise exception 'Rich text HTML is required';
    end if;
  elsif v_type='heading' then
    if nullif(btrim(coalesce(p_content->>'text','')),'') is null then
      raise exception 'Heading text is required';
    end if;
    if coalesce((p_content->>'level')::integer,2) not in (2,3,4) then
      raise exception 'Heading level must be 2, 3, or 4';
    end if;
  elsif v_type='list' then
    if jsonb_typeof(p_content->'items')<>'array'
       or jsonb_array_length(p_content->'items')=0 then
      raise exception 'List block requires at least one item';
    end if;
  elsif v_type in ('image','video','document','link','embed','download') then
    if nullif(btrim(coalesce(p_content->>'url','')),'') is null then
      raise exception 'URL is required for % block',v_type;
    end if;
  elsif v_type='button' then
    if nullif(btrim(coalesce(p_content->>'url','')),'') is null
       or nullif(btrim(coalesce(p_content->>'label','')),'') is null then
      raise exception 'Button block requires label and URL';
    end if;
  elsif v_type='accordion' then
    if nullif(btrim(coalesce(p_content->>'title','')),'') is null
       or nullif(btrim(coalesce(p_content->>'body','')),'') is null then
      raise exception 'Accordion block requires title and body';
    end if;
  elsif v_type='columns' then
    if jsonb_typeof(p_content->'columns')<>'array'
       or jsonb_array_length(p_content->'columns')<2 then
      raise exception 'Columns block requires at least two columns';
    end if;
  end if;
end;
$$;

-- 6) Authoring detail now includes section identity.
create or replace function public.employer_micro_cert_authoring_detail(
  p_employer_id text,
  p_micro_cert_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb;
  v_version_id text;
begin
  if not security.can_view_employer_learning_as_employer(p_employer_id) then
    raise exception 'Employer Learning access denied';
  end if;

  select mc.current_version_id
  into v_version_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=p_micro_cert_id
    and mc.employer_id=p_employer_id;

  if not found then
    raise exception 'Micro-Certification not found';
  end if;

  v_base:=public.employer_micro_cert_detail(p_employer_id,p_micro_cert_id);

  return v_base || jsonb_build_object(
    'sections',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sectionId',s.section_id,
        'microCertVersionId',s.micro_cert_version_id,
        'sequence',s.sequence_no,
        'title',s.title,
        'description',s.description,
        'required',s.required,
        'createdAt',s.created_at,
        'updatedAt',s.updated_at
      ) order by s.sequence_no,s.created_at)
      from public.wf_employer_micro_cert_sections s
      where s.micro_cert_version_id=v_version_id
    ),'[]'::jsonb),
    'lessons',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'lessonId',l.lesson_id,
          'microCertVersionId',l.micro_cert_version_id,
          'sectionId',l.section_id,
          'sequence',l.sequence_no,
          'title',l.title,
          'description',l.description,
          'learningObjective',l.learning_objective,
          'estimatedMinutes',l.estimated_minutes,
          'required',l.required,
          'status',l.status,
          'createdByUserId',l.created_by_user_id,
          'createdAt',l.created_at,
          'updatedAt',l.updated_at,
          'blocks',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'lessonBlockId',b.lesson_block_id,
                'lessonId',b.lesson_id,
                'sequence',b.sequence_no,
                'blockType',b.block_type,
                'title',b.title,
                'content',b.content,
                'required',b.required,
                'createdAt',b.created_at,
                'updatedAt',b.updated_at
              )
              order by b.sequence_no,b.created_at
            )
            from public.wf_employer_micro_cert_lesson_blocks b
            where b.lesson_id=l.lesson_id
          ),'[]'::jsonb)
        )
        order by l.sequence_no,l.created_at
      )
      from public.wf_employer_micro_cert_lessons l
      where l.micro_cert_version_id=v_version_id
    ),'[]'::jsonb)
  );
end;
$$;

-- 7) Sections.
create or replace function public.employer_micro_cert_section_create(
  p_employer_id text,
  p_micro_cert_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_section_id text:=security.new_legacy_id('MCS');
  v_title text:=nullif(btrim(coalesce(p_payload->>'title','')),'');
  v_description text:=nullif(btrim(coalesce(p_payload->>'description','')),'');
  v_required boolean:=coalesce((p_payload->>'required')::boolean,true);
  v_sequence integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );
  if v_title is null then raise exception 'Section title is required'; end if;
  if length(v_title)>200 then raise exception 'Section title must be 200 characters or fewer'; end if;

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.wf_employer_micro_cert_sections
  where micro_cert_version_id=v_version_id;

  insert into public.wf_employer_micro_cert_sections(
    section_id,micro_cert_version_id,sequence_no,title,description,required,
    created_by_user_id,created_at,updated_at
  ) values(
    v_section_id,v_version_id,v_sequence,v_title,v_description,v_required,
    v_user_id,now(),now()
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_SECTION_CREATED',
    'employer_micro_cert_section',v_section_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object('sectionId',v_section_id,'title',v_title,'sequence',v_sequence),
    jsonb_build_object('source','W11-04C','microCertId',p_micro_cert_id,'microCertVersionId',v_version_id)
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_section_update(
  p_employer_id text,
  p_micro_cert_id text,
  p_section_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_section public.wf_employer_micro_cert_sections%rowtype;
  v_title text;
  v_description text;
  v_required boolean;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  select * into v_section from public.wf_employer_micro_cert_sections
  where section_id=p_section_id and micro_cert_version_id=v_version_id
  for update;
  if not found then raise exception 'Section not found'; end if;

  v_title:=case when p_payload ? 'title'
    then nullif(btrim(coalesce(p_payload->>'title','')),'') else v_section.title end;
  if v_title is null then raise exception 'Section title is required'; end if;
  v_description:=case when p_payload ? 'description'
    then nullif(btrim(coalesce(p_payload->>'description','')),'') else v_section.description end;
  v_required:=case when p_payload ? 'required'
    then (p_payload->>'required')::boolean else v_section.required end;

  update public.wf_employer_micro_cert_sections
  set title=v_title,description=v_description,required=v_required,updated_at=now()
  where section_id=p_section_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_SECTION_UPDATED',
    'employer_micro_cert_section',p_section_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object('title',v_section.title,'description',v_section.description,'required',v_section.required),
    jsonb_build_object('title',v_title,'description',v_description,'required',v_required),
    jsonb_build_object('source','W11-04C','microCertId',p_micro_cert_id,'microCertVersionId',v_version_id)
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_section_delete(
  p_employer_id text,
  p_micro_cert_id text,
  p_section_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_section public.wf_employer_micro_cert_sections%rowtype;
  v_ids text[];
  v_i integer;
  v_temp_base integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  select * into v_section from public.wf_employer_micro_cert_sections
  where section_id=p_section_id and micro_cert_version_id=v_version_id
  for update;
  if not found then raise exception 'Section not found'; end if;

  update public.wf_employer_micro_cert_lessons
  set section_id=null,updated_at=now()
  where section_id=p_section_id;

  delete from public.wf_employer_micro_cert_sections where section_id=p_section_id;

  select coalesce(array_agg(section_id order by sequence_no),array[]::text[]),
         coalesce(max(sequence_no),0)+1000000
  into v_ids,v_temp_base
  from public.wf_employer_micro_cert_sections
  where micro_cert_version_id=v_version_id;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_sections
    set sequence_no=v_temp_base+v_i,updated_at=now()
    where section_id=v_ids[v_i];
  end loop;
  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_sections
    set sequence_no=v_i,updated_at=now()
    where section_id=v_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_SECTION_DELETED',
    'employer_micro_cert_section',p_section_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object('sectionId',p_section_id,'title',v_section.title,'sequence',v_section.sequence_no),
    jsonb_build_object('source','W11-04C','microCertId',p_micro_cert_id,'microCertVersionId',v_version_id)
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

-- 8) Atomic structure update: sections + lesson placement/order.
create or replace function public.employer_micro_cert_structure_update(
  p_employer_id text,
  p_micro_cert_id text,
  p_structure jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_group jsonb;
  v_section_id text;
  v_lesson_id text;
  v_seen_sections text[]:=array[]::text[];
  v_seen_lessons text[]:=array[]::text[];
  v_section_order integer:=0;
  v_lesson_order integer:=0;
  v_temp_base integer;
  v_before jsonb;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );
  if p_structure is null or jsonb_typeof(p_structure)<>'array' then
    raise exception 'structure must be an array';
  end if;

  v_before:=public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);

  for v_group in select value from jsonb_array_elements(p_structure)
  loop
    v_section_id:=nullif(btrim(coalesce(v_group->>'sectionId','')),'');
    if not (v_group ? 'lessonIds') or jsonb_typeof(v_group->'lessonIds')<>'array' then
      raise exception 'Each structure group requires lessonIds array';
    end if;

    if v_section_id is not null then
      if v_section_id=any(v_seen_sections) then raise exception 'Duplicate section in structure'; end if;
      if not exists(
        select 1 from public.wf_employer_micro_cert_sections s
        where s.section_id=v_section_id and s.micro_cert_version_id=v_version_id
      ) then raise exception 'Section outside current course version'; end if;
      v_seen_sections:=array_append(v_seen_sections,v_section_id);
    end if;

    for v_lesson_id in select value from jsonb_array_elements_text(v_group->'lessonIds')
    loop
      if v_lesson_id=any(v_seen_lessons) then raise exception 'Duplicate lesson in structure'; end if;
      if not exists(
        select 1 from public.wf_employer_micro_cert_lessons l
        where l.lesson_id=v_lesson_id and l.micro_cert_version_id=v_version_id
      ) then raise exception 'Lesson outside current course version'; end if;
      v_seen_lessons:=array_append(v_seen_lessons,v_lesson_id);
    end loop;
  end loop;

  if coalesce(array_length(v_seen_sections,1),0)<>(select count(*) from public.wf_employer_micro_cert_sections where micro_cert_version_id=v_version_id) then
    raise exception 'structure must include every section exactly once';
  end if;
  if coalesce(array_length(v_seen_lessons,1),0)<>(select count(*) from public.wf_employer_micro_cert_lessons where micro_cert_version_id=v_version_id) then
    raise exception 'structure must include every lesson exactly once';
  end if;

  select coalesce(max(sequence_no),0)+1000000 into v_temp_base
  from public.wf_employer_micro_cert_sections where micro_cert_version_id=v_version_id;
  update public.wf_employer_micro_cert_sections
  set sequence_no=v_temp_base+sequence_no,updated_at=now()
  where micro_cert_version_id=v_version_id;

  select coalesce(max(sequence_no),0)+1000000 into v_temp_base
  from public.wf_employer_micro_cert_lessons where micro_cert_version_id=v_version_id;
  update public.wf_employer_micro_cert_lessons
  set sequence_no=v_temp_base+sequence_no,updated_at=now()
  where micro_cert_version_id=v_version_id;

  v_section_order:=0;
  v_lesson_order:=0;
  for v_group in select value from jsonb_array_elements(p_structure)
  loop
    v_section_id:=nullif(btrim(coalesce(v_group->>'sectionId','')),'');
    if v_section_id is not null then
      v_section_order:=v_section_order+1;
      update public.wf_employer_micro_cert_sections
      set sequence_no=v_section_order,updated_at=now()
      where section_id=v_section_id;
    end if;

    for v_lesson_id in select value from jsonb_array_elements_text(v_group->'lessonIds')
    loop
      v_lesson_order:=v_lesson_order+1;
      update public.wf_employer_micro_cert_lessons
      set sequence_no=v_lesson_order,section_id=v_section_id,updated_at=now()
      where lesson_id=v_lesson_id;
    end loop;
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_STRUCTURE_UPDATED',
    'employer_micro_cert',p_micro_cert_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object('sections',v_before->'sections','lessons',v_before->'lessons'),
    jsonb_build_object('structure',p_structure),
    jsonb_build_object('source','W11-04C','microCertVersionId',v_version_id)
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

-- 9) Employer-wide reusable block library.
create or replace function public.employer_learning_reusable_library(
  p_employer_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not security.can_view_employer_learning_as_employer(p_employer_id) then
    raise exception 'Employer Learning access denied';
  end if;
  return jsonb_build_object(
    'blocks',coalesce((
      select jsonb_agg(jsonb_build_object(
        'reusableBlockId',r.reusable_block_id,'title',r.title,'blockType',r.block_type,
        'content',r.content,'active',r.active,'createdAt',r.created_at,'updatedAt',r.updated_at
      ) order by r.updated_at desc)
      from public.wf_employer_learning_reusable_blocks r
      where r.employer_id=p_employer_id and r.active=true
    ),'[]'::jsonb),
    'lessonTemplates',coalesce((
      select jsonb_agg(jsonb_build_object(
        'lessonTemplateId',t.lesson_template_id,'title',t.title,'description',t.description,
        'snapshot',t.snapshot,'active',t.active,'createdAt',t.created_at,'updatedAt',t.updated_at
      ) order by t.updated_at desc)
      from public.wf_employer_learning_lesson_templates t
      where t.employer_id=p_employer_id and t.active=true
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.employer_learning_reusable_block_save(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text,
  p_lesson_block_id text,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_block public.wf_employer_micro_cert_lesson_blocks%rowtype;
  v_id text:=security.new_legacy_id('ERB');
  v_title text:=nullif(btrim(coalesce(p_title,'')),'');
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(p_employer_id,p_micro_cert_id);
  if v_title is null then raise exception 'Reusable block title is required'; end if;
  select b.* into v_block
  from public.wf_employer_micro_cert_lesson_blocks b
  join public.wf_employer_micro_cert_lessons l on l.lesson_id=b.lesson_id
  where b.lesson_block_id=p_lesson_block_id and b.lesson_id=p_lesson_id
    and l.micro_cert_version_id=v_version_id;
  if not found then raise exception 'Content block not found'; end if;

  insert into public.wf_employer_learning_reusable_blocks(
    reusable_block_id,employer_id,title,block_type,content,source_lesson_block_id,
    active,created_by_user_id,created_at,updated_at
  ) values(v_id,p_employer_id,v_title,v_block.block_type,v_block.content,p_lesson_block_id,true,v_user_id,now(),now());

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values((select auth.uid()),v_user_id,'EMPLOYER_LEARNING_REUSABLE_BLOCK_SAVED',
    'employer_learning_reusable_block',v_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object('reusableBlockId',v_id,'title',v_title,'blockType',v_block.block_type),
    jsonb_build_object('source','W11-04C','microCertId',p_micro_cert_id));

  return public.employer_learning_reusable_library(p_employer_id);
end;
$$;

create or replace function public.employer_learning_reusable_block_insert(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text,
  p_reusable_block_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_version_id text;
  v_reusable public.wf_employer_learning_reusable_blocks%rowtype;
  v_sequence integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(p_employer_id,p_micro_cert_id);
  if not exists(select 1 from public.wf_employer_micro_cert_lessons l where l.lesson_id=p_lesson_id and l.micro_cert_version_id=v_version_id and l.status<>'archived') then
    raise exception 'Lesson not found or archived';
  end if;
  select * into v_reusable from public.wf_employer_learning_reusable_blocks
  where reusable_block_id=p_reusable_block_id and employer_id=p_employer_id and active=true;
  if not found then raise exception 'Reusable block not found'; end if;

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.wf_employer_micro_cert_lesson_blocks where lesson_id=p_lesson_id;

  insert into public.wf_employer_micro_cert_lesson_blocks(
    lesson_block_id,lesson_id,sequence_no,block_type,title,content,required,created_at,updated_at
  ) values(
    security.new_legacy_id('LCB'),p_lesson_id,v_sequence,v_reusable.block_type,
    v_reusable.title,v_reusable.content,true,now(),now()
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_learning_lesson_template_save(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_lesson public.wf_employer_micro_cert_lessons%rowtype;
  v_snapshot jsonb;
  v_id text:=security.new_legacy_id('ELT');
  v_title text:=nullif(btrim(coalesce(p_title,'')),'');
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(p_employer_id,p_micro_cert_id);
  if v_title is null then raise exception 'Lesson template title is required'; end if;
  select * into v_lesson from public.wf_employer_micro_cert_lessons
  where lesson_id=p_lesson_id and micro_cert_version_id=v_version_id;
  if not found then raise exception 'Lesson not found'; end if;

  v_snapshot:=jsonb_build_object(
    'title',v_lesson.title,'description',v_lesson.description,
    'learningObjective',v_lesson.learning_objective,'estimatedMinutes',v_lesson.estimated_minutes,
    'required',v_lesson.required,
    'blocks',coalesce((select jsonb_agg(jsonb_build_object(
      'blockType',b.block_type,'title',b.title,'content',b.content,'required',b.required
    ) order by b.sequence_no) from public.wf_employer_micro_cert_lesson_blocks b where b.lesson_id=p_lesson_id),'[]'::jsonb)
  );

  insert into public.wf_employer_learning_lesson_templates(
    lesson_template_id,employer_id,title,description,snapshot,source_lesson_id,
    active,created_by_user_id,created_at,updated_at
  ) values(v_id,p_employer_id,v_title,v_lesson.description,v_snapshot,p_lesson_id,true,v_user_id,now(),now());

  return public.employer_learning_reusable_library(p_employer_id);
end;
$$;

create or replace function public.employer_learning_lesson_template_insert(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_template_id text,
  p_section_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_template public.wf_employer_learning_lesson_templates%rowtype;
  v_lesson_id text:=security.new_legacy_id('MCL');
  v_sequence integer;
  v_block jsonb;
  v_block_seq integer:=0;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(p_employer_id,p_micro_cert_id);
  if p_section_id is not null and not exists(select 1 from public.wf_employer_micro_cert_sections s where s.section_id=p_section_id and s.micro_cert_version_id=v_version_id) then
    raise exception 'Section outside current course version';
  end if;
  select * into v_template from public.wf_employer_learning_lesson_templates
  where lesson_template_id=p_lesson_template_id and employer_id=p_employer_id and active=true;
  if not found then raise exception 'Lesson template not found'; end if;

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.wf_employer_micro_cert_lessons where micro_cert_version_id=v_version_id;

  insert into public.wf_employer_micro_cert_lessons(
    lesson_id,micro_cert_version_id,section_id,sequence_no,title,description,
    learning_objective,estimated_minutes,required,status,created_by_user_id,created_at,updated_at
  ) values(
    v_lesson_id,v_version_id,p_section_id,v_sequence,
    coalesce(nullif(btrim(v_template.snapshot->>'title'),''),v_template.title),
    nullif(v_template.snapshot->>'description',''),
    nullif(v_template.snapshot->>'learningObjective',''),
    nullif(v_template.snapshot->>'estimatedMinutes','')::integer,
    coalesce((v_template.snapshot->>'required')::boolean,true),
    'draft',v_user_id,now(),now()
  );

  for v_block in select value from jsonb_array_elements(coalesce(v_template.snapshot->'blocks','[]'::jsonb))
  loop
    v_block_seq:=v_block_seq+1;
    insert into public.wf_employer_micro_cert_lesson_blocks(
      lesson_block_id,lesson_id,sequence_no,block_type,title,content,required,created_at,updated_at
    ) values(
      security.new_legacy_id('LCB'),v_lesson_id,v_block_seq,v_block->>'blockType',
      nullif(v_block->>'title',''),coalesce(v_block->'content','{}'::jsonb),
      coalesce((v_block->>'required')::boolean,true),now(),now()
    );
  end loop;

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

-- 10) Extend lesson creation to optional section placement.
create or replace function public.employer_micro_cert_lesson_create(
  p_employer_id text,
  p_micro_cert_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_lesson_id text:=security.new_legacy_id('MCL');
  v_title text:=nullif(btrim(coalesce(p_payload->>'title','')),'');
  v_description text:=nullif(btrim(coalesce(p_payload->>'description','')),'');
  v_objective text:=nullif(btrim(coalesce(p_payload->>'learningObjective','')),'');
  v_minutes integer;
  v_required boolean:=coalesce((p_payload->>'required')::boolean,true);
  v_sequence integer;
  v_status text:=lower(coalesce(nullif(btrim(p_payload->>'status'),''),'draft'));
  v_section_id text:=nullif(btrim(coalesce(p_payload->>'sectionId','')),'');
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(p_employer_id,p_micro_cert_id);
  if v_title is null then raise exception 'Lesson title is required'; end if;
  if v_status not in ('draft','ready') then raise exception 'New lessons must be draft or ready'; end if;
  if v_section_id is not null and not exists(select 1 from public.wf_employer_micro_cert_sections s where s.section_id=v_section_id and s.micro_cert_version_id=v_version_id) then
    raise exception 'Section outside current course version';
  end if;
  if p_payload ? 'estimatedMinutes' and nullif(btrim(coalesce(p_payload->>'estimatedMinutes','')),'') is not null then
    v_minutes:=(p_payload->>'estimatedMinutes')::integer;
    if v_minutes<0 then raise exception 'estimatedMinutes must be non-negative'; end if;
  end if;
  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.wf_employer_micro_cert_lessons where micro_cert_version_id=v_version_id;

  insert into public.wf_employer_micro_cert_lessons(
    lesson_id,micro_cert_version_id,section_id,sequence_no,title,description,
    learning_objective,estimated_minutes,required,status,created_by_user_id,created_at,updated_at
  ) values(
    v_lesson_id,v_version_id,v_section_id,v_sequence,v_title,v_description,
    v_objective,v_minutes,v_required,v_status,v_user_id,now(),now()
  );
  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

-- 11) Deep version clone now preserves sections and lesson placement.
create or replace function public.employer_micro_cert_create_version(
  p_employer_id text,
  p_micro_cert_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_course public.wf_employer_micro_certs%rowtype;
  v_current public.wf_employer_micro_cert_versions%rowtype;
  v_version_id text:=security.new_legacy_id('MCV');
  v_next integer;
  v_section record;
  v_lesson record;
  v_block record;
  v_new_section_id text;
  v_new_lesson_id text;
  v_section_map jsonb:='{}'::jsonb;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then raise exception 'Employer Learning management denied'; end if;
  select * into v_course from public.wf_employer_micro_certs
  where micro_cert_id=p_micro_cert_id and employer_id=p_employer_id for update;
  if not found then raise exception 'Micro-Certification not found'; end if;
  select * into v_current from public.wf_employer_micro_cert_versions
  where micro_cert_version_id=v_course.current_version_id;
  if not found then raise exception 'Current Micro-Certification version not found'; end if;
  select coalesce(max(version_number),0)+1 into v_next from public.wf_employer_micro_cert_versions where micro_cert_id=p_micro_cert_id;

  insert into public.wf_employer_micro_cert_versions(
    micro_cert_version_id,micro_cert_id,version_number,status,learning_objective,
    content_type,content_url,equipment_process_context,safety_notes,duration_minutes,
    passing_requirement,company_badge_id,certification_definition_id,published_at,
    created_by_user_id,created_at,updated_at
  ) values(
    v_version_id,p_micro_cert_id,v_next,'draft',v_current.learning_objective,
    v_current.content_type,v_current.content_url,v_current.equipment_process_context,
    v_current.safety_notes,v_current.duration_minutes,v_current.passing_requirement,
    v_current.company_badge_id,v_current.certification_definition_id,null,v_user_id,now(),now()
  );

  for v_section in select * from public.wf_employer_micro_cert_sections
    where micro_cert_version_id=v_current.micro_cert_version_id order by sequence_no
  loop
    v_new_section_id:=security.new_legacy_id('MCS');
    insert into public.wf_employer_micro_cert_sections(
      section_id,micro_cert_version_id,sequence_no,title,description,required,
      created_by_user_id,created_at,updated_at
    ) values(
      v_new_section_id,v_version_id,v_section.sequence_no,v_section.title,
      v_section.description,v_section.required,v_user_id,now(),now()
    );
    v_section_map:=v_section_map || jsonb_build_object(v_section.section_id,v_new_section_id);
  end loop;

  for v_lesson in select * from public.wf_employer_micro_cert_lessons
    where micro_cert_version_id=v_current.micro_cert_version_id order by sequence_no
  loop
    v_new_lesson_id:=security.new_legacy_id('MCL');
    insert into public.wf_employer_micro_cert_lessons(
      lesson_id,micro_cert_version_id,section_id,sequence_no,title,description,
      learning_objective,estimated_minutes,required,status,created_by_user_id,created_at,updated_at
    ) values(
      v_new_lesson_id,v_version_id,
      case when v_lesson.section_id is null then null else v_section_map->>v_lesson.section_id end,
      v_lesson.sequence_no,v_lesson.title,v_lesson.description,v_lesson.learning_objective,
      v_lesson.estimated_minutes,v_lesson.required,
      case when v_lesson.status='archived' then 'archived' else 'draft' end,
      v_user_id,now(),now()
    );
    for v_block in select * from public.wf_employer_micro_cert_lesson_blocks
      where lesson_id=v_lesson.lesson_id order by sequence_no
    loop
      insert into public.wf_employer_micro_cert_lesson_blocks(
        lesson_block_id,lesson_id,sequence_no,block_type,title,content,required,created_at,updated_at
      ) values(
        security.new_legacy_id('LCB'),v_new_lesson_id,v_block.sequence_no,v_block.block_type,
        v_block.title,v_block.content,v_block.required,now(),now()
      );
    end loop;
  end loop;

  update public.wf_employer_micro_certs set current_version_id=v_version_id,
    updated_by_user_id=v_user_id,updated_at=now() where micro_cert_id=p_micro_cert_id;

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

-- privileges
revoke all on function public.employer_micro_cert_section_create(text,text,jsonb) from public,anon;
revoke all on function public.employer_micro_cert_section_update(text,text,text,jsonb) from public,anon;
revoke all on function public.employer_micro_cert_section_delete(text,text,text) from public,anon;
revoke all on function public.employer_micro_cert_structure_update(text,text,jsonb) from public,anon;
revoke all on function public.employer_learning_reusable_library(text) from public,anon;
revoke all on function public.employer_learning_reusable_block_save(text,text,text,text,text) from public,anon;
revoke all on function public.employer_learning_reusable_block_insert(text,text,text,text) from public,anon;
revoke all on function public.employer_learning_lesson_template_save(text,text,text,text) from public,anon;
revoke all on function public.employer_learning_lesson_template_insert(text,text,text,text) from public,anon;

grant execute on function public.employer_micro_cert_section_create(text,text,jsonb) to authenticated,service_role;
grant execute on function public.employer_micro_cert_section_update(text,text,text,jsonb) to authenticated,service_role;
grant execute on function public.employer_micro_cert_section_delete(text,text,text) to authenticated,service_role;
grant execute on function public.employer_micro_cert_structure_update(text,text,jsonb) to authenticated,service_role;
grant execute on function public.employer_learning_reusable_library(text) to authenticated,service_role;
grant execute on function public.employer_learning_reusable_block_save(text,text,text,text,text) to authenticated,service_role;
grant execute on function public.employer_learning_reusable_block_insert(text,text,text,text) to authenticated,service_role;
grant execute on function public.employer_learning_lesson_template_save(text,text,text,text) to authenticated,service_role;
grant execute on function public.employer_learning_lesson_template_insert(text,text,text,text) to authenticated,service_role;
