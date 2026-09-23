import { requireEmployerContext } from "@/lib/employer/auth";
import { addEmployerPrivateNote } from "@/lib/employer/workflow-repository";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ studentId: string }> };

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { studentId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as {
      note?: string;
      referralId?: string | null;
    };

    const note = await addEmployerPrivateNote(context, {
      studentId: decodeURIComponent(studentId),
      referralId:
        typeof body.referralId === "string" ? body.referralId : null,
      note: typeof body.note === "string" ? body.note : "",
    });

    return Response.json({ ok: true, note }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
