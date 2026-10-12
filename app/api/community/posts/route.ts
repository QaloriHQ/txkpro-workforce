import { communityFeed, createCommunityPost } from "@/lib/community/repository";
import type { CommunityFilter, FeedCursor } from "@/lib/community/types";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function failure(error: unknown) {
  return Response.json({ error: error instanceof Response ? await error.text() : "Community is temporarily unavailable." }, { status: error instanceof Response ? error.status : 503, headers });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filter = params.get("filter") || "recent";
  if (!["recent", "following", "nearby", "topic"].includes(filter)) return Response.json({ error: "Invalid feed filter." }, { status: 400, headers });
  let cursor: FeedCursor | null = null;
  const raw = params.get("cursor");
  if (raw) {
    try { cursor = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as FeedCursor; }
    catch { return Response.json({ error: "Invalid feed cursor." }, { status: 400, headers }); }
  }
  try {
    const result = await communityFeed({ filter: filter as CommunityFilter, topic: params.get("topic") || undefined, cursor });
    return Response.json({ ...result, nextCursor: result.nextCursor ? Buffer.from(JSON.stringify(result.nextCursor)).toString("base64url") : null }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(input).length > 20000) return Response.json({ error: "Invalid post input." }, { status: 400, headers });
    return Response.json(await createCommunityPost(input), { status: 201, headers });
  } catch (error) { return failure(error); }
}
