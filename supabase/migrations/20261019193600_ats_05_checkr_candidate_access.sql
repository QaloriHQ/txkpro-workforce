-- Operational projection only; no results, secrets, prices or employer notes.
create function security.checkr_candidate_workspace() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a text:=security.pro_actor(); begin
 return coalesce((select jsonb_agg(jsonb_build_object(
 'id',x.id,'employerId',x.employer_id,'employerName',x.business_name,
 'packageName',x.package_name,'status',x.status,
 'invitationStatus',x.invitation_status,'reportStatus',x.report_status,
 'createdAt',x.created_at,'canOpen',x.can_open) order by x.created_at desc)
 from (select o.id,o.employer_id,c.business_name,q.package_name,o.status,
 d.invitation_status,d.report_status,o.created_at,
 (d.invitation_id is not null and d.invitation_status='pending' and ca.connected) as can_open
 from public.wf_screening_orders o
 join public.contractors c on c.contractor_id=o.employer_id
 join security.wf_checkr_quotes q on q.order_id=o.id
 join security.wf_checkr_dispatch d on d.order_id=o.id
 join security.wf_checkr_accounts ca on ca.employer_id=o.employer_id
 where o.subject_user_id=a order by o.created_at desc limit 100) x),'[]'::jsonb);
end $$;
revoke all on function security.checkr_candidate_workspace() from public,anon,authenticated,service_role;
grant execute on function security.checkr_candidate_workspace() to authenticated;
create function public.checkr_candidate_workspace() returns jsonb
language sql stable security invoker set search_path='' as $$
 select security.checkr_candidate_workspace();
$$;
revoke all on function public.checkr_candidate_workspace() from public,anon,authenticated,service_role;
grant execute on function public.checkr_candidate_workspace() to authenticated;
