## TXKPRO Protocol PR

### Roadmap
- Task ID:
- Issue:
- Wave:
- Target branch: staging

### Implemented behavior
Describe exactly what changed and what did not change.

### Roles and scopes affected
- Roles:
- Institution / program / cohort / employer / student / platform scope:
- Read access:
- Mutation access:
- Restricted data that remains hidden:

### Authorization and privacy boundaries
- [ ] Role + scope are enforced server-side where required.
- [ ] No user-editable metadata is trusted for authorization.
- [ ] Wrong-role / wrong-scope paths were negatively tested where applicable.
- [ ] Restricted fields are not serialized to unauthorized clients.
- [ ] Sensitive mutations remain attributable/auditable where applicable.

### Canonical data / workflow contract
- Canonical record(s):
- Status transitions:
- Domain events:
- Idempotency / concurrency behavior:
- Provenance / evidence rules:

### Migrations
- Migration required: Yes / No
- Migration file(s):
- Application order:
- Rollback / forward-fix notes:
- Migration ledger verification:

### Verification evidence
- Focused tests:
- Typecheck:
- Lint:
- Production build:
- SQL/API smoke checks:
- Authorization/privacy checks:
- Security/advisor findings:
- Performance/cost review:

### Deployment
- Staging deployment required: Yes / No
- Staging revision:
- Staging deployment state:
- Migrations applied to staging:
- Runtime/log verification:

### Manual UAT remaining
List browser, signed-in, visual, responsive, keyboard/focus, theme, privacy, or observation checks that remain user-owned.

### Known warnings / baseline findings
List pre-existing findings separately from regressions introduced by this PR.

### Protocol completion intent
- [ ] Keep issue open / Project status not yet eligible for Verification or Done.
- [ ] After merge/deploy, evidence should request **Verification**.
- [ ] Acceptance evidence is complete and may later request **Done**.

Do not close the issue manually as proof of Done. Verification/Done transitions must use structured TXKPRO protocol evidence and the repository status-gate automation.

### Production
- [ ] This PR does **not** authorize production deployment or production database migration.
