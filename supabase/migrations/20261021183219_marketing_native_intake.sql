-- Native marketing intake; no Auth accounts or Workforce memberships are created.
create table public.marketing_interest_entries (
 id uuid primary key default gen_random_uuid(),
 product text not null check (product in ('marketplace','workforce')),
 email text not null check (length(email) between 3 and 254 and email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 interest_role text not null,
 consent_version text not null check (consent_version='marketing-email-v1'),
 consent_text text not null,
 consented_at timestamptz not null default now(),
 withdrawn_at timestamptz,
 source_origin text not null check (length(source_origin)<=200),
 unique(product,email,interest_role),
 check ((product='marketplace' and interest_role in ('homeowner','contractor')) or
        (product='workforce' and interest_role in ('student','employer','educator','community','parent','other')))
);
create table public.marketing_intake_limits (
 bucket_key text not null check (bucket_key ~ '^[a-f0-9]{64}$'),
 window_start timestamptz not null,
 attempts integer not null check(attempts>0),
 primary key(bucket_key,window_start)
);
-- Lossless archival destination only. Import requires verified source IDs, counts and consent mapping.
-- Imported records NEVER automatically enroll someone in a new update list.
create table public.marketing_legacy_records (
 source_document text not null check(length(source_document) between 1 and 300),
 source_row_key text not null check(length(source_row_key) between 1 and 200),
 record_kind text not null check(record_kind in ('signup','survey','interview','consent','other')),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 imported_at timestamptz not null default now(),
 primary key(source_document,source_row_key)
);
alter table public.marketing_interest_entries enable row level security;
alter table public.marketing_intake_limits enable row level security;
alter table public.marketing_legacy_records enable row level security;
revoke all on public.marketing_interest_entries,public.marketing_intake_limits,public.marketing_legacy_records from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_interest_entries,public.marketing_intake_limits,public.marketing_legacy_records to service_role;
create function public.marketing_interest_submit(p_product text,p_email text,p_role text,p_origin text,p_bucket text)
returns void language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_product not in ('marketplace','workforce') or p_product is null or p_email is null or p_role is null or p_origin is null or p_bucket is null then
  raise exception 'Invalid intake';
 end if;
 insert into public.marketing_intake_limits(bucket_key,window_start,attempts)
 values(p_bucket,date_trunc('hour',now()),1)
 on conflict(bucket_key,window_start) do update set attempts=public.marketing_intake_limits.attempts+1 returning attempts into n;
 if n>20 then raise exception using errcode='P0001',message='Intake limit'; end if;
 delete from public.marketing_intake_limits where window_start<now()-interval '48 hours';
 insert into public.marketing_interest_entries(product,email,interest_role,source_origin,consent_version,consent_text)
 values(p_product,lower(btrim(p_email)),p_role,p_origin,'marketing-email-v1',
 'I agree to receive email updates from TXKPRO about the selected program, development progress, and availability. I can unsubscribe at any time.')
 on conflict(product,email,interest_role) do nothing;
 -- A repeated submission does not overwrite consent evidence or reverse an existing withdrawal.
end $$;
revoke all on function public.marketing_interest_submit(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.marketing_interest_submit(text,text,text,text,text) to service_role;
