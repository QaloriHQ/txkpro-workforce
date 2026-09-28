# W11-15 staging security and UX gate

Run `npm install`, `npm run typecheck`, `npm run wave11:qa`, `npm run lint`, and
`npm run build` in CI. Against **staging only**, execute
`scripts/wave11-security-qa.sql` as a privileged SQL operator. It is wrapped in
`BEGIN`/`ROLLBACK`; never remove the rollback or use production fixtures.

The database script asserts that:

- anonymous/authenticated direct access to assessment keys, assignments,
  certifications, exposure, and referrals is closed;
- the public credential RPC is not directly executable by anonymous users;
- its output is curated, retains `employer_training` and
  `technicalSkillVerified=false`, and hides unpublished records;
- Student, Instructor, read-only Employer, and cross-Employer negative access
  checks reject authoring, answer keys, assignment creation, referrals, or
  another person's exposure as appropriate;
- assessment preview and module read models omit answer keys.

The SQL test temporarily changes the staging Employer demo membership and
public credential publication state, then rolls back. After it completes,
verify those fixtures are unchanged. `npm run wave11:qa` guards server secret
normalization and prevents credential material appearing in configuration
errors. The credential route also suppresses provider error text, which may
otherwise contain request headers.

Before closing the issue, verify a READY deployment whose commit matches
`staging`, the `staging-workforce.txkpro.com` alias, and the Vercel runtime-error
scan. Check the canonical credential page, invalid ID (404), old slug (308),
robots/canonical/JSON-LD, and public API for private identifiers. Because
staging has Vercel Authentication, use an authorized protected-deployment
session; an SSO redirect is **not** a successful route test.

Visual acceptance still requires signed-in Student, Institution, and Employer
sessions at 375px and desktop widths in light and dark themes: keyboard focus
order, labels, contrast, no horizontal overflow, Employer Learning authoring,
assignment, Student training, referrals, and credential status states. Do not
use or assume demo passwords from previous chats. An inaccessible sign-in or
deployment protection is a release blocker, not a pass.

Supabase advisor baseline at 2026-09-28: 48 RLS/no-policy notices are expected
for service-only tables; 113 authenticated security-definer warnings require
scope-aware review, not blanket revocation. Leaked-password protection is a
project-setting warning. Performance advisors noted unused and duplicate
indexes; no schema changes were made in this QA patch.
