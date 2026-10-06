// Money is represented by integral USD cents. Scoring ledgers never enter this contract.
export function fundingQuote(
  principal: number,
  basisPoints: number,
  fixedCents: number,
) {
  if (
    ![principal, basisPoints, fixedCents].every(Number.isSafeInteger) ||
    principal < 100 ||
    principal > 10000000 ||
    basisPoints < 0 ||
    basisPoints > 10000 ||
    fixedCents < 0 ||
    fixedCents > 100000
  )
    throw new Error("Invalid funding quote");
  const platformFeeCents = Math.max(500, Math.ceil(principal / 10));
  const thirdPartyFeeCents =
    Math.ceil((principal * basisPoints) / 10000) + fixedCents;
  return {
    principalCents: principal,
    platformFeeCents,
    thirdPartyFeeCents,
    totalCents: principal + platformFeeCents + thirdPartyFeeCents,
  };
}
export function usdCents(amount: unknown): number {
  const s = String(amount);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Invalid USD amount");
  const [whole, fraction = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid USD amount");
  return cents;
}
export function providerBalance(f: {
  status?: string;
  method?: string;
  currency_code?: string;
  meta?: {
    currency_code?: string;
    available_cents?: number;
    available_amount?: number;
  };
}) {
  if (
    f.status !== "active" ||
    f.method !== "balance" ||
    (f.currency_code ?? f.meta?.currency_code) !== "USD"
  )
    throw new Error("USD balance unavailable");
  const cents =
    f.meta?.available_amount !== undefined
      ? usdCents(f.meta.available_amount)
      : f.meta?.available_cents;
  if (!Number.isSafeInteger(cents) || cents! < 0)
    throw new Error("USD balance unavailable");
  return cents!;
}
