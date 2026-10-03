import "server-only";
import { randomUUID } from "node:crypto";
import twilio from "twilio";

export const WORKFORCE_TRANSACTIONAL_SMS_PURPOSES = [
  "account_notification",
  "interview_request",
  "retention",
  "support",
  "verification",
] as const;

export type WorkforceTransactionalSmsPurpose =
  (typeof WORKFORCE_TRANSACTIONAL_SMS_PURPOSES)[number];

const allowedTransactionalPurposes = new Set<string>(
  WORKFORCE_TRANSACTIONAL_SMS_PURPOSES,
);

export async function sendSms(
  to: string,
  body: string,
  purpose: WorkforceTransactionalSmsPurpose,
) {
  if (!allowedTransactionalPurposes.has(purpose)) {
    throw new Error(
      `SMS purpose "${purpose}" is not permitted on the TXKPRO Workforce transactional messaging program.`,
    );
  }

  const mode = (process.env.TXKPRO_SMS_MODE ?? "live").trim().toLowerCase();

  if (mode === "mock") {
    return {
      sid: `mock-${randomUUID()}`,
      status: "sent" as const,
      purpose,
    };
  }

  if (mode !== "live") {
    throw new Error(`Unsupported TXKPRO_SMS_MODE: ${mode}`);
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid =
    process.env.TWILIO_WORKFORCE_MESSAGING_SERVICE_SID;

  if (!sid || !token || !messagingServiceSid) {
    throw new Error(
      "Twilio Workforce SMS configuration is missing. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WORKFORCE_MESSAGING_SERVICE_SID.",
    );
  }

  const client = twilio(sid, token);
  const message = await client.messages.create({
    to,
    messagingServiceSid,
    body,
  });

  return {
    sid: message.sid,
    status: message.status ?? "queued",
    purpose,
  };
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
