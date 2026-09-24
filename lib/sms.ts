import "server-only";
import { randomUUID } from "node:crypto";
import twilio from "twilio";

export async function sendSms(to: string, body: string) {
  const mode = (process.env.TXKPRO_SMS_MODE ?? "live").trim().toLowerCase();

  if (mode === "mock") {
    return { sid: `mock-${randomUUID()}`, status: "sent" as const };
  }

  if (mode !== "live") {
    throw new Error(`Unsupported TXKPRO_SMS_MODE: ${mode}`);
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    throw new Error(
      "Twilio SMS configuration is missing. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
    );
  }

  const client = twilio(sid, token);
  const message = await client.messages.create({ to, from, body });
  return { sid: message.sid, status: message.status ?? "queued" };
}

export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>,
) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  return twilio.validateRequest(token, signature, url, params);
}
