insert into public.wf_interview_requests(
  interview_request_id,student_id,employer_id,created_by_user_id,referral_id,hiring_need_id,
  trade_id,role_title,message,status,sent_at,created_at,updated_at
) values(
  'INT-STG-BRANDON','STU-STG-BRANDON','CON-704D9BFCBC7A','USR-D2C03C1B3279',
  'REF-STG-BRANDON','HNE-STG-ELEC-001','electrical','Residential Service Technician',
  'We would like to discuss the Residential Service Technician role and your verified electrical training.',
  'sent',now()-interval '2 days',now()-interval '2 days',now()-interval '2 days'
)
on conflict (interview_request_id) do nothing;

update public.wf_referrals
set status='interview_requested',updated_at=now()
where referral_id='REF-STG-BRANDON'
  and status in ('referred','delivered','viewed');

insert into public.wf_interview_requests(
  interview_request_id,student_id,employer_id,created_by_user_id,hiring_need_id,
  trade_id,role_title,message,status,sent_at,responded_at,response_note,created_at,updated_at
) values(
  'INT-STG-MIA','STU-STG-MIA','CON-704D9BFCBC7A','USR-D2C03C1B3279','HNE-STG-ELEC-001',
  'electrical','Residential Service Technician',
  'We would like to schedule a conversation about the role.',
  'accepted',now()-interval '3 days',now()-interval '2 days','Available after class.',
  now()-interval '3 days',now()-interval '2 days'
)
on conflict (interview_request_id) do nothing;

insert into public.wf_interview_requests(
  interview_request_id,student_id,employer_id,created_by_user_id,hiring_need_id,
  trade_id,role_title,message,status,sent_at,responded_at,scheduled_for,interview_format,
  location_detail,created_at,updated_at
) values(
  'INT-STG-ETHAN','STU-STG-ETHAN','CON-704D9BFCBC7A','USR-D2C03C1B3279','HNE-STG-ELEC-001',
  'electrical','Residential Service Technician',
  'We would like to discuss the service technician opening.',
  'scheduled',now()-interval '5 days',now()-interval '4 days',now()+interval '2 days',
  'In person','Acme Company · Texarkana, TX',now()-interval '5 days',now()-interval '1 day'
)
on conflict (interview_request_id) do nothing;

insert into public.wf_interview_requests(
  interview_request_id,student_id,employer_id,created_by_user_id,hiring_need_id,
  trade_id,role_title,message,status,sent_at,responded_at,scheduled_for,interview_format,
  location_detail,completed_at,created_at,updated_at
) values(
  'INT-STG-KAYLA','STU-STG-KAYLA','CON-704D9BFCBC7A','USR-D2C03C1B3279','HNE-STG-ELEC-001',
  'electrical','Residential Service Technician',
  'We would like to discuss the service technician opening.',
  'completed',now()-interval '10 days',now()-interval '9 days',now()-interval '5 days',
  'In person','Acme Company · Texarkana, TX',now()-interval '5 days',
  now()-interval '10 days',now()-interval '5 days'
)
on conflict (interview_request_id) do nothing;

insert into public.wf_interview_evaluations(
  evaluation_id,interview_request_id,employer_id,interviewer_user_id,next_step,summary
) values(
  'IEV-STG-KAYLA','INT-STG-KAYLA','CON-704D9BFCBC7A','USR-D2C03C1B3279','prepare_hire',
  'Strong discussion of residential troubleshooting workflow and safe tool use. Proceed with human hiring review.'
)
on conflict (interview_request_id) do nothing;

insert into public.wf_placements(
  placement_id,student_id,employer_id,interview_request_id,hiring_need_id,created_by_user_id,
  role_title,trade_id,hire_date,employment_type,status
) values(
  'PLC-STG-KAYLA','STU-STG-KAYLA','CON-704D9BFCBC7A','INT-STG-KAYLA','HNE-STG-ELEC-001',
  'USR-D2C03C1B3279','Residential Service Technician','electrical','2026-10-05','Full-time','pending_start'
)
on conflict (placement_id) do nothing;

insert into public.wf_retention_milestones(
  milestone_id,placement_id,day_number,scheduled_for,status
) values
  ('RTM-STG-KAYLA-30','PLC-STG-KAYLA',30,'2026-11-04T00:00:00Z','pending'),
  ('RTM-STG-KAYLA-60','PLC-STG-KAYLA',60,'2026-12-04T00:00:00Z','pending'),
  ('RTM-STG-KAYLA-90','PLC-STG-KAYLA',90,'2027-01-03T00:00:00Z','pending')
on conflict (placement_id,day_number) do nothing;
