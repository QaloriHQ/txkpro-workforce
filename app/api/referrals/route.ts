import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["educator", "admin"]);
    const body = await request.json();
    const studentId = typeof body.studentId === "string" ? body.studentId : "";
    const employerId = typeof body.employerId === "string" ? body.employerId : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : null;
    if (!studentId || !employerId) return Response.json({ error: "studentId and employerId are required." }, { status: 400 });

    const admin = createAdminClient();
    if (auth.role === "educator") {
      const { data: student } = await admin.from("student_profiles").select("program_id").eq("id", studentId).maybeSingle();
      if (!student) return Response.json({ error: "Student not found." }, { status: 404 });
      const { data: membership } = await admin.from("educator_programs").select("id").eq("educator_profile_id", auth.profileId).eq("program_id", student.program_id).maybeSingle();
      if (!membership) return Response.json({ error: "You are not assigned to this student’s program." }, { status: 403 });
    }

    const { data, error } = await admin.from("referrals").insert({
      student_id: studentId,
      employer_id: employerId,
      referred_by_profile_id: auth.profileId,
      note,
      status: "referred",
    }).select("*").single();
    if (error) throw error;

    await audit({ actorProfileId: auth.profileId, action: "referral.created", entityType: "referral", entityId: data.id, newValue: data });
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
