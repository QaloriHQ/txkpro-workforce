create or replace function public.wf_emit_event(
  p_event_type text,
  p_target_type text,
  p_target_id text default null,
  p_employer_id text default null,
  p_institution_id text default null,
  p_student_id text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_result text default 'success',
  p_event_key text default null,
  p_correlation_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select security.emit_workforce_event(
    p_event_type,
    p_target_type,
    p_target_id,
    p_employer_id,
    p_institution_id,
    p_student_id,
    p_before,
    p_after,
    p_metadata,
    p_result,
    p_event_key,
    p_correlation_id
  );
$$;

revoke all on function public.wf_emit_event(
  text,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,uuid
) from public, anon, authenticated;
grant execute on function public.wf_emit_event(
  text,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,uuid
) to service_role;

create or replace function security.emit_employer_approval_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.approval_status,'')) = 'approved'
     and lower(coalesce(old.approval_status,'')) <> 'approved'
     and exists (
       select 1
       from public.wf_contractor_profiles p
       where p.contractor_id = new.contractor_id
     ) then

    update public.wf_onboarding_accounts
    set status = 'complete',
        current_step = 6,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where employer_id = new.contractor_id
      and selected_role = 'employer'
      and status in ('pending_review','in_progress');

    perform security.emit_workforce_event(
      'EMPLOYER_APPROVED',
      'employer',
      new.contractor_id,
      new.contractor_id,
      null,
      null,
      jsonb_build_object('approval_status', old.approval_status),
      jsonb_build_object('approval_status', new.approval_status),
      jsonb_build_object('onboarding_completed', true),
      'success',
      'employer_approved:' || new.contractor_id || ':' || coalesce(new.updated_at::text,now()::text),
      null
    );
  end if;
  return new;
end;
$$;
