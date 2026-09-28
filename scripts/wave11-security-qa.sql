-- W11-15 staging-only, rollback-only authorization regression.
-- Run as a privileged SQL operator against staging; never run against production.
-- Requires the three demo Auth accounts and the staging Acme fixture.
begin;

do $qa$
declare
  v_role text;
  v_table text;
begin
  foreach v_role in array array['anon','authenticated'] loop
    foreach v_table in array array[
      'wf_employer_micro_cert_assessment_questions',
      'wf_micro_cert_assignments',
      'wf_employer_certification_awards',
      'wf_employer_exposure_events',
      'wf_referrals'
    ] loop
      if has_table_privilege(v_role, 'public.' || v_table, 'SELECT,INSERT,UPDATE,DELETE') then
        raise exception 'Direct % table access granted to %', v_table, v_role;
      end if;
    end loop;
  end loop;
  if has_function_privilege('anon', 'public.employer_certification_public_verify(text)', 'EXECUTE') then
    raise exception 'Public credential read model directly executable by anon';
  end if;
end $qa$;

do $qa$
declare
  v jsonb;
  v_page_id text;
begin
  v:=public.employer_certification_public_verify('CERT-E928A400DC15');
  if v->>'found'<>'true' or v->>'status'<>'active'
     or v#>>'{evidence,category}'<>'employer_training'
     or v#>>'{evidence,technicalSkillVerified}'<>'false'
     or v#>>'{verification,integrityVerified}'<>'true' then
    raise exception 'Public credential evidence contract failed';
  end if;
  if v::text ~* 'email|phone|assignmentId|completionId|answerKey|revocationReason|privateNotes' then
    raise exception 'Public credential included private evidence';
  end if;
  if (public.employer_certification_public_verify('CERT-DOES-NOT-EXIST')->>'found')<>'false' then
    raise exception 'Unknown credential was discoverable';
  end if;
  select public_page_id into v_page_id from public.wf_public_pages
  where entity_type='credential' and canonical_path=v->>'canonicalPath';
  if v_page_id is null then raise exception 'Published credential fixture missing'; end if;
  update public.wf_public_pages set publication_status='draft'
  where public_page_id=v_page_id;
  if (public.employer_certification_public_verify('CERT-E928A400DC15')->>'found')<>'false' then
    raise exception 'Unpublished credential was exposed';
  end if;
  -- Restore within the transaction so later checks use the published fixture.
  update public.wf_public_pages set publication_status='published'
  where public_page_id=v_page_id;
end $qa$;

do $qa$ begin
  if (select count(*) from auth.users where email in (
    'student.demo@txkpro.com','instructor.demo@txkpro.com','employer.demo@txkpro.com'
  )) <> 3 then raise exception 'Staging demo Auth fixtures missing'; end if;
  perform set_config('request.jwt.claim.sub',
    (select id::text from auth.users where email='student.demo@txkpro.com'),true);
end $qa$;
set local role authenticated;
do $qa$
declare v jsonb;
begin
  v:=public.student_employer_training_exposure();
  if jsonb_typeof(v)<>'array' then raise exception 'Student exposure shape invalid'; end if;
  begin
    perform public.employer_micro_cert_module_detail('CON-704D9BFCBC7A','EMC-FB31AC3BF3AA');
    raise exception 'SECURITY FAILURE: Student viewed Employer authoring';
  exception when others then
    if sqlerrm like 'SECURITY FAILURE:%' then raise; end if;
  end;
  begin
    perform public.employer_micro_cert_assessment_authoring_detail(
      'CON-704D9BFCBC7A','EMC-FB31AC3BF3AA','ASM-DEMO-SAFETY');
    raise exception 'SECURITY FAILURE: Student viewed assessment answer key';
  exception when others then
    if sqlerrm like 'SECURITY FAILURE:%' then raise; end if;
  end;
  begin
    perform public.employer_referral_detail('CON-704D9BFCBC7A','REF-STG-BRANDON');
    raise exception 'SECURITY FAILURE: Student viewed Employer referral';
  exception when others then
    if sqlerrm like 'SECURITY FAILURE:%' then raise; end if;
  end;
end $qa$;

reset role;
do $qa$ begin
  perform set_config('request.jwt.claim.sub',
    (select id::text from auth.users where email='instructor.demo@txkpro.com'),true);
end $qa$;
set local role authenticated;
do $qa$ begin
  begin
    perform public.institution_micro_cert_assign(
      'INS-STG-TC','EMC-FB31AC3BF3AA','student',null,null,
      '["STU-DEMO-STUDENT"]'::jsonb,false);
    raise exception 'SECURITY FAILURE: Instructor assigned training';
  exception when others then
    if sqlerrm like 'SECURITY FAILURE:%' then raise; end if;
  end;
  begin
    perform public.employer_micro_cert_assessment_authoring_detail(
      'CON-704D9BFCBC7A','EMC-FB31AC3BF3AA','ASM-DEMO-SAFETY');
    raise exception 'SECURITY FAILURE: Instructor viewed answer key';
  exception when others then
    if sqlerrm like 'SECURITY FAILURE:%' then raise; end if;
  end;
end $qa$;

reset role;
do $qa$ begin
  perform set_config('request.jwt.claim.sub',
    (select id::text from auth.users where email='employer.demo@txkpro.com'),true);
end $qa$;
set local role authenticated;
do $qa$
declare v jsonb;
begin
  v:=public.employer_micro_cert_module_detail('CON-704D9BFCBC7A','EMC-FB31AC3BF3AA');
  if v::text ~* 'answerKey|correctOptionId' then
    raise exception 'Employer module read model leaked assessment answer keys';
  end if;
  v:=public.employer_micro_cert_assessment_preview(
    'CON-704D9BFCBC7A','EMC-FB31AC3BF3AA','ASM-DEMO-SAFETY');
  if v::text ~* 'answerKey|correctOptionId' then
    raise exception 'Employer assessment preview leaked answer keys';
  end if;
  begin
    perform public.employer_referral_detail('CON-OTHER-NOT-MEMBER','REF-STG-BRANDON');
    raise exception 'SECURITY FAILURE: cross-Employer referral';
  exception when others then
    if sqlerrm like 'SECURITY FAILURE:%' then raise; end if;
  end;
  begin
    perform public.student_employer_training_exposure();
    raise exception 'SECURITY FAILURE: Employer viewed Student exposure';
  exception when others then
    if sqlerrm like 'SECURITY FAILURE:%' then raise; end if;
  end;
end $qa$;

-- Temporarily demote the demo Employer to read-only inside this transaction.
-- The final rollback restores the canonical membership.
reset role;
do $qa$
declare v_count integer;
begin
  update public.app_role_memberships set role='employer_read_only'
  where auth_user_id=(select id from auth.users where email='employer.demo@txkpro.com')
    and scope_type='employer' and scope_id='CON-704D9BFCBC7A'
    and role='employer_admin';
  get diagnostics v_count = row_count;
  if v_count<>1 then raise exception 'Expected one Employer admin fixture'; end if;
end $qa$;
set local role authenticated;
do $qa$
declare v jsonb;
begin
  v:=public.employer_micro_cert_assessment_preview(
    'CON-704D9BFCBC7A','EMC-FB31AC3BF3AA','ASM-DEMO-SAFETY');
  if v::text ~* 'answerKey|correctOptionId' then
    raise exception 'Read-only Employer assessment preview leaked answer keys';
  end if;
  begin
    perform public.employer_micro_cert_assessment_authoring_detail(
      'CON-704D9BFCBC7A','EMC-FB31AC3BF3AA','ASM-DEMO-SAFETY');
    raise exception 'SECURITY FAILURE: read-only Employer viewed answer key';
  exception when others then
    if sqlerrm like 'SECURITY FAILURE:%' then raise; end if;
  end;
end $qa$;

rollback;
