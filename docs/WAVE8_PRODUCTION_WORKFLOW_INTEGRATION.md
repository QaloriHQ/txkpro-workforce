# WAVE 8 — Production Workflow Integration

Wave 8 moves the Employer Talent + Referrals workflow from prototype/static state into the shared TXKPRO Workforce Supabase domain model.

## Scope

53. Candidate visibility/read model  
54. Deterministic Talent filters  
55. Saved Candidates persistence  
56. Referral schema reconciliation  
57. Referral creation + delivery  
58. Referral viewed synchronization  
59. Referral Detail production read model  
60. Employer-private candidate/referral notes  
61. Hiring Manager scope enforcement  
62. Production/staging seed + smoke tests

## Source-of-truth decisions

- Supabase/Postgres remains canonical.
- Student discoverability is explicit. Employer search only returns `employer_discoverable` candidates.
- Employer Talent access requires an approved Employer plus an active Employer Talent scope.
- Verified Skills remain separate from Student self-attestation and retain provenance.
- Hiring Need comparison uses explicit criteria booleans only; there is no employability score, ranking, or recommendation.
- Saved Candidates are Employer-private workflow metadata.
- Referral is a shared placement-workflow record. Institution creates; Employer owns permitted employer-side lifecycle actions.
- Institution-shared referral notes remain separate from Employer-private notes.
- Referral evidence is snapshotted at referral creation for historical/audit integrity.
- Hiring Managers can browse Talent only through assigned Hiring Needs and only see Saved Candidates/Referrals tied to those assignments.
- Notifications remain consequences of domain events and are not workflow state.

## Canonical Wave 8 tables

Existing/reconciled:

- `wf_institutions`
- `wf_cohorts`
- `wf_student_profiles`
- `wf_student_logistics`
- `wf_hiring_needs`
- `platform_audit_events`
- `wf_domain_events`

Wave 8 additions:

- `wf_skill_catalog`
- `wf_student_skills`
- `wf_employer_talent_scopes`
- `wf_saved_candidates`
- `wf_referrals`
- `wf_employer_candidate_notes`

## Candidate read model

The Employer candidate read model is returned by the security-definer RPC:

`employer_talent_search(employer_id, hiring_need_id, filters)`

The function validates the signed-in Employer membership, Employer approval state, Hiring Manager assignment when applicable, and Employer Talent scope before returning a sanitized candidate model.

Supported deterministic filters:

- Institution
- Program
- Graduation timing
- Verified skill
- Minimum verified-skill count
- Driver's license
- Driving-record attestation
- Background-screen willingness
- Drug-screen willingness
- Work type
- Shift
- Location
- Referral state

When a Hiring Need is selected, the result includes explicit per-criterion booleans for that Hiring Need. The UI intentionally describes these as criteria met/not met and never converts them into a score.

## Referrals

Canonical statuses follow the shared TXKPRO Referral vocabulary:

- draft
- referred
- delivered
- viewed
- interview_requested
- interview_accepted
- interview_declined
- hired
- closed
- expired

`institution_create_referral` creates and delivers a referral, snapshots visible evidence, and emits `REFERRAL_CREATED`.

The first eligible Employer detail view calls `employer_mark_referral_viewed`, which transitions `referred/delivered -> viewed` exactly once and emits `REFERRAL_VIEWED`.

Employer-private notes are stored in `wf_employer_candidate_notes` and are never copied into the Institution-shared referral note.

## RLS / authorization

Wave 8 adds RLS for Employer-private records and keeps base Student data inaccessible to anonymous users. Employer Talent data is exposed through sanitized RPC read models rather than broad direct table access.

Negative behavior tested in staging:

- anonymous Saved Candidate reads return zero rows;
- anonymous Employer-private note reads return zero rows;
- an Employer cannot read another Employer's Saved Candidates;
- an Employer cannot insert Saved Candidates into another Employer tenant;
- Talent is unavailable unless the Employer is approved and has an active Talent scope;
- Hiring Manager Talent access requires an assigned Hiring Need.

## Staging seed

The isolated staging project includes fictional pilot data only:

- Texarkana College / Electrical Technology
- five fictional Student candidates
- verified electrical skill evidence
- operational-readiness attestations with provenance
- Acme Company Employer Talent scope
- one structured Hiring Need
- one Saved Candidate
- one delivered Referral

No staging seed creates real Student Auth identities or sends notifications.

## Application routes

Employer workspace:

- `/employer`
- `/employer/talent`
- `/employer/talent/[studentId]`
- `/employer/saved`
- `/employer/referrals`
- `/employer/referrals/[id]`

Server APIs:

- `GET /api/referrals`
- `POST /api/referrals`
- `POST|DELETE /api/employer/talent/[studentId]/save`
- `POST /api/employer/talent/[studentId]/notes`
- `POST /api/employer/referrals/[id]/close`

## Verification

Run:

```bash
npm run typecheck
npm run lint
npm run build
npm run wave8:smoke
```

The Wave 8 smoke script checks staging persistence plus anonymous RLS denial. Authenticated tenant-isolation, Talent filtering, Referral view-event idempotency, and cross-tenant denial are also verified directly against the staging Supabase project before merge.

## Next wave

Wave 9 should connect Interview Request + Student response + Employer-private interview evaluation + Record Hire to the same shared state/event model. Referral remains a separate canonical state machine and is not overwritten by Interview or Placement status.
