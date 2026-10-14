# COMM-07 community groups

Implements registered Workforce public/private groups, public open/approval joining, private invite-only visibility, admin/moderator/member roles, a scoped group feed, and auditable member/content moderation.

Private groups are omitted from discovery. Direct table access is revoked and every mutation resolves the active Workforce actor server-side. Public group posts are intentionally `unlisted` so they appear only inside their group; private group posts remain `private`. Group roles do not grant Institution, Employer, or platform authority.

Migration: `20261014130000_workforce_comm_07_groups.sql`. Browser, responsive, keyboard, theme, and signed-in wrong-role checks remain owner UAT after staging deployment.
