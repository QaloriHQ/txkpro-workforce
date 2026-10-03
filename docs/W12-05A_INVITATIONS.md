# W12-05A invitation implementation and staging UAT

`public.wf_user_invitations` owns invitation state. Auth emails verify identity; a link's invitation ID is only a locator. Authorization comes from active, scoped `app_role_memberships`, never editable Auth metadata. Acceptance adds memberships without replacing existing roles. Institution, Program, Cohort, Employer and Platform scope are checked in private SQL implementations behind SECURITY INVOKER public RPCs.

## Invitation lifecycle and approval

Pending invitations become accepted, expired, revoked or cancelled. Duplicate pending creates and repeated recipient acceptance are idempotent. Revoke/cancel affect only pending invitations and their pending membership projections. Expired invitations require a new invitation. Delivery status is separate from lifecycle; failed delivery leaves a visible retryable record.

Delegated Institution staff invitations require D-01 approval. Recipient acceptance links the identity but leaves the membership pending; only a scoped approver can activate it. Existing active memberships are preserved. Student acceptance activates the invited scope and hands off to the existing Student onboarding RPC, which binds the accepted Institution/Program/Cohort, preserves privacy consent, and emits the canonical cohort event. A previously onboarded Student receives the same affiliation without repeating onboarding.

## API contract for individual and future CSV ingestion

Authenticated `POST /api/invitations` accepts one object or `{ "invitations": [ ... ] }` (maximum 100). Each row accepts `email`, `role`, `scopeType`, `scopeId`, `institutionId` or `employerId`, optional `firstName`, `lastName`, and `idempotencyKey`. Use a stable import/row key for replay. Returns per-row invitation and delivery outcomes plus summary counts. Duplicate creation sends no additional email. Mixed bulk failures preserve each successful row; callers should retry failed rows only.

`GET /api/invitations` accepts `institutionId`, `employerId`, `status`; server policy filters every result. Tenant identifiers in requests never confer access. Scoped admins use `/institution/team`, `/institution/students`, `/employer/team`, or `/admin/invitations`.

`POST /api/invitations/{id}/resend` accepts a stable `requestKey` per retry. Claims serialize delivery, prevent duplicate provider calls for the same key, and enforce a 60-second cooldown between distinct requests. A fresh key after cooldown retries a failed send. Completed delivery recording is fenced by the claim key. `POST .../revoke` accepts `mode: "revoked" | "cancelled"`. `POST .../approval` accepts `decision: "approved" | "rejected"` after recipient acceptance. `GET .../accept` and `POST .../accept` require the verified recipient; newly invited accounts choose a password of at least eight characters.

## Email configuration and reconciliation

Supabase Auth sends actual new-account invitations or existing-account magic links. Set the server environment `NEXT_PUBLIC_SITE_URL` to the staging origin and configure Supabase Auth redirect allowlisting for `https://staging-workforce.txkpro.com/invitations/activate`. Server-only `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) is used solely for Auth delivery and its bookkeeping; scoped creation/acceptance/approval use authenticated SQL policy. Check SMTP delivery/rate limits with the owner-controlled test accounts below. Provider failures are sanitized and surfaced in the invitation manager.

The activation page supports default Supabase implicit email callbacks and explicit invite/email token-hash callbacks. Credentials are removed from the address bar before further requests. The checked-in email templates use `ConfirmationURL`; customization is optional.

The forward consolidation migration extends the already-applied `wf_user_invitations` table and retires alternate `workforce_invitation_*` RPC execution. Historical compatibility columns and rows remain. The competing raw-token `user_invitations` migration from PR #190 was confirmed unapplied and is removed. The two earlier invitation migrations are recovered verbatim from the staging ledger under their actual applied versions; their SQL is unchanged. PR #189's competing contract is superseded by this reconciliation. Production rollout needs separate authorization and a baseline/ledger review.

## Automated verification

Run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run wave12:qa`. The CI workflow includes the Wave 12 suite. Run `scripts/sql/w12-05a-invitations-qa.sql` on staging with PostgreSQL privileges after the migration. It creates synthetic identities and tenant fixtures, tests real authenticated-role RPC calls, and rolls back all fixtures and mutations. It sends no email. Assertions cover wrong recipient/unverified identity, tenant isolation, role escalation, approval, additive memberships, lifecycle/idempotency, the active onboarding RPC, privacy, and audit/event uniqueness.

## Owner manual UAT (remaining)

Use two test Institutions with different Program/Cohort scopes, two Employers, and owner-controlled new/existing email accounts. Do not use real recipients for testing.

1. Institution admin invites a new Student to an authorized Cohort. Open the received email, choose a password, accept, finish onboarding. Confirm the canonical Institution and Cohort despite conflicting profile input, private visibility until consent, and the normal Student destination. Repeat the same link: Continue succeeds without duplicate memberships/events.
2. Invite an existing account to another authorized scope and an Employer recruiter role. Accept both emails. Confirm existing roles/profile remain and Employer access uses the intended company.
3. A Program coordinator invites an Instructor to a contained Cohort. Accept and confirm staff access remains pending. Institution approver approves it; then scoped staff access activates. Test rejection and cross-Institution approval denial separately.
4. Create the same invitation twice and replay a small bulk request using stable row keys. Confirm one pending record and no duplicate send. Resend, retry the same request key, and verify cooldown/error feedback. Simulate an SMTP failure using a staging-only configuration change, restore it, and verify retry.
5. Revoke and cancel pending invitations, and use an expired email/invitation. Confirm blocked acceptance. A different signed-in email must not see or accept the recipient record. Test cross-tenant creation/list/resend/revoke and an Employer admin attempting an owner role.
6. Platform admin provisions support/admin; confirm only platform super-admin can invite another super-admin. Validate each destination with the intended role.
7. On desktop and narrow/mobile screens, in light/dark themes, keyboard through each form and action. Check labels, visible focus, disabled busy states, readable status feedback, tables, and errors. Confirm email links survive opening in a different browser and login returns to activation.

Record outcomes on issue #185. Implementation/staging evidence must remain at Verification until this signed-in, email, responsive, keyboard and theme UAT passes.
