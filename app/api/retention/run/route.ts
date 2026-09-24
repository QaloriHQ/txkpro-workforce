import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";

type RetentionClaim = {
  message_id: string;
  milestone_id: string;
  placement_id: string;
  day_number: 30 | 60 | 90;
  student_id: string;
  recipient_user_id: string;
  recipient_phone: string | null;
  consent_status: "unknown" | "consented" | "opted_out" | "revoked";
  employer_id: string;
  institution_id: string | null;
  role_title: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("retention_claim_due_milestones", {
    p_limit: 50,
  });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const claims = (data ?? []) as RetentionClaim[];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ messageId: string; error: string }> = [];

  for (const claim of claims) {
    try {
      if (!claim.recipient_phone) {
        const { error: skipError } = await admin.rpc(
          "retention_mark_message_skipped",
          {
            p_message_id: claim.message_id,
            p_reason: "missing_phone",
          },
        );
        if (skipError) throw skipError;
        skipped += 1;
        continue;
      }

      if (claim.consent_status !== "consented") {
        const { error: skipError } = await admin.rpc(
          "retention_mark_message_skipped",
          {
            p_message_id: claim.message_id,
            p_reason: `sms_consent_${claim.consent_status}`,
          },
        );
        if (skipError) throw skipError;
        skipped += 1;
        continue;
      }

      const body =
        `TXKPRO Day ${claim.day_number} check-in: How is the job going? ` +
        "Reply 1 = Going well, 2 = Okay, 3 = I need help. Reply STOP to opt out.";

      const sms = await sendSms(claim.recipient_phone, body);
      const { error: sentError } = await admin.rpc(
        "retention_mark_message_sent",
        {
          p_message_id: claim.message_id,
          p_provider_message_id: sms.sid,
          p_provider_status: sms.status,
        },
      );
      if (sentError) throw sentError;
      sent += 1;
    } catch (error) {
      failed += 1;
      const detail = errorMessage(error).slice(0, 1000);
      errors.push({ messageId: claim.message_id, error: detail });

      const { error: markError } = await admin.rpc(
        "retention_mark_message_failed",
        {
          p_message_id: claim.message_id,
          p_error_code: "send_failed",
          p_error_detail: detail,
        },
      );
      if (markError) {
        errors.push({
          messageId: claim.message_id,
          error: `Unable to mark failed: ${markError.message}`,
        });
      }
    }
  }

  return Response.json({
    claimed: claims.length,
    sent,
    skipped,
    failed,
    errors,
  });
}
