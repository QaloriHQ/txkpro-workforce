import { followCommunityAuthor } from "@/lib/community/repository";
export const dynamic = "force-dynamic";
export async function POST(_request: Request, context: { params: Promise<{ userId: string }> }) {
  try { return Response.json(await followCommunityAuthor((await context.params).userId), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Response ? await error.text() : "The action could not be completed." }, { status: error instanceof Response ? error.status : 503 }); }
}
