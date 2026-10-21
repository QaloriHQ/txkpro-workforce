import "server-only";
import { publicGroupPostIds } from "@/lib/community/public-group-context";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicCommunityComment = { id: string; parentId: string | null; body: string; createdAt: string; authorName: string; authorImageUrl: string | null; authorProfilePath: string | null };
export type PublicCommunityPost = {
  found: boolean; id?: string; postType?: "post"|"article"|"update"|"poll"|"event"; title?: string|null; body?: string; media?: string[];
  topic?: string|null; location?: string|null; publishedAt?: string; updatedAt?: string; canonicalPath?: string;
  robotsIndex?: boolean; robotsFollow?: boolean; authorName?: string; authorImageUrl?: string|null;
  authorProfilePath?: string|null; authorHeadline?: string|null; likeCount?: number; shareCount?: number;
  comments?: PublicCommunityComment[];
};

export const publicCommunityPost = cache(async (postId: string): Promise<PublicCommunityPost> => {
  const { data,error }=await createAdminClient().rpc("community_public_post",{p_post_id:postId});
  if(error) throw new Error("This community post is temporarily unavailable.");
  return (data ?? {found:false}) as PublicCommunityPost;
});

export async function publicCommunitySitemap(): Promise<Array<{path:string;updatedAt:string}>> {
  const {data,error}=await createAdminClient().rpc("community_public_sitemap");
  if(error) throw new Error("Community discovery is temporarily unavailable.");
  return (data ?? []).map((item:{path:string;updated_at:string})=>({path:item.path,updatedAt:item.updated_at}));
}

export async function listPublicArticles(excludeId?: string): Promise<PublicCommunityPost[]> {
  let query = createAdminClient().from("wf_profile_posts").select("profile_post_id")
    .eq("post_type", "article").eq("status", "published").eq("visibility", "public")
    .order("published_at", { ascending: false }).limit(20);
  if (excludeId) query = query.neq("profile_post_id", excludeId);
  const { data, error } = await query;
  if (error) return [];
  // Reuse the canonical anonymous projection; never expose a service-role row.
  const ids = await publicGroupPostIds((data || []).map(row => row.profile_post_id));
  const articles = await Promise.all(ids.map(id => publicCommunityPost(id)));
  return articles.filter(article => article.found && !!article.canonicalPath);
}
