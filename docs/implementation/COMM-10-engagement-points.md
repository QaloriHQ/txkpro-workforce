# COMM-10 engagement PRO Points

Issue: #274. This change adds an uncapped engagement award path without calling the capped `security.pro_award` path.

## Scoring contract

| Qualifying action | Author award |
| --- | ---: |
| Like | 1 |
| Comment | 2 |
| Reply | 2 |
| Share or repost | 3 |
| Poll vote | 1 |
| Interested or Going RSVP | 3 |

An award is unique for the recipient author, engaging actor, canonical content, and action type. Different action types stack. Repeated comments, share variants, poll selections, or RSVP state changes do not multiply an award. Self-engagement is ignored.

Awards apply only to published member-authored public content and member-authored content in an active public group. Private groups, messages, unlisted/private standalone posts, sponsored content, and organization-branded content are excluded. `wf_profile_posts.content_origin` makes the sponsored and organization exclusions explicit for later publishing paths.

Source removal, moderation removal, event cancellation, and RSVP withdrawal reverse the existing logical award. Restoration reactivates the same award row. Changes after season finalization append an immutable season-correction record and audit event. The migration intentionally performs no historical backfill.

## Totals and rankings

`GET /api/pro-points/engagement` returns the signed-in user's seasonal and lifetime totals, engagement subtotals, level, and student rank eligibility. Student totals include the existing learning ledger plus engagement. Non-students receive engagement totals and levels but are never added to student cohort, institution, or TXKPRO rankings.

The student summary and season finalizer include active engagement points. Engagement remains uncapped and separate from the existing capped learning/activity award path.

## Security and operations

The award and correction tables have RLS enabled and no direct anonymous or authenticated grants. Source-table triggers call private `security` functions; the only new public RPC is the authenticated self-summary. Award and reversal events use `PRO_ENGAGEMENT_AWARDED` and `PRO_ENGAGEMENT_REVERSED`.

Apply `supabase/staging/migrations/20261015004938_workforce_comm_10_engagement_points.sql` to staging. Production is not in scope. Owner browser UAT should confirm totals after each supported action, withdrawal/restoration behavior, private-content exclusions, and student-only rankings.
