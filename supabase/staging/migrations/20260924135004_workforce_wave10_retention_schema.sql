-- Wave 10 core retention schema.
create table if not exists public.wf_sms_consents (
  id uuid primary key default gen_random_uuid(),
  consent_id text not null unique default security.new_legacy_id('SMC'),
  user_id text not null references public.users(user_id) on delete cascade,
  category text not null default 'retention' check (btrim(category) <> ''),
  status text not null default 'unknown'
    check (status in ('unknown','consented','opted_out','revoked')),
  phone_snapshot text,
  sms_consent_at timestamptz,
  consent_source text,
  opt_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, category)
);

create table if not exists public.wf_retention_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique default security.new_legacy_id('RMSG'),
  milestone_id text not null references public.wf_retention_milestones(milestone_id) on delete cascade,
  recipient_user_id text not null references public.users(user_id) on delete cascade,
  recipient_phone text,
  channel text not null default 'sms' check (channel in ('sms','in_app','email')),
  provider_message_id text unique,
  template_version text not null default 'retention_v1',
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued','sending','sent','delivered','failed','skipped')),
  error_code text,
  error_detail text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(milestone_id, channel)
);

create table if not exists public.wf_retention_responses (
  id uuid primary key default gen_random_uuid(),
  response_id text not null unique default security.new_legacy_id('RRSP'),
  milestone_id text not null references public.wf_retention_milestones(milestone_id) on delete cascade,
  message_id text not null unique references public.wf_retention_messages(message_id) on delete cascade,
  recipient_user_id text not null references public.users(user_id) on delete cascade,
  provider_message_id text not null unique,
  sender_phone text not null,
  raw_response text not null,
  normalized_score smallint not null check (normalized_score in (1,2,3)),
  normalized_state text not null
    check (normalized_state in ('going_well','some_friction','needs_help')),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.wf_retention_cases (
  id uuid primary key default gen_random_uuid(),
  case_id text not null unique default security.new_legacy_id('RCASE'),
  placement_id text not null references public.wf_placements(placement_id) on delete cascade,
  milestone_id text not null unique references public.wf_retention_milestones(milestone_id) on delete cascade,
  source_response_id text not null unique references public.wf_retention_responses(response_id) on delete cascade,
  severity text not null default 'high' check (severity in ('low','medium','high','urgent')),
  status text not null default 'open'
    check (status in ('open','assigned','contacted','monitoring','resolved','closed_no_response','cancelled')),
  owner_user_id text references public.users(user_id) on delete set null,
  summary text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wf_retention_case_notes (
  id uuid primary key default gen_random_uuid(),
  note_id text not null unique default security.new_legacy_id('RCN'),
  case_id text not null references public.wf_retention_cases(case_id) on delete cascade,
  author_user_id text not null references public.users(user_id),
  note text not null check (btrim(note) <> ''),
  created_at timestamptz not null default now()
);

create index if not exists wf_sms_consents_user_status_idx
  on public.wf_sms_consents(user_id,category,status);
create index if not exists wf_retention_messages_milestone_status_idx
  on public.wf_retention_messages(milestone_id,delivery_status,created_at desc);
create index if not exists wf_retention_messages_phone_open_idx
  on public.wf_retention_messages(recipient_phone,delivery_status,sent_at desc)
  where recipient_phone is not null;
create index if not exists wf_retention_responses_milestone_idx
  on public.wf_retention_responses(milestone_id,received_at desc);
create index if not exists wf_retention_cases_status_idx
  on public.wf_retention_cases(status,severity,opened_at desc);
create index if not exists wf_retention_cases_placement_idx
  on public.wf_retention_cases(placement_id,opened_at desc);
create index if not exists wf_retention_case_notes_case_idx
  on public.wf_retention_case_notes(case_id,created_at desc);

alter table public.wf_sms_consents enable row level security;
alter table public.wf_retention_messages enable row level security;
alter table public.wf_retention_responses enable row level security;
alter table public.wf_retention_cases enable row level security;
alter table public.wf_retention_case_notes enable row level security;

revoke all on table public.wf_sms_consents from anon, authenticated;
revoke all on table public.wf_retention_messages from anon, authenticated;
revoke all on table public.wf_retention_responses from anon, authenticated;
revoke all on table public.wf_retention_cases from anon, authenticated;
revoke all on table public.wf_retention_case_notes from anon, authenticated;
grant all on table public.wf_sms_consents to service_role;
grant all on table public.wf_retention_messages to service_role;
grant all on table public.wf_retention_responses to service_role;
grant all on table public.wf_retention_cases to service_role;
grant all on table public.wf_retention_case_notes to service_role;
