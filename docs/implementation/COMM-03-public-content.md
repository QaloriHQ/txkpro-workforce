# COMM-03 — Public community content

Issue #267 adds a curated anonymous read model and stable `/community/posts/{profile_post_id}` pages. Participation remains signed-in only.

- Public detail rendering requires a published, public canonical item, a published timestamp, and an active author.
- Indexing additionally requires `robots_index` on the item and a public, published, indexable author projection.
- Private-profile authors expose only display name/avatar; no profile link or headline is emitted.
- Draft, unlisted, private, hidden, removed, inactive-author and non-indexable items never enter the sitemap.
- Comments render only through the parent page and have no standalone URL or sitemap record.
- Metadata, Open Graph, JSON-LD and share links use the stable canonical content URL.
- Reads use a server-only service-role client against a bounded RPC. Canonical tables remain unavailable to anonymous direct mutation or unrestricted reads.

Production deployment and migration remain separately authorized.
