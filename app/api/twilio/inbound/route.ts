import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateTwilioSignature } from "@/lib/sms";

export async function POST(request: Request) {
  const raw = await request.text();
  const search = new URLSearchParams(raw);
  const params = Object.fromEntries(search.entries());
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const configuredUrl = process.env.TWILIO_INBOUND_WEBHOOK_URL;

  if (!configuredUrl || !validateTwilioSignature(signature, configuredUrl, params)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const from = params.From;
  const responseText = (params.Body ?? "").trim();
  const score = Number(responseText.match(/^[123]/)?.[0] ?? 0);
  if (!from || ![1, 2, 3].includes(score)) {
    return new Response("<Response><Message>Please reply 1, 2, or 3.</Message></Response>", { headers: { "content-type": "text/xml" } });
  }

  const admin = createAdminClient();
  const { data: pulse } = await admin
    .from("retention_pulses")
    .select("id, placement_id, milestone_day, recipient_type")
    .eq("recipient_phone", from)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pulse) return new Response("<Response><Message>Thanks. No open TXKPRO check-in was found.</Message></Response>", { headers: { "content-type": "text/xml" } });

  const flagged = score === 3;
  await admin.from("retention_pulses").update({
    response_score: score,
    response_text: responseText.slice(0, 1000),
    responded_at: new Date().toISOString(),
    status: "responded",
    flagged,
  }).eq("id", pulse.id);

  if (flagged) {
    await admin.from("retention_cases").upsert({
      placement_id: pulse.placement_id,
      milestone_day: pulse.milestone_day,
      status: "open",
      priority: "high",
      source_pulse_id: pulse.id,
      summary: `${pulse.recipient_type} reported onboarding issues at day ${pulse.milestone_day}.`,
    }, { onConflict: "source_pulse_id" });
  }

  await audit({ action: "retention_pulse.responded", entityType: "retention_pulse", entityId: pulse.id, newValue: { score, flagged } });
  const reply = flagged
    ? "Thanks. TXKPRO has flagged this for a human follow-up."
    : "Thanks for checking in. Your response was recorded.";
  return new Response(`<Response><Message>${reply}</Message></Response>`, { headers: { "content-type": "text/xml" } });
}
