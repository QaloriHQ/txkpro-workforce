import { getInstitutionContext } from "@/lib/institution/auth";
import { createInstitutionReferral } from "@/lib/institution/learning-repository";
import { institutionCanManage } from "@/lib/institution/policy";
import { jsonError } from "@/lib/http";
import { validateReferralNotePolicy } from "@/lib/referrals/policy";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      institutionId?: string;
      studentId?: string;
      employerId?: string;
      hiringNeedId?: string | null;
      note?: string | null;
    };

    const institutionId =
      typeof body.institutionId === "string" ? body.institutionId.trim() : "";
    const studentId =
      typeof body.studentId === "string" ? body.studentId.trim() : "";
    const employerId =
      typeof body.employerId === "string" ? body.employerId.trim() : "";
    const hiringNeedId =
      typeof body.hiringNeedId === "string" && body.hiringNeedId.trim()
        ? body.hiringNeedId.trim()
        : null;

    if (!institutionId || !studentId || !employerId) {
      return Response.json(
        { error: "institutionId, studentId, and employerId are required." },
        { status: 400 },
      );
    }

    const context = await getInstitutionContext(institutionId);
    if (!context || context.institutionId !== institutionId) {
      return Response.json(
        { error: "Institution membership required." },
        { status: 403 },
      );
    }
    if (!institutionCanManage(context, "referrals")) {
      return Response.json(
        { error: "Institution referral permission required." },
        { status: 403 },
      );
    }

    const referralNote = validateReferralNotePolicy(body.note);
    const data = await createInstitutionReferral(context, {
      studentId,
      employerId,
      hiringNeedId,
      note: referralNote.note,
    });

    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
