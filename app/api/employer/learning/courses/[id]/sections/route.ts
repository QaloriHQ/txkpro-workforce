import { requireEmployerContext } from "@/lib/employer/auth";
import { createEmployerLearningSection } from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      required?: boolean;
    };
    const course = await createEmployerLearningSection(
      context,
      decodeURIComponent(id),
      {
        title: String(body.title ?? "").trim(),
        description: body.description ?? null,
        required: body.required ?? true,
      },
    );
    return Response.json({ ok: true, course }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
