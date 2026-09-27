
-- W11-09A hardening: make credential issuance digest timezone-invariant.

create or replace function security.employer_certification_digest(
  p_credential_id text,
  p_employer_id text,
  p_student_id text,
  p_certification_definition_id text,
  p_completion_id text,
  p_micro_cert_version_id text,
  p_issued_at timestamptz,
  p_expires_at timestamptz
)
returns text
language sql
immutable
set search_path=''
as $$
  select encode(
    extensions.digest(
      concat_ws(
        '|',
        'txkpro-employer-certification-v1',
        coalesce(p_credential_id,''),
        coalesce(p_employer_id,''),
        coalesce(p_student_id,''),
        coalesce(p_certification_definition_id,''),
        coalesce(p_completion_id,''),
        coalesce(p_micro_cert_version_id,''),
        coalesce(
          to_char(
            p_issued_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ),
          ''
        ),
        coalesce(
          to_char(
            p_expires_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ),
          ''
        )
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function security.employer_certification_digest(
  text,text,text,text,text,text,timestamptz,timestamptz
) from public,anon,authenticated;

grant execute on function security.employer_certification_digest(
  text,text,text,text,text,text,timestamptz,timestamptz
) to service_role;
