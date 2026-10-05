import { professionalSettings } from "@/lib/professional-profile/repository";
import type { Kind } from "@/lib/professional-profile/types";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function kind(request: Request): Kind | null { const v = new URL(request.url).searchParams.get("kind"); return v === "educator" || v === "staff" ? v : null; }
async function failure(error: unknown) { return Response.json({ error: error instanceof Response ? await error.text() : "Profile settings are temporarily unavailable." }, { status: error instanceof Response ? error.status : 503, headers }); }
export async function GET(request: Request) {
  const selected = kind(request); if (!selected) return Response.json({ error: "Choose Educator or Staff." }, { status: 400, headers });
  try { return Response.json(await professionalSettings(selected), { headers }); } catch (error) { return failure(error); }
}
async function write(request: Request, post: boolean) {
  const selected = kind(request); if (!selected) return Response.json({ error: "Choose Educator or Staff." }, { status: 400, headers });
  try { const input = await request.json().catch(() => null); if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(input).length > 16000) return Response.json({ error: "Invalid profile input." }, { status: 400, headers }); return Response.json(await professionalSettings(selected, input, post), { headers }); } catch (error) { return failure(error); }
}
export async function PUT(request: Request) { return write(request, false); }
export async function POST(request: Request) { return write(request, true); }
