-- W11-05 follow-up: validate primary Module Detail content references.

create or replace function security.enforce_micro_cert_content_url()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.content_url is not null
     and btrim(new.content_url)<>''
     and btrim(new.content_url) !~* '^(https?://|/)' then
    raise exception 'Unsafe or unsupported primary content URL scheme';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wf_micro_cert_versions_content_url
  on public.wf_employer_micro_cert_versions;

create trigger trg_wf_micro_cert_versions_content_url
before insert or update of content_url
on public.wf_employer_micro_cert_versions
for each row execute function security.enforce_micro_cert_content_url();

revoke all on function security.enforce_micro_cert_content_url()
  from public,anon,authenticated;
grant execute on function security.enforce_micro_cert_content_url()
  to service_role;
