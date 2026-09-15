# TXKPRO Workforce — MVE Architecture

## Product loop

Student self-attests skill → educator verifies skill → educator refers student → employer reviews verified profile + job-readiness attestations → employer hires → placement starts → TXKPRO checks both sides at 30/60/90 days → issues become human follow-up cases.

## Trust boundaries

- Browser state is never treated as authorization.
- Supabase Auth establishes identity.
- `profiles.role` is server-owned application data.
- Next.js route handlers call `requireRole()` before using the service-role client.
- Students may self-attest a skill, but cannot create or overwrite `verified` status.
- Educators may verify/refer only students in programs listed in `educator_programs`.
- Employer filters only use job-relevant MVE fields: verified competencies, license attestation, driving-record attestation, screening willingness, shift/work preferences.
- No protected-class fields are collected for matching.
- Job-readiness fields are labeled attestations unless a future third-party verification integration explicitly changes that status.
- Audit events record material changes.

## Core tables

`profiles` — authenticated person + role

`schools`, `programs`, `educator_programs` — training network and educator scope

`student_profiles` — workforce student record

`skills`, `program_skills`, `student_skills` — verified skills matrix

`job_readiness_profiles` — non-technical work-readiness attestations/preferences

`employer_profiles` — approved workforce employers

`referrals` — educator → employer handoff

`placements` — hire record that begins retention lifecycle

`retention_pulses` — 30/60/90-day student/employer SMS record

`retention_cases` — human intervention queue when either side responds `3`

`audit_log` — material system actions

## SMS behavior

The scheduler creates at most one student pulse and one employer pulse per placement milestone. Sending requires an SMS consent timestamp and phone number. Incoming Twilio webhook requests are signature-validated. A reply beginning with `1`, `2`, or `3` is attached to the newest open pulse for that phone number. A `3` opens a high-priority retention case.

## Next MVE increments

1. Replace demo dashboard reads with server-fetched records.
2. Add admin invitation/user provisioning.
3. Add employer requirement templates and saved talent searches.
4. Add educator bulk verification and competency evidence notes.
5. Add student document uploads for licenses/certificates.
6. Add placement conversion from a referral.
7. Add retention-case owner, notes, and resolution UI.
