import { requireEmployerContext } from "@/lib/employer/auth";
import { saveInterviewEvaluation } from "@/lib/employer/hiring-repository";
import type { InterviewEvaluation } from "@/lib/employer/types";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, routeContext: RouteContext) {
  try {
    const context = await requireEmployerContext({ approved: true });
    const { id } = await routeContext.params;
    const body = (await request.json()) as {
      nextStep?: string;
      summary?: string | null;
    };

    const nextStep =
      typeof body.nextStep === "string" ? body.nextStep.toLowerCase() : "not_set";
    if (
      !["not_set", "continue", "hold", "close", "prepare_hire"].includes(
        nextStep,
      )
    ) {
      return Response.json(
        { error: "Invalid evaluation next step." },
        { status: 400 },
      );
    }

    const result = await saveInterviewEvaluation(context, {
      interviewRequestId: decodeURIComponent(id),
      nextStep: nextStep as InterviewEvaluation["nextStep"],
      summary:
        typeof body.summary === "string" ? body.summary.trim() : null,
    });

    return Response.json({ ok: true, evaluation: result });
  } catch (error) {
    return jsonError(error);
  }
}
