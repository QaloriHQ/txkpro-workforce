-- Emit the previously reserved W11-13 event contracts in the same transaction
-- as the canonical request and immutable transition record.
create or replace function public.wf_record_training_production_transition()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_from text;
  v_type text;
  v_key text;
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    v_from := case when tg_op = 'INSERT' then null else old.status end;
    v_type := case when tg_op = 'INSERT' then 'PRODUCTION_REQUEST_CREATED'
                   else 'PRODUCTION_STATUS_CHANGED' end;
    v_key := case when tg_op = 'INSERT' then 'production-request:' || new.production_request_id
                  else 'production-status:' || new.production_request_id || ':' || new.status end;
    insert into public.wf_training_production_history
      (production_request_id, from_status, to_status, actor_auth_user_id, note)
    values
      (new.production_request_id, v_from, new.status,
       nullif(new.metadata->>'last_actor_auth_user_id', '')::uuid,
       nullif(new.metadata->>'status_note', ''));

    perform security.emit_workforce_event(
      v_type, 'employer_training_production_request', new.production_request_id,
      new.employer_id, new.institution_id, null,
      case when v_from is null then null else jsonb_build_object('status',v_from) end,
      jsonb_build_object('status',new.status),
      jsonb_build_object('production_request_id',new.production_request_id,
        'from_status',v_from,'to_status',new.status,
        'actor_auth_user_id',new.metadata->>'last_actor_auth_user_id'),
      'success',v_key,null
    );
  end if;
  return new;
end;
$$;
revoke all on function public.wf_record_training_production_transition() from public, anon, authenticated;
