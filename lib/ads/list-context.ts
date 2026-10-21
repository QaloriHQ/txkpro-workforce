import "server-only";
import { publicGroupPostIds } from "@/lib/community/public-group-context";
import { publicCommunityPost } from "@/lib/community/public-repository";
import type { AdListKind } from "@/lib/ads/list-policy";

// Client counts govern presentation, never permission. Independently establish
// three distinct, public organic records before any direct/provider delivery.
export async function publicAdListContext(kind: AdListKind, ids: string[], contentId: string | null) {
  if (ids.length !== 3 || new Set(ids).size !== 3 || ids.some(id => !id || id.length > 80)) return false;
  if (kind === "comments") {
    if (!contentId) return false;
    if (!(await publicGroupPostIds([contentId])).length) return false;
    const post = await publicCommunityPost(contentId);
    return post.found && ids.every(id => post.comments?.some(comment => comment.id === id));
  }
  if ((await publicGroupPostIds(ids)).length !== 3) return false;
  const posts = await Promise.all(ids.map(id => publicCommunityPost(id)));
  return posts.every(post => post.found && (kind === "posts" || post.postType === kind.slice(0, -1)));
}
