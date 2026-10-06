"use client";
import { useState } from "react";
import { ActionModal } from "@/components/design-system/action-modal";

type Documents = {
  receiptUrl: string | null;
  invoiceUrl: string | null;
  invoicePdfUrl: string | null;
  message: string;
};
export function FundingDocuments({ fundingId }: { fundingId: string }) {
  const [busy, setBusy] = useState(false);
  const [documents, setDocuments] = useState<Documents | null>(null);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true); setDocuments(null); setError("");
    try {
      const r = await fetch("/api/rewards/funding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "documents", fundingId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Payment documents are unavailable.");
      setDocuments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment documents are unavailable.");
    } finally { setBusy(false); }
  }
  return <ActionModal title="Invoices and receipts" triggerLabel="Invoices / receipts" busy={busy} onOpen={() => void load()}>
    {busy ? <p role="status">Loading payment documents…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {documents ? <>
      <p role="status">{documents.message}</p>
      <div className="reward-actions">
        {documents.receiptUrl ? <a className="button" href={documents.receiptUrl} target="_blank" rel="noopener noreferrer">View receipt</a> : null}
        {documents.invoiceUrl ? <a className="button" href={documents.invoiceUrl} target="_blank" rel="noopener noreferrer">View paid invoice</a> : null}
        {documents.invoicePdfUrl ? <a className="button" href={documents.invoicePdfUrl} target="_blank" rel="noopener noreferrer">Download invoice PDF</a> : null}
      </div>
    </> : null}
    {!busy ? <button className="button" type="button" onClick={() => void load()}>Refresh documents</button> : null}
  </ActionModal>;
}
