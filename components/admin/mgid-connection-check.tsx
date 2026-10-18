"use client";

import { useState } from "react";

type ConnectionResponse = {
  ok?: boolean;
  provider?: string;
  capability?: string;
  openRtbS2S?: string;
  outcome?: string;
  upstreamStatus?: number;
  error?: string;
};

const labels: Record<string, string> = {
  authenticated: "Publisher reporting API authentication verified.",
  missing_configuration: "Required MGID credentials are missing in this deployment.",
  invalid_configuration: "The configured MGID Client API ID or token format is invalid.",
  authentication_rejected: "MGID rejected the API credentials (HTTP 401).",
  permission_denied: "MGID denied access to publisher reporting (HTTP 403).",
  invalid_report_request: "MGID rejected the report parameters or client ID (HTTP 422).",
  rate_limited: "MGID rate-limited the request (HTTP 429).",
  upstream_unavailable: "MGID could not complete the request.",
  unexpected_response: "MGID returned a response that did not match the documented report contract.",
  timed_out: "MGID did not respond within the connection-test timeout.",
};

export function MgidConnectionCheck() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ConnectionResponse | null>(null);

  async function check() {
    if (pending) return;
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/integrations/mgid/test", {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = (await response.json()) as ConnectionResponse;
      setResult(body);
    } catch {
      setResult({ ok: false, error: "Connection check could not be completed." });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card" aria-label="MGID publisher API connection test">
      <h2>Test the publisher REST API</h2>
      <p>
        Runs one read-only report request from the server. Credentials, website
        statistics, and upstream response bodies are never sent to your browser.
      </p>
      <button className="txk-button txk-button-primary" type="button"
        disabled={pending} onClick={() => void check()}>
        {pending ? "Checking connection…" : "Test MGID connection"}
      </button>
      {result ? (
        <div role="status" aria-live="polite" style={{ marginTop: 16 }}>
          <strong>{result.ok ? "Connected" : "Connection not confirmed"}</strong>
          <p>{labels[result.outcome ?? ""] ?? result.error ?? "Unable to verify connectivity."}</p>
          {result.upstreamStatus ? <p>HTTP status: {result.upstreamStatus}</p> : null}
          <p>Native OpenRTB S2S access: Not verified.</p>
        </div>
      ) : null}
    </section>
  );
}
