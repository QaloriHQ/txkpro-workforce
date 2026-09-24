import { createAdminClient } from "@/lib/supabase/admin";
import { validateTwilioSignature } from "@/lib/sms";

type RetentionInboundResult = {
  kind:
    | "recorded"
    | "duplicate"
    | "invalid"
    | "not_found"
    | "ambiguous"
    | "opt_out"
    | "opt_in";
  normalizedScore?: number;
};

function twiml(message: string) {
  return new Response(
    `<Response><Message>${message}</Message></Response>`,
    {
      headers: { "content-type": "text/xml; charset=utf-8" },
    },
  );
}

export async function POST(request: Request) {
  const raw = await request.text();
  const search = new URLSearchParams(raw);
  const params = Object.fromEntries(search.entries());
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const configuredUrl = process.env.TWILIO_INBOUND_WEBHOOK_URL;

  if (
    !configuredUrl ||
    !validateTwilioSignature(signature, configuredUrl, params)
  ) {
    return new Response("Invalid signature", { status: 403 });
  }

  const from = params.From?.trim();
  const body = params.Body?.trim();
  const providerMessageId = params.MessageSid?.trim();
  if (!from || !body || !providerMessageId) {
    return twiml("TXKPRO could not read that message. Please try again.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("retention_record_sms_response", {
    p_provider_message_id: providerMessageId,
    p_from_phone: from,
    p_raw_response: body,
    p_received_at: new Date().toISOString(),
  });
  if (error) {
    return twiml(
      "TXKPRO could not record that response. A team member can help if needed.",
    );
  }

  const result = (data ?? { kind: "invalid" }) as RetentionInboundResult;

  switch (result.kind) {
    case "recorded":
      return result.normalizedScore === 3
        ? twiml(
            "Thanks. TXKPRO recorded that you need help and opened a human follow-up.",
          )
        : twiml("Thanks. Your TXKPRO retention check-in was recorded.");
    case "duplicate":
      return twiml("Thanks. That TXKPRO response was already recorded.");
    case "opt_out":
      return twiml(
        "You are opted out of TXKPRO retention text messages. Reply START to opt back in.",
      );
    case "opt_in":
      return twiml(
        "You are opted back in to TXKPRO retention text messages. Reply STOP to opt out.",
      );
    case "ambiguous":
      return twiml(
        "We found more than one open TXKPRO check-in. A TXKPRO team member will follow up.",
      );
    case "not_found":
      return twiml("Thanks. No open TXKPRO retention check-in was found.");
    default:
      return twiml(
        "Please reply 1 for going well, 2 for okay, or 3 if you need help. Reply STOP to opt out.",
      );
  }
}
