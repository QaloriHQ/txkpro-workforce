create index if not exists contractor_team_members_contractor_idx
  on public.contractor_team_members(contractor_id);
create index if not exists contractor_team_members_user_idx
  on public.contractor_team_members(user_id);
create index if not exists contractors_owner_user_idx
  on public.contractors(owner_user_id);
create index if not exists wf_contractor_profiles_primary_recruiter_idx
  on public.wf_contractor_profiles(primary_recruiter_user_id);
create index if not exists wf_contractor_profiles_updated_by_idx
  on public.wf_contractor_profiles(updated_by_user_id);
create index if not exists wf_hiring_needs_created_by_idx
  on public.wf_hiring_needs(created_by_user_id);
create index if not exists wf_role_memberships_contractor_idx
  on public.wf_role_memberships(contractor_id);
create index if not exists wf_role_memberships_user_idx
  on public.wf_role_memberships(user_id);
