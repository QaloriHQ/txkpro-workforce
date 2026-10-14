# COMM-05 — Direct messaging and request inbox

Issue #269 adds private two-person messaging for active registered Workforce members.

- First contact creates one seven-day request containing the initial message. Acceptance converts it into exactly one canonical message without duplication.
- Recipients may accept, decline, block or report. Decline enforces a 30-day retry cooldown; block prevents contact in either direction until removed.
- Conversations, messages, request previews and private attachments are available only through participant-authorized RPCs and server routes. Canonical tables have RLS enabled and no authenticated direct-table grants.
- Attachments are stored in the private `community-messages` bucket, validated by path, size, MIME metadata and file signature, and streamed with no-store/same-origin headers after participant authorization.
- Messages are immutable. Senders may redact to a tombstone; administrators can remove/restore a specifically reported message through the existing attributable moderation workflow.
- Reports capture only the selected request/message in restricted moderation evidence. No administrator API exposes an unrestricted inbox.
- Message content, filenames and storage paths never enter routine audit metadata, analytics, ad targeting, public rendering, search or sitemap output.
- V1 retains canonical content with deletion tombstones and approved moderation/legal holds. There is no automatic purge.

Production deployment and migration remain separately authorized.
