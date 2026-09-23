insert into public.wf_institutions(
  institution_id,name,short_name,institution_type,city,state,active,bridge_source_key,bridge_source_sheet
) values(
  'INS-STG-TC','Texarkana College','TC','community_college','Texarkana','TX',true,
  'wave8:institution:tc','wave8_seed'
)
on conflict (institution_id) do nothing;

insert into public.wf_cohorts(
  cohort_id,institution_id,name,trade_id,program_name,term,graduation_date,status,
  created_at,updated_at,bridge_source_key,bridge_source_sheet
) values(
  'COH-STG-ELEC-2027','INS-STG-TC','Electrical Technology · Spring 2027',
  'electrical','Electrical Technology','Spring 2027','2027-05-15','active',
  now()::text,now()::text,'wave8:cohort:electrical:2027','wave8_seed'
)
on conflict (cohort_id) do nothing;

insert into public.users(user_id,role,email,first_name,last_name,status,bridge_source_key,bridge_source_sheet)
values
  ('USR-STG-BRANDON','user','brandon.carter@example.invalid','Brandon','Carter','active','wave8:user:brandon','wave8_seed'),
  ('USR-STG-MIA','user','mia.hernandez@example.invalid','Mia','Hernandez','active','wave8:user:mia','wave8_seed'),
  ('USR-STG-ALEXIS','user','alexis.thompson@example.invalid','Alexis','Thompson','active','wave8:user:alexis','wave8_seed'),
  ('USR-STG-ETHAN','user','ethan.brooks@example.invalid','Ethan','Brooks','active','wave8:user:ethan','wave8_seed'),
  ('USR-STG-KAYLA','user','kayla.nguyen@example.invalid','Kayla','Nguyen','active','wave8:user:kayla','wave8_seed')
on conflict (user_id) do nothing;

insert into public.wf_student_profiles(
  student_id,user_id,profile_status,profile_visibility,discoverability_status,
  first_name_public,last_initial_public,preferred_name,program_type,school_id,cohort_id,
  graduation_year,graduation_date,education_level,zip_code,city,state,primary_trade_id,
  availability_status,available_start_date,employment_preferences_json,institution_validation_status,
  bridge_source_key,bridge_source_sheet
) values
  ('STU-STG-BRANDON','USR-STG-BRANDON','active','employer_discoverable','employer_discoverable','Brandon','C.','Brandon','Electrical Technology','INS-STG-TC','COH-STG-ELEC-2027','2027','2027-05-15','certificate','75501','Texarkana','TX','electrical','available','2027-05-16','{"workTypes":["Full-time","Apprenticeship"],"shifts":["Day"]}'::jsonb,'institution_verified','wave8:student:brandon','wave8_seed'),
  ('STU-STG-MIA','USR-STG-MIA','active','employer_discoverable','employer_discoverable','Mia','H.','Mia','Electrical Technology','INS-STG-TC','COH-STG-ELEC-2027','2027','2027-05-15','certificate','71854','Texarkana','AR','electrical','available','2027-05-16','{"workTypes":["Full-time"],"shifts":["Day","Evening"]}'::jsonb,'institution_verified','wave8:student:mia','wave8_seed'),
  ('STU-STG-ALEXIS','USR-STG-ALEXIS','active','employer_discoverable','employer_discoverable','Alexis','T.','Alexis','Electrical Technology','INS-STG-TC','COH-STG-ELEC-2027','2027','2027-05-15','certificate','75503','Texarkana','TX','electrical','available','2027-05-16','{"workTypes":["Apprenticeship"],"shifts":["Day"]}'::jsonb,'institution_verified','wave8:student:alexis','wave8_seed'),
  ('STU-STG-ETHAN','USR-STG-ETHAN','active','employer_discoverable','employer_discoverable','Ethan','B.','Ethan','Electrical Technology','INS-STG-TC','COH-STG-ELEC-2027','2026','2026-12-15','certificate','75570','New Boston','TX','electrical','available','2026-12-16','{"workTypes":["Full-time"],"shifts":["Day"]}'::jsonb,'institution_verified','wave8:student:ethan','wave8_seed'),
  ('STU-STG-KAYLA','USR-STG-KAYLA','active','employer_discoverable','employer_discoverable','Kayla','N.','Kayla','Electrical Technology','INS-STG-TC','COH-STG-ELEC-2027','2027','2027-05-15','certificate','75501','Texarkana','TX','electrical','available','2027-05-16','{"workTypes":["Full-time"],"shifts":["Day"]}'::jsonb,'institution_verified','wave8:student:kayla','wave8_seed')
on conflict (student_id) do update
set discoverability_status=excluded.discoverability_status,
    profile_visibility=excluded.profile_visibility,
    updated_at=now();

insert into public.wf_student_logistics(
  logistics_id,student_id,driver_license_status,reliable_transit,driving_record_attestation,
  background_screen_willingness,drug_screen_willingness,work_types_json,shifts_json,provenance_json,
  updated_at,bridge_source_key,bridge_source_sheet
) values
  ('LOG-STG-BRANDON','STU-STG-BRANDON','valid','yes',true,true,true,'["Full-time","Apprenticeship"]'::jsonb,'["Day"]'::jsonb,'{"driversLicense":"self_attested","drivingRecordAttestation":"self_attested","screeningWillingness":"self_attested"}'::jsonb,now()::text,'wave8:logistics:brandon','wave8_seed'),
  ('LOG-STG-MIA','STU-STG-MIA','valid','yes',true,true,true,'["Full-time"]'::jsonb,'["Day","Evening"]'::jsonb,'{"driversLicense":"self_attested","drivingRecordAttestation":"self_attested","screeningWillingness":"self_attested"}'::jsonb,now()::text,'wave8:logistics:mia','wave8_seed'),
  ('LOG-STG-ALEXIS','STU-STG-ALEXIS','valid','yes',false,true,true,'["Apprenticeship"]'::jsonb,'["Day"]'::jsonb,'{"driversLicense":"self_attested","drivingRecordAttestation":"self_attested","screeningWillingness":"self_attested"}'::jsonb,now()::text,'wave8:logistics:alexis','wave8_seed'),
  ('LOG-STG-ETHAN','STU-STG-ETHAN','valid','yes',true,true,false,'["Full-time"]'::jsonb,'["Day"]'::jsonb,'{"driversLicense":"self_attested","drivingRecordAttestation":"self_attested","screeningWillingness":"self_attested"}'::jsonb,now()::text,'wave8:logistics:ethan','wave8_seed'),
  ('LOG-STG-KAYLA','STU-STG-KAYLA','valid','yes',true,true,true,'["Full-time"]'::jsonb,'["Day"]'::jsonb,'{"driversLicense":"self_attested","drivingRecordAttestation":"self_attested","screeningWillingness":"self_attested"}'::jsonb,now()::text,'wave8:logistics:kayla','wave8_seed')
on conflict (logistics_id) do nothing;

insert into public.wf_skill_catalog(skill_id,institution_id,trade_id,category,name,description,active)
values
  ('SKL-ELEC-SAFETY','INS-STG-TC','electrical','Safety','Electrical Safety','Applies electrical safety procedures and PPE practices.',true),
  ('SKL-ELEC-CIRCUITS','INS-STG-TC','electrical','Core','AC/DC Circuits','Understands fundamental AC/DC circuit concepts and measurement.',true),
  ('SKL-ELEC-WIRING','INS-STG-TC','electrical','Residential','Residential Wiring','Performs common residential wiring tasks to instructional standard.',true),
  ('SKL-ELEC-BLUEPRINT','INS-STG-TC','electrical','Planning','Blueprint Reading','Reads basic electrical plans, symbols, and diagrams.',true),
  ('SKL-ELEC-TROUBLE','INS-STG-TC','electrical','Service','Troubleshooting','Uses a structured process to isolate common electrical faults.',true)
on conflict (skill_id) do nothing;

insert into public.wf_student_skills(
  student_skill_id,student_id,skill_id,status,provenance,verified_by_user_id,verified_at,evidence_json
)
select
  'SSK-' || upper(substr(md5(v.student_id || ':' || v.skill_id),1,12)),
  v.student_id,v.skill_id,'verified','institution_verified','USR-STG-INSTRUCTOR',now(),
  jsonb_build_object('source','Wave 8 staging seed','institutionId','INS-STG-TC')
from (values
  ('STU-STG-BRANDON','SKL-ELEC-SAFETY'),
  ('STU-STG-BRANDON','SKL-ELEC-CIRCUITS'),
  ('STU-STG-BRANDON','SKL-ELEC-WIRING'),
  ('STU-STG-BRANDON','SKL-ELEC-BLUEPRINT'),
  ('STU-STG-MIA','SKL-ELEC-SAFETY'),
  ('STU-STG-MIA','SKL-ELEC-CIRCUITS'),
  ('STU-STG-MIA','SKL-ELEC-WIRING'),
  ('STU-STG-ALEXIS','SKL-ELEC-SAFETY'),
  ('STU-STG-ALEXIS','SKL-ELEC-CIRCUITS'),
  ('STU-STG-ETHAN','SKL-ELEC-SAFETY'),
  ('STU-STG-ETHAN','SKL-ELEC-CIRCUITS'),
  ('STU-STG-ETHAN','SKL-ELEC-BLUEPRINT'),
  ('STU-STG-KAYLA','SKL-ELEC-SAFETY'),
  ('STU-STG-KAYLA','SKL-ELEC-CIRCUITS'),
  ('STU-STG-KAYLA','SKL-ELEC-WIRING'),
  ('STU-STG-KAYLA','SKL-ELEC-BLUEPRINT'),
  ('STU-STG-KAYLA','SKL-ELEC-TROUBLE')
) as v(student_id,skill_id)
on conflict (student_id,skill_id) do update
set status='verified',provenance='institution_verified',verified_at=excluded.verified_at,updated_at=now();

insert into public.wf_employer_talent_scopes(
  talent_scope_id,employer_id,institution_id,cohort_id,trade_id,program_name,active,created_by_user_id
) values(
  'ETS-STG-ACME-TC-ELEC','CON-704D9BFCBC7A','INS-STG-TC','COH-STG-ELEC-2027',
  'electrical','Electrical Technology',true,'USR-01DFC55A967A'
)
on conflict (talent_scope_id) do nothing;

insert into public.wf_hiring_needs(
  hiring_need_id,employer_id,created_by_user_id,title,trade_id,role_type,target_hires,
  target_hire_date,service_area_json,work_types_json,shifts_json,program_eligibility_json,
  graduation_timing,required_verified_skills_json,optional_verified_skills_json,
  minimum_verified_skill_count,requires_drivers_license,requires_driving_record_attestation,
  requires_background_willingness,requires_drug_screen_willingness,status,visibility,seed_key
) values(
  'HNE-STG-ELEC-001','CON-704D9BFCBC7A','USR-D2C03C1B3279',
  'Residential Service Technician','electrical','technician',2,'2027-06-01',
  '{"cities":["Texarkana","New Boston"]}'::jsonb,'["Full-time"]'::jsonb,'["Day"]'::jsonb,
  '["Electrical Technology"]'::jsonb,'Spring 2027',
  '["SKL-ELEC-SAFETY","SKL-ELEC-CIRCUITS"]'::jsonb,
  '["SKL-ELEC-WIRING","SKL-ELEC-TROUBLE"]'::jsonb,
  3,true,true,true,true,'active','institution_shared','wave8_staging_hiring_need'
)
on conflict (hiring_need_id) do update
set status='active',updated_at=now();

insert into public.wf_saved_candidates(
  saved_candidate_id,employer_id,student_id,hiring_need_id,saved_by_user_id,internal_tag
) values(
  'SAV-STG-MIA','CON-704D9BFCBC7A','STU-STG-MIA','HNE-STG-ELEC-001','USR-D2C03C1B3279','Follow up'
)
on conflict (saved_candidate_id) do nothing;

insert into public.wf_referrals(
  referral_id,institution_id,student_id,employer_id,hiring_need_id,created_by_user_id,
  institution_shared_note,technical_snapshot,professional_snapshot,operational_snapshot,
  status,referred_at,delivered_at
) values(
  'REF-STG-BRANDON','INS-STG-TC','STU-STG-BRANDON','CON-704D9BFCBC7A','HNE-STG-ELEC-001',
  'USR-STG-INSTRUCTOR','Instructor referral: strong lab participation and consistent safety practice.',
  '{"verifiedSkillCount":4,"verifiedSkills":[{"skillId":"SKL-ELEC-SAFETY","name":"Electrical Safety","provenance":"institution_verified"},{"skillId":"SKL-ELEC-CIRCUITS","name":"AC/DC Circuits","provenance":"institution_verified"},{"skillId":"SKL-ELEC-WIRING","name":"Residential Wiring","provenance":"institution_verified"},{"skillId":"SKL-ELEC-BLUEPRINT","name":"Blueprint Reading","provenance":"institution_verified"}]}'::jsonb,
  '{}'::jsonb,
  '{"driversLicense":"valid","drivingRecordAttestation":true,"backgroundScreenWillingness":true,"drugScreenWillingness":true,"workTypes":["Full-time","Apprenticeship"],"shifts":["Day"],"provenance":{"driversLicense":"self_attested","drivingRecordAttestation":"self_attested","screeningWillingness":"self_attested"}}'::jsonb,
  'delivered',now(),now()
)
on conflict (referral_id) do nothing;
