# COMM-08 aggregate-only polls

Polls reuse canonical community posts and support two to ten options, single or creator-bounded multiple selection, and durations from one hour through 30 days (default UI: three days). One immutable ballot exists per voter. Results expose aggregate option counts only after the viewer votes or the poll closes; individual selections have no client grants and never enter audit metadata.

Question/options/mode have no mutation API after publication. Close/cancel is creator-only and audited. Migration: `20261014170000_workforce_comm_08_polls.sql`.
