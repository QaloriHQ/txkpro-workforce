# D-05 - Referral consent

Decision: **Explicit student approval is required before an Institution user can send an employer referral.**

Implementation guardrails:

- Referral creation must be blocked unless the student has an active referral visibility/consent grant.
- A student-controlled employer-discoverable profile setting can satisfy consent for the MVP1 compatibility path.
- A dedicated `wf_student_referral_consents` row can also satisfy consent when later student-facing controls capture referral-specific approval.
- Institution users cannot bypass consent by calling the referral RPC directly.
- Consent source, status, and checked timestamp are stored on the referral for auditability.
- Consent only allows referral visibility; it does not grant access to Employer-private hiring notes, interview evaluations, or Institution-private case notes.

This resolves the PRD section 18 open question: "Is explicit student approval required before instructor referral?"
