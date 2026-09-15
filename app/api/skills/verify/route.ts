import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["educator", "admin"]);
    const body = await request.json();
    const studentId = typeof body.studentId === "string" ? body.studentId : "";
    const skillId = typeof body.skillId === "string" ? body.skillId : "";
    if (!studentId || !skillId) return Response.json({ error: "studentId and skillId are required." }, { status: 400 });

    const admin = createAdminClient();
    if (auth.role === "educator") {
      const { data: student } = await admin.from("student_profiles").select("program_id").eq("id", studentId).maybeSingle();
      if (!student) return Response.json({ error: "Student not found." }, { status: 404 });
      const { data: membership } = await admin.from("educator_programs").select("id").eq("educator_profile_id", auth.profileId).eq("program_id", student.program_id).maybeSingle();
      if (!membership) return Response.json({ error: "You are not assigned to this student’s program." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const { data, error } = await admin.from("student_skills").upsert({
      student_id: studentId,
      skill_id: skillId,
      status: "verified",
      verified_by_profile_id: auth.profileId,
      verified_at: now,
      updated_at: now,
    }, { onConflict: "student_id,skill_id" }).select("*").single();
    if (error) throw error;

    await audit({ actorProfileId: auth.profileId, action: "skill.verified", entityType: "student_skill", entityId: data.id, newValue: { studentId, skillId, verifiedAt: now } });
    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}
