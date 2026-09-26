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
  v_actual_size bigint;
  v_actual_mime text;
  v_ext text;
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

  begin
    v_actual_size:=coalesce(
      nullif(v_object.metadata->>'size','')::bigint,
      v_asset.size_bytes
    );
  exception when others then
    raise exception 'Uploaded media size metadata is invalid';
  end;

  v_actual_mime:=lower(
    coalesce(
      nullif(btrim(v_object.metadata->>'mimetype'),''),
      v_asset.mime_type
    )
  );

  -- Re-run canonical validation against the actual Storage object metadata.
  v_ext:=security.validate_employer_learning_media(
    v_asset.media_kind,
    v_actual_mime,
    v_asset.original_filename,
    v_actual_size
  );

  if v_actual_mime<>v_asset.mime_type then
    raise exception 'Uploaded media MIME type does not match the reserved file';
  end if;

  if v_actual_size<>v_asset.size_bytes then
    raise exception 'Uploaded media size does not match the reserved file';
  end if;

  if v_ext<>v_asset.extension then
    raise exception 'Uploaded media extension validation failed';
  end if;

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
      'mimeType',v_actual_mime,'sizeBytes',v_actual_size
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
    'mimeType',v_actual_mime,
    'extension',v_asset.extension,
    'sizeBytes',v_actual_size,
    'status','ready',
    'metadata',v_asset.metadata,
    'createdAt',v_asset.created_at,
    'updatedAt',now()
  );
end;
$$;
