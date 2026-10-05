-- Separate explicit opt-in: existing Company Badge sharing never publishes System activity badges.
alter table public.wf_student_portfolio_preferences add column show_system_badges boolean not null default false;
create or replace function security.pro_summary(s text,public_view boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare points bigint; lifetime bigint; q date; rankings jsonb; pref text; sharing boolean; badges boolean; result jsonb;
begin
 q:=date_trunc('quarter',now() at time zone 'America/Chicago')::date;
 select coalesce(sum(l.points) filter(where l.season=q),0),coalesce(sum(l.points),0) into points,lifetime from public.wf_pro_ledger l where l.student_id=s;
 select ranking_scope,show_progress,show_system_badges into pref,sharing,badges from public.wf_student_portfolio_preferences where student_id=s;
 with scores as(select p.student_id,p.school_id,p.cohort_id,coalesce(sum(l.points),0) pts from public.wf_student_profiles p left join public.wf_pro_ledger l on l.student_id=p.student_id and l.season=q group by p.student_id,p.school_id,p.cohort_id), target as(select * from scores where student_id=s)
 select jsonb_build_object('cohort',case when t.cohort_id is null then null else (select count(*)+1 from scores x where x.cohort_id=t.cohort_id and x.pts>t.pts) end,'institution',case when t.school_id is null then null else (select count(*)+1 from scores x where x.school_id=t.school_id and x.pts>t.pts) end,'txkpro',(select count(*)+1 from scores x where x.pts>t.pts)) into rankings from target t;
 result:=jsonb_build_object('season',q,'seasonEnds',(q+interval '3 months')::date,'points',points,'lifetime',lifetime,'level',(select count(*) from unnest(array[0,250,750,1500,3000,5000,8000,12000,18000,25000]) t where t<=lifetime),'preferredScope',coalesce(pref,'cohort'),'rankings',rankings,'streaks',jsonb_build_array(security.pro_streak(s,'visit'),security.pro_streak(s,'check_in'),security.pro_streak(s,'engagement')));
 if public_view and not coalesce(sharing,false) then result:=null; end if;
 return jsonb_build_object('progress',result,'badges',case when not public_view or coalesce(badges,false) then coalesce((select jsonb_agg(jsonb_build_object('family',family,'tier',tier,'issuer','TXKPRO System','earnedAt',earned_at) order by tier desc) from public.wf_pro_system_badges where student_id=s and status='earned'),'[]') else '[]'::jsonb end) || case when public_view then '{}'::jsonb else jsonb_build_object('shareSystemBadges',coalesce(badges,false)) end;
end $$;

alter function security.pro_action(jsonb) rename to pro_action_before_system_badge_privacy;
revoke all on function security.pro_action_before_system_badge_privacy(jsonb) from public,anon,authenticated,service_role;
create function security.pro_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u text; s text; enabled boolean; begin
 if input->>'op' is distinct from 'badge_visibility' then return security.pro_action_before_system_badge_privacy(input); end if;
 u:=security.pro_actor(); s:=security.current_student_id();
 if s is null then raise exception 'Student self scope required' using errcode='42501';end if;
 if jsonb_typeof(input->'enabled') is distinct from 'boolean' then raise exception 'Visibility choice required';end if;
 enabled:=(input->>'enabled')::boolean;
 insert into public.wf_student_portfolio_preferences(student_id,show_system_badges) values(s,enabled)
 on conflict(student_id) do update set show_system_badges=excluded.show_system_badges;
 insert into public.wf_incentive_audit(actor,event,detail) values(u,'SYSTEM_BADGE_VISIBILITY_CHANGED',jsonb_build_object('enabled',enabled));
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.pro_action(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select security.pro_action(p_input) $$;
revoke all on function security.pro_action(jsonb),public.pro_action(jsonb) from public,anon,authenticated,service_role;
grant execute on function security.pro_action(jsonb),public.pro_action(jsonb) to authenticated;
