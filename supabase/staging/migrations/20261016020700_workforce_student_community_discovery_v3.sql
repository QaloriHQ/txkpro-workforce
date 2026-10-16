-- Student-only discovery galleries for Community events and polls.
-- Both functions use the existing Student actor gate and expose only privacy-safe
-- aggregate/community state. Individual poll selections and voter identities are excluded.

create or replace function public.community_student_event_gallery()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor text := security.community_student_actor();
  result jsonb;
begin
  with visible_events as (
    select
      event.profile_post_id,
      event.title,
      event.description,
      event.cover_url,
      event.starts_at,
      event.ends_at,
      event.timezone,
      event.location_type,
      event.venue_name,
      event.address_text,
      event.organizer_name,
      case
        when event.status = 'published' and event.ends_at <= now() then 'completed'
        else event.status
      end as display_status,
      post.author_user_id = actor as is_own,
      (
        select rsvp.status
        from public.wf_post_event_rsvps rsvp
        where rsvp.profile_post_id = event.profile_post_id
          and rsvp.user_id = actor
      ) as viewer_rsvp,
      (
        select count(*)
        from public.wf_post_event_rsvps rsvp
        where rsvp.profile_post_id = event.profile_post_id
          and rsvp.status = 'interested'
      ) as interested_count,
      (
        select count(*)
        from public.wf_post_event_rsvps rsvp
        where rsvp.profile_post_id = event.profile_post_id
          and rsvp.status = 'going'
      ) as going_count
    from public.wf_post_events event
    join public.wf_profile_posts post on post.profile_post_id = event.profile_post_id
    where event.status in ('published', 'cancelled')
      and security.community_event_viewable(event.profile_post_id, actor)
      and security.community_content_visible(actor, post.author_user_id)
    order by event.starts_at desc, event.profile_post_id desc
    limit 200
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', profile_post_id,
    'title', title,
    'description', description,
    'coverUrl', cover_url,
    'startsAt', starts_at,
    'endsAt', ends_at,
    'timezone', timezone,
    'locationType', location_type,
    'venueName', venue_name,
    'address', address_text,
    'organizerName', organizer_name,
    'status', display_status,
    'viewerRsvp', viewer_rsvp,
    'isOwn', is_own,
    'counts', jsonb_build_object('interested', interested_count, 'going', going_count)
  ) order by starts_at desc, profile_post_id desc), '[]'::jsonb)
  into result
  from visible_events;

  return result;
end;
$$;

create or replace function public.community_student_poll_gallery()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor text := security.community_student_actor();
  result jsonb;
begin
  with visible_polls as (
    select
      poll.profile_post_id,
      poll.question,
      poll.selection_mode,
      poll.max_selections,
      case
        when poll.status = 'open' and poll.closes_at <= now() then 'closed'
        else poll.status
      end as display_status,
      poll.closes_at,
      post.author_user_id = actor as is_own,
      exists(
        select 1
        from public.wf_post_poll_ballots ballot
        where ballot.profile_post_id = poll.profile_post_id
          and ballot.voter_user_id = actor
      ) as viewer_voted,
      (
        select count(*)
        from public.wf_post_poll_ballots ballot
        where ballot.profile_post_id = poll.profile_post_id
      ) as total_ballots
    from public.wf_post_polls poll
    join public.wf_profile_posts post on post.profile_post_id = poll.profile_post_id
    join public.users author on author.user_id = post.author_user_id and lower(author.status) = 'active'
    where poll.status in ('open', 'closed')
      and security.community_poll_viewable(poll.profile_post_id, actor)
      and security.community_content_visible(actor, post.author_user_id)
    order by poll.closes_at desc, poll.profile_post_id desc
    limit 200
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', visible.profile_post_id,
    'question', visible.question,
    'selectionMode', visible.selection_mode,
    'maxSelections', visible.max_selections,
    'status', visible.display_status,
    'closesAt', visible.closes_at,
    'viewerVoted', visible.viewer_voted,
    'totalBallots', visible.total_ballots,
    'isOwn', visible.is_own,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', option.option_id,
        'label', option.label,
        'votes', case
          when visible.viewer_voted or visible.display_status <> 'open'
            then (select count(*) from public.wf_post_poll_selections selection where selection.option_id = option.option_id)
          else null
        end
      ) order by option.display_order)
      from public.wf_post_poll_options option
      where option.profile_post_id = visible.profile_post_id
    ), '[]'::jsonb)
  ) order by visible.closes_at desc, visible.profile_post_id desc), '[]'::jsonb)
  into result
  from visible_polls visible;

  return result;
end;
$$;

revoke all on function public.community_student_event_gallery(), public.community_student_poll_gallery()
from public, anon, authenticated;
grant execute on function public.community_student_event_gallery(), public.community_student_poll_gallery()
to authenticated;
