import {
  canManageInstitutionLearningAssignments,
  requireInstitutionContext,
} from "@/lib/institution/auth";
import {
  assignInstitutionMicroCert,
  listInstitutionMicroCertAssignments,
} from "@/lib/institution/learning-repository";
import type { InstitutionAssignmentInput } from "@/lib/institution/types";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const context = await requireInstitutionContext({
      institutionId: url.searchParams.get("institutionId"),
    });
    const assignments = await listInstitutionMicroCertAssignments(
      context,
      url.searchParams.get("status"),
      url.searchParams.get("microCertId"),
    );
    return Response.json({ assignments });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InstitutionAssignmentInput & {
      institutionId?: string | null;
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
    const result = await assignInstitutionMicroCert(context, body);
    return Response.json({ ok: true, result }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
