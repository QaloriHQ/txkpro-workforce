import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
// Public post visibility alone does not authorize private group context.
export async function publicGroupPostIds(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const admin = createAdminClient();
  const { data: audiences, error } = await admin.from("wf_community_post_audiences")
    .select("profile_post_id,group_id").in("profile_post_id", ids);
  if (error) return [];
  const groupIds = [...new Set((audiences || []).map(row => row.group_id).filter(Boolean))];
  if (!groupIds.length) return ids;
  const { data: groups, error: groupError } = await admin.from("wf_community_groups")
    .select("group_id").in("group_id", groupIds).eq("visibility", "public").eq("status", "active");
  if (groupError) return [];
  const allowed = new Set((groups || []).map(group => group.group_id));
  return ids.filter(id => !(audiences || []).some(row => row.profile_post_id === id && row.group_id && !allowed.has(row.group_id)));
}
