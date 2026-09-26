-- W11-04E: align Employer Learning direct media uploads with the
-- current Supabase Free-plan 50 MB global Storage ceiling.

update storage.buckets
set file_size_limit=52428800,
    updated_at=now()
where id='employer-learning-media';

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
    v_limit:=52428800;
    if v_mime not in ('video/mp4','video/webm','video/quicktime')
       or v_ext not in ('mp4','webm','mov') then
      raise exception 'Unsupported video file type';
    end if;
  elsif v_kind='audio' then
    v_limit:=52428800;
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
      or (v_mime='text/vtt' and v_ext='vtt')
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

    if v_ext='vtt' then
      v_limit:=5242880;
    end if;
  end if;

  if p_size_bytes>v_limit then
    if v_kind in ('video','audio') or (v_kind='document' and v_ext<>'vtt') then
      raise exception 'Direct % uploads are limited to 50 MB in this environment',v_kind;
    elsif v_kind='image' then
      raise exception 'Image uploads are limited to 15 MB';
    else
      raise exception 'VTT caption uploads are limited to 5 MB';
    end if;
  end if;

  return v_ext;
end;
$$;
