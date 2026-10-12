# COMM-02 — Workforce community Home feed

Issue #266 implements the signed-in Home experience approved by COMM-01 (#265). It is an additive staging change; production is unchanged.

## Product behavior

All active natural-person Workforce accounts with an active canonical role membership can read and publish. `/dashboard` sends supported roles to `/community`, while “My workspace” preserves access to the role-specific workspace. Advertiser-only accounts are not introduced or authorized by this release.

The composer defaults to the only V1 audience, Public, and requires an explicit acknowledgement that the post is visible on TXKPRO and search engines. Private-profile members may publish: cards always show the minimum display name/avatar byline, but profile links and headlines are returned only when that profile is currently public and published. Media is limited to four HTTPS references. Public post SEO pages are owned by COMM-03; COMM-02 does not claim that rendering work complete.

The feed authorizes content before ordering, then orders by `(published_at, profile_post_id)` for stable cursor pagination. Recent, Following, Nearby, and Topic filters are explicit; no opaque personalized/trending ranking is introduced. Nearby is an exact user-configured location label for this first scaffold. The UI includes loading, empty, error, retry, and mobile states plus follow, like, save, share, and report controls. Comments remain visibly unavailable until COMM-03.

## Data and security

The implementation reuses `wf_public_pages`, `wf_profile_posts`, comments, reactions, and shares. `member` is an internal private author-page type used only when a person has no Student/Educator/Staff public identity. It does not create a discoverable member profile. New preference, follow, save, and report tables have RLS enabled and no direct anon/authenticated privileges.

All reads and writes cross bounded security-definer RPCs that resolve the actor from `auth.uid()`, an active `users` row, and an active `app_role_memberships` row. Client-supplied owner IDs are never trusted. Publication and report operations emit `COMMUNITY_POST_PUBLISHED` and `COMMUNITY_POST_REPORTED` audit events without post text. Engagement does not award PRO Points in this issue; COMM-10 owns the approved points ledger and abuse controls.

## Verification and rollout

Run `npm run community:qa`, `npm run typecheck`, `npm run lint`, and `npm run build`. Apply the staging migration, then test recent/following/nearby/topic pagination with two active roles, a private profile, a disabled user, malformed media, duplicate toggles, and mobile/keyboard UI. Verify direct table access remains denied and public acknowledgement is mandatory. Roll back the app deployment before the migration if needed; the additive schema may remain dormant. Production requires a separate approval and migration.
