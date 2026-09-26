-- W11-06 follow-up: deliver deferred assignment notifications exactly once
-- when a Ready course version becomes Live.

create or replace function security.enqueue_deferred_micro_cert_assignment_notifications()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='live' and old.status is distinct from 'live' then
    insert into public.wf_notifications(
      recipient_user_id,event_type,target_type,target_id,channel,status,payload,
      created_at,updated_at
    )
    select
      s.user_id,
      'MICRO_CERT_ASSIGNED',
      'micro_cert_assignment',
      a.assignment_id,
      'in_app',
      'queued',
      jsonb_build_object(
        'assignmentId',a.assignment_id,
        'microCertId',a.micro_cert_id,
        'microCertVersionId',a.micro_cert_version_id,
        'courseTitle',mc.title,
        'employerId',mc.employer_id,
        'employerName',ctr.business_name
      ),
      now(),
      now()
    from public.wf_micro_cert_assignments a
    join public.wf_student_profiles s
      on s.student_id=a.student_id
    join public.wf_employer_micro_certs mc
      on mc.micro_cert_id=a.micro_cert_id
    join public.contractors ctr
      on ctr.contractor_id=mc.employer_id
    where a.micro_cert_version_id=new.micro_cert_version_id
      and a.status<>'cancelled'
      and coalesce((a.metadata->>'notificationRequested')::boolean,false)=true
      and s.user_id is not null
      and not exists(
        select 1
        from public.wf_notifications n
        where n.recipient_user_id=s.user_id
          and n.event_type='MICRO_CERT_ASSIGNED'
          and n.target_type='micro_cert_assignment'
          and n.target_id=a.assignment_id
          and n.channel='in_app'
      );

    update public.wf_micro_cert_assignments a
    set metadata=a.metadata||jsonb_build_object(
          'notificationReleasedAt',now(),
          'notificationReleaseReason','course_version_live'
        ),
        updated_at=now()
    where a.micro_cert_version_id=new.micro_cert_version_id
      and a.status<>'cancelled'
      and coalesce((a.metadata->>'notificationRequested')::boolean,false)=true
      and not (a.metadata ? 'notificationReleasedAt');
  end if;
  return new;
end;
$$;

revoke all on function security.enqueue_deferred_micro_cert_assignment_notifications()
from public,anon,authenticated;
grant execute on function security.enqueue_deferred_micro_cert_assignment_notifications()
to service_role;

drop trigger if exists trg_wf_micro_cert_version_release_assignments
on public.wf_employer_micro_cert_versions;

create trigger trg_wf_micro_cert_version_release_assignments
after update of status on public.wf_employer_micro_cert_versions
for each row
when (new.status='live' and old.status is distinct from 'live')
execute function security.enqueue_deferred_micro_cert_assignment_notifications();
