-- Align the read model with the active Student role and auth linkage used by
-- the canonical learning runtime.
create or replace function public.student_employer_training_exposure()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_student_id text:=security.current_student_id();
begin
  if v_student_id is null then raise exception 'Student membership required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'exposureEventId',x.exposure_event_id,'eventType',x.event_type,
      'employerName',x.employer_name,'courseTitle',x.course_title,
      'occurredAt',x.occurred_at
    ) order by x.occurred_at desc)
    from (
      select e.exposure_event_id,e.event_type,e.occurred_at,
             c.business_name as employer_name,mc.title as course_title
      from public.wf_employer_exposure_events e
      join public.contractors c on c.contractor_id=e.employer_id
      left join public.wf_employer_micro_certs mc on mc.micro_cert_id=e.micro_cert_id
      where e.student_id=v_student_id
        and e.event_type in ('EMPLOYER_TRAINING_PREVIEWED','EMPLOYER_TRAINING_STARTED',
                             'EMPLOYER_TRAINING_COMPLETED')
      order by e.occurred_at desc
      limit 30
    ) x
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.student_employer_training_exposure() from public,anon,authenticated;
grant execute on function public.student_employer_training_exposure() to authenticated,service_role;
