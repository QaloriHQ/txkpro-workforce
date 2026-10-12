import { communityComments, createCommunityComment } from "@/lib/community/repository";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function failure(error: unknown) {
  return Response.json(
    { error: error instanceof Response ? await error.text() : "Comments are temporarily unavailable." },
    { status: error instanceof Response ? error.status : 503, headers },
  );
}

export async function GET(_request: Request, context: { params: Promise<{ postId: string }> }) {
  try { return Response.json(await communityComments((await context.params).postId), { headers }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  try {
    const input = await request.json().catch(() => null);
    if (!input || typeof input.body !== "string" || input.body.trim().length < 1 || input.body.length > 2000) {
      return Response.json({ error: "Add a comment of 1–2,000 characters." }, { status: 400, headers });
    }
    const parentId = typeof input.parentId === "string" && input.parentId ? input.parentId : null;
    return Response.json(await createCommunityComment((await context.params).postId, input.body, parentId), { status: 201, headers });
  } catch (error) { return failure(error); }
}
