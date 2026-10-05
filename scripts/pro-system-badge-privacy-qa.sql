do $$
declare s text; actor uuid; company boolean; begin
 select student.student_id,usr.auth_user_id into s,actor from public.wf_student_profiles student join public.users usr on usr.user_id=student.user_id where usr.status='active' and exists(select 1 from public.app_role_memberships m where m.auth_user_id=usr.auth_user_id and m.role='student' and m.status='active') limit 1;
 if s is null then raise exception 'Student fixture unavailable';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.wf_pro_system_badges(student_id,family,tier) values(s,'visit',3) on conflict(student_id,family,tier) do update set status='earned';
 insert into public.wf_student_portfolio_preferences(student_id,show_badges) values(s,true) on conflict(student_id) do update set show_badges=true;
 if jsonb_array_length(security.pro_summary(s,true)->'badges')<>0 then raise exception 'Existing Company Badge opt-in leaked System badges';end if;
 perform public.pro_action(jsonb_build_object('op','badge_visibility','enabled',true));
 if jsonb_array_length(security.pro_summary(s,true)->'badges')=0 then raise exception 'Explicit System badge opt-in failed';end if;
 if security.pro_summary(s,true)?'shareSystemBadges' then raise exception 'Private setting leaked in public summary';end if;
 select show_badges into company from public.wf_student_portfolio_preferences where student_id=s;
 if not company then raise exception 'Company Badge preference modified';end if;
 perform public.pro_action(jsonb_build_object('op','badge_visibility','enabled',false));
 if jsonb_array_length(security.pro_summary(s,true)->'badges')<>0 or (security.pro_summary(s)->>'shareSystemBadges')::boolean then raise exception 'System badge opt-out failed';end if;
 if not exists(select 1 from public.wf_incentive_audit audit where audit.event='SYSTEM_BADGE_VISIBILITY_CHANGED' and audit.actor=security.pro_actor()) then raise exception 'Sharing audit missing';end if;
 if has_function_privilege('authenticated','security.pro_action_before_system_badge_privacy(jsonb)','execute') then raise exception 'Old action helper exposed';end if;
end $$;
select jsonb_build_object('result','PASS','checks',jsonb_build_array('separate_default_private_system_badges','explicit_opt_in','explicit_opt_out','company_preference_preserved','public_setting_redacted','sharing_audit','old_helper_revoked')) badge_privacy_verification;
