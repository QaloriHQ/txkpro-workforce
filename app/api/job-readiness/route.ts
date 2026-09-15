import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { jsonError, stringArray } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

const booleanOrNull = (value: unknown) => typeof value === "boolean" ? value : null;

export async function PATCH(request: Request) {
  try {
    const auth = await requireRole(["student"]);
    const body = await request.json();
    const admin = createAdminClient();

    const { data: student, error: studentError } = await admin
      .from("student_profiles")
      .select("id")
      .eq("profile_id", auth.profileId)
      .single();
    if (studentError || !student) return Response.json({ error: "Student profile not found." }, { status: 404 });

    const payload = {
      student_id: student.id,
      valid_drivers_license: booleanOrNull(body.validDriversLicense),
      clean_driving_record_attestation: booleanOrNull(body.cleanDrivingRecord),
      willing_background_check: booleanOrNull(body.willingBackgroundCheck),
      willing_drug_screen: booleanOrNull(body.willingDrugScreen),
      shift_preferences: stringArray(body.shiftPreferences),
      work_preferences: stringArray(body.workPreferences),
      discoverable: body.discoverable === true,
      attested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("job_readiness_profiles")
      .upsert(payload, { onConflict: "student_id" })
      .select("*")
      .single();
    if (error) throw error;

    await audit({ actorProfileId: auth.profileId, action: "job_readiness.updated", entityType: "student", entityId: student.id, newValue: payload });
    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}
