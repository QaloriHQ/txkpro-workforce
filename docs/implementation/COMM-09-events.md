# COMM-09 event posts and RSVP

Events reuse canonical community posts and add an event record with UTC instants plus an IANA timezone. Public projections expose event details and aggregate RSVP counts, never attendee identities or online meeting URLs. Authenticated group access follows canonical active membership.

RSVP values are `interested`, `going`, and `not_going`. One mutable RSVP row exists per member/event; repeated writes are idempotent. The first qualifying RSVP timestamp is retained for COMM-10, while withdrawal and restoration reuse the same logical identity. Cancellation is creator-only, idempotent, remains visibly cancelled, and emits `EVENT_CANCELLED` for downstream reversal.

Migration: `20261015003226_workforce_comm_09_events.sql`.
