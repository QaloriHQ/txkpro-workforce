import { studentPublicSettings } from "@/lib/student-public-profile/repository";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function failure(error: unknown) {
  return Response.json({ error: error instanceof Response ? await error.text() : "Profile settings are temporarily unavailable." }, { status: error instanceof Response ? error.status : 503, headers });
}
export async function GET() {
  try { return Response.json(await studentPublicSettings(), { headers }); } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(input).length > 8000) return Response.json({ error: "Invalid profile settings." }, { status: 400, headers });
    return Response.json(await studentPublicSettings(input), { headers });
  } catch (error) { return failure(error); }
}
