-- Appendix C: additive Employer policy contract. Sandbox does not enable real employment screening.
create table security.wf_screening_policy_versions (
 policy_id text not null, version integer not null check(version>0), title text not null, body text not null,
 content_hash text not null,
 published_at timestamptz not null default now(), primary key(policy_id,version)
);
create table security.wf_screening_policy_current (
 policy_id text primary key, version integer not null,
 foreign key(policy_id,version) references security.wf_screening_policy_versions(policy_id,version)
);
create table security.wf_screening_policy_acceptances (
 sequence bigint generated always as identity primary key, id uuid unique not null default gen_random_uuid(),
 employer_id text not null references public.contractors(contractor_id), actor_user_id text not null references public.users(user_id),
 policy_id text not null, policy_version integer not null, content_hash text not null,
 accepted_at timestamptz not null default now(), scope text not null default 'employer:screening', correlation_id uuid not null,
 foreign key(policy_id,policy_version) references security.wf_screening_policy_versions(policy_id,version)
);
create index wf_screening_policy_acceptances_employer on security.wf_screening_policy_acceptances(employer_id,sequence desc);
create index wf_screening_policy_acceptances_actor on security.wf_screening_policy_acceptances(actor_user_id);
create index wf_screening_policy_acceptances_version on security.wf_screening_policy_acceptances(policy_id,policy_version);
create table security.wf_screening_policy_revocations (
 acceptance_id uuid primary key references security.wf_screening_policy_acceptances(id),
 actor_user_id text not null references public.users(user_id), revoked_at timestamptz not null default now(), correlation_id uuid not null
);
create index wf_screening_policy_revocations_actor on security.wf_screening_policy_revocations(actor_user_id);
alter table public.wf_reward_audit add column payload jsonb;
create function security.screening_policy_hash() returns trigger language plpgsql set search_path='' as $$begin new.content_hash:=encode(sha256(convert_to(new.body,'UTF8')),'hex');return new;end $$;
create trigger policy_hash before insert on security.wf_screening_policy_versions for each row execute function security.screening_policy_hash();
create function security.screening_policy_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Policy evidence is immutable';end $$;
do $$declare t text;begin foreach t in array array['wf_screening_policy_versions','wf_screening_policy_acceptances','wf_screening_policy_revocations'] loop
 execute format('create trigger immutable_policy before update or delete on security.%I for each row execute function security.screening_policy_immutable()',t);
 end loop;
 foreach t in array array['wf_screening_policy_versions','wf_screening_policy_current','wf_screening_policy_acceptances','wf_screening_policy_revocations'] loop
 execute format('alter table security.%I enable row level security',t);
 execute format('revoke all on security.%I from public,anon,authenticated,service_role',t);
 end loop;end $$;
insert into security.wf_screening_policy_versions(policy_id,version,title,body) values('employer-screening',1,'TXKPRO Employer screening policy — sandbox',
$policy$This staging policy governs access to TXKPRO sandbox screening features. All checks use fixed provider mock identities and all payments are test payments. Do not submit real-person screening information to Authenticate.

By accepting, I affirm that I am authorized to represent this Employer workspace. Acceptance applies only to this workspace and does not grant ordering, review or spending permissions.

Each orderer must certify the intended transaction use. TXKPRO and this workspace must not use sandbox results to determine employment, credit or insurance eligibility. Candidate AuthCard sharing and separate authorization for the exact checks remain required. Employer acceptance, platform identity verification and Candidate authorization are separate controls.

Keep account access and information confidential. Respect Candidate sharing/revocation choices. Revocation, role loss or a new policy version may suspend future requests, payments and provider submissions. Previously submitted checks cannot be recalled. Historical policy acceptance and Candidate authorization records are retained for audit; invoice/status access remains scoped.

Employer policy records and certifications stay inside TXKPRO and are not sent to Authenticate.

LEGAL REVIEW NOTICE
This policy establishes TXKPRO platform and contractual requirements and is not a substitute for advice from qualified legal counsel. Employment-screening laws vary by jurisdiction and may change. TXKPRO should have this policy, its Employer agreement, Candidate disclosures, screening-provider contracts, electronic-consent implementation, and any integrated adverse-action workflow reviewed by qualified employment/privacy counsel before enabling production employment background screening. Accepting this sandbox policy does not enable production employment screening.$policy$);
insert into security.wf_screening_policy_current values('employer-screening',1);
create function security.screening_policy_state(i text) returns text language plpgsql volatile security definer set search_path='' as $$
declare v integer;r security.wf_screening_policy_acceptances%rowtype;begin
 select version into v from security.wf_screening_policy_current where policy_id='employer-screening';
 select * into r from security.wf_screening_policy_acceptances where employer_id=i and policy_id='employer-screening' order by sequence desc limit 1;
 if r.id is null or v is null then return 'required';end if;
 if exists(select 1 from security.wf_screening_policy_revocations where acceptance_id=r.id) or not security.auth_allowed('employer',i,r.actor_user_id,'manage') then return 'revoked';end if;
 if r.policy_version<>v then return 'superseded';end if;
 return 'accepted';end $$;
create function public.screening_policy(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a text:=security.pro_actor();i text:=p_input->>'ownerId';op text:=p_input->>'op';v security.wf_screening_policy_versions%rowtype;r security.wf_screening_policy_acceptances%rowtype;c uuid;begin
 if p_input->>'ownerType' is distinct from 'employer' or not coalesce(security.auth_member('employer',i,a),false) or not (security.auth_allowed('employer',i,a,'manage') or security.auth_allowed('employer',i,a,'order') or security.auth_allowed('employer',i,a,'review')) then raise exception 'Employer policy access denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('screening-policy:'||i,0));
 perform 1 from security.wf_screening_policy_current where policy_id='employer-screening' for share;
 select p.* into v from security.wf_screening_policy_versions p join security.wf_screening_policy_current h using(policy_id,version) where p.policy_id='employer-screening';
 if v.policy_id is null then raise exception 'Policy unavailable' using errcode='42501';end if;
 if op in ('policy_accept','policy_revoke') then
 if not security.auth_allowed('employer',i,a,'manage') then raise exception 'Authorized Employer administrator required' using errcode='42501';end if;
 c:=coalesce((p_input->>'correlationId')::uuid,gen_random_uuid());
 select * into r from security.wf_screening_policy_acceptances where employer_id=i and policy_id=v.policy_id order by sequence desc limit 1;
 if op='policy_accept' then
 if p_input->'affirmative' is distinct from 'true'::jsonb or p_input->>'policyId' is distinct from v.policy_id or (p_input->>'version')::integer is distinct from v.version or p_input->>'hash' is distinct from v.content_hash then raise exception 'Review and affirm the current policy';end if;
 if security.screening_policy_state(i)<>'accepted' then
 insert into security.wf_screening_policy_acceptances(employer_id,actor_user_id,policy_id,policy_version,content_hash,correlation_id) values(i,a,v.policy_id,v.version,v.content_hash,c) returning * into r;
 insert into public.wf_reward_audit(actor,owner_type,owner_id,event,target,payload) values(a,'employer',i,'EMPLOYER_SCREENING_POLICY_ACCEPTED',r.id::text,jsonb_build_object('actor_user_id',a,'employer_id',i,'policy_id',v.policy_id,'policy_version',v.version,'accepted_at',r.accepted_at,'scope',r.scope,'result','success','correlation_id',c));
 end if;
 else
 if r.id is null or p_input->>'acceptanceId' is distinct from r.id::text then raise exception 'Refresh the latest policy acceptance';end if;
 insert into security.wf_screening_policy_revocations(acceptance_id,actor_user_id,correlation_id) values(r.id,a,c) on conflict do nothing;
 if found then insert into public.wf_reward_audit(actor,owner_type,owner_id,event,target,payload) values(a,'employer',i,'EMPLOYER_SCREENING_POLICY_REVOKED',r.id::text,jsonb_build_object('actor_user_id',a,'employer_id',i,'policy_id',r.policy_id,'policy_version',r.policy_version,'scope',r.scope,'result','success','correlation_id',c));end if;
 end if;
 elsif op<>'policy' then raise exception 'Unsupported policy operation';end if;
 return jsonb_build_object('state',security.screening_policy_state(i),'canAccept',security.auth_allowed('employer',i,a,'manage'),'policyId',v.policy_id,'version',v.version,'hash',v.content_hash,'title',v.title,'body',v.body,
 'history',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'version',x.policy_version,'hash',x.content_hash,'actor',x.actor_user_id,'acceptedAt',x.accepted_at,'revokedAt',z.revoked_at,'body',p.body) order by x.sequence desc) from security.wf_screening_policy_acceptances x join security.wf_screening_policy_versions p on p.policy_id=x.policy_id and p.version=x.policy_version left join security.wf_screening_policy_revocations z on z.acceptance_id=x.id where x.employer_id=i),'[]'::jsonb));
end $$;
-- Preserve all existing AuthCard checks while making every protected service call enforce the policy.
alter function public.auth_screening_service(jsonb) rename to auth_screening_service_authcard;
revoke all on function public.auth_screening_service_authcard(jsonb) from public,anon,authenticated,service_role;
create function public.auth_screening_service(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t text:=p_input->>'ownerType';i text:=p_input->>'ownerId';op text:=p_input->>'op';o security.wf_auth_orders%rowtype;begin
 if op in ('quote','checkout','claim','approve') then
 if op<>'quote' then select * into o from security.wf_auth_orders where id=(p_input->>'orderId')::uuid;t:=o.owner_type;i:=o.owner_id;end if;
 if t='employer' then
 perform pg_advisory_xact_lock(hashtextextended('screening-policy:'||i,0));
 perform 1 from security.wf_screening_policy_current where policy_id='employer-screening' for share;
 if security.screening_policy_state(i)<>'accepted' then raise exception 'Current Employer screening policy acceptance required' using errcode='42501';end if;
 end if;
 end if;
 return public.auth_screening_service_authcard(p_input);
end $$;
revoke all on function security.screening_policy_hash(),security.screening_policy_immutable(),security.screening_policy_state(text),public.screening_policy(jsonb),public.auth_screening_service(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.screening_policy(jsonb) to authenticated;
grant execute on function public.auth_screening_service(jsonb) to service_role;
