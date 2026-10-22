-- Preserve historical Google identifiers; new bookings record their provider explicitly.
alter table public.marketing_research_bookings
 add column booking_provider text not null default 'google' check(booking_provider in ('google','zoho')),
 add column provider_booking_id text check(provider_booking_id is null or provider_booking_id ~ '^#[A-Za-z0-9_-]{1,80}$');
create unique index marketing_research_provider_booking on public.marketing_research_bookings(booking_provider,provider_booking_id) where provider_booking_id is not null;
-- Existing RLS and service-only privileges remain in force. No public policy/grant.
