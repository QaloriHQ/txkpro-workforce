import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["student"]);
    const body = await request.json();
    const skillId = typeof body.skillId === "string" ? body.skillId : "";
    const status = body.status === "self_attested" ? "self_attested" : "learning";
    if (!skillId) return Response.json({ error: "skillId is required." }, { status: 400 });

    const admin = createAdminClient();
    const { data: student } = await admin.from("student_profiles").select("id").eq("profile_id", auth.profileId).maybeSingle();
    if (!student) return Response.json({ error: "Student profile not found." }, { status: 404 });

    const { data: existing } = await admin.from("student_skills").select("id, status").eq("student_id", student.id).eq("skill_id", skillId).maybeSingle();
    if (existing?.status === "verified") {
      return Response.json({ error: "Instructor-verified skills cannot be changed by the student." }, { status: 409 });
    }

    const { data, error } = await admin.from("student_skills").upsert({
      student_id: student.id,
      skill_id: skillId,
      status,
      self_attested_at: status === "self_attested" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "student_id,skill_id" }).select("*").single();
    if (error) throw error;

    await audit({ actorProfileId: auth.profileId, action: "skill.self_attested", entityType: "student_skill", entityId: data.id, newValue: { skillId, status } });
    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}
