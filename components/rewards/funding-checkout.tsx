"use client";
import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import { LockClosedIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

type Props = {
  fundingId: string;
  clientSecret: string;
  publishableKey: string;
  returnUrl: string;
  onDone: () => void;
  onBusy: (busy: boolean) => void;
  onResume: () => void;
};
function Payment({ fundingId, returnUrl, onDone, onBusy, onResume }: Props) {
  const result = useCheckoutElements();
  const [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState(false);
  const [uncertain, setUncertain] = useState(false),
    [canResume, setCanResume] = useState(false);
  const [message, setMessage] = useState("");
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/rewards/funding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "status", fundingId }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (active) {
          setChecked(true);
          if (!data.canResume) {
            setUncertain(true);
            setMessage(data.message);
          }
        }
      })
      .catch(() => {
        if (active) {
          setChecked(true);
          setUncertain(true);
          setMessage(
            "Payment status is unavailable. Check this same request before paying.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [fundingId]);
  async function checkStatus() {
    setBusy(true);
    onBusy(true);
    try {
      const r = await fetch("/api/rewards/funding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "status", fundingId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error();
      setMessage(data.message);
      setCanResume(data.canResume === true);
      onDone();
    } catch {
      setMessage(
        "Payment status is unavailable. Check this same request again before retrying.",
      );
      setCanResume(false);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  if (result.type === "loading")
    return (
      <p className="funding-notice" role="status">
        Loading secure payment fields…
      </p>
    );
  if (result.type === "error")
    return (
      <div className="funding-notice" role="alert">
        <p>Secure payment fields could not load.</p>
        <button className="button" type="button" onClick={onResume}>
          Reload this payment
        </button>
      </div>
    );
  return (
    <form
      className="funding-payment"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          !checked ||
          busy ||
          submitted ||
          uncertain ||
          !result.checkout.canConfirm
        )
          return;
        setBusy(true);
        onBusy(true);
        setMessage("");
        try {
          const validation = await result.checkout.validateElements();
          if (validation.type === "error") {
            setMessage(validation.error.message);
            return;
          }
          const r = await result.checkout.confirm({
            returnUrl,
            redirect: "if_required",
          });
          if (r.type === "error") setMessage(r.error.message);
          else {
            setSubmitted(true);
            setMessage(
              "Payment submitted. Checking confirmation for this funding request…",
            );
            setUncertain(true);
            await checkStatus();
          }
        } catch {
          setUncertain(true);
          setMessage(
            "Checking the payment result. Keep this funding request open.",
          );
          await checkStatus();
        } finally {
          setBusy(false);
          onBusy(false);
        }
      }}
    >
      <div className="funding-section-title">
        <LockClosedIcon aria-hidden="true" />
        <h3>Secure payment</h3>
        <span className="pill">Sandbox</span>
      </div>
      {!uncertain && !submitted ? <PaymentElement /> : null}
      <p className="funding-help">
        Payment details are secured by Stripe. Bank payments may take time to
        clear. Credits become available after payment and provider backing are
        confirmed.
      </p>
      {!uncertain && !submitted ? (
        <button
          className="button button-dark funding-primary"
          disabled={!checked || busy || !result.checkout.canConfirm}
          type="submit"
        >
          {!checked
            ? "Checking payment status…"
            : busy
              ? "Confirming payment…"
              : `Pay ${result.checkout.total.total.amount}`}
        </button>
      ) : null}
      {message ? (
        <p className="funding-notice" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {uncertain ? (
        <div className="funding-recovery">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => void checkStatus()}
          >
            <ArrowPathIcon aria-hidden="true" />
            {busy ? "Checking…" : "Check payment status"}
          </button>
          {canResume ? (
            <button
              className="button button-dark"
              type="button"
              disabled={busy}
              onClick={onResume}
            >
              Resume payment
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
export function FundingCheckout(props: Props) {
  const stripe = useMemo(
    () => loadStripe(props.publishableKey),
    [props.publishableKey],
  );
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () =>
      setDark(document.documentElement.dataset.theme === "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  const options = useMemo(
    () => ({
      clientSecret: props.clientSecret,
      elementsOptions: {
        appearance: {
          theme: dark ? ("night" as const) : ("stripe" as const),
          variables: {
            colorPrimary: dark ? "#f8fafc" : "#111827",
            colorBackground: dark ? "#161f2a" : "#f8fafc",
            colorText: dark ? "#f8fafc" : "#111827",
            borderRadius: "10px",
            fontFamily: "Arial, sans-serif",
            spacingUnit: "4px",
          },
        },
        savedPaymentMethod: { enableSave: "never" as const },
      },
    }),
    [props.clientSecret, dark],
  );
  return (
    <CheckoutElementsProvider stripe={stripe} options={options}>
      <Payment {...props} />
    </CheckoutElementsProvider>
  );
}
