import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export const SANDBOX_ORIGIN = "https://testflight.tremendous.com";
export function seal(value: unknown, key: string, context: string): string {
  const bytes = Buffer.from(key, "base64");
  if (bytes.length !== 32)
    throw new Error("Provider encryption is not configured.");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", bytes, iv);
  cipher.setAAD(Buffer.from(context));
  return Buffer.concat([
    iv,
    cipher.update(JSON.stringify(value)),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
export function unseal<T>(value: string, key: string, context: string): T {
  const b = Buffer.from(value, "base64"),
    bytes = Buffer.from(key, "base64");
  if (bytes.length !== 32 || b.length < 29)
    throw new Error("Provider encryption is not configured.");
  const d = createDecipheriv("aes-256-gcm", bytes, b.subarray(0, 12));
  d.setAAD(Buffer.from(context));
  d.setAuthTag(b.subarray(-16));
  return JSON.parse(
    Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString(),
  );
}
export function validSignature(
  raw: string,
  header: string | null,
  key: string,
): boolean {
  if (!header || !/^sha256=[a-f0-9]{64}$/.test(header)) return false;
  return timingSafeEqual(
    Buffer.from(header.slice(7), "hex"),
    createHmac("sha256", key).update(raw).digest(),
  );
}
export function screeningBudget(
  quoteCents: number,
  usedCents: number,
  limitCents: number,
  approvalAboveCents: number,
) {
  if (
    ![quoteCents, usedCents, limitCents, approvalAboveCents].every(
      Number.isSafeInteger,
    ) ||
    quoteCents <= 0 ||
    Math.min(usedCents, limitCents, approvalAboveCents) < 0
  )
    throw new Error("Invalid screening budget");
  return {
    withinLimit: quoteCents + usedCents <= limitCents,
    requiresApproval: quoteCents > approvalAboveCents,
  };
}
export type RewardRequest = {
  id: string;
  cents: number;
  credits: number;
  productId: string;
  email: string;
  name: string;
  providerOrderId: string | null;
  status?: string;
};
export function orderPayload(r: RewardRequest) {
  if (!Number.isSafeInteger(r.cents) || r.cents <= 0)
    throw new Error("Invalid reward amount");
  return {
    external_id: `txkpro-sandbox-${r.id}`,
    payment: { funding_source_id: "BALANCE" },
    reward: {
      products: [r.productId],
      value: { denomination: r.cents / 100, currency_code: "USD" },
      recipient: { name: r.name, email: r.email },
      delivery: { method: "EMAIL" },
    },
  };
}
export function reconcileOrder(
  order: Record<string, unknown>,
  r: RewardRequest,
) {
  const rewards = order.rewards as Record<string, unknown>[];
  const reward = rewards?.[0];
  const v = reward?.value as { denomination?: number; currency_code?: string };
  const recipient = reward?.recipient as { email?: string };
  if (
    order.external_id !== `txkpro-sandbox-${r.id}` ||
    !order.id ||
    rewards?.length !== 1 ||
    !reward?.id ||
    v?.currency_code !== "USD" ||
    Math.round(Number(v?.denomination) * 100) !== r.cents ||
    recipient?.email?.toLowerCase() !== r.email.toLowerCase()
  )
    throw new Error("Provider response requires reconciliation.");
  const payment = order.payment as {
    refund?: { total?: number; currency_code?: string };
  };
  const refunded =
    order.status === "CANCELED" &&
    payment?.refund?.currency_code === "USD" &&
    Math.round(Number(payment?.refund?.total) * 100) >= r.cents;
  const delivery = reward.delivery as { status?: string };
  return {
    status: refunded
      ? "cancelled"
      : order.status === "EXECUTED"
        ? "issued"
        : "provider_pending",
    orderId: order.id,
    rewardId: reward.id,
    providerStatus: String(order.status || "UNKNOWN"),
    deliveryStatus: delivery?.status || null,
  };
}

export function validGiftCard(
  product: Record<string, unknown>,
  cents: number,
): boolean {
  const bands = product.skus as
    { min: number; max: number; currency_code: string }[] | undefined;
  return (
    product.category === "merchant_card" &&
    (product.currency_codes as string[] | undefined)?.includes("USD") ===
      true &&
    (product.countries as { abbr: string }[] | undefined)?.some(
      (c) => c.abbr === "US",
    ) === true &&
    Array.isArray(bands) &&
    bands.some(
      (b) =>
        b.currency_code === "USD" &&
        cents >= Math.ceil(b.min * 100) &&
        cents <= Math.floor(b.max * 100),
    )
  );
}
