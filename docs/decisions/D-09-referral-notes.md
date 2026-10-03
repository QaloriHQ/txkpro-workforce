# D-09 - Referral note content

Decision: **Referral notes are employer-visible professional context only.**

Allowed referral-note content:

- Verified skill context, training evidence, and work-readiness observations.
- Program, cohort, availability, shift, travel, and employer-fit context the student has made referral-visible.
- Neutral handoff context needed for the employer to evaluate the referral.

Disallowed referral-note content:

- Employer-private interview notes or evaluations.
- Institution-private educator notes, retention case notes, discipline notes, or safety concerns.
- Protected-class, medical, disability, accommodation, criminal, drug-screen, family, financial, immigration, or other regulated/sensitive personal information.
- Direct contact details, credentials, passwords, assessment answers, or answer keys.

Implementation guardrails:

- Referral-note validation runs before the referral RPC is called and again inside the database function.
- Stored shared notes are trimmed, length-limited, tagged as `institution_shared_referral_note_v1`, and visible to the receiving employer.
- Rejected note attempts fail the referral creation; callers must edit the note or omit it.
- Employer-private notes remain in `wf_employer_candidate_notes` and never become Institution/Student data.

This resolves the PRD section 18 open question: "What content is allowed in referral notes?"
