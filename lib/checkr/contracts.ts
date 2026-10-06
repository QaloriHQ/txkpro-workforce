import { createHmac, timingSafeEqual } from "node:crypto";

export const CHECKR_ORIGIN = "https://api.checkr-staging.com";
export type CheckrPackage = {
  slug: string;
  name: string;
  price: number;
  screenings: string[];
};
export type CheckrNode = { id: string; name: string; packages: string[] };
export function sandboxConfigured(env: Record<string, string | undefined>) {
  return Boolean(
    env.CHECKR_SANDBOX_CLIENT_ID &&
    env.CHECKR_SANDBOX_CLIENT_SECRET &&
    env.CHECKR_SANDBOX_APP_ORIGIN === "https://staging-workforce.txkpro.com" &&
    env.REWARDS_ENCRYPTION_KEY &&
    Buffer.from(env.REWARDS_ENCRYPTION_KEY, "base64").length === 32,
  );
}
export function providerId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw new Error("Invalid provider identifier");
  return value;
}
export function packagesForNode(
  packages: CheckrPackage[],
  nodes: CheckrNode[],
  node: string,
) {
  if (!nodes.length) {
    if (node) throw new Error("Unexpected account node");
    return packages;
  }
  const selected = nodes.find((n) => n.id === node);
  if (!selected) throw new Error("Select an account node");
  return selected.packages.length
    ? packages.filter((p) => selected.packages.includes(p.slug))
    : packages;
}
export function curatePackage(value: Record<string, unknown>): CheckrPackage {
  const price = value.price;
  if (
    !Number.isSafeInteger(price) ||
    Number(price) <= 0 ||
    Number(price) > 100000000 ||
    value.deleted_at
  )
    throw new Error("Package quote unavailable");
  return {
    slug: providerId(value.slug),
    name: String(value.name || value.slug).slice(0, 100),
    price: Number(price),
    screenings: Array.isArray(value.screenings)
      ? value.screenings.slice(0, 30).map((s) =>
          String(s.type || "")
            .replaceAll("_", " ")
            .slice(0, 100),
        )
      : [],
  };
}
// Never surface report result (clear/consider), findings or report payloads.
export function operationalStatus(status: unknown, report: boolean) {
  if (report)
    return ["clear", "consider", "complete"].includes(String(status))
      ? "complete"
      : "processing";
  return ["pending", "completed", "expired", "canceled"].includes(
    String(status),
  )
    ? String(status)
    : "pending";
}
export function validSignature(
  raw: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  try {
    const compact = JSON.stringify(JSON.parse(raw));
    const expected = createHmac("sha256", secret).update(compact).digest();
    return timingSafeEqual(expected, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
export function retrySafe(startedAt: string, now = Date.now()) {
  const elapsed = now - Date.parse(startedAt);
  // Checkr retains idempotency for 24h. After that, reconcile; never recreate automatically.
  return (
    Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 23 * 60 * 60 * 1000
  );
}
