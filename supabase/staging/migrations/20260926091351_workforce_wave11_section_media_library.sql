-- W11-04D: Section authoring enhancements + Employer-wide Media Library.
-- Private Supabase Storage, scoped authenticated policies, reference-safe asset metadata,
-- audio lesson blocks, and deep section duplication.

-- ---------------------------------------------------------------------------
-- 1) Lesson block vocabulary: add audio.
-- ---------------------------------------------------------------------------

alter table public.wf_employer_micro_cert_lesson_blocks
  drop constraint if exists wf_employer_micro_cert_lesson_blocks_block_type_check;

alter table public.wf_employer_micro_cert_lesson_blocks
  add constraint wf_employer_micro_cert_lesson_blocks_block_type_check
  check (block_type in (
    'text','rich_text','heading','list','callout','safety_note',
    'image','video','audio','document','link','embed','divider','button',
    'download','accordion','columns'
  ));

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
  v_url text;
begin
  if v_type not in (
    'text','rich_text','heading','list','callout','safety_note',
    'image','video','audio','document','link','embed','divider','button',
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
  elsif v_type in ('image','video','audio','document','embed','download') then
    v_url:=nullif(btrim(coalesce(p_content->>'url','')),'');
    if v_url is null then raise exception 'URL is required for % block',v_type; end if;
    if v_url !~* '^(https?://|/)' then raise exception 'Unsafe or unsupported URL scheme'; end if;
  elsif v_type='link' then
    v_url:=nullif(btrim(coalesce(p_content->>'url','')),'');
    if v_url is null then raise exception 'URL is required for link block'; end if;
    if v_url !~* '^(https?://|/|mailto:|tel:)' then raise exception 'Unsafe or unsupported URL scheme'; end if;
  elsif v_type='button' then
    v_url:=nullif(btrim(coalesce(p_content->>'url','')),'');
    if v_url is null
       or nullif(btrim(coalesce(p_content->>'label','')),'') is null then
      raise exception 'Button block requires label and URL';
    end if;
    if v_url !~* '^(https?://|/|mailto:|tel:)' then raise exception 'Unsafe or unsupported URL scheme'; end if;
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

-- ---------------------------------------------------------------------------
-- 2) Employer-wide media metadata.
-- ---------------------------------------------------------------------------

create table if not exists public.wf_employer_learning_media_assets (
  id uuid primary key default gen_random_uuid(),
  media_asset_id text not null unique default security.new_legacy_id('MED'),
  employer_id text not null
    references public.contractors(contractor_id) on delete cascade,
  bucket_id text not null default 'employer-learning-media',
  storage_path text not null unique,
  original_filename text not null,
  display_name text not null,
  media_kind text not null
    check (media_kind in ('image','video','audio','document')),
  mime_type text not null,
  extension text not null,
  size_bytes bigint not null check (size_bytes > 0),
  status text not null default 'pending'
    check (status in ('pending','ready','failed','deleted')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_by_user_id text references public.users(user_id) on delete set null,
  ready_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wf_learning_media_employer_status
  on public.wf_employer_learning_media_assets(employer_id,status,updated_at desc);

create index if not exists idx_wf_learning_media_created_by
  on public.wf_employer_learning_media_assets(created_by_user_id)
  where created_by_user_id is not null;

alter table public.wf_employer_learning_media_assets enable row level security;
revoke all on table public.wf_employer_learning_media_assets
  from public,anon,authenticated;
grant all on table public.wf_employer_learning_media_assets to service_role;

-- ---------------------------------------------------------------------------
-- 3) Private Storage bucket + narrow Employer-scoped policies.
-- ---------------------------------------------------------------------------

insert into storage.buckets(
  id,name,public,file_size_limit,allowed_mime_types
)
values(
  'employer-learning-media',
  'employer-learning-media',
  false,
  524288000,
  null
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    updated_at=now();

create or replace function security.can_view_employer_learning_storage(
  p_employer_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select security.can_view_employer_learning_as_employer(p_employer_id);
$$;

create or replace function security.can_manage_employer_learning_storage(
  p_employer_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select security.can_manage_employer_learning_content(p_employer_id);
$$;

revoke all on function security.can_view_employer_learning_storage(text)
  from public,anon;
revoke all on function security.can_manage_employer_learning_storage(text)
  from public,anon;
grant execute on function security.can_view_employer_learning_storage(text)
  to authenticated,service_role;
grant execute on function security.can_manage_employer_learning_storage(text)
  to authenticated,service_role;

drop policy if exists "Employer Learning media read" on storage.objects;
create policy "Employer Learning media read"
on storage.objects
for select
to authenticated
using (
  bucket_id='employer-learning-media'
  and security.can_view_employer_learning_storage(split_part(name,'/',1))
);

drop policy if exists "Employer Learning media insert" on storage.objects;
create policy "Employer Learning media insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id='employer-learning-media'
  and security.can_manage_employer_learning_storage(split_part(name,'/',1))
);

drop policy if exists "Employer Learning media update" on storage.objects;
create policy "Employer Learning media update"
on storage.objects
for update
to authenticated
using (
  bucket_id='employer-learning-media'
  and security.can_manage_employer_learning_storage(split_part(name,'/',1))
)
with check (
  bucket_id='employer-learning-media'
  and security.can_manage_employer_learning_storage(split_part(name,'/',1))
);

drop policy if exists "Employer Learning media delete" on storage.objects;
create policy "Employer Learning media delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id='employer-learning-media'
  and security.can_manage_employer_learning_storage(split_part(name,'/',1))
);

-- ---------------------------------------------------------------------------
-- 4) Media validation and RPCs.
-- ---------------------------------------------------------------------------

create or replace function security.validate_employer_learning_media(
  p_media_kind text,
  p_mime_type text,
  p_filename text,
  p_size_bytes bigint
)
returns text
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  v_kind text:=lower(btrim(coalesce(p_media_kind,'')));
  v_mime text:=lower(btrim(coalesce(p_mime_type,'')));
  v_name text:=lower(btrim(coalesce(p_filename,'')));
  v_ext text:=lower(regexp_replace(v_name,'^.*\.','',''));
  v_limit bigint;
begin
  if v_kind not in ('image','video','audio','document') then
    raise exception 'Unsupported media kind';
  end if;
  if p_size_bytes is null or p_size_bytes<=0 then
    raise exception 'Media file must not be empty';
  end if;
  if length(v_name)=0 or length(v_name)>255 then
    raise exception 'Invalid media filename';
  end if;

  if v_kind='image' then
    v_limit:=15728640;
    if v_mime not in ('image/jpeg','image/png','image/webp','image/gif')
       or v_ext not in ('jpg','jpeg','png','webp','gif') then
      raise exception 'Unsupported image file type';
    end if;
  elsif v_kind='video' then
    v_limit:=524288000;
    if v_mime not in ('video/mp4','video/webm','video/quicktime')
       or v_ext not in ('mp4','webm','mov') then
      raise exception 'Unsupported video file type';
    end if;
  elsif v_kind='audio' then
    v_limit:=104857600;
    if v_mime not in (
      'audio/mpeg','audio/mp4','audio/x-m4a','audio/wav',
      'audio/x-wav','audio/ogg'
    ) or v_ext not in ('mp3','m4a','wav','ogg') then
      raise exception 'Unsupported audio file type';
    end if;
  else
    v_limit:=52428800;
    if not (
      (v_mime='application/pdf' and v_ext='pdf')
      or (v_mime='text/plain' and v_ext='txt')
      or (v_mime='text/csv' and v_ext='csv')
      or (v_mime='application/zip' and v_ext='zip')
      or (v_mime='application/msword' and v_ext='doc')
      or (v_mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document' and v_ext='docx')
      or (v_mime='application/vnd.ms-powerpoint' and v_ext='ppt')
      or (v_mime='application/vnd.openxmlformats-officedocument.presentationml.presentation' and v_ext='pptx')
      or (v_mime='application/vnd.ms-excel' and v_ext='xls')
      or (v_mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and v_ext='xlsx')
    ) then
      raise exception 'Unsupported document file type';
    end if;
  end if;

  if p_size_bytes>v_limit then
    raise exception 'Media file exceeds the allowed size for %',v_kind;
  end if;

  return v_ext;
end;
$$;

revoke all on function security.validate_employer_learning_media(text,text,text,bigint)
  from public,anon,authenticated;
grant execute on function security.validate_employer_learning_media(text,text,text,bigint)
  to service_role;

create or replace function public.employer_learning_media_reserve(
  p_employer_id text,
  p_filename text,
  p_display_name text,
  p_media_kind text,
  p_mime_type text,
  p_size_bytes bigint,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_media_id text:=security.new_legacy_id('MED');
  v_ext text;
  v_display text:=nullif(btrim(coalesce(p_display_name,'')),'');
  v_path text;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;

  v_ext:=security.validate_employer_learning_media(
    p_media_kind,p_mime_type,p_filename,p_size_bytes
  );

  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then
    raise exception 'Media metadata must be an object';
  end if;

  if v_display is null then
    v_display:=left(regexp_replace(p_filename,'\.[^.]+$',''),200);
  end if;
  if length(v_display)>200 then
    raise exception 'Media display name must be 200 characters or fewer';
  end if;

  v_path:=p_employer_id || '/' || v_media_id || '/asset.' || v_ext;

  insert into public.wf_employer_learning_media_assets(
    media_asset_id,employer_id,bucket_id,storage_path,original_filename,
    display_name,media_kind,mime_type,extension,size_bytes,status,metadata,
    created_by_user_id,created_at,updated_at
  ) values(
    v_media_id,p_employer_id,'employer-learning-media',v_path,p_filename,
    v_display,lower(p_media_kind),lower(p_mime_type),v_ext,p_size_bytes,
    'pending',p_metadata,v_user_id,now(),now()
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'EMPLOYER_LEARNING_MEDIA_RESERVED',
    'employer_learning_media_asset',v_media_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'mediaAssetId',v_media_id,'storagePath',v_path,'mediaKind',lower(p_media_kind),
      'mimeType',lower(p_mime_type),'sizeBytes',p_size_bytes
    ),
    jsonb_build_object('source','W11-04D')
  );

  return jsonb_build_object(
    'mediaAssetId',v_media_id,
    'employerId',p_employer_id,
    'bucketId','employer-learning-media',
    'storagePath',v_path,
    'originalFilename',p_filename,
    'displayName',v_display,
    'mediaKind',lower(p_media_kind),
    'mimeType',lower(p_mime_type),
    'extension',v_ext,
    'sizeBytes',p_size_bytes,
    'status','pending',
    'metadata',p_metadata,
    'createdAt',now(),
    'updatedAt',now()
  );
end;
$$;

create or replace function public.employer_learning_media_finalize(
  p_employer_id text,
  p_media_asset_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_asset public.wf_employer_learning_media_assets%rowtype;
  v_object storage.objects%rowtype;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;

  select * into v_asset
  from public.wf_employer_learning_media_assets
  where media_asset_id=p_media_asset_id
    and employer_id=p_employer_id
    and status='pending'
  for update;
  if not found then raise exception 'Pending media asset not found'; end if;

  select * into v_object
  from storage.objects
  where bucket_id=v_asset.bucket_id
    and name=v_asset.storage_path
    and is_delete_marker is not true
  limit 1;
  if not found then raise exception 'Uploaded media object not found'; end if;

  update public.wf_employer_learning_media_assets
  set status='ready',ready_at=now(),updated_at=now()
  where media_asset_id=p_media_asset_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'EMPLOYER_LEARNING_MEDIA_READY',
    'employer_learning_media_asset',p_media_asset_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'storagePath',v_asset.storage_path,'mediaKind',v_asset.media_kind,
      'mimeType',v_asset.mime_type,'sizeBytes',v_asset.size_bytes
    ),
    jsonb_build_object('source','W11-04D')
  );

  return jsonb_build_object(
    'mediaAssetId',v_asset.media_asset_id,
    'employerId',v_asset.employer_id,
    'bucketId',v_asset.bucket_id,
    'storagePath',v_asset.storage_path,
    'originalFilename',v_asset.original_filename,
    'displayName',v_asset.display_name,
    'mediaKind',v_asset.media_kind,
    'mimeType',v_asset.mime_type,
    'extension',v_asset.extension,
    'sizeBytes',v_asset.size_bytes,
    'status','ready',
    'metadata',v_asset.metadata,
    'createdAt',v_asset.created_at,
    'updatedAt',now()
  );
end;
$$;

create or replace function public.employer_learning_media_list(
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

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'mediaAssetId',a.media_asset_id,
      'employerId',a.employer_id,
      'bucketId',a.bucket_id,
      'storagePath',a.storage_path,
      'originalFilename',a.original_filename,
      'displayName',a.display_name,
      'mediaKind',a.media_kind,
      'mimeType',a.mime_type,
      'extension',a.extension,
      'sizeBytes',a.size_bytes,
      'status',a.status,
      'metadata',a.metadata,
      'createdAt',a.created_at,
      'updatedAt',a.updated_at
    ) order by a.updated_at desc)
    from public.wf_employer_learning_media_assets a
    where a.employer_id=p_employer_id
      and a.status='ready'
  ),'[]'::jsonb);
end;
$$;

create or replace function public.employer_learning_media_get(
  p_employer_id text,
  p_media_asset_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_asset public.wf_employer_learning_media_assets%rowtype;
begin
  if not security.can_view_employer_learning_as_employer(p_employer_id) then
    raise exception 'Employer Learning access denied';
  end if;

  select * into v_asset
  from public.wf_employer_learning_media_assets
  where media_asset_id=p_media_asset_id
    and employer_id=p_employer_id
    and status='ready';
  if not found then raise exception 'Media asset not found'; end if;

  return jsonb_build_object(
    'mediaAssetId',v_asset.media_asset_id,
    'employerId',v_asset.employer_id,
    'bucketId',v_asset.bucket_id,
    'storagePath',v_asset.storage_path,
    'originalFilename',v_asset.original_filename,
    'displayName',v_asset.display_name,
    'mediaKind',v_asset.media_kind,
    'mimeType',v_asset.mime_type,
    'extension',v_asset.extension,
    'sizeBytes',v_asset.size_bytes,
    'status',v_asset.status,
    'metadata',v_asset.metadata,
    'createdAt',v_asset.created_at,
    'updatedAt',v_asset.updated_at
  );
end;
$$;

create or replace function public.employer_learning_media_delete_guard(
  p_employer_id text,
  p_media_asset_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_asset public.wf_employer_learning_media_assets%rowtype;
  v_refs integer;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;

  select * into v_asset
  from public.wf_employer_learning_media_assets
  where media_asset_id=p_media_asset_id
    and employer_id=p_employer_id
    and status in ('pending','ready');
  if not found then raise exception 'Media asset not found'; end if;

  select count(*) into v_refs
  from public.wf_employer_micro_cert_lesson_blocks b
  join public.wf_employer_micro_cert_lessons l on l.lesson_id=b.lesson_id
  join public.wf_employer_micro_cert_versions v
    on v.micro_cert_version_id=l.micro_cert_version_id
  join public.wf_employer_micro_certs mc on mc.micro_cert_id=v.micro_cert_id
  where mc.employer_id=p_employer_id
    and b.content->>'mediaAssetId'=p_media_asset_id;

  if v_refs>0 then
    raise exception 'MEDIA_ASSET_IN_USE';
  end if;

  return jsonb_build_object(
    'mediaAssetId',v_asset.media_asset_id,
    'bucketId',v_asset.bucket_id,
    'storagePath',v_asset.storage_path,
    'status',v_asset.status,
    'referenceCount',v_refs
  );
end;
$$;

create or replace function public.employer_learning_media_delete_finalize(
  p_employer_id text,
  p_media_asset_id text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_asset public.wf_employer_learning_media_assets%rowtype;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;

  select * into v_asset
  from public.wf_employer_learning_media_assets
  where media_asset_id=p_media_asset_id
    and employer_id=p_employer_id
    and status in ('pending','ready')
  for update;
  if not found then raise exception 'Media asset not found'; end if;

  if exists(
    select 1
    from public.wf_employer_micro_cert_lesson_blocks b
    join public.wf_employer_micro_cert_lessons l on l.lesson_id=b.lesson_id
    join public.wf_employer_micro_cert_versions v
      on v.micro_cert_version_id=l.micro_cert_version_id
    join public.wf_employer_micro_certs mc on mc.micro_cert_id=v.micro_cert_id
    where mc.employer_id=p_employer_id
      and b.content->>'mediaAssetId'=p_media_asset_id
  ) then
    raise exception 'MEDIA_ASSET_IN_USE';
  end if;

  update public.wf_employer_learning_media_assets
  set status='deleted',deleted_at=now(),updated_at=now()
  where media_asset_id=p_media_asset_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'EMPLOYER_LEARNING_MEDIA_DELETED',
    'employer_learning_media_asset',p_media_asset_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object('status',v_asset.status,'storagePath',v_asset.storage_path),
    jsonb_build_object('status','deleted'),
    jsonb_build_object('source','W11-04D')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Duplicate an entire section. New lesson/content IDs; lesson status Draft.
-- Media references remain stable because content JSON is copied, not objects.
-- ---------------------------------------------------------------------------

create or replace function public.employer_micro_cert_section_duplicate(
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
  v_source public.wf_employer_micro_cert_sections%rowtype;
  v_new_section_id text:=security.new_legacy_id('MCS');
  v_section_ids text[];
  v_lesson_ids text[];
  v_section_pos integer;
  v_insert_lesson_pos integer:=0;
  v_i integer;
  v_temp_base integer;
  v_lesson record;
  v_block record;
  v_new_lesson_id text;
  v_cloned_lessons integer:=0;
  v_cloned_blocks integer:=0;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  select * into v_source
  from public.wf_employer_micro_cert_sections
  where section_id=p_section_id
    and micro_cert_version_id=v_version_id
  for update;
  if not found then raise exception 'Section not found'; end if;

  select coalesce(array_agg(section_id order by sequence_no),array[]::text[])
  into v_section_ids
  from public.wf_employer_micro_cert_sections
  where micro_cert_version_id=v_version_id;

  select coalesce(array_agg(lesson_id order by sequence_no),array[]::text[])
  into v_lesson_ids
  from public.wf_employer_micro_cert_lessons
  where micro_cert_version_id=v_version_id;

  select coalesce(max(sequence_no),0)+1
  into v_i
  from public.wf_employer_micro_cert_sections
  where micro_cert_version_id=v_version_id;

  insert into public.wf_employer_micro_cert_sections(
    section_id,micro_cert_version_id,sequence_no,title,description,required,
    created_by_user_id,created_at,updated_at
  ) values(
    v_new_section_id,v_version_id,v_i,
    left(v_source.title || ' — Copy',200),
    v_source.description,v_source.required,v_user_id,now(),now()
  );

  -- Clone section lessons at the end temporarily.
  for v_lesson in
    select *
    from public.wf_employer_micro_cert_lessons
    where micro_cert_version_id=v_version_id
      and section_id=p_section_id
    order by sequence_no
  loop
    v_new_lesson_id:=security.new_legacy_id('MCL');

    select coalesce(max(sequence_no),0)+1 into v_i
    from public.wf_employer_micro_cert_lessons
    where micro_cert_version_id=v_version_id;

    insert into public.wf_employer_micro_cert_lessons(
      lesson_id,micro_cert_version_id,section_id,sequence_no,title,description,
      learning_objective,estimated_minutes,required,status,created_by_user_id,
      created_at,updated_at
    ) values(
      v_new_lesson_id,v_version_id,v_new_section_id,v_i,
      left(v_lesson.title || ' — Copy',200),
      v_lesson.description,v_lesson.learning_objective,
      v_lesson.estimated_minutes,v_lesson.required,'draft',
      v_user_id,now(),now()
    );
    v_cloned_lessons:=v_cloned_lessons+1;

    for v_block in
      select *
      from public.wf_employer_micro_cert_lesson_blocks
      where lesson_id=v_lesson.lesson_id
      order by sequence_no
    loop
      insert into public.wf_employer_micro_cert_lesson_blocks(
        lesson_block_id,lesson_id,sequence_no,block_type,title,content,required,
        created_at,updated_at
      ) values(
        security.new_legacy_id('LCB'),v_new_lesson_id,v_block.sequence_no,
        v_block.block_type,v_block.title,v_block.content,v_block.required,
        now(),now()
      );
      v_cloned_blocks:=v_cloned_blocks+1;
    end loop;
  end loop;

  -- Normalize section order with the copy immediately after its source.
  select array_position(v_section_ids,p_section_id) into v_section_pos;
  v_section_ids:=v_section_ids[1:v_section_pos]
    || array[v_new_section_id]
    || coalesce(v_section_ids[v_section_pos+1:array_length(v_section_ids,1)],array[]::text[]);

  select coalesce(max(sequence_no),0)+1000000 into v_temp_base
  from public.wf_employer_micro_cert_sections
  where micro_cert_version_id=v_version_id;

  update public.wf_employer_micro_cert_sections
  set sequence_no=v_temp_base+sequence_no,updated_at=now()
  where micro_cert_version_id=v_version_id;

  for v_i in 1..coalesce(array_length(v_section_ids,1),0) loop
    update public.wf_employer_micro_cert_sections
    set sequence_no=v_i,updated_at=now()
    where section_id=v_section_ids[v_i];
  end loop;

  -- Rebuild global lesson order with cloned lessons directly after source section lessons.
  select coalesce(max(l.sequence_no),0)
  into v_insert_lesson_pos
  from public.wf_employer_micro_cert_lessons l
  where l.micro_cert_version_id=v_version_id
    and l.section_id=p_section_id;

  -- New clones currently follow all old lessons. Capture them in their internal order.
  select coalesce(array_agg(lesson_id order by sequence_no),array[]::text[])
  into v_section_ids
  from public.wf_employer_micro_cert_lessons
  where micro_cert_version_id=v_version_id
    and section_id=v_new_section_id;

  -- Remove cloned IDs from current global list and insert after source section's last lesson.
  v_lesson_ids:=(
    select coalesce(array_agg(x order by ord),array[]::text[])
    from unnest(v_lesson_ids) with ordinality as t(x,ord)
    where not (x=any(v_section_ids))
  );

  if v_insert_lesson_pos>0 then
    declare
      v_source_last_id text;
      v_source_last_pos integer;
    begin
      select lesson_id into v_source_last_id
      from public.wf_employer_micro_cert_lessons
      where micro_cert_version_id=v_version_id
        and section_id=p_section_id
      order by sequence_no desc
      limit 1;

      v_source_last_pos:=array_position(v_lesson_ids,v_source_last_id);
      if v_source_last_pos is null then
        v_lesson_ids:=v_lesson_ids || v_section_ids;
      else
        v_lesson_ids:=v_lesson_ids[1:v_source_last_pos]
          || v_section_ids
          || coalesce(v_lesson_ids[v_source_last_pos+1:array_length(v_lesson_ids,1)],array[]::text[]);
      end if;
    end;
  else
    v_lesson_ids:=v_lesson_ids || v_section_ids;
  end if;

  select coalesce(max(sequence_no),0)+1000000 into v_temp_base
  from public.wf_employer_micro_cert_lessons
  where micro_cert_version_id=v_version_id;

  update public.wf_employer_micro_cert_lessons
  set sequence_no=v_temp_base+sequence_no,updated_at=now()
  where micro_cert_version_id=v_version_id;

  for v_i in 1..coalesce(array_length(v_lesson_ids,1),0) loop
    update public.wf_employer_micro_cert_lessons
    set sequence_no=v_i,updated_at=now()
    where lesson_id=v_lesson_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_SECTION_DUPLICATED',
    'employer_micro_cert_section',v_new_section_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'sourceSectionId',p_section_id,
      'sourceTitle',v_source.title
    ),
    jsonb_build_object(
      'sectionId',v_new_section_id,
      'title',left(v_source.title || ' — Copy',200),
      'clonedLessonCount',v_cloned_lessons,
      'clonedBlockCount',v_cloned_blocks,
      'lessonStatus','draft'
    ),
    jsonb_build_object('source','W11-04D','microCertId',p_micro_cert_id)
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Grants
-- ---------------------------------------------------------------------------

revoke all on function public.employer_learning_media_reserve(text,text,text,text,text,bigint,jsonb)
  from public,anon;
revoke all on function public.employer_learning_media_finalize(text,text)
  from public,anon;
revoke all on function public.employer_learning_media_list(text)
  from public,anon;
revoke all on function public.employer_learning_media_get(text,text)
  from public,anon;
revoke all on function public.employer_learning_media_delete_guard(text,text)
  from public,anon;
revoke all on function public.employer_learning_media_delete_finalize(text,text)
  from public,anon;
revoke all on function public.employer_micro_cert_section_duplicate(text,text,text)
  from public,anon;

grant execute on function public.employer_learning_media_reserve(text,text,text,text,text,bigint,jsonb)
  to authenticated,service_role;
grant execute on function public.employer_learning_media_finalize(text,text)
  to authenticated,service_role;
grant execute on function public.employer_learning_media_list(text)
  to authenticated,service_role;
grant execute on function public.employer_learning_media_get(text,text)
  to authenticated,service_role;
grant execute on function public.employer_learning_media_delete_guard(text,text)
  to authenticated,service_role;
grant execute on function public.employer_learning_media_delete_finalize(text,text)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_section_duplicate(text,text,text)
  to authenticated,service_role;
