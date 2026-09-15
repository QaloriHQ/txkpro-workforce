-- Incremental migration for the existing TXKPRO production schema.
-- The base TXKPRO workforce tables predate this Next.js repository.

create table if not exists public.wf_onboarding_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  user_id text not null references public.users(user_id) on delete cascade,
  selected_role text check (selected_role in ('student','educator','employer','admin')),
  status text not null default 'not_started' check (status in ('not_started','in_progress','pending_review','complete')),
  current_step integer not null default 1 check (current_step between 1 and 6),
  profile_data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists wf_onboarding_accounts_status_idx
  on public.wf_onboarding_accounts(status, selected_role);

alter table public.wf_onboarding_accounts enable row level security;

drop policy if exists wf_onboarding_read_self_or_admin on public.wf_onboarding_accounts;
create policy wf_onboarding_read_self_or_admin
on public.wf_onboarding_accounts
for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or security.is_admin()
);

comment on table public.wf_onboarding_accounts is
  'Tracks TXKPRO Workforce onboarding progress. Role-specific records remain in the existing workforce tables.';
