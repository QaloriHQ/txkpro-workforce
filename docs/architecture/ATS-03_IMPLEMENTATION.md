# ATS-03 — Invitations and application lifecycle implementation

**Task:** ATS-03 / issue #330  
**Target:** staging only; production migration and deployment remain separately gated.

## Delivered contract

- Candidate invitations to a published Job Listing use verified Supabase email links and never create Employer-team or Student membership.
- Authenticated Students and verified external identities submit one canonical application per Job Listing.
- Submission atomically pins the Job's current immutable Pipeline Version and creates per-node tasks from that snapshot.
- `targetHours` is retained as planning metadata. `due_at` stays empty until a separate assignment event establishes an actual deadline.
- Candidate reads expose only their application and candidate-visible tasks. Employer reads are tenant/role/assigned-Job scoped.
- Withdrawal, Employer closure, invitation revocation, candidate task submission and Employer task movement are guarded, revision-aware and audited with reasons where required.
- Provider nodes remain inert. Task/provider completion cannot automatically accept, reject, hire or confirm employment start.

## Surfaces

- `/jobs/[id]/apply`: verified Student/external application flow.
- `/candidate/hiring`: own application and candidate-visible task progress.
- `/employer/applications`: scoped application/task workspace.
- Employer Job details: invitation delivery, invitation lifecycle and application counts.
- Server routes under `/api/applicant/*` and `/api/employer/applications/*` re-derive identity and scope.

## Database and security

Migration `20261101090000_ats_03_invitations_lifecycle.sql` adds candidate invitations, applications, application tasks and a private security audit ledger. Public tables enable RLS, revoke direct mutation, and expose guarded RPCs only. External email sessions have no direct table mutation. Published-version, tenant and candidate/job uniqueness constraints are database-enforced.

## Verification

`npm run ats-applications:qa` installs ATS-01/02/03 migrations in PGlite and proves version pinning, candidate isolation, read-only denial, audited task transitions and terminal withdrawal. Normal typecheck, lint and build remain required before staging handoff. Manual owner UAT should cover Student and new external email flows, wrong-recipient invitation denial, cross-Employer denial, mobile/keyboard behavior, light/dark themes, withdrawal/closure confirmations and no automatic hiring state.
