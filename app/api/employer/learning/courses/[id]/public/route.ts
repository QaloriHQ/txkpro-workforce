import { getLearningPublicSettings } from "@/lib/employer/learning-repository";
import type { LearningPublicSettingsInput } from "@/lib/employer/learning-types";

async function publicationError(error: unknown) {
  if (error instanceof Response) return Response.json({ error: await error.text() }, { status: error.status });
  return Response.json({ error: "Unable to update public pages. Please try again." }, { status: 500 });
}

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    // RPC validates active canonical Employer Owner/Admin or platform-admin scope.
    return Response.json({ settings: await getLearningPublicSettings(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return publicationError(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 100_000) return Response.json({ error: "Publication settings are too large." }, { status: 413 });
    const { id } = await params;
    const text = await request.text();
    if (text.length > 100_000) return Response.json({ error: "Publication settings are too large." }, { status: 413 });
    let input: LearningPublicSettingsInput;
    try { input = JSON.parse(text); } catch { return Response.json({ error: "Invalid publication settings." }, { status: 400 }); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return Response.json({ error: "Invalid publication settings." }, { status: 400 });
    return Response.json({ settings: await getLearningPublicSettings(id, input) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return publicationError(error); }
}
