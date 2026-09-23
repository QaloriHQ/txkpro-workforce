revoke execute on function public.employer_talent_search(text,text,jsonb) from public, anon;
revoke execute on function public.employer_referrals_list(text,text) from public, anon;
revoke execute on function public.employer_referral_detail(text,text) from public, anon;
revoke execute on function public.employer_mark_referral_viewed(text,text) from public, anon;
revoke execute on function public.employer_close_referral(text,text) from public, anon;
revoke execute on function public.institution_create_referral(text,text,text,text,text) from public, anon;

grant execute on function public.employer_talent_search(text,text,jsonb) to authenticated, service_role;
grant execute on function public.employer_referrals_list(text,text) to authenticated, service_role;
grant execute on function public.employer_referral_detail(text,text) to authenticated, service_role;
grant execute on function public.employer_mark_referral_viewed(text,text) to authenticated, service_role;
grant execute on function public.employer_close_referral(text,text) to authenticated, service_role;
grant execute on function public.institution_create_referral(text,text,text,text,text) to authenticated, service_role;
