-- Referral rows, including immutable evidence snapshots, are served through
-- scoped security-definer RPCs. Direct Data API table access is unnecessary.
revoke all on table public.wf_referrals from public, anon, authenticated;

comment on table public.wf_referrals is
  'Canonical Institution referrals with immutable technical, operational, and Company Training snapshots. Direct anon/authenticated table access is closed; use role- and scope-checked referral RPCs.';
