# WAVE 7 — Production Integration

Wave 7 connects the Employer foundation to the existing TXKPRO Supabase backend. It is intentionally additive: existing Workforce and contractor tables remain authoritative where they already represent the canonical domain.

## 43. Supabase schema reconciliation

| Canonical domain | Existing production source | Wave 7 decision |
| --- | --- | --- |
| Auth identity | Supabase Auth + `public.users.auth_user_id` | Reuse |
| Shared role membership | `public.app_role_memberships` | Reuse + add canonical Employer aliases |
| Workforce role bridge | `public.wf_role_memberships` | Reuse + canonical Employer scope synchronization |
| Employer identity / approval | `public.contractors` | Reuse; approval remains TXKPRO-controlled |
| Employer Workforce profile | `public.wf_contractor_profiles` | Reuse + extend profile fields |
| Onboarding progress | `public.wf_onboarding_accounts` | Reuse + canonical statuses + Employer link |
| Hiring Needs | No canonical table existed | Create `public.wf_hiring_needs` |
| Legacy job listings | `public.wf_jobs` | Keep separate; Hiring Need is not a public job post |
| Platform audit | `public.platform_audit_events` | Reuse + canonical audit fields |
| Shared domain event stream | No canonical table existed | Create append-only `public.wf_domain_events` |
| Browser Employer demo state | `/demo/employer` + `lib/demo-data.ts` | Production dashboard now routes to `/employer` |

No Wave 7 migration creates a competing user, Employer, job-listing, or audit system.

## 44. Employer authentication + membership resolution

Supabase Auth verifies identity. Employer authority comes from active `app_role_memberships` rows with Employer/contractor scope. Canonical roles are:

- `employer_owner`
- `employer_admin`
- `recruiter`
- `hiring_manager`
- `employer_read_only`

Legacy `contractor_owner` and `contractor_recruiter` remain readable during migration and are mapped to canonical roles. New onboarding creates canonical `employer_owner` membership.

`lib/employer/auth.ts` resolves the current Employer tenant and role server-side. Hostnames and user-editable metadata are not authorization inputs.

## 45. RLS / authorization policies

Wave 7 adds Employer-aware helpers in the non-exposed `security` schema and RLS policies for Company Profile and Hiring Needs.

Important rules:

- cross-Employer access is denied by default;
- Owner/Admin may edit Company Profile;
- approval/account state remains TXKPRO-controlled;
- Owner/Admin/Recruiter may create Hiring Needs after Employer approval;
- assigned Hiring Manager may update only its scoped Hiring Need;
- Read-Only cannot mutate Hiring Needs;
- Hiring Need delete is Owner/Admin only;
- service-role-only domain-event RPC is not executable by anon/authenticated clients.

Application handlers also perform role/approval checks before issuing RLS-backed writes.

## 46. Employer onboarding persistence

`wf_onboarding_accounts` now supports the complete canonical status vocabulary:

`not_started → in_progress → pending_review → complete`

Exception states: `blocked`, `cancelled`.

Employer onboarding stores `employer_id`. New Employer onboarding creates canonical Employer membership and remains `pending_review` until `contractors.approval_status = approved`.

The Employer approval trigger completes linked onboarding records and emits `EMPLOYER_APPROVED`.

## 47. Company Profile persistence

The existing `wf_contractor_profiles` record remains the Workforce Employer profile. Wave 7 adds:

- service area;
- hiring role types;
- annual hiring volume;
- hiring horizon;
- Workforce description;
- profile metadata/version;
- last updating user.

`lib/employer/repository.ts` uses the signed-in Supabase session so database RLS remains part of the authorization decision.

## 48. Hiring Needs persistence

`wf_hiring_needs` stores structured Employer demand and explicit filtering/referral criteria. It is deliberately separate from `wf_jobs`.

The schema supports role/trade, target hires/date, service area, work type, shift, program/graduation criteria, required/optional verified skills, minimum verified-skill count, driver/screening requirements, assignment ownership, visibility, lifecycle status, and optimistic versioning.

Hiring Need status:

- `draft`
- `active`
- `paused`
- `closed`

## 49. Shared status/event infrastructure

`wf_domain_events` is append-only. State tables remain canonical; notifications are consequences rather than competing workflow state.

Hiring Need writes automatically emit:

- `HIRING_NEED_CREATED`
- `HIRING_NEED_UPDATED`
- `HIRING_NEED_STATUS_CHANGED`

Employer approval emits `EMPLOYER_APPROVED`.

A server-only RPC bridge, `wf_emit_event`, is executable only by service-role/server workflows.

## 50. Audit event infrastructure

`platform_audit_events` now includes canonical scope/result/correlation/before/after fields while preserving its existing `action/entity_*` API.

`lib/audit.ts` now writes to `platform_audit_events`, replacing the older generic `audit_log` target for Workforce application audit writes.

## 51. Persistent Employer repository

The production repository did not contain localStorage; the standalone Waves 1–6 HTML prototype did. The Next.js Employer demo used static `lib/demo-data.ts`.

Wave 7 replaces that production path with:

- `lib/employer/auth.ts`
- `lib/employer/repository.ts`
- `/api/employer/context`
- `/api/employer/company`
- `/api/employer/hiring-needs`
- `/api/employer/hiring-needs/[id]`
- `/employer`

The authenticated dashboard now sends Employer users to `/employer`; `/demo/employer` remains only as a prototype reference.

## 52. Production seed data + smoke tests

Wave 7 creates two draft Hiring Needs only in the clearly synthetic Acme Company tenant. The seed is idempotent and does not create Auth users, send notifications, publish jobs, or initiate hiring actions.

Run:

```bash
npm run wave7:smoke
```

The smoke test checks:

- Wave 7 Hiring Need seed;
- domain-event emission;
- audit-event emission;
- canonical Employer membership availability;
- Company Profile persistence columns;
- onboarding Employer linkage;
- anonymous Hiring Need access denied by RLS.

## Production safety

Wave 7 does not depend on client-side role selection. It does not use a branded hostname as authorization. It does not expose raw MVR/background/drug/medical data. It does not combine readiness evidence into an employability score.

The next integration increment should wire Talent/Referral/Interview/Placement/Retention read models to the same shared backend and event model rather than introducing parallel state.


## Admin approval workspace

Platform Admin accounts do not use Student/Educator/Employer onboarding. After normal Supabase Auth sign-in, active platform-level `super_admin`, `admin`, or `platform_admin` membership routes directly to `/admin`.

The production Admin workspace lists pending Employer submissions and allows an authorized platform admin to approve or reject them. Approval updates the canonical Employer state, completes linked Employer onboarding through the existing database trigger, and records an audit event. Rejection moves linked onboarding to `blocked`.

Mobile sign-out uses a POST followed by an HTTP 303 redirect to `/login`, avoiding Safari's ambiguous POST/302 navigation behavior.
