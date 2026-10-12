import { communityToggle, reportCommunityPost, toggleCommunityShare } from "@/lib/community/repository";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request, context: { params: Promise<{ postId: string; action: string }> }) {
  const { postId, action } = await context.params;
  try {
    if (action === "like" || action === "save") return Response.json(await communityToggle(action === "like" ? "community_like_toggle" : "community_save_toggle", postId), { headers });
    if (action === "share" || action === "repost") {
      const input = await request.json().catch(() => ({}));
      return Response.json(await toggleCommunityShare(postId, action, typeof input.commentary === "string" ? input.commentary : undefined), { headers });
    }
    if (action === "report") {
      const input = await request.json().catch(() => ({}));
      return Response.json(await reportCommunityPost(postId, typeof input.reason === "string" ? input.reason : "other"), { headers });
    }
    return Response.json({ error: "Unknown community action." }, { status: 404, headers });
  } catch (error) {
    return Response.json({ error: error instanceof Response ? await error.text() : "The action could not be completed." }, { status: error instanceof Response ? error.status : 503, headers });
  }
}
