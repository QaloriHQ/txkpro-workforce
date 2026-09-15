create extension if not exists pgcrypto;

create or replace function public.txk_id(prefix text)
returns text
language sql
volatile
as $$
  select upper(prefix) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id text primary key default public.txk_id('PRF'),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  role text not null check (role in ('student','educator','employer','admin')),
  email text not null unique,
  phone text,
  first_name text not null,
  last_name text not null,
  status text not null default 'active' check (status in ('invited','active','disabled')),
  sms_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schools (
  id text primary key default public.txk_id('SCH'),
  name text not null,
  city text,
  state text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.programs (
  id text primary key default public.txk_id('PRG'),
  school_id text not null references public.schools(id) on delete cascade,
  name text not null,
  trade text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table public.student_profiles (
  id text primary key default public.txk_id('STU'),
  profile_id text not null unique references public.profiles(id) on delete cascade,
  program_id text not null references public.programs(id),
  graduation_date date,
  city text,
  state text,
  status text not null default 'active' check (status in ('active','graduated','placed','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.educator_programs (
  id text primary key default public.txk_id('EDP'),
  educator_profile_id text not null references public.profiles(id) on delete cascade,
  program_id text not null references public.programs(id) on delete cascade,
  can_verify boolean not null default true,
  can_refer boolean not null default true,
  created_at timestamptz not null default now(),
  unique (educator_profile_id, program_id)
);

create table public.employer_profiles (
  id text primary key default public.txk_id('EMP'),
  primary_contact_profile_id text unique references public.profiles(id) on delete set null,
  business_name text not null,
  contact_phone text,
  city text,
  state text,
  service_trades text[] not null default '{}',
  approved boolean not null default false,
  sms_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skills (
  id text primary key default public.txk_id('SKL'),
  trade text not null,
  category text not null,
  name text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trade, name)
);

create table public.program_skills (
  id text primary key default public.txk_id('PSK'),
  program_id text not null references public.programs(id) on delete cascade,
  skill_id text not null references public.skills(id) on delete cascade,
  required boolean not null default false,
  sort_order integer not null default 0,
  unique (program_id, skill_id)
);

create table public.student_skills (
  id text primary key default public.txk_id('SSK'),
  student_id text not null references public.student_profiles(id) on delete cascade,
  skill_id text not null references public.skills(id) on delete cascade,
  status text not null default 'learning' check (status in ('not_started','learning','self_attested','verified')),
  self_attested_at timestamptz,
  verified_by_profile_id text references public.profiles(id) on delete set null,
  verified_at timestamptz,
  evidence_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, skill_id),
  check ((status = 'verified' and verified_by_profile_id is not null and verified_at is not null) or status <> 'verified')
);

create table public.job_readiness_profiles (
  id text primary key default public.txk_id('JRD'),
  student_id text not null unique references public.student_profiles(id) on delete cascade,
  valid_drivers_license boolean,
  clean_driving_record_attestation boolean,
  willing_background_check boolean,
  willing_drug_screen boolean,
  shift_preferences text[] not null default '{}',
  work_preferences text[] not null default '{}',
  discoverable boolean not null default false,
  attested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referrals (
  id text primary key default public.txk_id('REF'),
  student_id text not null references public.student_profiles(id) on delete cascade,
  employer_id text not null references public.employer_profiles(id) on delete cascade,
  referred_by_profile_id text not null references public.profiles(id),
  note text,
  status text not null default 'referred' check (status in ('referred','viewed','contacted','interviewing','hired','declined','closed')),
  referred_at timestamptz not null default now(),
  viewed_at timestamptz,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.placements (
  id text primary key default public.txk_id('PLC'),
  student_id text not null references public.student_profiles(id),
  employer_id text not null references public.employer_profiles(id),
  referral_id text references public.referrals(id) on delete set null,
  job_title text,
  hired_at date not null,
  status text not null default 'active' check (status in ('active','completed_90','separated')),
  separation_date date,
  separation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.retention_pulses (
  id text primary key default public.txk_id('PLS'),
  placement_id text not null references public.placements(id) on delete cascade,
  milestone_day integer not null check (milestone_day in (30,60,90)),
  recipient_type text not null check (recipient_type in ('student','employer')),
  recipient_phone text not null,
  status text not null default 'queued' check (status in ('queued','sent','responded','failed','expired')),
  provider_message_id text,
  sent_at timestamptz,
  responded_at timestamptz,
  response_score integer check (response_score between 1 and 3),
  response_text text,
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (placement_id, milestone_day, recipient_type)
);

create table public.retention_cases (
  id text primary key default public.txk_id('RTC'),
  placement_id text not null references public.placements(id) on delete cascade,
  milestone_day integer not null check (milestone_day in (30,60,90)),
  source_pulse_id text not null unique references public.retention_pulses(id) on delete cascade,
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  status text not null default 'open' check (status in ('open','contacted','resolved','closed')),
  summary text,
  owner_profile_id text references public.profiles(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id text primary key default public.txk_id('AUD'),
  actor_profile_id text references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  old_value_json jsonb,
  new_value_json jsonb,
  source_app text not null default 'workforce-web',
  created_at timestamptz not null default now()
);

create index idx_student_skills_student_status on public.student_skills(student_id, status);
create index idx_referrals_employer_status on public.referrals(employer_id, status);
create index idx_referrals_student on public.referrals(student_id);
create index idx_placements_status_hired on public.placements(status, hired_at);
create index idx_retention_pulses_phone_status on public.retention_pulses(recipient_phone, status, sent_at desc);
create index idx_audit_entity on public.audit_log(entity_type, entity_id, created_at desc);

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger schools_updated_at before update on public.schools for each row execute function public.set_updated_at();
create trigger programs_updated_at before update on public.programs for each row execute function public.set_updated_at();
create trigger student_profiles_updated_at before update on public.student_profiles for each row execute function public.set_updated_at();
create trigger employer_profiles_updated_at before update on public.employer_profiles for each row execute function public.set_updated_at();
create trigger skills_updated_at before update on public.skills for each row execute function public.set_updated_at();
create trigger student_skills_updated_at before update on public.student_skills for each row execute function public.set_updated_at();
create trigger job_readiness_updated_at before update on public.job_readiness_profiles for each row execute function public.set_updated_at();
create trigger referrals_updated_at before update on public.referrals for each row execute function public.set_updated_at();
create trigger placements_updated_at before update on public.placements for each row execute function public.set_updated_at();
create trigger retention_pulses_updated_at before update on public.retention_pulses for each row execute function public.set_updated_at();
create trigger retention_cases_updated_at before update on public.retention_cases for each row execute function public.set_updated_at();

-- All application data is mediated through authenticated Next.js server routes.
-- The service-role key stays server-only and bypasses RLS after explicit role/ownership checks.
alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.programs enable row level security;
alter table public.student_profiles enable row level security;
alter table public.educator_programs enable row level security;
alter table public.employer_profiles enable row level security;
alter table public.skills enable row level security;
alter table public.program_skills enable row level security;
alter table public.student_skills enable row level security;
alter table public.job_readiness_profiles enable row level security;
alter table public.referrals enable row level security;
alter table public.placements enable row level security;
alter table public.retention_pulses enable row level security;
alter table public.retention_cases enable row level security;
alter table public.audit_log enable row level security;
