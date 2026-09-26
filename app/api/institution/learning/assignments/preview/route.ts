import { requireInstitutionContext } from "@/lib/institution/auth";
import { previewInstitutionMicroCertAssignment } from "@/lib/institution/learning-repository";
import type { InstitutionAssignmentInput } from "@/lib/institution/types";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InstitutionAssignmentInput & {
      institutionId?: string | null;
    };
    const context = await requireInstitutionContext({
      institutionId: body.institutionId ?? null,
    });
    const preview = await previewInstitutionMicroCertAssignment(context, body);
    return Response.json({ preview });
  } catch (error) {
    return jsonError(error);
  }
}
