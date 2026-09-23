import { requireEmployerContext } from "@/lib/employer/auth";
import {
  completeInterview,
  scheduleInterview,
} from "@/lib/employer/hiring-repository";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const context = await requireEmployerContext({ approved: true });
    const { id } = await routeContext.params;
    const interviewRequestId = decodeURIComponent(id);
    const body = (await request.json()) as {
      action?: string;
      scheduledFor?: string;
      format?: string;
      locationDetail?: string | null;
    };

    if (body.action === "complete") {
      const result = await completeInterview(context, interviewRequestId);
      return Response.json({ ok: true, interview: result });
    }

    if (body.action === "schedule") {
      const scheduledFor =
        typeof body.scheduledFor === "string" ? body.scheduledFor.trim() : "";
      const format = typeof body.format === "string" ? body.format.trim() : "";
      if (!scheduledFor || !format) {
        return Response.json(
          { error: "scheduledFor and format are required." },
          { status: 400 },
        );
      }
      const result = await scheduleInterview(context, {
        interviewRequestId,
        scheduledFor,
        format,
        locationDetail:
          typeof body.locationDetail === "string"
            ? body.locationDetail.trim()
            : null,
      });
      return Response.json({ ok: true, interview: result });
    }

    return Response.json({ error: "Invalid Interview action." }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
