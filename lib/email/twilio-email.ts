// Credentials are supplied by a server caller; never import environment values here.
const ENDPOINT = "https://comms.twilio.com/v1/Emails";
const operationPattern = /^comms_operation_[a-z0-9]{10,80}$/;
const emailPattern = /^[^\s@<>\x00-\x1f\x7f]+@[^\s@<>\x00-\x1f\x7f]+\.[^\s@<>\x00-\x1f\x7f]+$/;

export type TwilioEmailConfig = {
  accountSid: string;
  authToken: string;
  fromAddress: string;
  fromName: string;
};
type Fetcher = typeof fetch;
type Failure = { ok: false; outcome: string; upstreamStatus?: number };

export function readTwilioEmailConfig(env: Record<string, string | undefined>): TwilioEmailConfig | null {
  if (env.TWILIO_EMAIL_ENABLED !== "true") return null;
  const config = {
    accountSid: env.TWILIO_EMAIL_ACCOUNT_SID ?? "",
    authToken: env.TWILIO_EMAIL_AUTH_TOKEN ?? "",
    fromAddress: env.TWILIO_EMAIL_FROM_ADDRESS ?? "",
    fromName: env.TWILIO_EMAIL_FROM_NAME ?? "",
  };
  return validConfig(config) ? config : null;
}

function validEmail(value: string) {
  return typeof value === "string" && value.length <= 254 && emailPattern.test(value);
}
function validConfig(config: TwilioEmailConfig) {
  return /^AC[0-9a-f]{32}$/i.test(config.accountSid) &&
    /^[\x21-\x7e]{16,256}$/.test(config.authToken) && !config.authToken.includes(":") &&
    validEmail(config.fromAddress) && !!config.fromName.trim() &&
    config.fromName.length <= 100 && !/[\x00-\x1f\x7f]/.test(config.fromName);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("response");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("response");
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 32768) throw new Error("response");
      parts.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) { buffer.set(part, offset); offset += part.byteLength; }
  const json = JSON.parse(new TextDecoder().decode(buffer));
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("response");
  return json;
}

function headers(config: TwilioEmailConfig) {
  return { "Content-Type": "application/json", Authorization: "Basic " + btoa(config.accountSid + ":" + config.authToken) };
}

export async function sendTwilioEmail(
  config: TwilioEmailConfig | null,
  message: { to: string; subject: string; html: string; text?: string },
  fetcher: Fetcher = fetch,
): Promise<Failure | { ok: true; outcome: "accepted"; delivery: "unverified"; operationId: string }> {
  if (!config || !validConfig(config)) return { ok: false, outcome: "missing_or_invalid_configuration" };
  if (!validEmail(message.to) || typeof message.subject !== "string" || !message.subject.trim() ||
      message.subject.length > 200 || /[\x00-\x1f\x7f]/.test(message.subject) ||
      typeof message.html !== "string" || !message.html.trim() || message.html.length > 100000 ||
      (message.text !== undefined && (typeof message.text !== "string" || message.text.length > 100000))) {
    return { ok: false, outcome: "invalid_message" };
  }
  let response: Response;
  try {
    // Deliberately one attempt. A timeout may happen after provider acceptance.
    response = await fetcher(ENDPOINT, {
      method: "POST", headers: headers(config), cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        from: { address: config.fromAddress, name: config.fromName },
        to: [{ address: message.to }],
        content: { subject: message.subject, html: message.html, ...(message.text === undefined ? {} : { text: message.text }) },
      }),
    });
  } catch { return { ok: false, outcome: "send_unconfirmed" }; }
  if (response.status !== 202) {
    await response.body?.cancel().catch(() => {});
    return { ok: false, outcome: response.status >= 400 && response.status < 500 ? "rejected" : "send_unconfirmed", upstreamStatus: response.status };
  }
  try {
    const json = await readJson(response);
    if (typeof json.operationId !== "string" || !operationPattern.test(json.operationId)) throw new Error("response");
    return { ok: true, outcome: "accepted", delivery: "unverified", operationId: json.operationId };
  } catch { return { ok: false, outcome: "send_unconfirmed", upstreamStatus: 202 }; }
}

export async function getTwilioEmailOperation(config: TwilioEmailConfig | null, operationId: string, fetcher: Fetcher = fetch) {
  if (!config || !validConfig(config)) return { ok: false, outcome: "missing_or_invalid_configuration" };
  if (!operationPattern.test(operationId)) return { ok: false, outcome: "invalid_operation" };
  try {
    // Ignore operationLocation supplied by upstream. Credentials go to this host only.
    const response = await fetcher(ENDPOINT + "/Operations/" + operationId, {
      headers: headers(config), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      return { ok: false, outcome: "status_unavailable", upstreamStatus: response.status };
    }
    const json = await readJson(response);
    if (json.id !== operationId || !["SCHEDULED", "PROCESSING", "COMPLETED", "CANCELED"].includes(String(json.status))) throw new Error("response");
    const stats: Record<string, number> = {};
    const source = json.stats as Record<string, unknown> | undefined;
    for (const key of ["total", "queued", "sent", "scheduled", "delivered", "opened", "undelivered", "failed", "canceled"]) {
      const value = source?.[key];
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("response");
      stats[key] = value;
    }
    return { ok: true, operationId, status: json.status, stats };
  } catch { return { ok: false, outcome: "status_unavailable" }; }
}
