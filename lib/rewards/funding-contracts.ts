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

// Read-only provider observation; event processing remains a separate server operation.
export function fundingPaymentObservation(
  f: {
    id: string;
    total_cents: number;
    stripe_session_id: string | null;
    status: string;
  },
  session: {
    id: string;
    client_reference_id: string | null;
    metadata: { funding_id?: string } | null;
    amount_total: number | null;
    currency: string | null;
    livemode: boolean;
    status: string | null;
    payment_status: string;
    payment_intent?: string | { status: string } | null;
  },
) {
  if (
    session.id !== f.stripe_session_id ||
    session.client_reference_id !== f.id ||
    session.metadata?.funding_id !== f.id ||
    session.amount_total !== Number(f.total_cents) ||
    session.currency !== "usd" ||
    session.livemode
  )
    throw new Error("Payment binding mismatch");
  const intent =
    typeof session.payment_intent === "object" ? session.payment_intent : null;
  const canResume =
    ["quoted", "pending"].includes(f.status) &&
    session.status === "open" &&
    session.payment_status === "unpaid" &&
    (session.payment_intent == null ||
      (intent !== null &&
        [
          "requires_payment_method",
          "requires_confirmation",
          "requires_action",
        ].includes(intent.status)));
  return {
    canResume,
    message:
      session.payment_status === "paid"
        ? f.status === "backed"
          ? "Payment confirmed. Reward Credits funding is backed."
          : f.status === "hold"
            ? "Payment received. Funding is on hold; contact TXKPRO support."
            : f.status === "paid"
              ? "Payment confirmed. Reward Credits await provider backing."
              : "Stripe confirms payment received. Workspace confirmation and provider backing may still be processing."
        : session.status === "expired"
          ? "This payment session has expired. Refresh funding history before creating a new request."
          : canResume
            ? "Stripe has not confirmed payment. Resume this same funding request to continue."
            : "Payment is processing. Check this request again; do not submit another payment.",
  };
}
