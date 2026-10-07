begin;
do $$
declare u text; au uuid; i text;
begin
 select m.user_id,x.auth_user_id,m.scope_id into u,au,i from public.app_role_memberships m join public.users x on x.user_id=m.user_id join public.wf_institutions w on w.institution_id=m.scope_id where m.scope_type='institution' and m.status='active' and m.role in ('institution_admin','institution_super_admin') and x.status='active' and x.auth_user_id is not null and w.active limit 1;
 if u is null then raise exception 'Active institutional test administrator required';end if;
 perform set_config('txkpro.qa.actor',u,true);perform set_config('txkpro.qa.scope',i,true);
 perform set_config('request.jwt.claim.sub',au::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',au,'role','authenticated')::text,true);
 if has_function_privilege('anon','public.auth_screening_authority(jsonb)','execute') or has_function_privilege('authenticated','public.auth_screening_service(jsonb)','execute') or has_table_privilege('authenticated','security.wf_auth_orders','select') then raise exception 'RPC privilege boundary failed';end if;
end $$;
set local role authenticated;
do $$
declare v jsonb;denied boolean;
begin
 v:=public.auth_screening_authority(jsonb_build_object('op','workspace','ownerType','institution','ownerId',current_setting('txkpro.qa.scope')));
 if not (v->>'canManage')::boolean or v::text like '%auth_user_id%' or v::text like '%stripe_session%' then raise exception 'Authority projection failed';end if;
 denied:=false;begin perform public.auth_screening_authority(jsonb_build_object('op','workspace','ownerType','institution','ownerId','ROLLBACK-FOREIGN-SCOPE'));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Cross-workspace denial failed';end if;
 denied:=false;begin perform public.auth_screening_service('{}');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Authenticated service RPC accessible';end if;
 denied:=false;begin perform 1 from security.wf_auth_orders;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Private orders readable';end if;
end $$;
reset role;
do $$
declare base jsonb;q jsonb;q2 jsonb;denied boolean;
begin
 base:=jsonb_build_object('ownerType','institution','ownerId',current_setting('txkpro.qa.scope'),'actor',current_setting('txkpro.qa.actor'));
 perform public.auth_screening_service(base||jsonb_build_object('op','permission','userId',current_setting('txkpro.qa.actor'),'canOrder',true,'canReview',true,'limit',1000000,'threshold',0));
 q:=base||jsonb_build_object('op','quote','subject',current_setting('txkpro.qa.actor'),'audience','staff','products',jsonb_build_array('employment'),'providerCents',500,'platformCents',500,'thirdPartyCents',0,'totalCents',1000,'pricingVersion','authenticate-public-usd-mock-2026-10-06-v1','paymentConfiguration','pmc_ROLLBACK_ONLY','requestKey',gen_random_uuid());
 q2:=public.auth_screening_service(q);
 if q2->>'status'<>'pending_approval' or q2->>'id'<>(public.auth_screening_service(q)->>'id') then raise exception 'Reservation retry/approval state failed';end if;
 denied:=false;begin perform public.auth_screening_service(base||jsonb_build_object('op','approve','orderId',q2->>'id'));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Self approval allowed';end if;
 perform public.auth_screening_service(base||jsonb_build_object('op','cancel','orderId',q2->>'id'));
end $$;
set local role anon;
do $$declare denied boolean:=false;begin
 begin perform public.auth_screening_authority('{}');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Anonymous read allowed';end if;
end $$;
reset role;
select 'PASS: live scoped authority, private projection/table denial, anonymous/service grants, canonical UUID/text binding, idempotent reservation, independent approval and cancellation; all test writes rolled back' verification;
rollback;
