begin;
do $$declare a text;u uuid;i text;begin
 select m.user_id,x.auth_user_id,m.scope_id into a,u,i from public.app_role_memberships m join public.users x on x.user_id=m.user_id where m.status='active' and m.scope_type in ('employer','contractor') and m.role in ('employer_owner','employer_admin') and x.status='active' and x.auth_user_id is not null and security.auth_allowed('employer',m.scope_id,m.user_id,'manage') limit 1;
 if a is null then raise exception 'Active Employer administrator required';end if;
 perform set_config('qa.policy.actor',a,true);perform set_config('qa.policy.employer',i,true);
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 if has_function_privilege('anon','public.screening_policy(jsonb)','execute') or has_function_privilege('service_role','public.screening_policy(jsonb)','execute') or has_function_privilege('service_role','public.auth_screening_service_authcard(jsonb)','execute') or has_table_privilege('authenticated','security.wf_screening_policy_acceptances','select') then raise exception 'Policy privilege boundary failed';end if;
end $$;
set local role authenticated;
do $$declare b jsonb:=jsonb_build_object('ownerType','employer','ownerId',current_setting('qa.policy.employer'));p jsonb;x jsonb;denied boolean:=false;begin
 p:=public.screening_policy(b||jsonb_build_object('op','policy'));
 if jsonb_array_length(p->'history')>0 and p->'history'->0->>'revokedAt' is null then perform public.screening_policy(b||jsonb_build_object('op','policy_revoke','acceptanceId',p->'history'->0->>'id'));end if;
 begin perform public.screening_policy(b||jsonb_build_object('op','policy_accept','policyId',p->>'policyId','version',p->'version','hash','STALE','affirmative',true));exception when others then if sqlerrm='Review and affirm the current policy' then denied:=true;else raise;end if;end;if not denied then raise exception 'Stale policy accepted';end if;
 denied:=false;begin perform public.screening_policy(jsonb_build_object('ownerType','employer','ownerId','FOREIGN_ROLLBACK_ONLY','op','policy'));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign policy readable';end if;
 perform set_config('qa.policy.version',p->>'version',true);
end $$;
reset role;
do $$declare denied boolean:=false;begin
 begin perform public.auth_screening_service(jsonb_build_object('ownerType','employer','ownerId',current_setting('qa.policy.employer'),'actor',current_setting('qa.policy.actor'),'op','quote'));exception when insufficient_privilege then if sqlerrm='Current Employer screening policy acceptance required' then denied:=true;else raise;end if;end;if not denied then raise exception 'Missing policy did not block service quote';end if;
end $$;
set local role authenticated;
do $$declare b jsonb:=jsonb_build_object('ownerType','employer','ownerId',current_setting('qa.policy.employer'));p jsonb;x jsonb;begin
 p:=public.screening_policy(b||jsonb_build_object('op','policy'));
 x:=b||jsonb_build_object('op','policy_accept','policyId',p->>'policyId','version',p->'version','hash',p->>'hash','affirmative',true);
 p:=public.screening_policy(x);if p->>'state'<>'accepted' then raise exception 'Positive acceptance failed';end if;
 perform set_config('qa.policy.acceptance',p->'history'->0->>'id',true);
 if public.screening_policy(x)->'history'<>p->'history' then raise exception 'Duplicate acceptance changed history';end if;
end $$;
reset role;
do $$declare denied boolean:=false;begin
 if not exists(select 1 from public.wf_reward_audit where target=current_setting('qa.policy.acceptance') and event='EMPLOYER_SCREENING_POLICY_ACCEPTED' and payload ?& array['actor_user_id','employer_id','policy_id','policy_version','accepted_at','scope','result','correlation_id']) then raise exception 'Audit payload incomplete';end if;
 begin update security.wf_screening_policy_acceptances set scope='changed' where id=current_setting('qa.policy.acceptance')::uuid;exception when others then if sqlerrm='Policy evidence is immutable' then denied:=true;else raise;end if;end;if not denied then raise exception 'Acceptance mutable';end if;
 insert into security.wf_screening_policy_versions(policy_id,version,title,body) values('employer-screening',current_setting('qa.policy.version')::integer+1,'ROLLBACK ONLY','Rollback test version');update security.wf_screening_policy_current set version=current_setting('qa.policy.version')::integer+1 where policy_id='employer-screening';
end $$;
set local role authenticated;
do $$declare p jsonb;begin
 p:=public.screening_policy(jsonb_build_object('ownerType','employer','ownerId',current_setting('qa.policy.employer'),'op','policy'));
 if p->>'state'<>'superseded' then raise exception 'New policy did not supersede effective grant';end if;
 perform public.screening_policy(jsonb_build_object('ownerType','employer','ownerId',current_setting('qa.policy.employer'),'op','policy_revoke','acceptanceId',current_setting('qa.policy.acceptance')));
 p:=public.screening_policy(jsonb_build_object('ownerType','employer','ownerId',current_setting('qa.policy.employer'),'op','policy'));
 if p->>'state'<>'revoked' then raise exception 'Revocation failed';end if;
end $$;
reset role;
set local role anon;
do $$declare denied boolean:=false;begin begin perform public.screening_policy('{}');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Anonymous policy access allowed';end if;end $$;
reset role;
select 'PASS: live scoped policy authority, grants, stale/foreign/anonymous denial, service quote gate, positive/idempotent acceptance, complete immutable audit, supersession and revocation; all writes rolled back' verification;
rollback;
