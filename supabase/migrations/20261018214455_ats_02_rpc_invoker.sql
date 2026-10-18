-- ATS-02: authenticated PostgREST wrappers should run as the caller.
-- Private security-schema implementation continues to use narrow SECURITY DEFINER
-- after verifying auth.uid, employer scope/role, expected revision and tenant links.
-- No new endpoint or role grant is introduced.
alter function public.wf_ats_publish_job(text,uuid,uuid,integer) security invoker;
alter function public.wf_ats_publish_pipeline(text,uuid,integer) security invoker;
