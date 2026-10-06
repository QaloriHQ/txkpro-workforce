"use client";
import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
function Payment({
  returnUrl,
  onDone,
  onBusy,
}: {
  returnUrl: string;
  onDone: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const result = useCheckoutElements();
  const [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState(false),
    [message, setMessage] = useState("");
  if (result.type === "loading")
    return <p role="status">Loading secure payment fields…</p>;
  if (result.type === "error")
    return (
      <p role="alert">
        Payment fields unavailable. Close and resume this funding request.
      </p>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || submitted || !result.checkout.canConfirm) return;
        setBusy(true);
        onBusy(true);
        setMessage("");
        try {
          const r = await result.checkout.confirm({
            returnUrl,
            redirect: "if_required",
          });
          if (r.type === "error") setMessage(r.error.message);
          else {
            setMessage(
              "Payment submitted. Confirmation and provider backing may take time; no credits are available yet.",
            );
            setSubmitted(true);
            onDone();
          }
        } catch {
          setMessage(
            "Payment result is unconfirmed. Resume the same funding request.",
          );
        } finally {
          setBusy(false);
          onBusy(false);
        }
      }}
    >
      <PaymentElement />
      <p className="card-sub">
        Card or ACH details are secured by Stripe. ACH may remain pending while
        your bank processes it.
      </p>
      <button
        className="button button-dark"
        disabled={busy || submitted || !result.checkout.canConfirm}
        type="submit"
      >
        {busy ? "Submitting…" : `Pay ${result.checkout.total.total.amount}`}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function FundingCheckout({
  clientSecret,
  publishableKey,
  returnUrl,
  onDone,
  onBusy,
}: {
  clientSecret: string;
  publishableKey: string;
  returnUrl: string;
  onDone: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const stripe = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <CheckoutElementsProvider stripe={stripe} options={{ clientSecret }}>
      <Payment returnUrl={returnUrl} onDone={onDone} onBusy={onBusy} />
    </CheckoutElementsProvider>
  );
}
