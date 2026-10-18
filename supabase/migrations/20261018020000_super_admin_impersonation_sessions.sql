-- SEC-IMP-01: revocable, actor-bound registry for future full-session impersonation.
-- This migration does NOT mint target-user credentials or grant any target-user access.
-- Strictly service-role access; no client CRUD, RPC, GRANT or RLS exception.
create table if not exists public.wf_super_admin_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique
    check (token_hash ~ '^[a-f0-9]{64}$'),
  actor_auth_user_id uuid not null,
  actor_auth_session_id uuid not null,
  target_auth_user_id uuid not null,
  target_membership_key text not null
    check (char_length(target_membership_key) between 1 and 200),
  state text not null default 'active' check (state in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint impersonation_not_self check (actor_auth_user_id <> target_auth_user_id),
  constraint impersonation_expiry_15_min
    check (expires_at > created_at and expires_at <= created_at + interval '15 minutes'),
  constraint impersonation_revocation_consistent
    check ((state = 'active' and revoked_at is null) or
           (state = 'revoked' and revoked_at is not null))
);
create index if not exists wf_super_admin_impersonation_actor
  on public.wf_super_admin_impersonation_sessions(actor_auth_user_id,actor_auth_session_id,created_at desc);
create index if not exists wf_super_admin_impersonation_expiration
  on public.wf_super_admin_impersonation_sessions(expires_at) where state='active';

alter table public.wf_super_admin_impersonation_sessions enable row level security;
revoke all on public.wf_super_admin_impersonation_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.wf_super_admin_impersonation_sessions to service_role;
comment on table public.wf_super_admin_impersonation_sessions is
  'Administrative impersonation registry only. No target user access is conferred by an entry. SEC-IMP-02 actor-aware Supabase/RLS bridge required before activation.';
