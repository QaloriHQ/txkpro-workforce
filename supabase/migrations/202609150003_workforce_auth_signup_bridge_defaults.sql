-- New Supabase Auth registrations are native application records rather than legacy sheet imports.
-- These defaults allow security.handle_auth_user_created() to create public.users rows without
-- requiring migration-only bridge values from the client.

alter table public.users
  alter column bridge_source_key set default ('supabase_auth:' || gen_random_uuid()::text);

alter table public.users
  alter column bridge_source_sheet set default 'supabase_auth';
