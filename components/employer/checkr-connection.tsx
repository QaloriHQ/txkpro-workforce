"use client";
import { useState } from "react";
import Link from "next/link";
import { ActionModal } from "@/components/design-system/action-modal";

type Connection = { connected: boolean; credentialed: boolean; canManage: boolean };
export function CheckrConnection({ employerId }: { employerId: string }) {
  const [data, setData] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function call(op: string) {
    const r = await fetch("/api/checkr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, employerId }) });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || "Checkr setup unavailable.");
    return result;
  }
  async function load() {
    setBusy(true); setError("");
    try { setData(await call("workspace")); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load connection."); }
    finally { setBusy(false); }
  }
  async function connect() {
    setBusy(true); setError("");
    try { const result = await call("authorize"); window.location.assign(result.url); }
    catch (e) { setError(e instanceof Error ? e.message : "Connection unavailable."); setBusy(false); }
  }
  return <ActionModal title="Background check · Checkr sandbox" triggerLabel="Enable / manage Checkr" onOpen={() => void load()} busy={busy}
    description="Connect your employer’s Checkr account. Screening charges belong to your employer account.">
    {busy ? <p role="status">Loading Checkr…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {data ? <>
      <p role="status">{data.connected ? data.credentialed ? "Connected · employer credentialed" : "Connected · awaiting Checkr credentialing" : "Checkr is not connected"}</p>
      <p>Checkr hosts candidate disclosures, consent and reports. Connecting an account or adding a pipeline component does not start a background check or make a hiring decision.</p>
      {data.canManage ? <button type="button" className="button button-dark" disabled={busy} onClick={() => void connect()}>{data.connected ? "Reconnect Checkr" : "Enable Checkr sandbox"}</button>
        : <p>An Employer Owner or Admin must connect Checkr.</p>}
      {data.connected ? <Link className="button button-ghost" href={`/employer/checkr?employer=${encodeURIComponent(employerId)}`}>Open Checkr workspace</Link> : null}
    </> : null}
    <button type="button" className="button button-ghost" disabled={busy} onClick={() => void load()}>Refresh connection</button>
  </ActionModal>;
}
