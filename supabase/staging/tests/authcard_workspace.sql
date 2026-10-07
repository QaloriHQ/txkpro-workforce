begin;
do $$declare u text;au uuid;i text;base jsonb;o jsonb;r uuid;begin
 select m.user_id,x.auth_user_id,m.scope_id into u,au,i from public.app_role_memberships m join public.users x on x.user_id=m.user_id join public.wf_institutions w on w.institution_id=m.scope_id where m.scope_type='institution' and m.status='active' and m.role in ('institution_admin','institution_super_admin') and x.status='active' and x.auth_user_id is not null and w.active limit 1;
 if u is null then raise exception 'Active institution administrator required';end if;
 perform set_config('txkpro.qa.actor',u,true);perform set_config('txkpro.qa.scope',i,true);
 perform set_config('request.jwt.claim.sub',au::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',au,'role','authenticated')::text,true);
 if has_function_privilege('anon','public.authcard_self(jsonb)','execute') or has_function_privilege('authenticated','public.authcard_service(jsonb)','execute') or has_function_privilege('service_role','public.auth_screening_service_legacy(jsonb)','execute') or has_table_privilege('authenticated','security.wf_authcards','select') then raise exception 'Privilege boundary failed';end if;
 base:=jsonb_build_object('ownerType','institution','ownerId',i,'actor',u);
 perform public.auth_screening_service(base||jsonb_build_object('op','permission','userId',u,'canOrder',true,'canReview',true,'limit',1000000,'threshold',1000000));
 o:=public.auth_screening_service(base||jsonb_build_object('op','quote','subject',u,'audience','staff','products',jsonb_build_array('employment'),'providerCents',500,'platformCents',500,'thirdPartyCents',0,'totalCents',1000,'pricingVersion','authenticate-public-usd-mock-2026-10-06-v1','paymentConfiguration','pmc_ROLLBACK_ONLY','requestKey',gen_random_uuid(),'purpose','fraud_prevention','transactionCertified',true,'nonEligibilityCertified',true));
 select id into r from security.wf_authcard_requests where order_id=(o->>'id')::uuid;
 perform set_config('txkpro.qa.order',o->>'id',true);perform set_config('txkpro.qa.request',r::text,true);
end $$;
set local role authenticated;
do $$declare v jsonb;denied boolean:=false;begin
 v:=public.authcard_self(jsonb_build_object('op','workspace'));
 if v::text like '%details_encrypted%' or v::text like '%identity_session%' or v::text like '%payment_session%' then raise exception 'Private projection failed';end if;
 begin perform 1 from security.wf_authcards;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Private table readable';end if;
 denied:=false;begin perform public.authcard_self(jsonb_build_object('op','share','requestId',gen_random_uuid()));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign request accessible';end if;
 denied:=false;begin perform public.authcard_order_status(jsonb_build_object('ownerType','institution','ownerId','ROLLBACK_FOREIGN'));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign workspace accessible';end if;
end $$;
reset role;
do $$declare denied boolean:=false;begin
 begin perform public.auth_screening_service(jsonb_build_object('ownerType','institution','ownerId',current_setting('txkpro.qa.scope'),'actor',current_setting('txkpro.qa.actor'),'op','checkout','orderId',current_setting('txkpro.qa.order')));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Checkout without authorization allowed';end if;
 -- Synthetic state for authorization testing only; no Stripe/Authenticate call and nothing persists.
 update security.wf_authcards set status='verified',payment_status='paid',adult_verified=true,details_encrypted='ROLLBACK_ONLY_ENCRYPTED_FIXTURE' where user_id=current_setting('txkpro.qa.actor');
end $$;
set local role authenticated;
do $$declare v jsonb;r jsonb;accepted jsonb;denied boolean:=false;begin
 perform public.authcard_self(jsonb_build_object('op','share','requestId',current_setting('txkpro.qa.request')));
 v:=public.authcard_self(jsonb_build_object('op','workspace'));
 select value into r from jsonb_array_elements(v->'requests') where value->>'id'=current_setting('txkpro.qa.request');
 begin perform public.authcard_self(jsonb_build_object('op','authorize','requestId',r->>'id','version',r->>'version','accepted',jsonb_build_array('txkpro')));exception when others then if sqlerrm='All consent fields required' then denied:=true;else raise;end if;end;if not denied then raise exception 'Incomplete consent accepted';end if;
 select jsonb_agg(value->>'id') into accepted from jsonb_array_elements(r->'parties');
 perform public.authcard_self(jsonb_build_object('op','authorize','requestId',r->>'id','version',r->>'version','accepted',accepted));
 v:=public.authcard_order_status(jsonb_build_object('ownerType','institution','ownerId',current_setting('txkpro.qa.scope')));
 if not (v->current_setting('txkpro.qa.order')->>'authorized')::boolean then raise exception 'Exact order authorization failed';end if;
 perform public.authcard_self(jsonb_build_object('op','revoke','requestId',r->>'id'));
end $$;
reset role;
do $$declare denied boolean:=false;begin
 begin perform public.auth_screening_service(jsonb_build_object('ownerType','institution','ownerId',current_setting('txkpro.qa.scope'),'actor',current_setting('txkpro.qa.actor'),'op','checkout','orderId',current_setting('txkpro.qa.order')));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Revoked checkout allowed';end if;
 if (select count(*) from security.wf_authcard_authorizations where request_id=current_setting('txkpro.qa.request')::uuid)<>1 then raise exception 'Immutable authorization history lost';end if;
end $$;
set local role anon;
do $$declare denied boolean:=false;begin
 begin perform public.authcard_self('{}');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Anonymous AuthCard access allowed';end if;
end $$;
reset role;
select 'PASS: live self/scoped authority, private projection and grants, foreign/anonymous denial, missing consent and revocation checkout gates, immutable authorization; all test writes rolled back' verification;
rollback;
