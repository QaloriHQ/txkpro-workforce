-- Follow-up #56: owner media and presentation; public identity remains a curated read model.
create table public.wf_professional_customization (
 public_page_id text primary key references public.wf_public_pages(public_page_id) on delete cascade,
 photo_path text, cover_path text,
 layout text not null default 'comfortable' check(layout in ('comfortable','compact')),
 panel_order text[] not null default array['about','specialties','credentials','reviews','posts','activity'],
 hidden_sections text[] not null default '{}', updated_at timestamptz not null default now()
);
alter table public.wf_professional_customization enable row level security;
revoke all on public.wf_professional_customization from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('professional-profile','professional-profile',false,4194304,array['image/jpeg','image/png','image/webp']);

create function security.professional_customization(p_kind text,p_input jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user text; v_page text; c public.wf_professional_customization%rowtype; previous jsonb; v_order text[]; v_hidden text[]; slot text; path text;
begin
 v_user:=security.professional_actor(p_kind);
 perform 1 from public.users where user_id=v_user for update;
 select public_page_id into v_page from public.wf_public_pages where entity_type=p_kind and entity_id=v_user and owner_user_id=v_user;
 if v_page is null then
 if p_input is not null then raise exception using errcode='22023',message='Save your profile first'; end if;
 return jsonb_build_object('pageId',null,'layout','comfortable','panelOrder',array['about','specialties','credentials','reviews','posts','activity'],'hiddenSections','[]'::jsonb,'photoUrl',null,'coverUrl',null);
 end if;
 insert into public.wf_professional_customization(public_page_id) values(v_page) on conflict do nothing;
 select * into c from public.wf_professional_customization where public_page_id=v_page for update;
 previous:=to_jsonb(c)-'updated_at';
 if p_input is not null then
 if jsonb_typeof(p_input)<>'object' then raise exception using errcode='22023',message='Invalid customization'; end if;
 if p_input->>'op'='layout' then
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('op','layout','panelOrder','hiddenSections'))
 or jsonb_typeof(p_input->'panelOrder') is distinct from 'array' or jsonb_typeof(p_input->'hiddenSections') is distinct from 'array'
 or p_input->>'layout' is null or p_input->>'layout' not in ('compact','comfortable') then raise exception using errcode='22023',message='Invalid layout'; end if;
 select array_agg(x) into v_order from jsonb_array_elements_text(p_input->'panelOrder') x;
 select coalesce(array_agg(x),'{}'::text[]) into v_hidden from jsonb_array_elements_text(p_input->'hiddenSections') x;
 if cardinality(v_order) is distinct from 6 or (select count(distinct x) from unnest(v_order) x)<>6
 or not v_order <@ array['about','specialties','credentials','reviews','posts','activity']
 or not v_hidden <@ v_order or (select count(distinct x) from unnest(v_hidden) x)<>cardinality(v_hidden) then raise exception using errcode='22023',message='Choose each supported section once'; end if;
 update public.wf_professional_customization set layout=p_input->>'layout',panel_order=v_order,hidden_sections=v_hidden where public_page_id=v_page;
 elsif p_input->>'op' in ('image','remove_image') then
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('op','slot','storagePath')) then raise exception using errcode='22023',message='Invalid image field'; end if;
 slot:=p_input->>'slot'; path:=p_input->>'storagePath';
 if slot is null or slot not in ('photo','cover') then raise exception using errcode='22023',message='Choose photo or cover'; end if;
 if p_input->>'op'='image' then
 if path is null or path !~ ('^'||v_page||'/[0-9a-f-]{36}$') or not exists(select 1 from storage.objects o where o.bucket_id='professional-profile' and o.name=path
 and o.metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') and (o.metadata->>'size')::bigint between 1 and 4194304) then raise exception using errcode='22023',message='Owned image upload required'; end if;
 else path:=null; end if;
 update public.wf_professional_customization set photo_path=case when slot='photo' then path else photo_path end,cover_path=case when slot='cover' then path else cover_path end where public_page_id=v_page;
 else raise exception using errcode='22023',message='Unsupported customization'; end if;
 select * into c from public.wf_professional_customization where public_page_id=v_page;
 if previous is distinct from to_jsonb(c)-'updated_at' then
 update public.wf_professional_customization set updated_at=clock_timestamp() where public_page_id=v_page;
 update public.wf_public_pages set updated_at=clock_timestamp() where public_page_id=v_page;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json)
 values((select auth.uid()),v_user,'PROFESSIONAL_PROFILE_CUSTOMIZED','public_page',v_page,'professional',jsonb_build_object('operation',p_input->>'op','slot',slot,'layout',c.layout,'panelOrder',c.panel_order,'hiddenSections',c.hidden_sections));
 end if;
 end if;
 return jsonb_build_object('pageId',v_page,'layout',c.layout,'panelOrder',c.panel_order,'hiddenSections',c.hidden_sections,
 'photoUrl',case when c.photo_path is not null then '/api/professional/images?kind='||p_kind||'&slot=photo&v='||md5(c.photo_path) else null end,
 'coverUrl',case when c.cover_path is not null then '/api/professional/images?kind='||p_kind||'&slot=cover&v='||md5(c.cover_path) else null end);
end; $$;
revoke all on function security.professional_customization(text,jsonb) from public,anon,service_role;
grant execute on function security.professional_customization(text,jsonb) to authenticated;
create function public.professional_customization(p_kind text,p_input jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$ select security.professional_customization(p_kind,p_input); $$;
revoke all on function public.professional_customization(text,jsonb) from public,anon,service_role;
grant execute on function public.professional_customization(text,jsonb) to authenticated;

alter function security.professional_profile_settings(text,jsonb) rename to professional_profile_settings_before_customization;
revoke all on function security.professional_profile_settings_before_customization(text,jsonb) from public,anon,authenticated,service_role;
create function security.professional_profile_settings(p_kind text,p_input jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 return security.professional_profile_settings_before_customization(p_kind,p_input)||jsonb_build_object('customization',security.professional_customization(p_kind,null));
end; $$;
revoke all on function security.professional_profile_settings(text,jsonb) from public,anon,service_role;
grant execute on function security.professional_profile_settings(text,jsonb) to authenticated;
create or replace function public.professional_profile_settings(p_kind text,p_input jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$ select security.professional_profile_settings(p_kind,p_input); $$;

alter function security.professional_public_read(text) rename to professional_public_read_before_customization;
revoke all on function security.professional_public_read_before_customization(text) from public,anon,authenticated,service_role;
create function security.professional_public_read(p_path text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; c public.wf_professional_customization%rowtype; section text;
begin
 result:=security.professional_public_read_before_customization(p_path);
 if result->>'found'<>'true' then return result; end if;
 select cu.* into c from public.wf_professional_customization cu join public.wf_public_pages p on p.public_page_id=cu.public_page_id where p.canonical_path=result->>'path';
 foreach section in array coalesce(c.hidden_sections,'{}') loop
 result:=result||case section when 'about' then jsonb_build_object('bio','') when 'specialties' then jsonb_build_object('specialties','') when 'credentials' then jsonb_build_object('credentials','') when 'reviews' then jsonb_build_object('reviews','[]'::jsonb,'rating',null) when 'posts' then jsonb_build_object('posts','[]'::jsonb) else jsonb_build_object('activity','[]'::jsonb) end;
 end loop;
 result:=jsonb_set(result,'{activity}',coalesce((select jsonb_agg(a) from jsonb_array_elements(result->'activity') a where not exists(select 1 from public.wf_public_pages src join public.wf_professional_customization cu on cu.public_page_id=src.public_page_id where src.canonical_path=split_part(a->>'path','#',1) and 'posts'=any(cu.hidden_sections))),'[]'::jsonb));
 return result||jsonb_build_object('customization',jsonb_build_object('layout',coalesce(c.layout,'comfortable'),'panelOrder',coalesce(c.panel_order,array['about','specialties','credentials','reviews','posts','activity']),'hiddenSections',coalesce(c.hidden_sections,'{}'),
 'photoUrl',case when c.photo_path is not null then '/api/professional/public-image?path='||(result->>'path')||'&slot=photo&v='||md5(c.photo_path) else null end,
 'coverUrl',case when c.cover_path is not null then '/api/professional/public-image?path='||(result->>'path')||'&slot=cover&v='||md5(c.cover_path) else null end));
end; $$;
revoke all on function security.professional_public_read(text) from public,anon,authenticated;
grant execute on function security.professional_public_read(text) to service_role;
create or replace function public.professional_public_read(p_path text) returns jsonb
language sql security invoker set search_path='' as $$ select security.professional_public_read(p_path); $$;

create function security.professional_image(p_kind text,p_path text,p_slot text) returns text
language plpgsql stable security definer set search_path='' as $$
declare v_page text; v_user text; image text;
begin
 if p_slot is null or p_slot not in ('photo','cover') then return null; end if;
 if p_kind is not null then
 v_user:=security.professional_actor(p_kind);
 select public_page_id into v_page from public.wf_public_pages where entity_type=p_kind and entity_id=v_user and owner_user_id=v_user;
 else
 select public_page_id into v_page from public.wf_public_pages where canonical_path=p_path and security.professional_page_publishable(public_page_id);
 end if;
 select case when p_slot='photo' then photo_path else cover_path end into image from public.wf_professional_customization where public_page_id=v_page;
 return image;
end; $$;
revoke all on function security.professional_image(text,text,text) from public,anon,authenticated,service_role;
create function security.professional_owner_image(p_kind text,p_slot text) returns text
language sql security definer set search_path='' as $$ select security.professional_image(p_kind,null,p_slot); $$;
revoke all on function security.professional_owner_image(text,text) from public,anon,service_role;
grant execute on function security.professional_owner_image(text,text) to authenticated;
create function public.professional_owner_image(p_kind text,p_slot text) returns text
language sql security invoker set search_path='' as $$ select security.professional_owner_image(p_kind,p_slot); $$;
revoke all on function public.professional_owner_image(text,text) from public,anon,service_role;
grant execute on function public.professional_owner_image(text,text) to authenticated;
create function security.professional_public_image(p_path text,p_slot text) returns text
language sql security definer set search_path='' as $$ select security.professional_image(null,p_path,p_slot); $$;
revoke all on function security.professional_public_image(text,text) from public,anon,authenticated;
grant execute on function security.professional_public_image(text,text) to service_role;
create function public.professional_public_image(p_path text,p_slot text) returns text
language sql security invoker set search_path='' as $$ select security.professional_public_image(p_path,p_slot); $$;
revoke all on function public.professional_public_image(text,text) from public,anon,authenticated;
grant execute on function public.professional_public_image(text,text) to service_role;
