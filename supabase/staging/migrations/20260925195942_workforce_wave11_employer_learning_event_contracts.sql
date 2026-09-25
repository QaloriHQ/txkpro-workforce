-- W11-03: Canonical Employer Learning event contracts.
-- Extends the shared workforce event subsystem without duplicating canonical state.

create table if not exists public.wf_employer_learning_event_contracts (
  event_type text primary key
    check (event_type ~ '^[A-Z0-9_]+$'),
  contract_version integer not null default 1
    check (contract_version > 0),
  source_basis text not null
    check (source_basis in ('source-derived','approved-product-expansion')),
  target_type text not null check (btrim(target_type) <> ''),
  allowed_sources text[] not null default '{}'::text[],
  requires_employer_id boolean not null default false,
  requires_institution_id boolean not null default false,
  requires_student_id boolean not null default false,
  requires_before_after boolean not null default false,
  required_metadata_keys text[] not null default '{}'::text[],
  cross_app_consequences jsonb not null default '[]'::jsonb,
  description text not null check (btrim(description) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wf_employer_learning_event_contracts enable row level security;

revoke all on table public.wf_employer_learning_event_contracts
from public, anon, authenticated;

grant all on table public.wf_employer_learning_event_contracts
to service_role;

insert into public.wf_employer_learning_event_contracts(
  event_type,contract_version,source_basis,target_type,allowed_sources,
  requires_employer_id,requires_institution_id,requires_student_id,
  requires_before_after,required_metadata_keys,cross_app_consequences,description,active
) values
(
  'MICRO_CERT_ASSIGNED',1,'source-derived','micro_cert_assignment',
  array['institution','txkpro','system'],
  true,true,true,false,
  array['assignment_id','micro_cert_id','micro_cert_version_id','cohort_id'],
  '["Student Employer Training","Institution Readiness Queue","Employer Module Analytics","Audit"]'::jsonb,
  'A versioned Employer Micro-Certification is assigned to a scoped Student.',
  true
),
(
  'MICRO_CERT_COMPLETED',1,'source-derived','micro_cert_completion',
  array['student','system','txkpro'],
  true,true,true,false,
  array['completion_id','assignment_id','micro_cert_id','micro_cert_version_id','outcome'],
  '["Student Employer Training","Company Badge evaluation","Institution Employer Learning analytics","Employer Module Analytics","Audit"]'::jsonb,
  'A Student reaches a canonical Micro-Certification completion outcome.',
  true
),
(
  'COMPANY_BADGE_AWARDED',1,'source-derived','company_badge_award',
  array['system','txkpro','employer'],
  true,false,true,false,
  array['company_badge_award_id','company_badge_id','evidence_type','evidence_id'],
  '["Student Profile","Institution Workforce Readiness","Employer Detail","Referral Evidence","Reports","Audit"]'::jsonb,
  'An employer-specific Company Badge is awarded from explicit evidence.',
  true
),
(
  'PRODUCTION_REQUEST_CREATED',1,'source-derived','employer_training_production_request',
  array['institution','employer','txkpro'],
  true,false,false,false,
  array['production_request_id','status'],
  '["Pilot Center","TXKPRO Production Queue","Action Center","Audit"]'::jsonb,
  'A Concierge Employer Training production request is created.',
  true
),
(
  'PRODUCTION_STATUS_CHANGED',1,'source-derived','employer_training_production_request',
  array['institution','employer','txkpro','system'],
  true,false,false,true,
  array['production_request_id','from_status','to_status'],
  '["Pilot Center","Employer Micro-Certification Library","Action Center","Audit"]'::jsonb,
  'The canonical Concierge Employer Training production status changes.',
  true
),
(
  'EMPLOYER_PAGE_VIEWED',1,'source-derived','employer_exposure_event',
  array['student','system'],
  true,false,true,false,
  array['exposure_event_id','event_type','source_type'],
  '["Employer Exposure","Employer Engagement Analytics","Badge evaluation where configured","Audit"]'::jsonb,
  'A Student view of an Employer public/profile surface is recorded as observed engagement.',
  true
),
(
  'EMPLOYER_TRAINING_PREVIEWED',1,'approved-product-expansion','employer_exposure_event',
  array['student','system'],
  true,false,true,false,
  array['exposure_event_id','micro_cert_id','event_type','source_type'],
  '["Employer Exposure","Employer Learning Analytics","Audit"]'::jsonb,
  'A Student previews published Employer Training; this is observed engagement, not inferred intent.',
  true
),
(
  'EMPLOYER_TRAINING_STARTED',1,'approved-product-expansion','employer_exposure_event',
  array['student','system'],
  true,true,true,false,
  array['exposure_event_id','assignment_id','micro_cert_id','event_type','source_type'],
  '["Student Employer Training","Institution Employer Learning Analytics","Employer Module Analytics","Employer Exposure","Audit"]'::jsonb,
  'A Student begins an assigned Employer Training course.',
  true
),
(
  'COMPANY_BADGE_REVOKED',1,'approved-product-expansion','company_badge_award',
  array['employer','txkpro'],
  true,false,true,true,
  array['company_badge_award_id','company_badge_id','revoke_reason'],
  '["Student Profile","Institution Workforce Readiness","Employer Detail","Referral Evidence refresh","Reports","Audit"]'::jsonb,
  'A previously issued Company Badge is revoked without deleting its evidence history.',
  true
),
(
  'EMPLOYER_CERTIFICATION_AWARDED',1,'approved-product-expansion','employer_certification_award',
  array['system','employer','txkpro'],
  true,false,true,false,
  array['certification_award_id','credential_id','certification_definition_id','completion_id','micro_cert_id','micro_cert_version_id'],
  '["Student Profile","Credential Verification","Referral Evidence","Employer Certification Analytics","Audit"]'::jsonb,
  'A formal Employer Certification credential is issued from canonical passing evidence.',
  true
),
(
  'EMPLOYER_CERTIFICATION_REVOKED',1,'approved-product-expansion','employer_certification_award',
  array['employer','txkpro'],
  true,false,true,true,
  array['certification_award_id','credential_id','revoke_reason'],
  '["Student Profile","Credential Verification","Referral Evidence refresh","Employer Certification Analytics","Audit"]'::jsonb,
  'A formal Employer Certification credential is revoked without deleting its provenance.',
  true
),
(
  'EMPLOYER_LEARNING_PUBLICATION_CHANGED',1,'approved-product-expansion','public_page',
  array['employer','txkpro','system'],
  true,false,false,true,
  array['public_page_id','entity_type','entity_id','from_status','to_status','canonical_path'],
  '["Public Employer Learning page","SEO sitemap/index controls","Slug/canonical routing","Audit"]'::jsonb,
  'Publication state changes for an Employer, Course, Lesson, or Credential public page.',
  true
)
on conflict (event_type) do update set
  contract_version=excluded.contract_version,
  source_basis=excluded.source_basis,
  target_type=excluded.target_type,
  allowed_sources=excluded.allowed_sources,
  requires_employer_id=excluded.requires_employer_id,
  requires_institution_id=excluded.requires_institution_id,
  requires_student_id=excluded.requires_student_id,
  requires_before_after=excluded.requires_before_after,
  required_metadata_keys=excluded.required_metadata_keys,
  cross_app_consequences=excluded.cross_app_consequences,
  description=excluded.description,
  active=excluded.active,
  updated_at=now();

create or replace function security.emit_employer_learning_event(
  p_event_type text,
  p_target_id text,
  p_event_key text,
  p_source text,
  p_employer_id text default null,
  p_institution_id text default null,
  p_student_id text default null,
  p_actor_type text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_result text default 'success',
  p_correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_contract public.wf_employer_learning_event_contracts%rowtype;
  v_event_type text:=upper(btrim(coalesce(p_event_type,'')));
  v_event_key text:=btrim(coalesce(p_event_key,''));
  v_source text:=lower(btrim(coalesce(p_source,'')));
  v_actor_type text:=coalesce(
    nullif(lower(btrim(coalesce(p_actor_type,''))),''),
    case when (select auth.uid()) is null then 'system' else 'user' end
  );
  v_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb);
  v_required_key text;
  v_existing public.wf_domain_events%rowtype;
  v_event_id uuid;
begin
  if v_event_type='' then
    raise exception 'Employer Learning event_type is required';
  end if;
  if nullif(btrim(coalesce(p_target_id,'')),'') is null then
    raise exception 'Employer Learning target_id is required';
  end if;
  if v_event_key='' then
    raise exception 'Employer Learning event_key is required for idempotency';
  end if;
  if v_source='' then
    raise exception 'Employer Learning source is required';
  end if;
  if v_actor_type not in ('user','system') then
    raise exception 'Employer Learning actor_type must be user or system';
  end if;
  if v_actor_type='user' and (select auth.uid()) is null then
    raise exception 'Employer Learning user actor requires authenticated auth.uid()';
  end if;

  select *
  into v_contract
  from public.wf_employer_learning_event_contracts c
  where c.event_type=v_event_type
    and c.active=true;

  if not found then
    raise exception 'Unknown or inactive Employer Learning event contract: %',v_event_type;
  end if;

  if not (v_source=any(v_contract.allowed_sources)) then
    raise exception 'Source % is not allowed for Employer Learning event %',v_source,v_event_type;
  end if;

  if v_contract.requires_employer_id and nullif(btrim(coalesce(p_employer_id,'')),'') is null then
    raise exception 'Employer Learning event % requires employer_id',v_event_type;
  end if;
  if v_contract.requires_institution_id and nullif(btrim(coalesce(p_institution_id,'')),'') is null then
    raise exception 'Employer Learning event % requires institution_id',v_event_type;
  end if;
  if v_contract.requires_student_id and nullif(btrim(coalesce(p_student_id,'')),'') is null then
    raise exception 'Employer Learning event % requires student_id',v_event_type;
  end if;
  if v_contract.requires_before_after and (p_before is null or p_after is null) then
    raise exception 'Employer Learning event % requires before and after snapshots',v_event_type;
  end if;

  foreach v_required_key in array v_contract.required_metadata_keys loop
    if not (v_metadata ? v_required_key)
       or v_metadata->v_required_key is null
       or v_metadata->v_required_key='null'::jsonb then
      raise exception 'Employer Learning event % missing metadata key %',v_event_type,v_required_key;
    end if;
  end loop;

  select *
  into v_existing
  from public.wf_domain_events e
  where e.event_key=v_event_key;

  if found then
    if v_existing.event_type<>v_event_type
       or v_existing.target_type<>v_contract.target_type
       or v_existing.target_id is distinct from p_target_id
       or v_existing.employer_id is distinct from p_employer_id
       or v_existing.institution_id is distinct from p_institution_id
       or v_existing.student_id is distinct from p_student_id then
      raise exception 'Employer Learning event_key collision for %',v_event_key;
    end if;
    return v_existing.event_id;
  end if;

  v_metadata :=
    v_metadata ||
    jsonb_build_object(
      'event_contract_version',v_contract.contract_version,
      'event_source',v_source,
      'actor_type',v_actor_type,
      'source_basis',v_contract.source_basis
    );

  begin
    v_event_id:=security.emit_workforce_event(
      p_event_type=>v_event_type,
      p_target_type=>v_contract.target_type,
      p_target_id=>p_target_id,
      p_employer_id=>p_employer_id,
      p_institution_id=>p_institution_id,
      p_student_id=>p_student_id,
      p_before=>p_before,
      p_after=>p_after,
      p_metadata=>v_metadata,
      p_result=>p_result,
      p_event_key=>v_event_key,
      p_correlation_id=>p_correlation_id
    );
    return v_event_id;
  exception
    when unique_violation then
      select *
      into v_existing
      from public.wf_domain_events e
      where e.event_key=v_event_key;

      if found
         and v_existing.event_type=v_event_type
         and v_existing.target_type=v_contract.target_type
         and v_existing.target_id is not distinct from p_target_id
         and v_existing.employer_id is not distinct from p_employer_id
         and v_existing.institution_id is not distinct from p_institution_id
         and v_existing.student_id is not distinct from p_student_id then
        return v_existing.event_id;
      end if;

      raise;
  end;
end;
$$;

comment on table public.wf_employer_learning_event_contracts is
  'Canonical Employer Learning cross-app event contracts. Contracts describe event scope and consequences; canonical domain state remains in its owning tables.';
comment on function security.emit_employer_learning_event(text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,uuid) is
  'Replay-safe service-only Employer Learning event emitter. Validates event contract, source, scope IDs, required metadata, snapshots, and deterministic event_key before writing shared domain/audit events.';

revoke all on function security.emit_employer_learning_event(
  text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,uuid
) from public,anon,authenticated;

grant execute on function security.emit_employer_learning_event(
  text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,uuid
) to service_role;
