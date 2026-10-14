-- COMM-08: aggregate-only polls attached to canonical community posts.
alter table public.wf_profile_posts drop constraint if exists wf_profile_posts_post_type_check;
alter table public.wf_profile_posts add constraint wf_profile_posts_post_type_check check(post_type in ('post','article','update','poll','event'));
create table if not exists public.wf_post_polls(
 profile_post_id text primary key references public.wf_profile_posts(profile_post_id) on delete cascade,
 question text not null check(char_length(btrim(question)) between 1 and 280),
 selection_mode text not null check(selection_mode in ('single','multiple')),
 max_selections int not null default 1 check(max_selections between 1 and 10),
 status text not null default 'open' check(status in ('open','closed','cancelled')),
 closes_at timestamptz not null,closed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(closes_at>created_at and closes_at<=created_at+interval '30 days'),check((selection_mode='single' and max_selections=1) or selection_mode='multiple')
);
create table if not exists public.wf_post_poll_options(
 option_id text primary key default security.new_legacy_id('POPT'),profile_post_id text not null references public.wf_post_polls(profile_post_id) on delete cascade,
 label text not null check(char_length(btrim(label)) between 1 and 120),display_order int not null check(display_order between 0 and 9),unique(profile_post_id,display_order)
);
create table if not exists public.wf_post_poll_ballots(
 ballot_id text primary key default security.new_legacy_id('PBAL'),profile_post_id text not null references public.wf_post_polls(profile_post_id) on delete cascade,
 voter_user_id text not null references public.users(user_id) on delete cascade,client_key uuid not null,created_at timestamptz not null default now(),
 unique(profile_post_id,voter_user_id),unique(voter_user_id,client_key)
);
create table if not exists public.wf_post_poll_selections(
 ballot_id text not null references public.wf_post_poll_ballots(ballot_id) on delete cascade,option_id text not null references public.wf_post_poll_options(option_id) on delete cascade,primary key(ballot_id,option_id)
);
alter table public.wf_post_polls enable row level security;alter table public.wf_post_poll_options enable row level security;alter table public.wf_post_poll_ballots enable row level security;alter table public.wf_post_poll_selections enable row level security;
revoke all on table public.wf_post_polls,public.wf_post_poll_options,public.wf_post_poll_ballots,public.wf_post_poll_selections from public,anon,authenticated;

create or replace function security.community_poll_viewable(p_post text,p_actor text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wf_profile_posts p where p.profile_post_id=p_post and p.post_type='poll' and p.status='published' and (p.visibility='public' or exists(select 1 from public.wf_community_post_audiences a join public.wf_community_group_memberships m on m.group_id=a.group_id and m.user_id=p_actor and m.status='active' where a.profile_post_id=p.profile_post_id)));
$$;
revoke all on function security.community_poll_viewable(text,text) from public,anon,authenticated,service_role;

create or replace function public.community_poll_create(p_input jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor();page text;pid text;group_id text:=nullif(p_input->>'groupId','');question text:=btrim(coalesce(p_input->>'question',''));mode text:=coalesce(p_input->>'selectionMode','single');max_sel int:=coalesce((p_input->>'maxSelections')::int,1);hours int:=coalesce((p_input->>'durationHours')::int,72);options jsonb:=p_input->'options';visibility text:='public';
begin
 if char_length(question) not between 1 and 280 or mode not in ('single','multiple') or hours not between 1 and 720 or jsonb_typeof(options)<>'array' or jsonb_array_length(options) not between 2 and 10 then raise exception 'INVALID_POLL';end if;
 if mode='single' then max_sel:=1;elsif max_sel not between 2 and least(10,jsonb_array_length(options)) then raise exception 'INVALID_POLL_SELECTIONS';end if;
 if exists(select 1 from jsonb_array_elements_text(options) x where char_length(btrim(x)) not between 1 and 120) or (select count(distinct lower(btrim(x))) from jsonb_array_elements_text(options)x)<>jsonb_array_length(options) then raise exception 'INVALID_POLL_OPTIONS';end if;
 if group_id is not null then if security.community_group_role(group_id,a) is null then raise exception 'GROUP_ACCESS_DENIED';end if;select case when g.visibility='public' then 'unlisted' else 'private' end into visibility from public.wf_community_groups g where g.group_id=group_id and g.status='active';if visibility is null then raise exception 'GROUP_NOT_FOUND';end if;end if;
 page:=security.community_author_page(a);insert into public.wf_profile_posts(author_public_page_id,author_user_id,post_type,body,visibility,status,published_at) values(page,a,'poll',question,visibility,'published',now()) returning profile_post_id into pid;
 insert into public.wf_post_polls(profile_post_id,question,selection_mode,max_selections,closes_at) values(pid,question,mode,max_sel,now()+make_interval(hours=>hours));
 insert into public.wf_post_poll_options(profile_post_id,label,display_order) select pid,btrim(value),ordinality-1 from jsonb_array_elements_text(options) with ordinality;
 if group_id is not null then insert into public.wf_community_post_audiences(profile_post_id,group_id) values(pid,group_id);end if;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata) values(auth.uid(),a,'COMMUNITY_POST_PUBLISHED','community_post',pid,'workforce-domain-event',jsonb_build_object('postType','poll','selectionMode',mode,'durationHours',hours));
 return jsonb_build_object('id',pid);
end $$;

create or replace function public.community_poll(p_post_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a text:=security.community_actor();poll public.wf_post_polls;voted boolean;show_results boolean;result jsonb;
begin if not security.community_poll_viewable(p_post_id,a) then raise exception 'POLL_NOT_FOUND';end if;select * into poll from public.wf_post_polls where profile_post_id=p_post_id;voted:=exists(select 1 from public.wf_post_poll_ballots where profile_post_id=p_post_id and voter_user_id=a);show_results:=voted or poll.status<>'open' or poll.closes_at<=now();
 select jsonb_build_object('id',p.profile_post_id,'question',poll.question,'selectionMode',poll.selection_mode,'maxSelections',poll.max_selections,'status',case when poll.status='open' and poll.closes_at<=now() then 'closed' else poll.status end,'closesAt',poll.closes_at,'viewerVoted',voted,'totalBallots',(select count(*) from public.wf_post_poll_ballots where profile_post_id=p_post_id),'isOwn',p.author_user_id=a,'options',jsonb_agg(jsonb_build_object('id',o.option_id,'label',o.label,'votes',case when show_results then (select count(*) from public.wf_post_poll_selections s where s.option_id=o.option_id) else null end) order by o.display_order)) into result from public.wf_profile_posts p join public.wf_post_poll_options o on o.profile_post_id=p.profile_post_id where p.profile_post_id=p_post_id group by p.profile_post_id,p.author_user_id;
 return result;
end $$;

create or replace function public.community_poll_vote(p_post_id text,p_option_ids text[],p_client_key uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor();poll public.wf_post_polls;bid text;choice_count int;
begin if p_client_key is null or not security.community_poll_viewable(p_post_id,a) then raise exception 'POLL_NOT_FOUND';end if;select * into poll from public.wf_post_polls where profile_post_id=p_post_id for update;if poll.status<>'open' or poll.closes_at<=now() then raise exception 'POLL_CLOSED';end if;
 select count(distinct x) into choice_count from unnest(coalesce(p_option_ids,'{}'))x;if choice_count<1 or choice_count>poll.max_selections or choice_count<>coalesce(array_length(p_option_ids,1),0) or exists(select 1 from unnest(p_option_ids)x where not exists(select 1 from public.wf_post_poll_options where profile_post_id=p_post_id and option_id=x)) then raise exception 'INVALID_BALLOT';end if;
 select ballot_id into bid from public.wf_post_poll_ballots where profile_post_id=p_post_id and voter_user_id=a;if bid is not null then return jsonb_build_object('ballotId',bid,'accepted',true,'replayed',true);end if;
 insert into public.wf_post_poll_ballots(profile_post_id,voter_user_id,client_key) values(p_post_id,a,p_client_key) returning ballot_id into bid;insert into public.wf_post_poll_selections(ballot_id,option_id) select bid,x from unnest(p_option_ids)x;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata) values(auth.uid(),a,'POLL_BALLOT_CAST','community_poll',p_post_id,'workforce-domain-event',jsonb_build_object('ballotId',bid,'selectionCount',choice_count));return jsonb_build_object('ballotId',bid,'accepted',true,'replayed',false);
end $$;

create or replace function public.community_poll_close(p_post_id text,p_action text default 'close') returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor();new_status text;
begin if p_action not in ('close','cancel') then raise exception 'INVALID_POLL_ACTION';end if;new_status:=case when p_action='close' then 'closed' else 'cancelled' end;
 update public.wf_post_polls poll set status=new_status,closed_at=now(),updated_at=now() from public.wf_profile_posts p where poll.profile_post_id=p_post_id and p.profile_post_id=p_post_id and p.author_user_id=a and poll.status='open';if not found then raise exception 'POLL_NOT_FOUND';end if;
 if new_status='cancelled' then update public.wf_profile_posts set status='removed',updated_at=now() where profile_post_id=p_post_id;end if;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata) values(auth.uid(),a,'POLL_CLOSED','community_poll',p_post_id,'workforce-domain-event',jsonb_build_object('status',new_status));return jsonb_build_object('status',new_status);
end $$;

revoke all on function public.community_poll_create(jsonb),public.community_poll(text),public.community_poll_vote(text,text[],uuid),public.community_poll_close(text,text) from public,anon;
grant execute on function public.community_poll_create(jsonb),public.community_poll(text),public.community_poll_vote(text,text[],uuid),public.community_poll_close(text,text) to authenticated;
