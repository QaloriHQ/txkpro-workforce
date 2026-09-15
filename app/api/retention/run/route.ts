import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";

const MILESTONES = [30, 60, 90] as const;
const MS_DAY = 86_400_000;

function dueMilestone(hiredAt: string) {
  const days = Math.floor((Date.now() - new Date(hiredAt).getTime()) / MS_DAY);
  return [...MILESTONES].reverse().find((milestone) => days >= milestone) ?? null;
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: placements, error } = await admin
    .from("placements")
    .select("id, student_id, employer_id, hired_at, status")
    .eq("status", "active")
    .not("hired_at", "is", null);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  const skipped: string[] = [];

  for (const placement of placements ?? []) {
    const milestone = dueMilestone(placement.hired_at);
    if (!milestone) continue;

    const { data: existing } = await admin.from("retention_pulses").select("recipient_type").eq("placement_id", placement.id).eq("milestone_day", milestone);
    const existingTypes = new Set((existing ?? []).map((row: { recipient_type: string }) => row.recipient_type));

    const { data: student } = await admin
      .from("student_profiles")
      .select("id, profile_id, profiles!student_profiles_profile_id_fkey(first_name,last_name,phone,sms_consent_at)")
      .eq("id", placement.student_id)
      .maybeSingle();
    const { data: employer } = await admin.from("employer_profiles").select("id,business_name,contact_phone,sms_consent_at").eq("id", placement.employer_id).maybeSingle();
    if (!student || !employer) continue;

    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
    const studentName = `${profile?.first_name ?? "Student"} ${profile?.last_name ?? ""}`.trim();

    const recipients = [
      {
        type: "student",
        phone: profile?.phone as string | null | undefined,
        consent: profile?.sms_consent_at as string | null | undefined,
        body: `TXKPRO check-in: How is onboarding at ${employer.business_name}? Reply 1 Great, 2 Okay, 3 Having issues.`,
      },
      {
        type: "employer",
        phone: employer.contact_phone as string | null | undefined,
        consent: employer.sms_consent_at as string | null | undefined,
        body: `TXKPRO check-in: How is ${studentName} adjusting to the team? Reply 1 Great, 2 Okay, 3 Having issues.`,
      },
    ] as const;

    for (const recipient of recipients) {
      if (existingTypes.has(recipient.type)) continue;
      if (!recipient.phone || !recipient.consent) {
        skipped.push(`${placement.id}:${recipient.type}:no-consent-or-phone`);
        continue;
      }
      const sms = await sendSms(recipient.phone, recipient.body);
      const { data: pulse, error: pulseError } = await admin.from("retention_pulses").insert({
        placement_id: placement.id,
        milestone_day: milestone,
        recipient_type: recipient.type,
        recipient_phone: recipient.phone,
        status: "sent",
        provider_message_id: sms.sid,
        sent_at: new Date().toISOString(),
      }).select("id").single();
      if (pulseError) throw pulseError;
      sent += 1;
      await audit({ action: "retention_pulse.sent", entityType: "retention_pulse", entityId: pulse.id, newValue: { placementId: placement.id, milestone, recipientType: recipient.type } });
    }
  }

  return Response.json({ sent, skipped });
}
