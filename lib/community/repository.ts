import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CommunityComment, CommunityFeedResult, CommunityFilter, FeedCursor } from "@/lib/community/types";

function message(error: { message?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.message?.includes("COMMUNITY_ACCESS_DENIED")) return "Your Workforce community access is not active.";
  if (error.message?.includes("PUBLIC_ACKNOWLEDGEMENT_REQUIRED")) return "Confirm that this public post may appear on TXKPRO and search engines.";
  if (error.message?.includes("INVALID_")) return "Check the information you entered and try again.";
  return fallback;
}

export async function communityFeed(input: { filter: CommunityFilter; topic?: string; cursor?: FeedCursor | null }) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_feed", {
    p_filter: input.filter,
    p_topic: input.topic || null,
    p_before: input.cursor?.published_at || null,
    p_before_id: input.cursor?.profile_post_id || null,
    p_limit: 20,
  });
  if (error) throw new Response(message(error, "The community feed is temporarily unavailable."), { status: 503 });
  return data as CommunityFeedResult;
}

export async function createCommunityPost(input: Record<string, unknown>) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_post_create", { p_input: input });
  if (error) throw new Response(message(error, "The post could not be published."), { status: 400 });
  return data as { id: string };
}

export async function communityToggle(name: "community_like_toggle" | "community_save_toggle", postId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(name, { p_post_id: postId });
  if (error) throw new Response(message(error, "The action could not be completed."), { status: 400 });
  return data as { active: boolean; count?: number };
}

export async function communityComments(postId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_comments", { p_post_id: postId, p_limit: 50 });
  if (error) throw new Response(message(error, "Comments could not be loaded."), { status: 400 });
  return (data ?? []) as CommunityComment[];
}

export async function createCommunityComment(postId: string, body: string, parentId: string | null) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_comment_create", {
    p_post_id: postId, p_body: body, p_parent_comment_id: parentId,
  });
  if (error) throw new Response(message(error, "The comment could not be published."), { status: 400 });
  return data as { id: string; parentId: string | null; body: string; createdAt: string };
}

export async function toggleCommunityShare(postId: string, shareType: "share" | "repost", commentary?: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_share_toggle", {
    p_post_id: postId, p_share_type: shareType, p_commentary: commentary || null,
  });
  if (error) throw new Response(message(error, "The share action could not be completed."), { status: 400 });
  return data as { active: boolean; shareType: "share" | "repost"; count: number };
}

export async function followCommunityAuthor(userId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_follow_toggle", { p_followed_user_id: userId });
  if (error) throw new Response(message(error, "The follow action could not be completed."), { status: 400 });
  return data as { active: boolean };
}

export async function updateCommunityLocation(location: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_preferences_update", { p_nearby_location: location });
  if (error) throw new Response(message(error, "Your nearby location could not be updated."), { status: 400 });
  return data as { nearbyLocation: string | null };
}

export async function reportCommunityPost(postId: string, reason: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_report_post", { p_post_id: postId, p_reason: reason });
  if (error) throw new Response(message(error, "The report could not be submitted."), { status: 400 });
  return data as { reported: boolean; reportId: string };
}
