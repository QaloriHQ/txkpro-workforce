type Funding = { id: string; total_cents: number; stripe_session_id: string | null; status: string };
type Session = {
  id: string; client_reference_id: string | null;
  metadata: { funding_id?: string } | null;
  amount_total: number | null; currency: string | null; livemode: boolean;
  status: string | null; payment_status: string;
};

export function fundingEventMatches(f: Funding, event: {
  type: string; livemode: boolean; data: { object: unknown };
}) {
  if (event.livemode || !["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) return false;
  const s = event.data.object as Partial<Session> | null;
  return Boolean(s && s.id === f.stripe_session_id && s.client_reference_id === f.id &&
    s.metadata?.funding_id === f.id && s.amount_total === Number(f.total_cents) &&
    s.currency === "usd" && s.livemode === false && s.payment_status === "paid");
}

function documentUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password &&
      ["pay.stripe.com", "invoice.stripe.com", "files.stripe.com", "payments.stripe.com"].includes(u.hostname)
      ? u.href : null;
  } catch { return null; }
}

export function fundingDocuments(f: Funding, session: Session & {
  payment_intent?: string | { id: string; status: string; amount: number; currency: string; livemode: boolean;
    latest_charge?: string | { payment_intent: string | { id: string } | null; amount: number; currency: string; livemode: boolean; paid: boolean; receipt_url: string | null } | null;
  } | null;
  invoice?: string | { amount_paid: number; currency: string; livemode: boolean; status: string | null; hosted_invoice_url?: string | null; invoice_pdf?: string | null } | null;
}) {
  if (session.id !== f.stripe_session_id || session.client_reference_id !== f.id ||
    session.metadata?.funding_id !== f.id || session.amount_total !== Number(f.total_cents) ||
    session.currency !== "usd" || session.livemode) throw new Error("Payment binding mismatch");
  let receiptUrl: string | null = null, invoiceUrl: string | null = null, invoicePdfUrl: string | null = null;
  const pi = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const invoice = typeof session.invoice === "object" ? session.invoice : null;
  if (session.payment_status === "paid") {
    if (pi && charge && pi.status === "succeeded" && !pi.livemode && pi.currency === "usd" && pi.amount === Number(f.total_cents) &&
      !charge.livemode && charge.paid && charge.currency === "usd" && charge.amount === Number(f.total_cents) &&
      (typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id) === pi.id) receiptUrl = documentUrl(charge.receipt_url);
    if (invoice && invoice.status === "paid" && !invoice.livemode && invoice.currency === "usd" && invoice.amount_paid === Number(f.total_cents)) {
      invoiceUrl = documentUrl(invoice.hosted_invoice_url);
      invoicePdfUrl = documentUrl(invoice.invoice_pdf);
    }
  }
  return { receiptUrl, invoiceUrl, invoicePdfUrl, message: receiptUrl || invoiceUrl || invoicePdfUrl
    ? "Payment documents are provided by Stripe. Provider backing is tracked separately."
    : "Documents appear after payment. Older requests may have a receipt only; paid invoices are enabled for new checkouts." };
}
