import { requireEmployerContext } from "@/lib/employer/auth";
import { requestInterview } from "@/lib/employer/hiring-repository";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as {
      studentId?: string;
      hiringNeedId?: string | null;
      referralId?: string | null;
      roleTitle?: string | null;
      tradeId?: string | null;
      message?: string | null;
      schedulingUrl?: string | null;
    };

    const studentId =
      typeof body.studentId === "string" ? body.studentId.trim() : "";
    if (!studentId) {
      return Response.json({ error: "studentId is required." }, { status: 400 });
    }

    const result = await requestInterview(context, {
      studentId,
      hiringNeedId:
        typeof body.hiringNeedId === "string" ? body.hiringNeedId.trim() : null,
      referralId:
        typeof body.referralId === "string" ? body.referralId.trim() : null,
      roleTitle:
        typeof body.roleTitle === "string" ? body.roleTitle.trim() : null,
      tradeId: typeof body.tradeId === "string" ? body.tradeId.trim() : null,
      message: typeof body.message === "string" ? body.message.trim() : null,
      schedulingUrl:
        typeof body.schedulingUrl === "string"
          ? body.schedulingUrl.trim()
          : null,
    });

    return Response.json({ ok: true, interview: result }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
