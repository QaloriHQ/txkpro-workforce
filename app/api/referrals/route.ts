import { requireRole } from "@/lib/auth";
import { getEmployerContext } from "@/lib/employer/auth";
import { listReferrals } from "@/lib/employer/workflow-repository";
import { jsonError } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const context = await getEmployerContext(url.searchParams.get("employerId"));
    if (!context) {
      return Response.json({ error: "Employer membership required." }, { status: 403 });
    }
    if (context.approvalStatus !== "approved") {
      return Response.json({ error: "Employer approval required." }, { status: 403 });
    }
    const status = url.searchParams.get("status");
    return Response.json({ referrals: await listReferrals(context, status) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(["educator", "admin"]);
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

    if (!institutionId || !studentId || !employerId) {
      return Response.json(
        { error: "institutionId, studentId, and employerId are required." },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("institution_create_referral", {
      p_institution_id: institutionId,
      p_student_id: studentId,
      p_employer_id: employerId,
      p_hiring_need_id:
        typeof body.hiringNeedId === "string" ? body.hiringNeedId : null,
      p_note: typeof body.note === "string" ? body.note.trim().slice(0, 2000) : null,
    });
    if (error) throw error;

    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
