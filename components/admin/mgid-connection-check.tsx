"use client";

import { useState } from "react";

type ConnectionResponse = {
  ok?: boolean;
  provider?: string;
  capability?: string;
  openRtbS2S?: string;
  outcome?: string;
  upstreamStatus?: number;
  advertiserProbe?: { outcome?: string; upstreamStatus?: number };
  error?: string;
};

const labels: Record<string, string> = {
  authenticated: "Publisher reporting API authentication verified.",
  missing_configuration: "Required MGID credentials are missing in this deployment.",
  invalid_configuration: "The configured MGID Client API ID or token format is invalid.",
  authentication_rejected: "The publisher reporting API rejected this request (HTTP 401). This can mean an invalid token or a credential belonging to another MGID API.",
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
        Checks the publisher reporting API and, only if MGID rejects access, the separate read-only advertiser account API. Credentials, website
        statistics, and upstream response bodies are never sent to your browser.
      </p>
      <button className="txk-button txk-button-primary" type="button"
        disabled={pending} onClick={() => void check()}>
        {pending ? "Checking connection…" : "Test MGID connection"}
      </button>
      {result ? (
        <div role="status" aria-live="polite" style={{ marginTop: 16 }}>
          <strong>{result.ok ? "Publisher reporting connected" : result.advertiserProbe?.outcome === "authenticated" ? "Advertiser API verified; publisher access not confirmed" : "Connection not confirmed"}</strong>
          <p>{labels[result.outcome ?? ""] ?? result.error ?? "Unable to verify connectivity."}</p>
          {result.upstreamStatus ? <p>Publisher API HTTP status: {result.upstreamStatus}</p> : null}
          {result.advertiserProbe ? (
            <>
              <p>{result.advertiserProbe.outcome === "authenticated"
                ? "These credentials work on the MGID Ads advertiser API, but did not authorize publisher reporting. Ask MGID for publisher API access or the matching publisher credentials."
                : result.advertiserProbe.outcome === "authentication_rejected"
                ? "The MGID advertiser API also rejected these credentials. Verify that the Client API ID and token come from the same account, are current, and are authorized."
                : result.advertiserProbe.outcome === "permission_denied"
                ? "The advertiser API also denied access (HTTP 403). Ask MGID to confirm the account's API permissions."
                : "Advertiser API check: " + (labels[result.advertiserProbe.outcome ?? ""] ?? "Not verified.")}</p>
              {result.advertiserProbe.upstreamStatus ? <p>Advertiser API HTTP status: {result.advertiserProbe.upstreamStatus}</p> : null}
            </>
          ) : null}
          <p>Native OpenRTB S2S access: Not verified.</p>
        </div>
      ) : null}
    </section>
  );
}
