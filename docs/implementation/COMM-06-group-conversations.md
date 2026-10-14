# COMM-06 group conversations

Group conversations are linked one-to-one to canonical community groups and inherit current active membership. New members see messages only from their membership start time; leaving, removal, or banning immediately removes access. Private invitations expire after seven days. Message bodies remain out of ordinary audit/analytics data, attachments retain participant authorization, and sends are retry-safe through existing client keys.

The Groups UI opens chat and supports leave; the Messages inbox combines direct and group conversations. Muting is exposed through a participant-authorized API. Migration `20261014150000_workforce_comm_06_group_conversations.sql` is additive and requires COMM-07 first.
