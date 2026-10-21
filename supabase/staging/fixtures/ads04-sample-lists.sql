-- OWNER-AUTHORIZED STAGING FIXTURE ONLY. Execute only against
-- qwxlgzlkaeaqfzjodtis. Not a schema migration; never auto-run in production.
-- Uses the existing Demo Student identity, never a real member's identity.
-- Stable fixture keys make reruns idempotent; no votes/RSVPs/likes are fabricated.
begin;
do $$
declare demo_page text; kind text; n int; post_key text; label text; opt int;
begin
  select p.public_page_id into demo_page from public.wf_public_pages p
  join public.users u on u.user_id=p.owner_user_id
  where p.owner_user_id='USR-DEMO-STUDENT' and p.display_name='Demo Student'
    and lower(u.status)='active' and p.visibility='public' and p.publication_status='published' limit 1;
  if demo_page is null then raise exception 'EXPECTED_STAGING_DEMO_IDENTITY_MISSING'; end if;
  foreach kind in array array['post','article','event','poll'] loop
    for n in 1..(case when kind='article' then 4 else 3 end) loop
      post_key:='POST-ADS04-SAMPLE-'||upper(kind)||'-'||n;
      label:=case kind
        when 'post' then (array['First week on a worksite','Local trade career discussion','Community project update'])[n]
        when 'article' then (array['Preparing for your first job','Building a project portfolio','Learning with a mentor','Planning your next training step'])[n]
        when 'event' then (array['Skilled trades open house','Resume practice workshop','Community networking session'])[n]
        else (array['Which workshop topic interests you?','Which event format would you prefer?','Which trade would you explore?'])[n] end;
      insert into public.wf_profile_posts(profile_post_id,author_public_page_id,author_user_id,post_type,title,body,visibility,status,published_at,robots_index,content_origin,topic,location_label)
      values(post_key,demo_page,'USR-DEMO-STUDENT',kind,'Sample: '||label,
        'STAGING SAMPLE — This fictional '||kind||' is for reviewing list layouts and sponsored placements. It is not a real announcement, event or survey.'||case when kind='article' then E'\n\nUse this sample to inspect article cards, related articles, comments and sponsored disclosure.' else '' end,
        'public','published',now()-make_interval(mins=>n),false,'organization','Ad layout samples','Texarkana, TX')
      on conflict(profile_post_id) do nothing;
      if kind='event' then
        insert into public.wf_post_events(profile_post_id,title,description,starts_at,ends_at,timezone,location_type,venue_name,address_text,organizer_name,status)
        values(post_key,'Sample: '||label,'STAGING SAMPLE — Fictional event for ad layout review. No real gathering is scheduled.',now()+make_interval(days=>n+7),now()+make_interval(days=>n+7,hours=>2),'America/Chicago','physical','Sample venue (not a real event)','Staging sample — do not attend','TXKPRO staging sample','published') on conflict(profile_post_id) do nothing;
      elsif kind='poll' then
        insert into public.wf_post_polls(profile_post_id,question,selection_mode,max_selections,status,closes_at)
        values(post_key,'Sample: '||label,'single',1,'open',now()+interval '29 days') on conflict(profile_post_id) do nothing;
        for opt in 1..3 loop
          insert into public.wf_post_poll_options(option_id,profile_post_id,label,display_order)
          values('POPT-ADS04-'||n||'-'||opt,post_key,(array['Sample choice A','Sample choice B','Sample choice C'])[opt],opt-1)
          on conflict(option_id) do nothing;
        end loop;
      end if;
      for opt in 1..3 loop
        insert into public.wf_profile_post_comments(profile_post_comment_id,profile_post_id,author_user_id,author_public_page_id,body,status)
        values('CMT-ADS04-'||upper(kind)||'-'||n||'-'||opt,post_key,'USR-DEMO-STUDENT',demo_page,
          (array['STAGING SAMPLE comment: Thanks for sharing this idea.','STAGING SAMPLE comment: This would make an interesting discussion.','STAGING SAMPLE comment: Reviewing the three-comment ad layout.'])[opt],'published')
        on conflict(profile_post_comment_id) do nothing;
      end loop;
    end loop;
  end loop;
  insert into public.platform_audit_events(action,entity_type,entity_id,source,metadata)
  values('ADS04_STAGING_SAMPLES_CREATED','staging_fixture','ADS04-SAMPLE-LISTS','owner-authorized-staging-fixture',
    jsonb_build_object('samplePosts',3,'sampleArticles',4,'sampleEvents',3,'samplePolls',3,'commentsPerItem',3,'pointsEligible',false));
end;
$$;
commit;
