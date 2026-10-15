import "server-only";
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
