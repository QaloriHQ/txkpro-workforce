-- Cover invitation identity/actor foreign keys without changing authority.
-- Legacy closed/target columns are retained only where they already exist.
do $indexes$
declare v_column text;
begin
  foreach v_column in array array['accepted_by_auth_user_id','closed_by_auth_user_id','closed_by_user_id','invited_by_auth_user_id','invited_by_user_id','revoked_by_auth_user_id','revoked_by_user_id','target_user_id'] loop
    if exists(select 1 from pg_attribute where attrelid='public.wf_user_invitations'::regclass and attname=v_column and not attisdropped) then
      execute format('create index if not exists %I on public.wf_user_invitations (%I)', 'wf_user_invitations_'||v_column||'_idx',v_column);
    end if;
  end loop;
end;
$indexes$;
