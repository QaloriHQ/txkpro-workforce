-- W11-04C follow-up: harden Lesson Editor resource URL validation.

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
  elsif v_type in ('image','video','document','embed','download') then
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
