
create table if not exists public.wf_pilot_requests (
  request_id uuid primary key default gen_random_uuid(),
  institution_name text not null,
  institution_type text not null,
  contact_name text not null,
  contact_title text,
  email text not null,
  phone text,
  contact_preference text not null default 'email',
  intent text not null default 'pilot',
  trade_program text,
  estimated_cohort_size integer,
  target_start_window text,
  message text,
  source_path text not null default '/institutions/request-pilot',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_pilot_requests_institution_type_check
    check (institution_type in (
      'technical_college',
      'community_college',
      'high_school_cte',
      'workforce_program',
      'other'
    )),
  constraint wf_pilot_requests_contact_preference_check
    check (contact_preference in ('email','phone','either')),
  constraint wf_pilot_requests_intent_check
    check (intent in ('pilot','meeting','both')),
  constraint wf_pilot_requests_status_check
    check (status in ('new','contacted','qualified','scheduled','closed')),
  constraint wf_pilot_requests_cohort_size_check
    check (estimated_cohort_size is null or estimated_cohort_size between 1 and 5000)
);

alter table public.wf_pilot_requests enable row level security;

revoke all on table public.wf_pilot_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.wf_pilot_requests to service_role;

create index if not exists wf_pilot_requests_created_at_idx
  on public.wf_pilot_requests(created_at desc);

create index if not exists wf_pilot_requests_email_created_at_idx
  on public.wf_pilot_requests(lower(email), created_at desc);

comment on table public.wf_pilot_requests is
  'Server-only institution pilot and meeting requests captured from the public TXKPRO Workforce conversion funnel. No direct anon/authenticated Data API access.';
