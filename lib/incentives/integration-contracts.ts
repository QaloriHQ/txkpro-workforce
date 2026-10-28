import { createHash, timingSafeEqual } from "node:crypto";
export function integrationHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function validWorkerSecret(
  header: string | null,
  expected: string | undefined,
) {
  if (!expected || !header?.startsWith("Bearer ")) return false;
  return timingSafeEqual(
    Buffer.from(integrationHash(header.slice(7)), "hex"),
    Buffer.from(integrationHash(expected), "hex"),
  );
}
export function integrationEnvelope(
  value: unknown,
  now = Date.now(),
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Object required");
  const input = value as Record<string, unknown>;
  if (
    typeof input.eventId !== "string" ||
    input.eventId.length < 1 ||
    input.eventId.length > 100 ||
    typeof input.sentAt !== "string" ||
    !Number.isFinite(Date.parse(input.sentAt)) ||
    Math.abs(now - Date.parse(input.sentAt)) > 300000
  )
    throw new Error("Fresh timestamp and bounded event ID required");
  return Object.fromEntries(
    [
      "eventId",
      "sentAt",
      "type",
      "employeeId",
      "milestoneId",
      "crewId",
      "values",
      "evidence",
      "safetyComplete",
      "startedOn",
      "endedOn",
    ]
      .filter((k) => k in input)
      .map((k) => [k, input[k]]),
  );
}
