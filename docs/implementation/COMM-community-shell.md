# Community shell integration

## Outcome

- Community Home is role-native at `/student/community`, `/institution/community`, and `/employer/community`.
- Workspace and Community navigation remain separate, with an explicit mode switch in both directions.
- The avatar opens the Community profile drawer containing Community navigation, profile/AuthCard access, appearance, and sign out.
- The dedicated Create action supports posts, articles, events, and polls.
- Employer and Institution Community content is always attributed to the authenticated individual account.

## Authorization and data

The shared server page resolves the authenticated account before rendering and redirects a mismatched role route to its canonical Community Home. This UI release adds no schema or migration. Existing Community repositories continue to resolve the actor from the authenticated user rather than an organization identity.

## Release boundary

Target `staging` only. Production deployment and production database migration are outside this change.
