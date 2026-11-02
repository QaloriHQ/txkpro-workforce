# TXKPRO Slack team — Issue #378

## Approved operating contract

Maya owns Product & Design: user problems, clear requirements, accessible flows,
acceptance criteria and prioritization recommendations. Devon owns Engineering:
architecture, implementation planning, integration boundaries and scoped execution
handoffs. Riley owns Reliability & QA: independent evidence review, incident
triage, regression assessment and final-acceptance handoff. Each owns the outcome
of assigned work and escalates missing evidence instead of inventing progress.
Their distinct voice guides live in `scripts/slack-team/policy.mjs`.

Use names and role titles in brief conversational paragraphs. Account metadata
identifies automation; direct identity questions receive truthful answers. Never
invent personal history, work performed, or consensus. Peer contributions are
actual separate bounded calls, recorded before the owner responds. Unrelated
messages and passing specialty keywords receive no reply.

Mark approves issue creation and final acceptance. Research, routine coordination,
progress and review within approved scope do not require repeated approval.
Scope expansion returns to Mark. Riley may begin review automatically, but neither
Riley nor the executor can mark work complete without Mark's final acceptance and
the repository's existing protocol evidence gates. Production authorization stays
separate, including during incidents.

## Architecture and boundaries

This extends the established Socket Mode/OpenRouter/Cline deployment rather than
introducing a second agent framework. Node 24 supplies WebSocket and fetch; no
new dependencies are required. A single Socket Mode ingress (Maya's app) receives
channel events. Three separately installed apps provide independently mentionable
identities and post through their own credentials. Delivery is acknowledged only
after routing/queue persistence. Message timestamp + workspace + channel deduplicate
overlapping app_mention/message events. Authentication comes from Slack's private
Socket Mode connection, not caller-supplied HTTP requests.

The service can read bounded GitHub issue context, discuss, stage researched
proposals, create specifically approved issues, and record final acceptance.
It has **no shell/code execution tool, production tool, arbitrary HTTP tool,
Project status mutation, or automatic issue-closing operation**. Discussion text
cannot invoke mutation tools. Existing Cline contracts remain the execution path:
the owner supplies the task's pre-existing validated implementation contract and
invokes the existing executor separately. A thread reply is not a contract.

This initial runtime is not autonomous code execution or automatic completion.
Automatic source discovery beyond explicitly referenced issues and automatic
proposal synthesis are not enabled. Research must be compiled and checked before
staging a proposal, including repository sources beyond what discussion context
can retrieve. Observed routed messages provide bounded working memory; earlier
Slack history is explicitly reported as missing. There is no general private-user
data access. Keep this service in the internal approved channel only.

## Configuration and account verification

Copy `config/slack-team.example.json` to a private path outside Git. It is disabled
and uses zero budgets by default. Set `TXKPRO_TEAM_CONFIG` to that path. Never
commit tokens, private config, state, or participant records.

Use the existing installation's verified `SLACK_ALLOWED_USER_ID` and
`SLACK_TEAM_ID`; the service accepts those environment values as overrides. Do
not select an account by display name. This host's channel directory contained
two similarly named accounts and does not establish which installation owner is
configured. Resolve that mapping from the existing deployment or Mark before
activation. Add the verified owner to `allowedUserIds`, and explicitly list other
permitted participants. Set the three unique app user IDs in `memberIds`.
Startup calls auth.test for every member token and checks user/workspace identity.

Provision apps using the three `config/slack-team-*-manifest.json` files, install
them in the same workspace, and invite them to #all-txkpro. Use Maya's app-level
Socket Mode token with connections:write. Receiver events must include all channel
messages to route role-directed requests that do not @mention Maya. Devon and
Riley do not run separate receivers. The configured channel is public; private
channel support is not enabled by these manifests.

Required runtime environment:

| Variable | Meaning |
| --- | --- |
| SLACK_TEAM_APP_TOKEN | Maya app-level Socket Mode credential |
| SLACK_MAYA_BOT_TOKEN | Maya's installed bot credential |
| SLACK_DEVON_BOT_TOKEN | Devon's installed bot credential |
| SLACK_RILEY_BOT_TOKEN | Riley's installed bot credential |
| SLACK_ALLOWED_USER_ID | Existing verified Mark approval identity |
| SLACK_TEAM_ID | Existing verified workspace |
| GITHUB_TOKEN | Scoped repository issues read/write credential |
| OPENROUTER_API_KEY | Existing provider credential, with provider-side spending limit |
| TXKPRO_TEAM_CONFIG | Private JSON config path |
| TXKPRO_TEAM_STATE_DIR | Durable local volume directory, outside repository |

Set an explicitly approved model and monthly/per-task token limits plus an urgent
incident reserve. Reservations count conservatively and are not automatically
refunded on errors; this avoids retry overspend. Actual returned token counters
are recorded separately. Provider cost is only known when returned; do not infer
dollars from tokens. Set a provider-side dollar cap as an additional spend control.
Missing telemetry halts the job for investigation. No paid provider calls were
made in the implementation tests.

## Cutover and rollback

Stop the existing Cline Slack listener before setting `legacyListenerStopped` and
`enabled` to true. The flag is an operator attestation, not automatic process
detection. Keep the Cline executor and hooks installed; only stop its overlapping
Slack listener. Run `npm run slack-team -- serve` in a supervised Node 24 process
on the Codespace/host with a durable local volume. Do not run this worker inside
an ephemeral Vercel request or concurrently on multiple hosts. A Codespace can
stop; round-the-clock incidents require an always-running supervised host.

On rollback: stop this worker, preserve its private state, and restart the prior
listener only after confirming this one has stopped. No schema migration is
needed. Do not run both listeners against the same channel.

## Research, approval, and acceptance

With the worker stopped, an authorized operator prepares a private JSON proposal
and runs `npm run slack-team -- stage /private/proposal.json`. The exclusive state
lock prevents staging concurrently with service work. Restart afterward. Proposal
fields:

```json
{
  "kind": "proposal",
  "title": "Concrete requested behavior",
  "body": "Scope, roles, implementation plan and testable acceptance criteria",
  "threadTs": "1234567890.123456",
  "findings": {
    "requirements": "Approved requirement and exact source",
    "implementation": "What live repository evidence demonstrates",
    "dependencies": "Verified dependencies or explicitly unresolved items",
    "alternatives": "Options and rationale",
    "risks": "Role/scope, privacy, cost and operational implications",
    "acceptance": "Positive/negative checks and UAT owner"
  },
  "sources": ["https://github.com/QaloriHQ/txkpro-workforce/issues/378"]
}
```

The service checks evidence URLs are accessible repository resources before
presenting the exact revision and its SHA-256 hash. Reachability does not prove
semantic support; the responsible member must verify each finding against its
sources before staging. GitHub's canonical task metadata and dependencies must
be included in real implementation issues per the existing protocol.

Mark replies in that same thread with `approve issue <full hash>`. Display-name
matches, colleagues, unrelated threads, stale revisions and replayed approvals
cannot authorize writes. Edits require a newly staged revision. A new revision
supersedes pending/approved earlier revisions. Approved scope is serialized into
the issue with the sources and immutable approval marker.

For final acceptance, stage `kind: verification` with the same research fields,
the issue number in `issue`, and the reviewed full commit SHA in `commit`. Attach
actual CI, deployment and test evidence in the body/sources. Mark replies
`accept issue <full hash>`. This posts an acceptance audit comment; the existing
protocol checker, independent Chat review and Project transition automation still
run separately. An acceptance comment is not proof of CI or deployment success.

## Availability, incidents, recovery and retention

Daily working hours are 08:00–18:00 America/Chicago, including daylight-saving
changes. Routine replies use configurable 8–20 second pacing by default and queue
outside working hours. Only allowlisted monitoring app IDs with outage/security
incident/data-loss/critical-workflow messages bypass mention/hours checks.
Direct requests can still be queued outside hours; a claimed emergency from an
untrusted sender cannot impersonate a monitoring event. Incidents investigate and
escalate; they do not authorize production mutation.

Capacity acknowledgments vary deterministically and are sent only once per job.
The original request remains queued with an hourly capacity check. No promise of
a fixed completion time or invented personal availability is made.

State uses private file permissions, fsync and atomic replacement, plus an
exclusive single-worker lock. Back it up securely. A crash leaves the lock: verify
the recorded PID is no longer running before removing **only worker.lock**.
Previously running jobs become `uncertain`. GitHub writes use immutable markers;
if a write's response is lost, do not retry automatically. Inspect GitHub for the
marker and Slack for the delivered message; reconcile private state under an
exclusive stopped-worker maintenance window with a backup and audit entry.
Leave unresolved jobs uncertain. A new model request requires a deliberate new
message; do not silently replay uncertain paid work. This favors stopping over
duplicate external writes; it does not claim transactional exactly-once delivery
across Slack, the filesystem and GitHub.

The local volume contains working messages, notes, proposal bodies and audit
metadata. Restrict access to the deployment owner; never commit/upload it. Plan
periodic archival of completed work and approved audit records. Keep unfinished,
uncertain and idempotency records until reconciled; do not automatically delete
them. Retention policy and encrypted backup operations remain deployment duties.

## Pilot and final acceptance checklist

Run `npm run slack-team:qa`, existing confirmation/orchestration regressions,
typecheck, lint and build. With sandbox credentials and an approved budget:

1. Mention each member; address a role; send an unrelated message. Confirm only
   intended participation and one final response owner.
2. Address everyone. Confirm bounded real peer reviews and a consolidated answer.
3. Stage a researched proposal. Reject wrong-person, wrong-thread, edited and
   duplicate approvals. Confirm an approved proposal creates one actual issue.
4. Stage verification. Confirm review does not close the issue and only Mark's
   task-bound acceptance is recorded. Exercise normal protocol gates afterward.
5. Check off-hours queued work and a trusted monitoring incident; exercise budget
   exhaustion and the deferred follow-up. Restart and verify state persists.
6. Simulate lost external responses and duplicate events. Confirm uncertainty
   stops replay and the operator can locate the immutable marker for reconciliation.
7. Demonstrate rollback to one listener. Present actual pilot evidence to Mark.

Project #1 linkage, an Operations view and member fields require supported
Projects access; the #378 exception permits implementation but cannot prove or
create those objects. Do not claim Project configuration, Slack activation,
live pilot success, or issue completion until separately evidenced.
