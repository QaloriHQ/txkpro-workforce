"use client";
import { useMemo, useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { CheckoutElementsProvider, ContactDetailsElement, PaymentElement, useCheckoutElements } from "@stripe/react-stripe-js/checkout";
type Props = {
    apiPath?: "/api/screening" | "/api/authcard";
    orderId: string;
    ownerType: string;
    ownerId: string;
    clientSecret: string;
    publishableKey: string;
    onDone: () => void;
    onBusy: (v: boolean) => void;
    onResume: () => void;
};
function Payment(p: Props) {
    const result = useCheckoutElements();
    const [busy, setBusy] = useState(false), [checked, setChecked] = useState(false), [uncertain, setUncertain] = useState(false), [resume, setResume] = useState(false), [message, setMessage] = useState("");
    useEffect(() => { let active = true; void fetch(p.apiPath || "/api/screening", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "status", orderId: p.orderId, ownerType: p.ownerType, ownerId: p.ownerId }) }).then(async (r) => { if (!r.ok)
        throw Error(); return r.json(); }).then(d => { if (active) {
        setChecked(true);
        if (!d.canResume) {
            setUncertain(true);
            setMessage(d.message);
        }
    } }).catch(() => { if (active) {
        setChecked(true);
        setUncertain(true);
        setMessage("Check this same payment before retrying.");
    } }); return () => { active = false; }; }, [p.orderId, p.ownerType, p.ownerId, p.apiPath]);
    async function check() { try {
        const r = await fetch(p.apiPath || "/api/screening", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "status", orderId: p.orderId, ownerType: p.ownerType, ownerId: p.ownerId }) });
        const d = await r.json();
        if (!r.ok)
            throw Error();
        setMessage(d.message);
        setResume(d.canResume === true);
        p.onDone();
    }
    catch {
        setMessage("Payment result unconfirmed. Resume this same order.");
        setResume(false);
    } }
    if (result.type === "loading")
        return <p role="status">Loading secure test payment…</p>;
    if (result.type === "error")
        return <button className="button" onClick={p.onResume}>Reload this payment</button>;
    return <form onSubmit={async (e) => { e.preventDefault(); if (busy || uncertain || !checked)
        return; setBusy(true); p.onBusy(true); try {
        const v = await result.checkout.validateElements();
        if (v.type === "error") {
            setMessage(v.error.message);
            return;
        }
        const r = await result.checkout.confirm({ redirect: "if_required" });
        if (r.type === "error") {
            setMessage(r.error.message);
            return;
        }
        setUncertain(true);
        await check();
    }
    catch {
        setUncertain(true);
        await check();
    }
    finally {
        setBusy(false);
        p.onBusy(false);
    } }}>
 {!uncertain ? <><ContactDetailsElement /><PaymentElement /><p className="card-sub">Sandbox payment only. No real charge or real background check.</p>{!result.checkout.canConfirm?<p className="card-sub" role="status">Complete the receipt email and payment fields, then select Pay to validate them.</p>:null}<button type="submit" className="button button-dark" disabled={!checked || busy}>{!checked ? "Checking payment status…" : busy ? "Confirming…" : `Pay ${result.checkout.total.total.amount} (test)`}</button></> : <><button type="button" className="button" disabled={busy} onClick={async () => { setBusy(true); p.onBusy(true); try {
        await check();
    }
    finally {
        setBusy(false);
        p.onBusy(false);
    } }}>Check payment status</button>{resume ? <button type="button" className="button" disabled={busy} onClick={p.onResume}>Resume same payment</button> : null}</>}
 {message ? <p role="status" className="funding-notice">{message}</p> : null}</form>;
}
export function ScreeningCheckout(p: Props) { const stripe = useMemo(() => loadStripe(p.publishableKey), [p.publishableKey]); return <CheckoutElementsProvider stripe={stripe} options={{ clientSecret: p.clientSecret, elementsOptions: { appearance: { theme: "stripe", variables: { colorBackground: "#f4f6f8", colorText: "#111827", colorPrimary: "#116fd6", borderRadius: "10px" } }, savedPaymentMethod: { enableSave: "never" } } }}><Payment {...p}/></CheckoutElementsProvider>; }
