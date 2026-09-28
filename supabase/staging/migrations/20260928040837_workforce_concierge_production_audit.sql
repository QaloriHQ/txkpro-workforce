-- W11-13: immutable status provenance for Concierge Production Requests.
create table if not exists public.wf_training_production_history (
  id uuid primary key default gen_random_uuid(),
  production_request_id text not null references public.wf_employer_training_production_requests(production_request_id) on delete restrict,
  from_status text,
  to_status text not null,
  actor_auth_user_id uuid,
  note text,
  occurred_at timestamptz not null default now()
);
create index if not exists wf_training_production_history_request_idx
  on public.wf_training_production_history(production_request_id, occurred_at, id);
alter table public.wf_training_production_history enable row level security;
revoke all on public.wf_training_production_history from public, anon, authenticated;
grant select, insert on public.wf_training_production_history to service_role;

create or replace function public.wf_record_training_production_transition()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.wf_training_production_history
      (production_request_id, from_status, to_status, actor_auth_user_id, note)
    values
      (new.production_request_id,
       case when tg_op = 'INSERT' then null else old.status end,
       new.status,
       nullif(new.metadata->>'last_actor_auth_user_id', '')::uuid,
       nullif(new.metadata->>'status_note', ''));
  end if;
  return new;
end;
$$;
revoke all on function public.wf_record_training_production_transition() from public, anon, authenticated;
drop trigger if exists wf_training_production_transition on public.wf_employer_training_production_requests;
create trigger wf_training_production_transition
after insert or update of status on public.wf_employer_training_production_requests
for each row execute function public.wf_record_training_production_transition();
