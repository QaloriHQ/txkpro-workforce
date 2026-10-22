-- Public research is a separate domain from authenticated hiring/student records.
create table public.marketing_research_surveys (
 request_id uuid primary key,
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 research_role text not null check(research_role in ('student','parent','employer','instructor','community','other')),
 question_version text not null check(question_version='legacy-v7'),
 answers jsonb not null check(jsonb_typeof(answers)='object'),
 completed_at timestamptz not null default now()
);
create table public.marketing_research_bookings (
 request_id uuid primary key,
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 first_name text not null check(length(first_name) between 1 and 80),
 email text not null check(length(email)<=254 and email=lower(btrim(email))),
 research_role text not null check(research_role in ('student','parent','employer','instructor','community','other')),
 start_at timestamptz not null,
 end_at timestamptz not null,
 reservation_state text not null default 'pending' check(reservation_state in ('pending','booked','needs_review')),
 google_event_id text not null unique check(google_event_id ~ '^[a-f0-9]{64}$'),
 calendar_token_hash text not null unique check(calendar_token_hash ~ '^[a-f0-9]{64}$'),
 receipt_claimed_at timestamptz,
 receipt_operation_id text,
 receipt_outcome text,
 email_consent boolean not null default false,
 created_at timestamptz not null default now(),
 check(end_at=start_at+interval '20 minutes')
);
create unique index marketing_research_booking_slot on public.marketing_research_bookings(start_at);
create table public.marketing_research_tokens (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 email text not null check(email=lower(btrim(email)) and length(email)<=254),
 purpose text not null check(purpose='unsubscribe'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 used_at timestamptz
);
create index marketing_research_token_expiry on public.marketing_research_tokens(expires_at);
create table public.marketing_research_suppressions (
 email text primary key check(email=lower(btrim(email)) and length(email)<=254),
 withdrawn_at timestamptz not null default now(),
 source text not null check(source='confirmed_email_link')
);
alter table public.marketing_research_surveys enable row level security;
alter table public.marketing_research_bookings enable row level security;
alter table public.marketing_research_tokens enable row level security;
alter table public.marketing_research_suppressions enable row level security;
revoke all on public.marketing_research_surveys,public.marketing_research_bookings,public.marketing_research_tokens,public.marketing_research_suppressions from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_research_surveys,public.marketing_research_bookings,public.marketing_research_tokens,public.marketing_research_suppressions to service_role;

create function public.marketing_research_rate_limit(p_bucket text,p_limit integer default 60) returns void
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_limit<1 or p_limit>60 then raise exception 'Invalid research limit'; end if;
 insert into public.marketing_intake_limits(bucket_key,window_start,attempts)
 values(p_bucket,date_trunc('hour',now()),1)
 on conflict(bucket_key,window_start) do update set attempts=public.marketing_intake_limits.attempts+1 returning attempts into n;
 if n>p_limit then raise exception 'Research request limit'; end if;
 delete from public.marketing_intake_limits where window_start<now()-interval '48 hours';
end $$;
revoke all on function public.marketing_research_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.marketing_research_rate_limit(text,integer) to service_role;

create function public.marketing_research_unsubscribe(p_token_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare recipient text;
begin
 select email into recipient from public.marketing_research_tokens
 where token_hash=p_token_hash and expires_at>now() for update;
 if recipient is null then return false; end if;
 insert into public.marketing_research_suppressions(email,source)
 values(recipient,'confirmed_email_link') on conflict(email) do nothing;
 update public.marketing_interest_entries set withdrawn_at=coalesce(withdrawn_at,now()) where product='workforce' and email=recipient;
 update public.marketing_research_tokens set used_at=coalesce(used_at,now()) where token_hash=p_token_hash;
 return true;
end $$;
revoke all on function public.marketing_research_unsubscribe(text) from public,anon,authenticated;
grant execute on function public.marketing_research_unsubscribe(text) to service_role;

create function public.marketing_research_keep_withdrawal() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.product='workforce' and exists(select 1 from public.marketing_research_suppressions where email=new.email) then
  new.withdrawn_at=coalesce(new.withdrawn_at,now());
 end if;
 return new;
end $$;
revoke all on function public.marketing_research_keep_withdrawal() from public,anon,authenticated;
grant execute on function public.marketing_research_keep_withdrawal() to service_role;
create trigger marketing_research_keep_withdrawal before insert or update on public.marketing_interest_entries
for each row execute function public.marketing_research_keep_withdrawal();

-- Explicit operator-only preview sends. These records never enroll a subscriber.
create table public.marketing_email_preview_deliveries (
 batch_id uuid not null,
 template_id text not null,
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 recipient_hash text not null check(recipient_hash ~ '^[a-f0-9]{64}$'),
 claimed_at timestamptz not null default now(),
 operation_id text,
 outcome text not null default 'claimed',
 provider_stats jsonb,
 primary key(batch_id,template_id)
);
alter table public.marketing_email_preview_deliveries enable row level security;
revoke all on public.marketing_email_preview_deliveries from public,anon,authenticated;
grant select,insert,update on public.marketing_email_preview_deliveries to service_role;
