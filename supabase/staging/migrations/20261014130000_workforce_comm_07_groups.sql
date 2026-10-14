-- COMM-07: registered-user community groups with server-enforced membership and scoped moderation.
create table if not exists public.wf_community_groups (
  group_id text primary key default security.new_legacy_id('GRP'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  visibility text not null check (visibility in ('public','private')),
  join_policy text not null check (join_policy in ('open','approval','invite_only')),
  status text not null default 'active' check (status in ('active','archived','removed')),
  created_by_user_id text not null references public.users(user_id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((visibility='public' and join_policy in ('open','approval')) or (visibility='private' and join_policy='invite_only'))
);
create table if not exists public.wf_community_group_memberships (
  group_id text not null references public.wf_community_groups(group_id) on delete cascade,
  user_id text not null references public.users(user_id) on delete cascade,
  role text not null default 'member' check (role in ('admin','moderator','member')),
  status text not null default 'pending' check (status in ('pending','active','left','removed','banned')),
  invited_by_user_id text references public.users(user_id), joined_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(group_id,user_id)
);
create table if not exists public.wf_community_group_join_requests (
  request_id text primary key default security.new_legacy_id('GREQ'),
  group_id text not null references public.wf_community_groups(group_id) on delete cascade,
  requester_user_id text not null references public.users(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  decided_by_user_id text references public.users(user_id), decided_at timestamptz,
  created_at timestamptz not null default now(), unique(group_id,requester_user_id,status)
);
create table if not exists public.wf_community_post_audiences (
  profile_post_id text primary key references public.wf_profile_posts(profile_post_id) on delete cascade,
  group_id text not null references public.wf_community_groups(group_id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists wf_group_memberships_user_idx on public.wf_community_group_memberships(user_id,status);
create index if not exists wf_group_posts_idx on public.wf_community_post_audiences(group_id,created_at desc);
alter table public.wf_community_groups enable row level security;
alter table public.wf_community_group_memberships enable row level security;
alter table public.wf_community_group_join_requests enable row level security;
alter table public.wf_community_post_audiences enable row level security;
revoke all on table public.wf_community_groups,public.wf_community_group_memberships,public.wf_community_group_join_requests,public.wf_community_post_audiences from public,anon,authenticated;

create or replace function security.community_group_can_view(p_group_id text,p_actor text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wf_community_groups g where g.group_id=p_group_id and g.status='active' and
   (g.visibility='public' or exists(select 1 from public.wf_community_group_memberships m where m.group_id=g.group_id and m.user_id=p_actor and m.status in ('pending','active'))));
$$;
create or replace function security.community_group_role(p_group_id text,p_actor text)
returns text language sql stable security definer set search_path='' as $$
 select role from public.wf_community_group_memberships where group_id=p_group_id and user_id=p_actor and status='active';
$$;
revoke all on function security.community_group_can_view(text,text),security.community_group_role(text,text) from public,anon,authenticated,service_role;

create or replace function public.community_groups(p_scope text default 'discover') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a text:=security.community_actor(); result jsonb;
begin
 if p_scope not in ('discover','mine') then raise exception 'INVALID_GROUP_SCOPE'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.group_id,'slug',g.slug,'name',g.name,'description',g.description,
 'visibility',g.visibility,'joinPolicy',g.join_policy,'status',g.status,'memberCount',(select count(*) from public.wf_community_group_memberships m where m.group_id=g.group_id and m.status='active'),
 'viewerRole',(select m.role from public.wf_community_group_memberships m where m.group_id=g.group_id and m.user_id=a and m.status='active'),
 'viewerStatus',(select m.status from public.wf_community_group_memberships m where m.group_id=g.group_id and m.user_id=a)) order by g.name),'[]'::jsonb) into result
 from public.wf_community_groups g where g.status='active' and ((p_scope='discover' and g.visibility='public') or (p_scope='mine' and exists(select 1 from public.wf_community_group_memberships m where m.group_id=g.group_id and m.user_id=a and m.status in ('pending','active'))));
 return result;
end $$;

create or replace function public.community_group_create(p_name text,p_description text,p_visibility text,p_join_policy text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor(); gid text; s text; n text:=btrim(coalesce(p_name,''));
begin
 if char_length(n) not between 2 and 80 or char_length(coalesce(p_description,''))>1000 then raise exception 'INVALID_GROUP_INPUT'; end if;
 if not ((p_visibility='public' and p_join_policy in ('open','approval')) or (p_visibility='private' and p_join_policy='invite_only')) then raise exception 'INVALID_GROUP_POLICY'; end if;
 s:=trim(both '-' from regexp_replace(lower(n),'[^a-z0-9]+','-','g'))||'-'||substr(md5(random()::text),1,6);
 insert into public.wf_community_groups(slug,name,description,visibility,join_policy,created_by_user_id) values(s,n,btrim(coalesce(p_description,'')),p_visibility,p_join_policy,a) returning group_id into gid;
 insert into public.wf_community_group_memberships(group_id,user_id,role,status,joined_at) values(gid,a,'admin','active',now());
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),a,'COMMUNITY_GROUP_CREATED','community_group',gid,'workforce-domain-event',jsonb_build_object('visibility',p_visibility,'joinPolicy',p_join_policy));
 return jsonb_build_object('id',gid,'slug',s);
end $$;

create or replace function public.community_group(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a text:=security.community_actor(); g public.wf_community_groups; out jsonb;
begin
 select * into g from public.wf_community_groups where slug=p_slug;
 if g.group_id is null or not security.community_group_can_view(g.group_id,a) then raise exception 'GROUP_NOT_FOUND'; end if;
 select jsonb_build_object('id',g.group_id,'slug',g.slug,'name',g.name,'description',g.description,'visibility',g.visibility,'joinPolicy',g.join_policy,'status',g.status,
 'viewerRole',security.community_group_role(g.group_id,a),'viewerStatus',(select m.status from public.wf_community_group_memberships m where m.group_id=g.group_id and m.user_id=a),
 'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'name',coalesce(nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),'Member'),'role',m.role,'status',m.status) order by m.role,m.created_at) from public.wf_community_group_memberships m join public.users u on u.user_id=m.user_id where m.group_id=g.group_id and m.status='active'),'[]'::jsonb),
 'requests',case when security.community_group_role(g.group_id,a) in ('admin','moderator') then coalesce((select jsonb_agg(jsonb_build_object('requestId',r.request_id,'userId',r.requester_user_id,'name',coalesce(nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),'Member')) order by r.created_at) from public.wf_community_group_join_requests r join public.users u on u.user_id=r.requester_user_id where r.group_id=g.group_id and r.status='pending'),'[]'::jsonb) else '[]'::jsonb end,
 'posts',coalesce((select jsonb_agg(jsonb_build_object('id',p.profile_post_id,'authorName',pg.display_name,'body',p.body,'publishedAt',p.published_at,'isOwn',p.author_user_id=a) order by p.published_at desc) from public.wf_community_post_audiences x join public.wf_profile_posts p on p.profile_post_id=x.profile_post_id join public.wf_public_pages pg on pg.public_page_id=p.author_public_page_id where x.group_id=g.group_id and p.status='published'),'[]'::jsonb)) into out;
 return out;
end $$;

create or replace function public.community_group_join(p_group_id text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor(); g public.wf_community_groups; st text;
begin
 select * into g from public.wf_community_groups where group_id=p_group_id and status='active'; if g.group_id is null then raise exception 'GROUP_NOT_FOUND'; end if;
 if g.visibility='private' then
   if not exists(select 1 from public.wf_community_group_memberships where group_id=p_group_id and user_id=a and status='pending' and invited_by_user_id is not null) then raise exception 'GROUP_ACCESS_DENIED'; end if;
   update public.wf_community_group_memberships set status='active',joined_at=now(),updated_at=now() where group_id=p_group_id and user_id=a;
   return jsonb_build_object('status','active');
 end if;
 if exists(select 1 from public.wf_community_group_memberships where group_id=p_group_id and user_id=a and status='banned') then raise exception 'GROUP_ACCESS_DENIED'; end if;
 st:=case when g.join_policy='open' then 'active' else 'pending' end;
 insert into public.wf_community_group_memberships(group_id,user_id,role,status,joined_at) values(p_group_id,a,'member',st,case when st='active' then now() end)
 on conflict(group_id,user_id) do update set status=excluded.status,role='member',joined_at=excluded.joined_at,updated_at=now() where public.wf_community_group_memberships.status in ('left','removed');
 if st='pending' then insert into public.wf_community_group_join_requests(group_id,requester_user_id) values(p_group_id,a) on conflict do nothing; end if;
 return jsonb_build_object('status',st);
end $$;

create or replace function public.community_group_invite(p_group_id text,p_user_id text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor(); r text:=security.community_group_role(p_group_id,a);
begin
 if r not in ('admin','moderator') or not exists(select 1 from public.wf_community_groups where group_id=p_group_id and visibility='private' and status='active') then raise exception 'GROUP_ACCESS_DENIED'; end if;
 if not exists(select 1 from public.users where user_id=p_user_id and lower(status)='active') then raise exception 'GROUP_MEMBER_NOT_FOUND'; end if;
 insert into public.wf_community_group_memberships(group_id,user_id,role,status,invited_by_user_id) values(p_group_id,p_user_id,'member','pending',a)
 on conflict(group_id,user_id) do update set status='pending',role='member',invited_by_user_id=a,updated_at=now() where public.wf_community_group_memberships.status in ('left','removed');
 return jsonb_build_object('status','pending');
end $$;

create or replace function public.community_group_member_set(p_group_id text,p_user_id text,p_action text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor(); r text:=security.community_group_role(p_group_id,a); target_role text;
begin
 if r not in ('admin','moderator') then raise exception 'GROUP_ACCESS_DENIED'; end if;
 select role into target_role from public.wf_community_group_memberships where group_id=p_group_id and user_id=p_user_id and status='active';
 if p_action in ('make_admin','make_moderator','make_member') and r<>'admin' then raise exception 'GROUP_ACCESS_DENIED'; end if;
 if p_action='remove' and target_role='admin' then raise exception 'GROUP_ACCESS_DENIED'; end if;
 if p_action='ban' and (target_role='admin' or (r='moderator' and target_role='moderator')) then raise exception 'GROUP_ACCESS_DENIED'; end if;
 if p_action='make_admin' then update public.wf_community_group_memberships set role='admin',updated_at=now() where group_id=p_group_id and user_id=p_user_id and status='active';
 elsif p_action='make_moderator' then update public.wf_community_group_memberships set role='moderator',updated_at=now() where group_id=p_group_id and user_id=p_user_id and status='active';
 elsif p_action='make_member' then
   if target_role='admin' and (select count(*) from public.wf_community_group_memberships where group_id=p_group_id and role='admin' and status='active')<=1 then raise exception 'LAST_GROUP_ADMIN'; end if;
   update public.wf_community_group_memberships set role='member',updated_at=now() where group_id=p_group_id and user_id=p_user_id and status='active';
 elsif p_action in ('remove','ban') then update public.wf_community_group_memberships set status=case when p_action='ban' then 'banned' else 'removed' end,updated_at=now() where group_id=p_group_id and user_id=p_user_id and status='active';
 else raise exception 'INVALID_GROUP_ACTION'; end if;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),a,'COMMUNITY_GROUP_MEMBER_UPDATED','community_group_member',p_group_id||':'||p_user_id,'workforce-domain-event',jsonb_build_object('action',p_action));
 return jsonb_build_object('updated',true);
end $$;

create or replace function public.community_group_request_decide(p_request_id text,p_decision text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor(); req public.wf_community_group_join_requests; r text;
begin
 select * into req from public.wf_community_group_join_requests where request_id=p_request_id and status='pending' for update; if req.request_id is null then raise exception 'GROUP_REQUEST_NOT_FOUND'; end if;
 r:=security.community_group_role(req.group_id,a); if r not in ('admin','moderator') or p_decision not in ('approve','decline') then raise exception 'GROUP_ACCESS_DENIED'; end if;
 update public.wf_community_group_join_requests set status=case when p_decision='approve' then 'approved' else 'declined' end,decided_by_user_id=a,decided_at=now() where request_id=p_request_id;
 update public.wf_community_group_memberships set status=case when p_decision='approve' then 'active' else 'removed' end,joined_at=case when p_decision='approve' then now() end,updated_at=now() where group_id=req.group_id and user_id=req.requester_user_id;
 return jsonb_build_object('status',case when p_decision='approve' then 'approved' else 'declined' end);
end $$;

create or replace function public.community_group_post_create(p_group_id text,p_body text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor(); pg text; pid text; vis text;
begin
 if security.community_group_role(p_group_id,a) is null then raise exception 'GROUP_ACCESS_DENIED'; end if;
 if char_length(btrim(coalesce(p_body,''))) not between 1 and 8000 then raise exception 'INVALID_POST_INPUT'; end if;
 select case when visibility='public' then 'unlisted' else 'private' end into vis from public.wf_community_groups where group_id=p_group_id and status='active'; if vis is null then raise exception 'GROUP_NOT_FOUND'; end if;
 pg:=security.community_author_page(a); insert into public.wf_profile_posts(author_public_page_id,author_user_id,post_type,body,visibility,status,published_at) values(pg,a,'post',btrim(p_body),vis,'published',now()) returning profile_post_id into pid;
 insert into public.wf_community_post_audiences(profile_post_id,group_id) values(pid,p_group_id);
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),a,'COMMUNITY_GROUP_POST_PUBLISHED','community_post',pid,'workforce-domain-event',jsonb_build_object('groupId',p_group_id));
 return jsonb_build_object('id',pid);
end $$;

create or replace function public.community_group_post_moderate(p_group_id text,p_post_id text,p_action text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor(); r text:=security.community_group_role(p_group_id,a);
begin
 if r not in ('admin','moderator') or p_action not in ('hide','remove') or not exists(select 1 from public.wf_community_post_audiences where group_id=p_group_id and profile_post_id=p_post_id) then raise exception 'GROUP_ACCESS_DENIED'; end if;
 update public.wf_profile_posts set status=case when p_action='hide' then 'hidden' else 'removed' end,updated_at=now() where profile_post_id=p_post_id;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json) values(auth.uid(),a,'COMMUNITY_GROUP_POST_MODERATED','community_post',p_post_id,'workforce-domain-event',jsonb_build_object('groupId',p_group_id,'action',p_action));
 return jsonb_build_object('status',p_action);
end $$;

revoke all on function public.community_groups(text),public.community_group_create(text,text,text,text),public.community_group(text),public.community_group_join(text),public.community_group_invite(text,text),public.community_group_member_set(text,text,text),public.community_group_request_decide(text,text),public.community_group_post_create(text,text),public.community_group_post_moderate(text,text,text) from public,anon;
grant execute on function public.community_groups(text),public.community_group_create(text,text,text,text),public.community_group(text),public.community_group_join(text),public.community_group_invite(text,text),public.community_group_member_set(text,text,text),public.community_group_request_decide(text,text),public.community_group_post_create(text,text),public.community_group_post_moderate(text,text,text) to authenticated,service_role;
