-- Wave 11 / W11-01 expansion: course authoring, lessons, assessments,
-- and formal employer-issued certifications.
-- Existing Micro-Certification remains the canonical course identity.
-- Direct client access remains withheld pending W11-02 authorization.

create table if not exists public.wf_employer_micro_cert_lessons (
  id uuid primary key default gen_random_uuid(),
  lesson_id text not null unique default security.new_legacy_id('MCL'),
  micro_cert_version_id text not null
    references public.wf_employer_micro_cert_versions(micro_cert_version_id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  title text not null check (btrim(title) <> ''),
  description text,
  learning_objective text,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
  required boolean not null default true,
  status text not null default 'draft'
    check (status in ('draft','ready','published','archived')),
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(micro_cert_version_id, sequence_no),
  unique(micro_cert_version_id, lesson_id)
);

create table if not exists public.wf_employer_micro_cert_lesson_blocks (
  id uuid primary key default gen_random_uuid(),
  lesson_block_id text not null unique default security.new_legacy_id('LCB'),
  lesson_id text not null
    references public.wf_employer_micro_cert_lessons(lesson_id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  block_type text not null
    check (block_type in ('text','video','image','document','link','embed','safety_note')),
  title text,
  content jsonb not null default '{}'::jsonb,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lesson_id, sequence_no)
);

create table if not exists public.wf_employer_micro_cert_assessments (
  id uuid primary key default gen_random_uuid(),
  assessment_id text not null unique default security.new_legacy_id('ASM'),
  micro_cert_version_id text not null
    references public.wf_employer_micro_cert_versions(micro_cert_version_id) on delete cascade,
  lesson_id text,
  sequence_no integer not null check (sequence_no > 0),
  title text not null check (btrim(title) <> ''),
  description text,
  assessment_type text not null default 'lesson_quiz'
    check (assessment_type in ('checkpoint','lesson_quiz','final_assessment')),
  passing_score numeric not null default 80
    check (passing_score >= 0 and passing_score <= 100),
  max_attempts integer check (max_attempts is null or max_attempts > 0),
  required boolean not null default true,
  randomize_questions boolean not null default false,
  show_feedback boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (micro_cert_version_id, lesson_id)
    references public.wf_employer_micro_cert_lessons(micro_cert_version_id, lesson_id)
    on delete cascade,
  unique(assessment_id, micro_cert_version_id)
);

create unique index if not exists wf_micro_cert_assessment_sequence_key
  on public.wf_employer_micro_cert_assessments(
    micro_cert_version_id,
    coalesce(lesson_id,''),
    sequence_no
  );

create table if not exists public.wf_employer_micro_cert_assessment_questions (
  id uuid primary key default gen_random_uuid(),
  question_id text not null unique default security.new_legacy_id('ASQ'),
  assessment_id text not null
    references public.wf_employer_micro_cert_assessments(assessment_id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  question_type text not null
    check (question_type in ('single_choice','multiple_choice','true_false','acknowledgement','numeric')),
  prompt text not null check (btrim(prompt) <> ''),
  options jsonb not null default '[]'::jsonb,
  answer_key jsonb not null default '{}'::jsonb,
  points numeric not null default 1 check (points >= 0),
  required boolean not null default true,
  feedback_correct text,
  feedback_incorrect text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assessment_id, sequence_no),
  unique(assessment_id, question_id)
);

create table if not exists public.wf_micro_cert_assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_attempt_id text not null unique default security.new_legacy_id('AAT'),
  assignment_id text not null
    references public.wf_micro_cert_assignments(assignment_id) on delete cascade,
  assessment_id text not null
    references public.wf_employer_micro_cert_assessments(assessment_id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status text not null default 'in_progress'
    check (status in ('in_progress','submitted','passed','not_passed','voided')),
  score numeric check (score is null or (score >= 0 and score <= 100)),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  grading_method text not null default 'automatic'
    check (grading_method in ('automatic','manual_review')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assignment_id, assessment_id, attempt_number),
  unique(assessment_id, assessment_attempt_id)
);

create table if not exists public.wf_micro_cert_assessment_responses (
  id uuid primary key default gen_random_uuid(),
  assessment_response_id text not null unique default security.new_legacy_id('ASR'),
  assessment_attempt_id text not null,
  assessment_id text not null,
  question_id text not null,
  response jsonb not null default '{}'::jsonb,
  is_correct boolean,
  score numeric check (score is null or score >= 0),
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (assessment_id, assessment_attempt_id)
    references public.wf_micro_cert_assessment_attempts(assessment_id, assessment_attempt_id)
    on delete cascade,
  foreign key (assessment_id, question_id)
    references public.wf_employer_micro_cert_assessment_questions(assessment_id, question_id)
    on delete cascade,
  unique(assessment_attempt_id, question_id)
);

create table if not exists public.wf_employer_certification_definitions (
  id uuid primary key default gen_random_uuid(),
  certification_definition_id text not null unique default security.new_legacy_id('CDF'),
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  micro_cert_id text not null references public.wf_employer_micro_certs(micro_cert_id) on delete cascade,
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

alter table public.wf_employer_micro_cert_versions
  add column if not exists certification_definition_id text;

alter table public.wf_employer_micro_cert_versions
  drop constraint if exists wf_employer_micro_cert_versions_certification_definition_fkey;

alter table public.wf_employer_micro_cert_versions
  add constraint wf_employer_micro_cert_versions_certification_definition_fkey
  foreign key (certification_definition_id)
  references public.wf_employer_certification_definitions(certification_definition_id)
  on delete set null;

create table if not exists public.wf_employer_certification_awards (
  id uuid primary key default gen_random_uuid(),
  certification_award_id text not null unique default security.new_legacy_id('CAW'),
  credential_id text not null unique default security.new_legacy_id('CERT'),
  certification_definition_id text not null
    references public.wf_employer_certification_definitions(certification_definition_id) on delete cascade,
  student_id text not null references public.wf_student_profiles(student_id) on delete cascade,
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  micro_cert_id text not null references public.wf_employer_micro_certs(micro_cert_id) on delete cascade,
  micro_cert_version_id text not null
    references public.wf_employer_micro_cert_versions(micro_cert_version_id) on delete cascade,
  assignment_id text not null references public.wf_micro_cert_assignments(assignment_id) on delete cascade,
  completion_id text not null references public.wf_micro_cert_completions(completion_id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  evidence jsonb not null default '{}'::jsonb,
  verification_metadata jsonb not null default '{}'::jsonb,
  artifact_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(certification_definition_id, student_id, completion_id)
);

create index if not exists wf_micro_cert_lessons_version_idx
  on public.wf_employer_micro_cert_lessons(micro_cert_version_id, sequence_no);
create index if not exists wf_micro_cert_lessons_created_by_idx
  on public.wf_employer_micro_cert_lessons(created_by_user_id)
  where created_by_user_id is not null;

create index if not exists wf_micro_cert_lesson_blocks_lesson_idx
  on public.wf_employer_micro_cert_lesson_blocks(lesson_id, sequence_no);

create index if not exists wf_micro_cert_assessments_version_idx
  on public.wf_employer_micro_cert_assessments(micro_cert_version_id, sequence_no);
create index if not exists wf_micro_cert_assessments_version_lesson_idx
  on public.wf_employer_micro_cert_assessments(micro_cert_version_id, lesson_id)
  where lesson_id is not null;
create index if not exists wf_micro_cert_assessments_created_by_idx
  on public.wf_employer_micro_cert_assessments(created_by_user_id)
  where created_by_user_id is not null;

create index if not exists wf_micro_cert_assessment_questions_assessment_idx
  on public.wf_employer_micro_cert_assessment_questions(assessment_id, sequence_no);

create index if not exists wf_micro_cert_assessment_attempts_assignment_idx
  on public.wf_micro_cert_assessment_attempts(assignment_id, assessment_id, attempt_number desc);
create index if not exists wf_micro_cert_assessment_attempts_assessment_idx
  on public.wf_micro_cert_assessment_attempts(assessment_id, assessment_attempt_id);

create index if not exists wf_micro_cert_assessment_responses_attempt_idx
  on public.wf_micro_cert_assessment_responses(assessment_id, assessment_attempt_id);
create index if not exists wf_micro_cert_assessment_responses_question_idx
  on public.wf_micro_cert_assessment_responses(assessment_id, question_id);

create index if not exists wf_employer_cert_def_employer_idx
  on public.wf_employer_certification_definitions(employer_id, active, updated_at desc);
create index if not exists wf_employer_cert_def_micro_cert_idx
  on public.wf_employer_certification_definitions(micro_cert_id, active);
create index if not exists wf_employer_cert_def_created_by_idx
  on public.wf_employer_certification_definitions(created_by_user_id)
  where created_by_user_id is not null;
create index if not exists wf_micro_cert_versions_certification_idx
  on public.wf_employer_micro_cert_versions(certification_definition_id)
  where certification_definition_id is not null;

create index if not exists wf_employer_cert_awards_definition_idx
  on public.wf_employer_certification_awards(certification_definition_id, issued_at desc);
create index if not exists wf_employer_cert_awards_student_idx
  on public.wf_employer_certification_awards(student_id, issued_at desc);
create index if not exists wf_employer_cert_awards_employer_idx
  on public.wf_employer_certification_awards(employer_id, issued_at desc);
create index if not exists wf_employer_cert_awards_micro_cert_idx
  on public.wf_employer_certification_awards(micro_cert_id, issued_at desc);
create index if not exists wf_employer_cert_awards_version_idx
  on public.wf_employer_certification_awards(micro_cert_version_id, issued_at desc);
create index if not exists wf_employer_cert_awards_assignment_idx
  on public.wf_employer_certification_awards(assignment_id);
create index if not exists wf_employer_cert_awards_completion_idx
  on public.wf_employer_certification_awards(completion_id);
create index if not exists wf_employer_cert_awards_status_expiry_idx
  on public.wf_employer_certification_awards(status, expires_at);

alter table public.wf_employer_micro_cert_lessons enable row level security;
alter table public.wf_employer_micro_cert_lesson_blocks enable row level security;
alter table public.wf_employer_micro_cert_assessments enable row level security;
alter table public.wf_employer_micro_cert_assessment_questions enable row level security;
alter table public.wf_micro_cert_assessment_attempts enable row level security;
alter table public.wf_micro_cert_assessment_responses enable row level security;
alter table public.wf_employer_certification_definitions enable row level security;
alter table public.wf_employer_certification_awards enable row level security;

revoke all on table
  public.wf_employer_micro_cert_lessons,
  public.wf_employer_micro_cert_lesson_blocks,
  public.wf_employer_micro_cert_assessments,
  public.wf_employer_micro_cert_assessment_questions,
  public.wf_micro_cert_assessment_attempts,
  public.wf_micro_cert_assessment_responses,
  public.wf_employer_certification_definitions,
  public.wf_employer_certification_awards
from public, anon, authenticated;

grant all on table
  public.wf_employer_micro_cert_lessons,
  public.wf_employer_micro_cert_lesson_blocks,
  public.wf_employer_micro_cert_assessments,
  public.wf_employer_micro_cert_assessment_questions,
  public.wf_micro_cert_assessment_attempts,
  public.wf_micro_cert_assessment_responses,
  public.wf_employer_certification_definitions,
  public.wf_employer_certification_awards
to service_role;

comment on table public.wf_employer_micro_cert_lessons is
  'Ordered lessons within a versioned Employer Micro-Certification course.';
comment on table public.wf_employer_micro_cert_lesson_blocks is
  'Ordered lesson content blocks. Course content remains employer-specific readiness content, not Instructor Verified competency.';
comment on table public.wf_employer_micro_cert_assessments is
  'Employer-authored deterministic assessments/checkpoints attached to a course version or lesson.';
comment on table public.wf_employer_micro_cert_assessment_questions is
  'Assessment questions and answer keys. Student delivery must never expose answer_key directly.';
comment on table public.wf_employer_certification_definitions is
  'Employer-issued formal certification definition tied to a Micro-Certification course.';
comment on table public.wf_employer_certification_awards is
  'Verifiable Employer certification credential issued from passing course evidence. Distinct from Company Badges and Instructor Verified Skills.';
