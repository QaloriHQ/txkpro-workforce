import {
  canManageInstitutionLearningAssignments,
  requireInstitutionContext,
} from "@/lib/institution/auth";
import { cancelInstitutionMicroCertAssignment } from "@/lib/institution/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ assignmentId: string }> };

export async function DELETE(request: Request, routeContext: RouteContext) {
  try {
    const { assignmentId } = await routeContext.params;
    const body = (await request.json().catch(() => ({}))) as {
      institutionId?: string | null;
      reason?: string | null;
    };
    const context = await requireInstitutionContext({
      institutionId: body.institutionId ?? null,
    });
    if (!canManageInstitutionLearningAssignments(context)) {
      return Response.json(
        { error: "Institution Employer Learning assignment management denied." },
        { status: 403 },
      );
    }
    const assignment = await cancelInstitutionMicroCertAssignment(
      context,
      decodeURIComponent(assignmentId),
      body.reason ?? null,
    );
    return Response.json({ ok: true, assignment });
  } catch (error) {
    return jsonError(error);
  }
}
