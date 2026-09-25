-- W11-04A follow-up: preserve positive sequence constraints during reorder/delete compaction.

create or replace function public.employer_micro_cert_lessons_reorder(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_ids text[];
  v_actual_count integer;
  v_distinct_count integer;
  v_i integer;
  v_temp_base integer;
  v_before jsonb;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if p_lesson_ids is null or jsonb_typeof(p_lesson_ids)<>'array' then
    raise exception 'lessonIds must be an array';
  end if;

  select coalesce(array_agg(value order by ordinality),array[]::text[]),
         count(*),
         count(distinct value)
  into v_ids,v_actual_count,v_distinct_count
  from jsonb_array_elements_text(p_lesson_ids) with ordinality as x(value,ordinality);

  if v_actual_count<>v_distinct_count then
    raise exception 'lessonIds must not contain duplicates';
  end if;

  if v_actual_count<>(
    select count(*)
    from public.wf_employer_micro_cert_lessons
    where micro_cert_version_id=v_version_id
  ) then
    raise exception 'lessonIds must contain every lesson in the current version exactly once';
  end if;

  if exists(
    select 1
    from unnest(v_ids) as x(lesson_id)
    where not exists(
      select 1
      from public.wf_employer_micro_cert_lessons l
      where l.lesson_id=x.lesson_id
        and l.micro_cert_version_id=v_version_id
    )
  ) then
    raise exception 'lessonIds contains a lesson outside the current course version';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'lessonId',lesson_id,'sequence',sequence_no
  ) order by sequence_no),'[]'::jsonb),
  coalesce(max(sequence_no),0)+1000000
  into v_before,v_temp_base
  from public.wf_employer_micro_cert_lessons
  where micro_cert_version_id=v_version_id;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_lessons
    set sequence_no=v_temp_base+v_i,updated_at=now()
    where lesson_id=v_ids[v_i];
  end loop;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_lessons
    set sequence_no=v_i,updated_at=now()
    where lesson_id=v_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_LESSONS_REORDERED',
    'employer_micro_cert',p_micro_cert_id,'workforce-employer-learning',
    p_employer_id,'success',v_before,
    (select coalesce(jsonb_agg(jsonb_build_object(
      'lessonId',lesson_id,'sequence',sequence_no
    ) order by sequence_no),'[]'::jsonb)
     from public.wf_employer_micro_cert_lessons
     where micro_cert_version_id=v_version_id),
    jsonb_build_object(
      'source','W11-04A',
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_lesson_blocks_reorder(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text,
  p_lesson_block_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_ids text[];
  v_actual_count integer;
  v_distinct_count integer;
  v_i integer;
  v_temp_base integer;
  v_before jsonb;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if not exists(
    select 1
    from public.wf_employer_micro_cert_lessons l
    where l.lesson_id=p_lesson_id
      and l.micro_cert_version_id=v_version_id
      and l.status<>'archived'
  ) then
    raise exception 'Lesson not found or archived';
  end if;

  if p_lesson_block_ids is null or jsonb_typeof(p_lesson_block_ids)<>'array' then
    raise exception 'lessonBlockIds must be an array';
  end if;

  select coalesce(array_agg(value order by ordinality),array[]::text[]),
         count(*),
         count(distinct value)
  into v_ids,v_actual_count,v_distinct_count
  from jsonb_array_elements_text(p_lesson_block_ids) with ordinality as x(value,ordinality);

  if v_actual_count<>v_distinct_count then
    raise exception 'lessonBlockIds must not contain duplicates';
  end if;

  if v_actual_count<>(
    select count(*)
    from public.wf_employer_micro_cert_lesson_blocks
    where lesson_id=p_lesson_id
  ) then
    raise exception 'lessonBlockIds must contain every block in the lesson exactly once';
  end if;

  if exists(
    select 1
    from unnest(v_ids) as x(block_id)
    where not exists(
      select 1
      from public.wf_employer_micro_cert_lesson_blocks b
      where b.lesson_block_id=x.block_id
        and b.lesson_id=p_lesson_id
    )
  ) then
    raise exception 'lessonBlockIds contains a block outside the lesson';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'lessonBlockId',lesson_block_id,'sequence',sequence_no
  ) order by sequence_no),'[]'::jsonb),
  coalesce(max(sequence_no),0)+1000000
  into v_before,v_temp_base
  from public.wf_employer_micro_cert_lesson_blocks
  where lesson_id=p_lesson_id;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_lesson_blocks
    set sequence_no=v_temp_base+v_i,updated_at=now()
    where lesson_block_id=v_ids[v_i];
  end loop;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_lesson_blocks
    set sequence_no=v_i,updated_at=now()
    where lesson_block_id=v_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_LESSON_BLOCKS_REORDERED',
    'employer_micro_cert_lesson',p_lesson_id,'workforce-employer-learning',
    p_employer_id,'success',v_before,
    (select coalesce(jsonb_agg(jsonb_build_object(
      'lessonBlockId',lesson_block_id,'sequence',sequence_no
    ) order by sequence_no),'[]'::jsonb)
     from public.wf_employer_micro_cert_lesson_blocks
     where lesson_id=p_lesson_id),
    jsonb_build_object(
      'source','W11-04A',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_lesson_block_delete(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text,
  p_lesson_block_id text
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
  v_ids text[];
  v_i integer;
  v_temp_base integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if not exists(
    select 1
    from public.wf_employer_micro_cert_lessons l
    where l.lesson_id=p_lesson_id
      and l.micro_cert_version_id=v_version_id
      and l.status<>'archived'
  ) then
    raise exception 'Lesson not found or archived';
  end if;

  select * into v_block
  from public.wf_employer_micro_cert_lesson_blocks
  where lesson_block_id=p_lesson_block_id
    and lesson_id=p_lesson_id
  for update;

  if not found then raise exception 'Content block not found'; end if;

  delete from public.wf_employer_micro_cert_lesson_blocks
  where lesson_block_id=p_lesson_block_id;

  select coalesce(array_agg(lesson_block_id order by sequence_no),array[]::text[]),
         coalesce(max(sequence_no),0)+1000000
  into v_ids,v_temp_base
  from public.wf_employer_micro_cert_lesson_blocks
  where lesson_id=p_lesson_id;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_lesson_blocks
    set sequence_no=v_temp_base+v_i,updated_at=now()
    where lesson_block_id=v_ids[v_i];
  end loop;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_lesson_blocks
    set sequence_no=v_i,updated_at=now()
    where lesson_block_id=v_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_LESSON_BLOCK_DELETED',
    'employer_micro_cert_lesson_block',p_lesson_block_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'lessonBlockId',p_lesson_block_id,
      'lessonId',p_lesson_id,
      'blockType',v_block.block_type,
      'sequence',v_block.sequence_no,
      'content',v_block.content
    ),
    jsonb_build_object(
      'source','W11-04A',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;
