import { setCommunityBlock } from "@/lib/community/moderation-repository";
import { jsonError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!["mute", "block", "none"].includes(body.mode)) return Response.json({ error: "Invalid member preference." }, { status: 400 });
    return Response.json(await setCommunityBlock((await context.params).userId, body.mode));
  } catch (error) { return jsonError(error); }
}
