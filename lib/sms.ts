import "server-only";
import twilio from "twilio";

export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    return { sid: `demo-${Date.now()}`, status: "demo" as const };
  }

  const client = twilio(sid, token);
  const message = await client.messages.create({ to, from, body });
  return { sid: message.sid, status: message.status ?? "queued" };
}

export function validateTwilioSignature(signature: string, url: string, params: Record<string, string>) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  return twilio.validateRequest(token, signature, url, params);
}
