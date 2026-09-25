-- Wave 11 / W11-01: canonical Employer Learning schema.
-- Direct client access is intentionally withheld until W11-02 role/scope rules.

create table if not exists public.wf_company_badges (
  id uuid primary key default gen_random_uuid(),
  company_badge_id text not null unique default security.new_legacy_id('CBG'),
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  description text,
  criteria jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  expires_after_days integer check (expires_after_days is null or expires_after_days > 0),
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employer_id, title, version)
);

create table if not exists public.wf_employer_micro_certs (
  id uuid primary key default gen_random_uuid(),
  micro_cert_id text not null unique default security.new_legacy_id('EMC'),
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  description text,
  active boolean not null default true,
  current_version_id text,
  created_by_user_id text references public.users(user_id) on delete set null,
  updated_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(micro_cert_id, employer_id)
);

create table if not exists public.wf_employer_micro_cert_versions (
  id uuid primary key default gen_random_uuid(),
  micro_cert_version_id text not null unique default security.new_legacy_id('MCV'),
  micro_cert_id text not null references public.wf_employer_micro_certs(micro_cert_id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft'
    check (status in ('draft','in_production','review','ready','live','archived')),
  learning_objective text,
  content_type text not null default 'video' check (btrim(content_type) <> ''),
  content_url text,
  equipment_process_context text,
  safety_notes text,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  passing_requirement jsonb not null default '{}'::jsonb,
  company_badge_id text references public.wf_company_badges(company_badge_id) on delete set null,
  published_at timestamptz,
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(micro_cert_id, version_number),
  unique(micro_cert_id, micro_cert_version_id)
);

alter table public.wf_employer_micro_certs
  drop constraint if exists wf_employer_micro_certs_current_version_fkey;

alter table public.wf_employer_micro_certs
  add constraint wf_employer_micro_certs_current_version_fkey
  foreign key (micro_cert_id, current_version_id)
  references public.wf_employer_micro_cert_versions(micro_cert_id, micro_cert_version_id)
  on delete set null;

create table if not exists public.wf_employer_micro_cert_checkpoints (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id text not null unique default security.new_legacy_id('MCP'),
  micro_cert_version_id text not null references public.wf_employer_micro_cert_versions(micro_cert_version_id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  title text,
  prompt text not null check (btrim(prompt) <> ''),
  checkpoint_type text not null default 'acknowledgement' check (btrim(checkpoint_type) <> ''),
  config jsonb not null default '{}'::jsonb,
  required boolean not null default true,
  weight numeric not null default 1 check (weight >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(micro_cert_version_id, sequence_no),
  unique(micro_cert_version_id, checkpoint_id)
);

create table if not exists public.wf_employer_micro_cert_eligibility (
  id uuid primary key default gen_random_uuid(),
  eligibility_id text not null unique default security.new_legacy_id('MCE'),
  micro_cert_id text not null references public.wf_employer_micro_certs(micro_cert_id) on delete cascade,
  institution_id text references public.wf_institutions(institution_id) on delete cascade,
  cohort_id text references public.wf_cohorts(cohort_id) on delete cascade,
  trade_id text,
  program_name text,
  active boolean not null default true,
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wf_micro_cert_eligibility_semantic_key
  on public.wf_employer_micro_cert_eligibility(
    micro_cert_id,
    coalesce(institution_id,''),
    coalesce(cohort_id,''),
    coalesce(trade_id,''),
    coalesce(program_name,'')
  );

create table if not exists public.wf_micro_cert_assignments (
  id uuid primary key default gen_random_uuid(),
  assignment_id text not null unique default security.new_legacy_id('MCA'),
  micro_cert_id text not null,
  micro_cert_version_id text not null,
  student_id text not null references public.wf_student_profiles(student_id) on delete cascade,
  institution_id text references public.wf_institutions(institution_id) on delete set null,
  cohort_id text references public.wf_cohorts(cohort_id) on delete set null,
  assigned_by_user_id text references public.users(user_id) on delete set null,
  status text not null default 'assigned'
    check (status in ('assigned','in_progress','completed','cancelled')),
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (micro_cert_id, micro_cert_version_id)
    references public.wf_employer_micro_cert_versions(micro_cert_id, micro_cert_version_id)
    on delete cascade,
  unique(micro_cert_version_id, assignment_id)
);

create unique index if not exists wf_micro_cert_assignment_active_unique
  on public.wf_micro_cert_assignments(micro_cert_version_id, student_id)
  where status in ('assigned','in_progress','completed');

create table if not exists public.wf_micro_cert_checkpoint_responses (
  id uuid primary key default gen_random_uuid(),
  checkpoint_response_id text not null unique default security.new_legacy_id('MCR'),
  assignment_id text not null,
  micro_cert_version_id text not null,
  checkpoint_id text not null,
  attempt_number integer not null default 1 check (attempt_number > 0),
  response_json jsonb not null default '{}'::jsonb,
  is_correct boolean,
  score numeric,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (micro_cert_version_id, assignment_id)
    references public.wf_micro_cert_assignments(micro_cert_version_id, assignment_id)
    on delete cascade,
  foreign key (micro_cert_version_id, checkpoint_id)
    references public.wf_employer_micro_cert_checkpoints(micro_cert_version_id, checkpoint_id)
    on delete cascade,
  unique(assignment_id, checkpoint_id, attempt_number)
);

create table if not exists public.wf_micro_cert_completions (
  id uuid primary key default gen_random_uuid(),
  completion_id text not null unique default security.new_legacy_id('MCC'),
  assignment_id text not null references public.wf_micro_cert_assignments(assignment_id) on delete cascade,
  attempt_number integer not null default 1 check (attempt_number > 0),
  outcome text not null check (outcome in ('passed','not_passed','voided')),
  score numeric,
  evidence jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(assignment_id, attempt_number)
);

create unique index if not exists wf_micro_cert_completion_passed_unique
  on public.wf_micro_cert_completions(assignment_id)
  where outcome='passed';

create table if not exists public.wf_company_badge_awards (
  id uuid primary key default gen_random_uuid(),
  company_badge_award_id text not null unique default security.new_legacy_id('CBA'),
  company_badge_id text not null references public.wf_company_badges(company_badge_id) on delete cascade,
  student_id text not null references public.wf_student_profiles(student_id) on delete cascade,
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  evidence_type text not null default 'micro_cert_completion' check (btrim(evidence_type) <> ''),
  evidence_id text not null check (btrim(evidence_id) <> ''),
  completion_id text references public.wf_micro_cert_completions(completion_id) on delete set null,
  micro_cert_id text references public.wf_employer_micro_certs(micro_cert_id) on delete set null,
  micro_cert_version_id text references public.wf_employer_micro_cert_versions(micro_cert_version_id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(company_badge_id, student_id, evidence_type, evidence_id)
);

create table if not exists public.wf_employer_exposure_events (
  id uuid primary key default gen_random_uuid(),
  exposure_event_id text not null unique default security.new_legacy_id('EEX'),
  event_key text not null unique,
  student_id text not null references public.wf_student_profiles(student_id) on delete cascade,
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  institution_id text references public.wf_institutions(institution_id) on delete set null,
  event_type text not null check (btrim(event_type) <> ''),
  source_type text not null check (btrim(source_type) <> ''),
  source_id text,
  micro_cert_id text references public.wf_employer_micro_certs(micro_cert_id) on delete set null,
  assignment_id text references public.wf_micro_cert_assignments(assignment_id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.wf_employer_training_production_requests (
  id uuid primary key default gen_random_uuid(),
  production_request_id text not null unique default security.new_legacy_id('PRQ'),
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  institution_id text references public.wf_institutions(institution_id) on delete set null,
  cohort_id text references public.wf_cohorts(cohort_id) on delete set null,
  trade_id text,
  program_name text,
  requested_by_user_id text references public.users(user_id) on delete set null,
  field_gap text not null check (btrim(field_gap) <> ''),
  equipment_process text,
  desired_outcome text,
  status text not null default 'requested'
    check (status in (
      'requested','discovery','filming_scheduled','editing',
      'employer_review','institution_preview','ready'
    )),
  target_launch_date date,
  resulting_micro_cert_id text references public.wf_employer_micro_certs(micro_cert_id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wf_company_badges_employer_active_idx
  on public.wf_company_badges(employer_id, active, updated_at desc);
create index if not exists wf_company_badges_created_by_idx
  on public.wf_company_badges(created_by_user_id) where created_by_user_id is not null;

create index if not exists wf_micro_certs_employer_active_idx
  on public.wf_employer_micro_certs(employer_id, active, updated_at desc);
create index if not exists wf_micro_certs_created_by_idx
  on public.wf_employer_micro_certs(created_by_user_id) where created_by_user_id is not null;
create index if not exists wf_micro_certs_updated_by_idx
  on public.wf_employer_micro_certs(updated_by_user_id) where updated_by_user_id is not null;
create index if not exists wf_micro_certs_current_version_idx
  on public.wf_employer_micro_certs(current_version_id) where current_version_id is not null;

create index if not exists wf_micro_cert_versions_cert_status_idx
  on public.wf_employer_micro_cert_versions(micro_cert_id, status, version_number desc);
create index if not exists wf_micro_cert_versions_badge_idx
  on public.wf_employer_micro_cert_versions(company_badge_id) where company_badge_id is not null;
create index if not exists wf_micro_cert_versions_created_by_idx
  on public.wf_employer_micro_cert_versions(created_by_user_id) where created_by_user_id is not null;

create index if not exists wf_micro_cert_checkpoints_version_idx
  on public.wf_employer_micro_cert_checkpoints(micro_cert_version_id, sequence_no);

create index if not exists wf_micro_cert_eligibility_cert_idx
  on public.wf_employer_micro_cert_eligibility(micro_cert_id, active);
create index if not exists wf_micro_cert_eligibility_institution_idx
  on public.wf_employer_micro_cert_eligibility(institution_id) where institution_id is not null;
create index if not exists wf_micro_cert_eligibility_cohort_idx
  on public.wf_employer_micro_cert_eligibility(cohort_id) where cohort_id is not null;
create index if not exists wf_micro_cert_eligibility_created_by_idx
  on public.wf_employer_micro_cert_eligibility(created_by_user_id) where created_by_user_id is not null;

create index if not exists wf_micro_cert_assignments_student_status_idx
  on public.wf_micro_cert_assignments(student_id, status, assigned_at desc);
create index if not exists wf_micro_cert_assignments_cert_status_idx
  on public.wf_micro_cert_assignments(micro_cert_id, status, assigned_at desc);
create index if not exists wf_micro_cert_assignments_version_idx
  on public.wf_micro_cert_assignments(micro_cert_version_id, assigned_at desc);
create index if not exists wf_micro_cert_assignments_institution_idx
  on public.wf_micro_cert_assignments(institution_id, status, assigned_at desc) where institution_id is not null;
create index if not exists wf_micro_cert_assignments_cohort_idx
  on public.wf_micro_cert_assignments(cohort_id, status, assigned_at desc) where cohort_id is not null;
create index if not exists wf_micro_cert_assignments_assigned_by_idx
  on public.wf_micro_cert_assignments(assigned_by_user_id) where assigned_by_user_id is not null;

create index if not exists wf_micro_cert_checkpoint_responses_assignment_idx
  on public.wf_micro_cert_checkpoint_responses(assignment_id, checkpoint_id, submitted_at desc);
create index if not exists wf_micro_cert_checkpoint_responses_version_idx
  on public.wf_micro_cert_checkpoint_responses(micro_cert_version_id);

create index if not exists wf_micro_cert_completions_assignment_idx
  on public.wf_micro_cert_completions(assignment_id, completed_at desc);

create index if not exists wf_company_badge_awards_badge_idx
  on public.wf_company_badge_awards(company_badge_id, issued_at desc);
create index if not exists wf_company_badge_awards_student_idx
  on public.wf_company_badge_awards(student_id, issued_at desc);
create index if not exists wf_company_badge_awards_employer_idx
  on public.wf_company_badge_awards(employer_id, issued_at desc);
create index if not exists wf_company_badge_awards_completion_idx
  on public.wf_company_badge_awards(completion_id) where completion_id is not null;
create index if not exists wf_company_badge_awards_cert_idx
  on public.wf_company_badge_awards(micro_cert_id, issued_at desc) where micro_cert_id is not null;
create index if not exists wf_company_badge_awards_version_idx
  on public.wf_company_badge_awards(micro_cert_version_id) where micro_cert_version_id is not null;

create index if not exists wf_employer_exposure_employer_idx
  on public.wf_employer_exposure_events(employer_id, occurred_at desc);
create index if not exists wf_employer_exposure_student_idx
  on public.wf_employer_exposure_events(student_id, occurred_at desc);
create index if not exists wf_employer_exposure_institution_idx
  on public.wf_employer_exposure_events(institution_id, occurred_at desc) where institution_id is not null;
create index if not exists wf_employer_exposure_cert_idx
  on public.wf_employer_exposure_events(micro_cert_id, occurred_at desc) where micro_cert_id is not null;
create index if not exists wf_employer_exposure_assignment_idx
  on public.wf_employer_exposure_events(assignment_id, occurred_at desc) where assignment_id is not null;

create index if not exists wf_training_production_requests_employer_idx
  on public.wf_employer_training_production_requests(employer_id, status, created_at desc);
create index if not exists wf_training_production_requests_institution_idx
  on public.wf_employer_training_production_requests(institution_id, status, created_at desc) where institution_id is not null;
create index if not exists wf_training_production_requests_cohort_idx
  on public.wf_employer_training_production_requests(cohort_id, status, created_at desc) where cohort_id is not null;
create index if not exists wf_training_production_requests_requested_by_idx
  on public.wf_employer_training_production_requests(requested_by_user_id) where requested_by_user_id is not null;
create index if not exists wf_training_production_requests_result_idx
  on public.wf_employer_training_production_requests(resulting_micro_cert_id) where resulting_micro_cert_id is not null;
create index if not exists wf_training_production_requests_status_launch_idx
  on public.wf_employer_training_production_requests(status, target_launch_date);

alter table public.wf_company_badges enable row level security;
alter table public.wf_employer_micro_certs enable row level security;
alter table public.wf_employer_micro_cert_versions enable row level security;
alter table public.wf_employer_micro_cert_checkpoints enable row level security;
alter table public.wf_employer_micro_cert_eligibility enable row level security;
alter table public.wf_micro_cert_assignments enable row level security;
alter table public.wf_micro_cert_checkpoint_responses enable row level security;
alter table public.wf_micro_cert_completions enable row level security;
alter table public.wf_company_badge_awards enable row level security;
alter table public.wf_employer_exposure_events enable row level security;
alter table public.wf_employer_training_production_requests enable row level security;

revoke all on table
  public.wf_company_badges,
  public.wf_employer_micro_certs,
  public.wf_employer_micro_cert_versions,
  public.wf_employer_micro_cert_checkpoints,
  public.wf_employer_micro_cert_eligibility,
  public.wf_micro_cert_assignments,
  public.wf_micro_cert_checkpoint_responses,
  public.wf_micro_cert_completions,
  public.wf_company_badge_awards,
  public.wf_employer_exposure_events,
  public.wf_employer_training_production_requests
from public, anon, authenticated;

grant all on table
  public.wf_company_badges,
  public.wf_employer_micro_certs,
  public.wf_employer_micro_cert_versions,
  public.wf_employer_micro_cert_checkpoints,
  public.wf_employer_micro_cert_eligibility,
  public.wf_micro_cert_assignments,
  public.wf_micro_cert_checkpoint_responses,
  public.wf_micro_cert_completions,
  public.wf_company_badge_awards,
  public.wf_employer_exposure_events,
  public.wf_employer_training_production_requests
to service_role;

comment on table public.wf_employer_micro_certs is
  'Canonical employer-specific micro-certification identity. Content is versioned separately.';
comment on table public.wf_employer_micro_cert_versions is
  'Versioned Employer Training content. Completion never implies Instructor Verified technical competency.';
comment on table public.wf_company_badge_awards is
  'Employer-issued readiness badge evidence. Distinct from TXKPRO System Badges and Instructor Verified Skills.';
comment on table public.wf_employer_exposure_events is
  'Observed Employer engagement events only; must not be interpreted as inferred employment intent.';
comment on table public.wf_employer_training_production_requests is
  'TXKPRO concierge production workflow. Commercial payment processing is intentionally outside this schema.';
