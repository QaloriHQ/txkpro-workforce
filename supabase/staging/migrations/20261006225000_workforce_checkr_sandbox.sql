-- Checkr staging only. Reports/results remain provider-side. Existing Authenticate gate is unchanged.
create table security.wf_checkr_accounts (
 employer_id text primary key references public.contractors(contractor_id),
 account_id text unique not null, sealed_token text not null,
 credentialed boolean not null default false, connected boolean not null default true,
 updated_at timestamptz not null default now()
);
create table security.wf_checkr_quotes (
 id uuid primary key default gen_random_uuid(), employer_id text not null references public.contractors(contractor_id),
 actor text not null references public.users(user_id), subject text not null references public.users(user_id),
 audience text not null check(audience in ('applicant','employee')), account_id text not null,
 package_slug text not null, package_name text not null, node text not null default '',
 base_cents integer not null check(base_cents>0), location jsonb not null,
 expires_at timestamptz not null default now()+interval '10 minutes', order_id uuid unique references public.wf_screening_orders(id)
);
create table security.wf_checkr_dispatch (
 order_id uuid primary key references public.wf_screening_orders(id), candidate_id text, invitation_id text unique,
 report_id text, invitation_status text, report_status text check(report_status in ('processing','complete')),
 started_at timestamptz, lease_until timestamptz, reviewed_by text references public.users(user_id),
 updated_at timestamptz not null default now()
);
create table security.wf_checkr_events (event_id text primary key, received_at timestamptz not null default now());
create index wf_checkr_quotes_employer on security.wf_checkr_quotes(employer_id,actor);
create index wf_checkr_quotes_subject on security.wf_checkr_quotes(subject);
create index wf_checkr_dispatch_report on security.wf_checkr_dispatch(report_id);
create index wf_checkr_dispatch_reviewer on security.wf_checkr_dispatch(reviewed_by);
do $$declare t text;begin foreach t in array array['wf_checkr_accounts','wf_checkr_quotes','wf_checkr_dispatch','wf_checkr_events'] loop
 execute format('alter table security.%I enable row level security',t);
 execute format('revoke all on security.%I from public,anon,authenticated,service_role',t);
end loop;end $$;

create function security.checkr_allowed(e text,a text,cap text) returns boolean language sql stable security definer set search_path='' as $$
select security.screening_member(e,a) and exists(select 1 from public.contractors where contractor_id=e and approval_status='approved' and account_status='active') and
case when cap='manage' then exists(select 1 from public.app_role_memberships where user_id=a and scope_id=e and scope_type in ('employer','contractor') and status='active' and role in ('employer_owner','employer_admin'))
when cap='order' then exists(select 1 from public.wf_screening_permissions where employer_id=e and user_id=a and can_order)
when cap='review' then exists(select 1 from public.wf_screening_permissions where employer_id=e and user_id=a and can_review)
else false end $$;
create function security.checkr_subject(e text,a text,s text,k text) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.users where user_id=s and status='active' and email is not null) and
case when k='employee' then exists(select 1 from public.app_role_memberships where user_id=s and scope_id=e and scope_type in ('employer','contractor') and status='active' and role='employer_employee')
when k='applicant' then exists(
 select 1 from public.wf_referrals r join public.wf_student_profiles p on p.student_id=r.student_id
 left join public.wf_hiring_needs h on h.hiring_need_id=r.hiring_need_id
 where r.employer_id=e and p.user_id=s and r.status not in ('draft','closed','expired')
 and coalesce((security.student_referral_consent_status(r.student_id,r.institution_id)->>'allowed')::boolean,false)
 and exists(select 1 from public.app_role_memberships m where m.user_id=a and m.scope_id=e and m.scope_type in ('employer','contractor') and m.status='active' and
 (m.role in ('employer_owner','employer_admin','recruiter') or (m.role='hiring_manager' and h.assigned_hiring_manager_user_id=a)))
) else false end $$;
-- Session-derived actor only. No credential or private provider payload in this response.
create function public.checkr_authority(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a text:=security.pro_actor();e text:=p_input->>'employerId';op text:=p_input->>'op';v_order public.wf_screening_orders%rowtype;begin
 if not (security.checkr_allowed(e,a,'manage') or security.checkr_allowed(e,a,'order') or security.checkr_allowed(e,a,'review')) then raise exception 'Screening scope denied' using errcode='42501';end if;
 if op='connect' and not security.checkr_allowed(e,a,'manage') then raise exception 'Screening scope denied' using errcode='42501';end if;
 if op in ('quote','prepare') and (not security.checkr_allowed(e,a,'order') or not security.checkr_subject(e,a,p_input->>'subject',p_input->>'audience')) then raise exception 'Screening subject denied' using errcode='42501';end if;
 if op in ('dispatch','reconcile','summary','approve','cancel') then
 select * into v_order from public.wf_screening_orders where id=(p_input->>'orderId')::uuid and employer_id=e;
 if not found or not (security.checkr_allowed(e,a,'manage') or security.checkr_allowed(e,a,'review') or v_order.ordered_by=a) then raise exception 'Screening order denied' using errcode='42501';end if;
 if op='dispatch' and not security.checkr_allowed(e,a,'order') then raise exception 'Screening order denied' using errcode='42501';end if;
 if op='approve' and (not security.checkr_allowed(e,a,'review') or v_order.ordered_by=a) then raise exception 'Independent approver required' using errcode='42501';end if;
 end if;
 return jsonb_build_object('actor',a,'canManage',security.checkr_allowed(e,a,'manage'),'canOrder',security.checkr_allowed(e,a,'order'),'canReview',security.checkr_allowed(e,a,'review'),
 'connected',exists(select 1 from security.wf_checkr_accounts where employer_id=e and connected),
 'credentialed',exists(select 1 from security.wf_checkr_accounts where employer_id=e and connected and credentialed),
 'subjects',coalesce((select jsonb_agg(jsonb_build_object('id',u.user_id,'name',concat_ws(' ',u.first_name,u.last_name),'audience',k))
 from public.users u cross join (values('applicant'),('employee')) kinds(k) where security.checkr_allowed(e,a,'order') and security.checkr_subject(e,a,u.user_id,k)),'[]'),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'status',o.status,'audience',o.audience,'name',concat_ws(' ',u.first_name,u.last_name),'packageName',q.package_name,'baseCents',q.base_cents,'createdAt',o.created_at,'invitationStatus',d.invitation_status,'reportStatus',d.report_status,'own',o.ordered_by=a) order by o.created_at desc)
 from public.wf_screening_orders o join security.wf_checkr_quotes q on q.order_id=o.id join public.users u on u.user_id=o.subject_user_id join security.wf_checkr_dispatch d on d.order_id=o.id
 where o.employer_id=e and (o.ordered_by=a or security.checkr_allowed(e,a,'manage') or security.checkr_allowed(e,a,'review'))),'[]'));
end $$;
create function public.checkr_service(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op text:=p_input->>'op';e text:=p_input->>'employerId';a text:=p_input->>'actor';q security.wf_checkr_quotes%rowtype;c security.wf_checkr_accounts%rowtype;o public.wf_screening_orders%rowtype;d security.wf_checkr_dispatch%rowtype;rid uuid;begin
 if op='event' then
 select * into c from security.wf_checkr_accounts where account_id=p_input->>'accountId' for update;
 if not found then return jsonb_build_object('ignored',true);end if;
 if p_input->>'kind'='token.deauthorized' then update security.wf_checkr_accounts set connected=false,credentialed=false where employer_id=c.employer_id;
 elsif p_input->>'kind'='account.credentialed' then update security.wf_checkr_accounts set credentialed=true where employer_id=c.employer_id and connected;end if;
 insert into security.wf_checkr_events(event_id) values(p_input->>'eventId') on conflict do nothing;
 return jsonb_build_object('employerId',c.employer_id,'orderId',(select x.order_id from security.wf_checkr_dispatch x join public.wf_screening_orders y on y.id=x.order_id where y.employer_id=c.employer_id and (x.invitation_id=p_input->>'objectId' or x.report_id=p_input->>'objectId') limit 1));
 end if;
 if op='connect' then
 if not security.checkr_allowed(e,a,'manage') then raise exception 'Scope denied' using errcode='42501';end if;
 if exists(select 1 from security.wf_checkr_accounts where employer_id=e and account_id<>p_input->>'accountId') and exists(select 1 from security.wf_checkr_quotes where employer_id=e) then raise exception 'Account replacement requires reconciliation';end if;
 insert into security.wf_checkr_accounts(employer_id,account_id,sealed_token) values(e,p_input->>'accountId',p_input->>'sealed') on conflict(employer_id) do update set account_id=excluded.account_id,sealed_token=excluded.sealed_token,connected=true,credentialed=false,updated_at=now();
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event) values(a,'employer',e,'CHECKR_CONNECTED');return '{}'::jsonb;
 end if;
 select * into c from security.wf_checkr_accounts where employer_id=e and connected;
 if not found then raise exception 'Connect Checkr first';end if;
 if op='credential' then update security.wf_checkr_accounts set credentialed=coalesce((p_input->>'credentialed')::boolean,false),updated_at=now() where employer_id=e;return '{}'::jsonb;end if;
 if op='account' then return jsonb_build_object('sealed',c.sealed_token,'accountId',c.account_id,'credentialed',c.credentialed);end if;
 if op='quote' then
 if not c.credentialed or not security.checkr_allowed(e,a,'order') or not security.checkr_subject(e,a,p_input->>'subject',p_input->>'audience') then raise exception 'Quote scope denied' using errcode='42501';end if;
 -- Unknown age and minors remain gated. Self-declared DOB is never screening consent.
 if not exists(select 1 from security.wf_reward_eligibility where user_id=p_input->>'subject' and country='US' and born_on<=current_date-interval '18 years') then raise exception 'Adult eligibility details required';end if;
 insert into security.wf_checkr_quotes(employer_id,actor,subject,audience,account_id,package_slug,package_name,node,base_cents,location)
 values(e,a,p_input->>'subject',p_input->>'audience',c.account_id,p_input->>'slug',p_input->>'name',coalesce(p_input->>'node',''),(p_input->>'price')::integer,p_input->'location') returning * into q;
 return jsonb_build_object('id',q.id,'baseCents',q.base_cents,'expiresAt',q.expires_at,'packageName',q.package_name);
 end if;
 if op='prepare' then
 select * into q from security.wf_checkr_quotes where id=(p_input->>'quoteId')::uuid for update;
 if not found or q.employer_id<>e or q.actor<>a or q.account_id<>c.account_id then raise exception 'Quote scope denied' using errcode='42501';end if;
 if q.order_id is not null then return jsonb_build_object('id',q.order_id);end if;
 if q.expires_at<now() or not c.credentialed or not security.checkr_subject(e,a,q.subject,q.audience) or not exists(select 1 from security.wf_reward_eligibility where user_id=q.subject and country='US' and born_on<=current_date-interval '18 years') then raise exception 'Quote or eligibility changed';end if;
 rid:=security.screening_reserve(e,a,q.subject,q.audience,array[q.package_slug],q.base_cents,q.id);
 update security.wf_checkr_quotes set order_id=rid where id=q.id;
 insert into security.wf_checkr_dispatch(order_id) values(rid);
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event,target) values(a,'employer',e,'CHECKR_ORDER_RESERVED',rid::text);
 return jsonb_build_object('id',rid);
 end if;
 select * into o from public.wf_screening_orders where id=(p_input->>'orderId')::uuid and employer_id=e for update;
 if not found then raise exception 'Order scope denied' using errcode='42501';end if;
 select * into q from security.wf_checkr_quotes where order_id=o.id;
 select * into d from security.wf_checkr_dispatch where order_id=o.id for update;
 if q.id is null then raise exception 'Not a Checkr order';end if;
 if op='approve' then
 if not security.checkr_allowed(e,a,'review') or a=o.ordered_by or o.status<>'pending_approval' then raise exception 'Independent approver required' using errcode='42501';end if;
 update public.wf_screening_orders set status='reserved' where id=o.id;
 update security.wf_checkr_dispatch set reviewed_by=a where order_id=o.id;
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event) values(a,'employer',e,'CHECKR_ORDER_APPROVED');return '{}'::jsonb;
 elsif op='cancel' then
 if not (a=o.ordered_by or security.checkr_allowed(e,a,'review')) or d.started_at is not null or o.status not in ('pending_approval','reserved') then raise exception 'Order cannot be cancelled';end if;
 update public.wf_screening_orders set status='cancelled' where id=o.id;
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event) values(a,'employer',e,'CHECKR_ORDER_CANCELLED');return '{}'::jsonb;
 elsif op='claim' then
 if o.status not in ('reserved','processing') or not security.checkr_allowed(e,a,'order') or not security.checkr_allowed(e,o.ordered_by,'order') or not security.checkr_subject(e,o.ordered_by,o.subject_user_id,o.audience) or not c.credentialed or q.account_id<>c.account_id then raise exception 'Dispatch denied' using errcode='42501';end if;
 if (select coalesce(sum(quoted_cents),0) from public.wf_screening_orders where employer_id=e and ordered_by=o.ordered_by and reserved_month=o.reserved_month and status<>'cancelled') > (select monthly_limit_cents from public.wf_screening_permissions where employer_id=e and user_id=o.ordered_by) then raise exception 'Monthly screening limit exceeded';end if;
 if o.quoted_cents>(select approval_above_cents from public.wf_screening_permissions where employer_id=e and user_id=o.ordered_by) and (d.reviewed_by is null or not security.checkr_allowed(e,d.reviewed_by,'review') or d.reviewed_by=o.ordered_by) then raise exception 'Independent approval required';end if;
 if d.invitation_id is not null then return jsonb_build_object('done',true);end if;
 if d.lease_until>now() then raise exception 'Submission in progress';end if;
 if d.started_at<now()-interval '23 hours' then raise exception 'Submission requires provider reconciliation';end if;
 if not exists(select 1 from security.wf_reward_eligibility where user_id=o.subject_user_id and country='US' and born_on<=current_date-interval '18 years') then raise exception 'Adult eligibility details required';end if;
 update security.wf_checkr_dispatch set started_at=coalesce(started_at,now()),lease_until=now()+interval '60 seconds' where order_id=o.id;
 update public.wf_screening_orders set status='processing' where id=o.id;
 return jsonb_build_object('candidateId',d.candidate_id,'package',q.package_slug,'node',q.node,'location',q.location,'email',(select email from public.users where user_id=o.subject_user_id));
 elsif op='candidate' then update security.wf_checkr_dispatch set candidate_id=p_input->>'candidateId' where order_id=o.id and (candidate_id is null or candidate_id=p_input->>'candidateId');return '{}'::jsonb;
 elsif op='submitted' then
 if d.candidate_id<>p_input->>'candidateId' then raise exception 'Candidate binding mismatch';end if;
 update security.wf_checkr_dispatch set invitation_id=p_input->>'invitationId',invitation_status='pending',lease_until=null,updated_at=now() where order_id=o.id;
 update public.wf_screening_orders set provider_id=p_input->>'invitationId' where id=o.id;
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event) values(a,'employer',e,'CHECKR_INVITATION_SENT');return '{}'::jsonb;
 elsif op='read' then return jsonb_build_object('invitationId',d.invitation_id,'candidateId',d.candidate_id,'reportId',d.report_id,'package',q.package_slug,'baseCents',q.base_cents,'node',q.node,'status',o.status);
 elsif op='status' then
 if d.invitation_id<>p_input->>'invitationId' or d.candidate_id<>p_input->>'candidateId' then raise exception 'Provider binding mismatch';end if;
 update security.wf_checkr_dispatch set invitation_status=p_input->>'invitationStatus',report_id=coalesce(p_input->>'reportId',report_id),report_status=case when report_status='complete' then 'complete' else p_input->>'reportStatus' end,updated_at=now() where order_id=o.id;
 if p_input->>'reportStatus'='complete' then update public.wf_screening_orders set status='complete' where id=o.id;end if;
 return '{}'::jsonb;
 else raise exception 'Unsupported Checkr operation';end if;
end $$;
revoke all on function security.checkr_allowed(text,text,text),security.checkr_subject(text,text,text,text),public.checkr_authority(jsonb),public.checkr_service(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.checkr_authority(jsonb) to authenticated;
grant execute on function public.checkr_service(jsonb) to service_role;
