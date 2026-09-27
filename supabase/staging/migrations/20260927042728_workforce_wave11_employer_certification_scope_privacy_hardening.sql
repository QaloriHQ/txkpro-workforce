
-- W11-09A hardening: do not disclose credential existence across authorization scopes.
create or replace function public.employer_certification_verify(
  p_credential_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_award public.wf_employer_certification_awards%rowtype;
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_student_id text:=security.current_student_id();
  v_allowed boolean:=false;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required for Employer Certification verification';
  end if;

  select * into v_award
  from public.wf_employer_certification_awards a
  where lower(a.credential_id)=lower(btrim(p_credential_id));

  if not found then
    return jsonb_build_object(
      'found',false,
      'credentialId',btrim(coalesce(p_credential_id,''))
    );
  end if;

  select * into v_assignment
  from public.wf_micro_cert_assignments a
  where a.assignment_id=v_award.assignment_id;

  v_allowed:=
    security.is_admin()
    or security.can_view_employer_learning_as_employer(v_award.employer_id)
    or (v_student_id is not null and v_student_id=v_award.student_id)
    or (
      v_assignment.institution_id is not null
      and security.institution_student_accessible(
        v_assignment.institution_id,
        v_award.student_id
      )
    );

  if not v_allowed then
    return jsonb_build_object(
      'found',false,
      'credentialId',btrim(coalesce(p_credential_id,''))
    );
  end if;

  return security.employer_certification_verification_read_model(
    v_award.credential_id
  );
end;
$$;

revoke all on function public.employer_certification_verify(text)
  from public,anon;
grant execute on function public.employer_certification_verify(text)
  to authenticated,service_role;
