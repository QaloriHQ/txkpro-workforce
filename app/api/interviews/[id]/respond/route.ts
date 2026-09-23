import { jsonError } from "@/lib/http";
import { requireStudentContext } from "@/lib/student/auth";
import { respondToInterview } from "@/lib/student/workflow-repository";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    await requireStudentContext();
    const { id } = await routeContext.params;
    const body = (await request.json()) as {
      response?: string;
      note?: string | null;
    };

    const response =
      typeof body.response === "string" ? body.response.toLowerCase() : "";
    if (!["accepted", "declined", "scheduling"].includes(response)) {
      return Response.json(
        { error: "Response must be accepted, declined, or scheduling." },
        { status: 400 },
      );
    }

    const result = await respondToInterview({
      interviewRequestId: decodeURIComponent(id),
      response: response as "accepted" | "declined" | "scheduling",
      note: typeof body.note === "string" ? body.note.trim() : null,
    });

    return Response.json({ ok: true, interview: result });
  } catch (error) {
    return jsonError(error);
  }
}
