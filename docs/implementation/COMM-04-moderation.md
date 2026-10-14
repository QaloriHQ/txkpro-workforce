# COMM-04 — Community moderation, reports and blocks

Issue #268 implements the owner-approved moderation policy on an isolated staging branch. Production is not authorized.

## Policy contract

- Reports cover canonical posts, comments and member accounts. Direct-message evidence uses the same case contract only after COMM-05 creates the canonical message store; COMM-04 does not create a competing message table.
- A report is evidence intake, not proof. Raw report counts cannot independently remove content or suspend a member.
- Objective high-confidence spam/scam patterns may quarantine content automatically. A documented repeat upheld pattern may add a seven-day posting restriction.
- Threat, privacy, illegal, unsafe, harassment, hate and impersonation reports enter the priority queue. Permanent suspension requires Super Admin authorization.
- Other low-evidence reports remain monitored and can be re-evaluated as independent evidence arrives.
- Mute hides a member from the viewer. Block denies community interaction in both directions and clears follows.
- Content removal is reversible state (`hidden`/`removed`), not hard deletion. Evidence and decisions remain auditable.
- Every restriction is appealable. Suspended members retain an appeal-only route. Appeal decisions preserve the original record and add a reversal/upheld event.

## Data and privacy

Canonical case, report, action, appeal, block and timed-restriction records use RLS with no direct authenticated table mutation. All writes cross guarded RPCs. Evidence snapshots are stored in `security.wf_community_moderation_evidence`, outside the exposed API schema. Report text, raw evidence, private-message content and identities must never be sent to Mixpanel or other behavioral analytics.

## Admin workflow

`/admin/moderation` separates the priority queue, all cases and automated activity. Administrators see bounded evidence excerpts, severity, report count, policy state and prior outcome. Decisions require a rationale. Timed restrictions have explicit expiry; indefinite suspension requires Super Admin.

## Manual UAT

1. Submit post, comment and account reports with each reason; verify self-report and invalid targets fail.
2. Verify objective spam is quarantined, ambiguous volume alone is not, and high-risk reasons enter Priority queue.
3. Mute and block two test members; confirm both feed suppression and block bypass denial for like/comment/share/follow.
4. Apply dismiss, hide/remove, timed restriction, escalation and Super Admin suspension; verify audit attribution and expiry.
5. Appeal a content/account action and resolve upheld/reversed. Confirm a suspended member reaches only the appeal surface.
6. Verify mobile/desktop, light/dark, keyboard focus, modal close, empty/error/loading states and no raw evidence in analytics/log output.
