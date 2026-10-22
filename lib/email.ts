import "server-only";
import { getTwilioEmailOperation, readTwilioEmailConfig, sendTwilioEmail } from "./email/twilio-email";

// Application callers own consent, suppression, scope, deduplication and durable operation IDs.
// Never expose this transport through an unrestricted public send endpoint.
export function sendEmail(message: { to: string; subject: string; html: string; text?: string }) {
  return sendTwilioEmail(readTwilioEmailConfig(process.env), message);
}

export function getEmailOperation(operationId: string) {
  return getTwilioEmailOperation(readTwilioEmailConfig(process.env), operationId);
}
