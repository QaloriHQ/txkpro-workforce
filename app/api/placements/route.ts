import { requireEmployerContext } from "@/lib/employer/auth";
import { recordHire } from "@/lib/employer/hiring-repository";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as {
      interviewRequestId?: string;
      roleTitle?: string;
      tradeId?: string | null;
      hireDate?: string;
      employmentType?: string | null;
    };

    const interviewRequestId =
      typeof body.interviewRequestId === "string"
        ? body.interviewRequestId.trim()
        : "";
    const roleTitle =
      typeof body.roleTitle === "string" ? body.roleTitle.trim() : "";
    const hireDate =
      typeof body.hireDate === "string" ? body.hireDate.trim() : "";

    if (!interviewRequestId || !roleTitle || !hireDate) {
      return Response.json(
        { error: "interviewRequestId, roleTitle, and hireDate are required." },
        { status: 400 },
      );
    }

    const result = await recordHire(context, {
      interviewRequestId,
      roleTitle,
      tradeId: typeof body.tradeId === "string" ? body.tradeId.trim() : null,
      hireDate,
      employmentType:
        typeof body.employmentType === "string"
          ? body.employmentType.trim()
          : null,
    });

    return Response.json({ ok: true, placement: result }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
