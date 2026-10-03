import {
  listRetentionCases,
  retentionErrorResponse,
} from "@/lib/retention/repository";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const data = await listRetentionCases({
      institutionId: q.get("institutionId") ?? undefined,
      status: q.get("status") ?? undefined,
      owner: q.get("owner") ?? undefined,
      q: q.get("q") ?? undefined,
      offset: q.get("offset") ?? undefined,
    });
    return Response.json(
      { data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return retentionErrorResponse(error);
  }
}
