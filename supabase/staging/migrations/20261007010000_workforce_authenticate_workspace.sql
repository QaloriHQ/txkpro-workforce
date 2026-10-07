-- Additive staging-only synthetic Authenticate workflow. Real checks have no application execution path.
create table security.wf_auth_permissions(
 owner_type text not null check(owner_type in ('institution','employer')),owner_id text not null,user_id text not null references public.users,
 can_order boolean not null default false,can_review boolean not null default false,
 monthly_limit_cents integer not null check(monthly_limit_cents between 0 and 1000000),approval_above_cents integer not null check(approval_above_cents between 0 and 1000000),
 primary key(owner_type,owner_id,user_id)
);
-- Preserve explicit employer grants. Subsequent grants are managed by this workflow.
insert into security.wf_auth_permissions select 'employer',employer_id,user_id,can_order,can_review,monthly_limit_cents,approval_above_cents from public.wf_screening_permissions;
create table security.wf_auth_bundles(id uuid primary key default gen_random_uuid(),owner_type text not null,owner_id text not null,name text not null check(length(name) between 1 and 80),products jsonb not null,created_by text not null references public.users);
create table security.wf_auth_orders(
 id uuid primary key default gen_random_uuid(),owner_type text not null check(owner_type in ('employer','institution')),owner_id text not null,
 actor text not null references public.users,subject text not null references public.users,audience text not null check(audience in ('applicant','employee','student','staff')),
 products jsonb not null,provider_cents integer not null check(provider_cents>0),platform_cents integer not null check(platform_cents=greatest(500,ceil(provider_cents::numeric/10)::integer)),
 third_party_cents integer not null check(third_party_cents>=0),total_cents integer not null check(total_cents=provider_cents+platform_cents+third_party_cents),pricing_version text not null,payment_configuration text not null,
 status text not null check(status in ('pending_approval','reserved','processing','complete','cancelled')),
 payment_status text not null default 'quoted' check(payment_status in ('quoted','pending','paid','failed','expired','hold')),
 request_key uuid not null unique,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 minutes',
 reserved_month date not null default date_trunc('month',now())::date,reviewer text references public.users,
 stripe_session text unique,checkout_attempted_at timestamptz,checkout_lease uuid,checkout_lease_until timestamptz
);
create table security.wf_auth_items(order_id uuid not null references security.wf_auth_orders,product text not null,attempted_at timestamptz,complete_at timestamptz,lease uuid,primary key(order_id,product));
create table security.wf_auth_payments(order_id uuid primary key references security.wf_auth_orders,owner_type text not null,owner_id text not null,provider_cents integer not null,platform_cents integer not null,third_party_cents integer not null,total_cents integer not null,paid_at timestamptz not null default now());
create table security.wf_auth_events(id text primary key,order_id uuid not null references security.wf_auth_orders,kind text not null,received_at timestamptz not null default now());
create index wf_auth_orders_scope on security.wf_auth_orders(owner_type,owner_id,actor,reserved_month);
create index wf_auth_orders_subject on security.wf_auth_orders(subject);
create index wf_auth_orders_reviewer on security.wf_auth_orders(reviewer);
create index wf_auth_bundles_scope on security.wf_auth_bundles(owner_type,owner_id);
create index wf_auth_bundles_creator on security.wf_auth_bundles(created_by);
create index wf_auth_permissions_user on security.wf_auth_permissions(user_id);
create index wf_auth_events_order on security.wf_auth_events(order_id);
do $$declare t text;begin foreach t in array array['wf_auth_permissions','wf_auth_bundles','wf_auth_orders','wf_auth_items','wf_auth_payments','wf_auth_events'] loop
 execute format('alter table security.%I enable row level security',t);execute format('revoke all on security.%I from public,anon,authenticated,service_role',t);end loop;end $$;
create function security.auth_member(t text,i text,a text) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.users u where u.user_id=a and u.status='active') and case
when t='employer' then exists(select 1 from public.contractors c where c.contractor_id=i and c.approval_status='approved' and c.account_status='active') and exists(select 1 from public.app_role_memberships m where m.user_id=a and m.scope_id=i and m.scope_type in ('employer','contractor') and m.status='active' and m.role in ('employer_owner','employer_admin','recruiter','hiring_manager'))
when t='institution' then exists(select 1 from public.wf_institutions c where c.institution_id=i and c.active) and exists(select 1 from public.app_role_memberships m where m.user_id=a and m.scope_id=i and m.scope_type='institution' and m.status='active' and m.role in ('institution_super_admin','institution_admin','department_head','program_coordinator','instructor','assistant_instructor','career_services')) else false end $$;
create function security.auth_allowed(t text,i text,a text,c text) returns boolean language sql stable security definer set search_path='' as $$
select security.auth_member(t,i,a) and case when c='manage' then exists(select 1 from public.app_role_memberships m where m.user_id=a and m.scope_id=i and m.status='active' and ((t='employer' and m.scope_type in ('employer','contractor') and m.role in ('employer_owner','employer_admin')) or (t='institution' and m.scope_type='institution' and m.role in ('institution_super_admin','institution_admin'))))
when c='order' then exists(select 1 from security.wf_auth_permissions where owner_type=t and owner_id=i and user_id=a and can_order)
when c='review' then exists(select 1 from security.wf_auth_permissions where owner_type=t and owner_id=i and user_id=a and can_review) else false end $$;
create function security.auth_subject(t text,i text,a text,s text,k text) returns boolean language sql stable security definer set search_path='' as $$
select security.auth_member(t,i,a) and exists(select 1 from public.users where user_id=s and status='active') and case
when t='employer' then security.checkr_subject(i,a,s,k)
when t='institution' and k='student' then exists(select 1 from public.wf_student_profiles where user_id=s and school_id=i)
when t='institution' and k='staff' then security.auth_member(t,i,s) else false end $$;
create function security.auth_products(p jsonb) returns boolean language sql immutable set search_path='' as $$
select case when jsonb_typeof(p)='array' then jsonb_array_length(p) between 1 and 5 and (select count(*)=count(distinct value) and bool_and(value in ('criminal-seven','employment','education','license','mvr')) from jsonb_array_elements_text(p)) else false end $$;
create function public.auth_screening_authority(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a text:=security.pro_actor();t text:=p_input->>'ownerType';i text:=p_input->>'ownerId';op text:=p_input->>'op';o security.wf_auth_orders%rowtype;begin
 if not (security.auth_allowed(t,i,a,'manage') or security.auth_allowed(t,i,a,'order') or security.auth_allowed(t,i,a,'review')) then raise exception 'Screening access denied' using errcode='42501';end if;
 if op='permission' and not security.auth_allowed(t,i,a,'manage') then raise exception 'Screening access denied' using errcode='42501';end if;
 if op in ('quote','bundle') and not security.auth_allowed(t,i,a,'order') then raise exception 'Screening ordering denied' using errcode='42501';end if;
 if op='quote' and not security.auth_subject(t,i,a,p_input->>'subject',p_input->>'audience') then raise exception 'Screening subject denied' using errcode='42501';end if;
 if op in ('checkout','dispatch','approve','cancel','status','documents') then
 select * into o from security.wf_auth_orders where id=(p_input->>'orderId')::uuid and owner_type=t and owner_id=i;
 if not found or not (o.actor=a or security.auth_allowed(t,i,a,'manage') or security.auth_allowed(t,i,a,'review')) then raise exception 'Screening order denied' using errcode='42501';end if;
 if op in ('checkout','dispatch') and (a<>o.actor or not security.auth_allowed(t,i,a,'order')) then raise exception 'Only orderer may pay and submit' using errcode='42501';end if;
 end if;
 return jsonb_build_object('actor',a,'canManage',security.auth_allowed(t,i,a,'manage'),'canOrder',security.auth_allowed(t,i,a,'order'),'canReview',security.auth_allowed(t,i,a,'review'),
 'members',case when security.auth_allowed(t,i,a,'manage') then coalesce((select jsonb_agg(jsonb_build_object('id',u.user_id,'name',concat_ws(' ',u.first_name,u.last_name),'canOrder',coalesce(p.can_order,false),'canReview',coalesce(p.can_review,false),'limit',coalesce(p.monthly_limit_cents,0),'threshold',coalesce(p.approval_above_cents,0))) from public.users u left join security.wf_auth_permissions p on p.user_id=u.user_id and p.owner_type=t and p.owner_id=i where security.auth_member(t,i,u.user_id)),'[]') else '[]'::jsonb end,
 'subjects',coalesce((select jsonb_agg(jsonb_build_object('id',u.user_id,'name',concat_ws(' ',u.first_name,u.last_name),'audience',k)) from public.users u cross join (values('applicant'),('employee'),('student'),('staff')) kinds(k) where security.auth_allowed(t,i,a,'order') and security.auth_subject(t,i,a,u.user_id,k)),'[]'),
 'bundles',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'products',b.products)) from security.wf_auth_bundles b where b.owner_type=t and b.owner_id=i),'[]'),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',concat_ws(' ',u.first_name,u.last_name),'audience',x.audience,'products',x.products,'providerCents',x.provider_cents,'platformCents',x.platform_cents,'thirdPartyCents',x.third_party_cents,'totalCents',x.total_cents,'status',x.status,'payment',x.payment_status,'own',x.actor=a,'createdAt',x.created_at,'items',(select jsonb_agg(jsonb_build_object('product',d.product,'status',case when d.complete_at is not null then 'complete' when d.attempted_at is not null then 'reconciliation_required' else 'ready' end)) from security.wf_auth_items d where d.order_id=x.id)) order by x.created_at desc) from security.wf_auth_orders x join public.users u on u.user_id=x.subject where x.owner_type=t and x.owner_id=i and (x.actor=a or security.auth_allowed(t,i,a,'manage') or security.auth_allowed(t,i,a,'review'))),'[]'),
 'costs',case when security.auth_allowed(t,i,a,'manage') or security.auth_allowed(t,i,a,'review') then (select jsonb_build_object('providerCents',coalesce(sum(provider_cents),0),'platformCents',coalesce(sum(platform_cents),0),'thirdPartyCents',coalesce(sum(third_party_cents),0),'totalCents',coalesce(sum(total_cents),0)) from security.wf_auth_payments where owner_type=t and owner_id=i) else null end);
end $$;
create function security.auth_ready(o security.wf_auth_orders) returns boolean language sql stable security definer set search_path='' as $$
select security.auth_allowed(o.owner_type,o.owner_id,o.actor,'order') and security.auth_subject(o.owner_type,o.owner_id,o.actor,o.subject,o.audience) and exists(select 1 from security.wf_auth_permissions p where p.owner_type=o.owner_type and p.owner_id=o.owner_id and p.user_id=o.actor and
 (select coalesce(sum(total_cents),0) from security.wf_auth_orders where owner_type=o.owner_type and owner_id=o.owner_id and actor=o.actor and reserved_month=o.reserved_month and status<>'cancelled')<=p.monthly_limit_cents and (o.total_cents<=p.approval_above_cents or (o.reviewer is not null and o.reviewer<>o.actor and security.auth_allowed(o.owner_type,o.owner_id,o.reviewer,'review')))) $$;
create function public.auth_screening_service(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op text:=p_input->>'op';a text:=p_input->>'actor';t text:=p_input->>'ownerType';i text:=p_input->>'ownerId';o security.wf_auth_orders%rowtype;p security.wf_auth_permissions%rowtype;d security.wf_auth_items%rowtype;key uuid;total integer;begin
 if op='permission' then
 if not security.auth_allowed(t,i,a,'manage') or not security.auth_member(t,i,p_input->>'userId') then raise exception 'Permission denied' using errcode='42501';end if;
 insert into security.wf_auth_permissions values(t,i,p_input->>'userId',coalesce((p_input->>'canOrder')::boolean,false),coalesce((p_input->>'canReview')::boolean,false),(p_input->>'limit')::integer,(p_input->>'threshold')::integer) on conflict(owner_type,owner_id,user_id) do update set can_order=excluded.can_order,can_review=excluded.can_review,monthly_limit_cents=excluded.monthly_limit_cents,approval_above_cents=excluded.approval_above_cents;
 elsif op='bundle' then
 if not security.auth_allowed(t,i,a,'order') or not security.auth_products(p_input->'products') then raise exception 'Bundle denied' using errcode='42501';end if;
 insert into security.wf_auth_bundles(owner_type,owner_id,name,products,created_by) values(t,i,trim(p_input->>'name'),p_input->'products',a);
 elsif op='quote' then
 if not security.auth_allowed(t,i,a,'order') or not security.auth_subject(t,i,a,p_input->>'subject',p_input->>'audience') then raise exception 'Quote denied' using errcode='42501';end if;
 if not security.auth_products(p_input->'products') or (p_input->>'providerCents')::integer<>jsonb_array_length(p_input->'products')*500 or p_input->>'pricingVersion'<>'authenticate-public-usd-mock-2026-10-06-v1' then raise exception 'Pricing invalid';end if;
 -- Permission row lock serializes reservations for this orderer. Requests bind exact scope/subject/cart/pricing.
 select * into p from security.wf_auth_permissions where owner_type=t and owner_id=i and user_id=a for update;
 select * into o from security.wf_auth_orders where request_key=(p_input->>'requestKey')::uuid;
 if found then
 if o.owner_type<>t or o.owner_id<>i or o.actor<>a or o.subject<>p_input->>'subject' or o.audience<>p_input->>'audience' or o.products<>p_input->'products' or o.total_cents<>(p_input->>'totalCents')::integer then raise exception 'Request binding mismatch';end if;return to_jsonb(o);end if;
 total:=(p_input->>'totalCents')::integer;
 if not p.can_order or total>(p.monthly_limit_cents-(select coalesce(sum(total_cents),0) from security.wf_auth_orders where owner_type=t and owner_id=i and actor=a and reserved_month=date_trunc('month',now())::date and status<>'cancelled')) then raise exception 'Monthly screening limit exceeded';end if;
 insert into security.wf_auth_orders(owner_type,owner_id,actor,subject,audience,products,provider_cents,platform_cents,third_party_cents,total_cents,pricing_version,payment_configuration,status,request_key)
 values(t,i,a,p_input->>'subject',p_input->>'audience',p_input->'products',(p_input->>'providerCents')::integer,(p_input->>'platformCents')::integer,(p_input->>'thirdPartyCents')::integer,total,p_input->>'pricingVersion',p_input->>'paymentConfiguration',case when total>p.approval_above_cents then 'pending_approval' else 'reserved' end,(p_input->>'requestKey')::uuid) returning * into o;
 insert into security.wf_auth_items(order_id,product) select o.id,value from jsonb_array_elements_text(o.products);
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event,target) values(a,t,i,'AUTHENTICATE_TEST_ORDER_RESERVED',o.id::text);return to_jsonb(o);
 else
 select * into o from security.wf_auth_orders where id=(p_input->>'orderId')::uuid for update;
 if not found or (op not in ('payment','read') and (o.owner_type is distinct from t or o.owner_id is distinct from i)) then raise exception 'Order denied' using errcode='42501';end if;
 if op='read' then return to_jsonb(o);end if;
 if op='approve' then
 if not security.auth_allowed(t,i,a,'review') or o.actor=a or o.status<>'pending_approval' then raise exception 'Independent approver required' using errcode='42501';end if;
 update security.wf_auth_orders set status='reserved',reviewer=a where id=o.id;
 elsif op='cancel' then
 if not (security.auth_allowed(t,i,a,'review') or (a=o.actor and security.auth_allowed(t,i,a,'order'))) or o.checkout_attempted_at is not null or o.status not in ('pending_approval','reserved') then raise exception 'Order cannot be cancelled';end if;
 update security.wf_auth_orders set status='cancelled' where id=o.id;
 elsif op='checkout' then
 if a<>o.actor or o.status<>'reserved' or o.payment_status in ('paid','failed','expired','hold') or not security.auth_ready(o) then raise exception 'Payment permission or approval changed' using errcode='42501';end if;
 if o.stripe_session is not null then return to_jsonb(o);end if;
 if o.expires_at<now() and o.checkout_attempted_at is null then raise exception 'Quote expired; cancel and create a new request';end if;
 if o.checkout_lease_until>now() then raise exception 'Payment setup in progress';end if;
 if o.checkout_attempted_at<now()-interval '23 hours' then raise exception 'Payment requires administrator reconciliation';end if;
 key:=gen_random_uuid();update security.wf_auth_orders set checkout_lease=key,checkout_lease_until=now()+interval '60 seconds',checkout_attempted_at=coalesce(checkout_attempted_at,now()) where id=o.id returning * into o;
 return to_jsonb(o)||jsonb_build_object('customer_email',(select email from public.users where user_id=a));
 elsif op='session' then
 if o.checkout_lease is distinct from (p_input->>'lease')::uuid or o.stripe_session is not null then raise exception 'Session binding mismatch';end if;
 update security.wf_auth_orders set stripe_session=p_input->>'sessionId',payment_status='pending',checkout_lease_until=null where id=o.id;
 elsif op='payment' then
 if o.stripe_session is distinct from p_input->>'sessionId' then raise exception 'Payment binding mismatch';end if;
 if p_input->>'kind' not in ('paid','failed','expired','hold') then raise exception 'Payment status invalid';end if;
 insert into security.wf_auth_events(id,order_id,kind) values(p_input->>'eventId',o.id,p_input->>'kind') on conflict do nothing;
 if not found then return '{}'::jsonb;end if;
 if p_input->>'kind'='hold' then update security.wf_auth_orders set payment_status='hold' where id=o.id;
 elsif o.payment_status not in ('paid','hold') then update security.wf_auth_orders set payment_status=p_input->>'kind' where id=o.id;end if;
 if p_input->>'kind'='paid' then insert into security.wf_auth_payments(order_id,owner_type,owner_id,provider_cents,platform_cents,third_party_cents,total_cents) values(o.id,o.owner_type,o.owner_id,o.provider_cents,o.platform_cents,o.third_party_cents,o.total_cents) on conflict do nothing;end if;
 elsif op='claim' then
 if a<>o.actor or o.status not in ('reserved','processing') or o.payment_status<>'paid' or not security.auth_ready(o) then raise exception 'Paid authorized order required' using errcode='42501';end if;
 select * into d from security.wf_auth_items where order_id=o.id and product=p_input->>'product' for update;
 if not found then raise exception 'Product denied';end if;
 if d.complete_at is not null then return jsonb_build_object('done',true);end if;
 if d.attempted_at is not null then raise exception 'Provider result unconfirmed; administrator reconciliation required';end if;
 key:=gen_random_uuid();update security.wf_auth_items set attempted_at=now(),lease=key where order_id=o.id and product=d.product;
 update security.wf_auth_orders set status='processing' where id=o.id;return jsonb_build_object('lease',key);
 elsif op='finish' then
 update security.wf_auth_items set complete_at=now() where order_id=o.id and product=p_input->>'product' and lease=(p_input->>'lease')::uuid and attempted_at is not null;
 if not found then raise exception 'Submission binding mismatch';end if;
 if not exists(select 1 from security.wf_auth_items where order_id=o.id and complete_at is null) then update security.wf_auth_orders set status='complete' where id=o.id;end if;
 else raise exception 'Unsupported operation';end if;
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event,target) values(a,o.owner_type,o.owner_id,'AUTHENTICATE_TEST_'||upper(op),o.id::text);
 end if;
 if op in ('permission','bundle') then insert into public.wf_reward_audit(actor,owner_type,owner_id,event,target) values(a,t,i,'AUTHENTICATE_TEST_'||upper(op),p_input->>'userId');end if;
 return '{}'::jsonb;
end $$;
revoke all on function security.auth_member(text,text,text),security.auth_allowed(text,text,text,text),security.auth_subject(text,text,text,text,text),security.auth_products(jsonb),security.auth_ready(security.wf_auth_orders),public.auth_screening_authority(jsonb),public.auth_screening_service(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.auth_screening_authority(jsonb) to authenticated;
grant execute on function public.auth_screening_service(jsonb) to service_role;
