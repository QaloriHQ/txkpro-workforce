/**
 * MGID publisher REST API connectivity, not OpenRTB ad auction authorization.
 * Fixed upstream host and read-only, account-scoped report prevent SSRF.
 * No tokens, account details, report rows, or upstream error bodies are returned.
 */
export type MgidConnectionOutcome =
  | "authenticated"
  | "missing_configuration"
  | "invalid_configuration"
  | "authentication_rejected"
  | "permission_denied"
  | "invalid_report_request"
  | "rate_limited"
  | "upstream_unavailable"
  | "unexpected_response"
  | "timed_out";

export type MgidAdvertiserProbe = {
  outcome: MgidConnectionOutcome;
  upstreamStatus?: number;
};

export type MgidConnectionResult = {
  advertiserProbe?: MgidAdvertiserProbe;
  ok: boolean;
  provider: "mgid";
  capability: "publisher_rest_reporting";
  openRtbS2S: "not_verified";
  outcome: MgidConnectionOutcome;
  upstreamStatus?: number;
};

const MAX_RESPONSE_CHARS = 32_768;

function result(outcome: MgidConnectionOutcome, upstreamStatus?: number): MgidConnectionResult {
  return {
    ok: outcome === "authenticated",
    provider: "mgid",
    capability: "publisher_rest_reporting",
    openRtbS2S: "not_verified",
    outcome,
    ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
  };
}

export async function checkMgidPublisherRestApi(input: {
  clientId: string | undefined;
  token: string | undefined;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<MgidConnectionResult> {
  const clientId = input.clientId?.trim();
  const token = input.token?.trim();

  if (!clientId || !token) return result("missing_configuration");
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(clientId) || /\s/.test(token)) {
    return result("invalid_configuration");
  }

  const url = new URL(
    "https://api.mgid.com/v2/pub/account/" +
      encodeURIComponent(clientId) +
      "/website-custom-report"
  );
  url.searchParams.set("dateInterval", "yesterday");
  url.searchParams.set("dimensions", "date,website");
  url.searchParams.set("metrics", "pageViews");
  url.searchParams.set("limit", "1");

  const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 4_000, 1), 10_000);
  const signal = AbortSignal.timeout(timeoutMs);

  try {
    const response = await (input.fetcher ?? fetch)(url.toString(), {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Accept-Language": "en",
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      cache: "no-store",
      redirect: "error",
      signal,
    });

    if (response.status === 401) return result("authentication_rejected", 401);
    if (response.status === 403) return result("permission_denied", 403);
    if (response.status === 422) return result("invalid_report_request", 422);
    if (response.status === 429) return result("rate_limited", 429);
    if (!response.ok) return result("upstream_unavailable", response.status);

    const mediaType = (response.headers.get("content-type") ?? "").toLowerCase();
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (!mediaType.includes("application/json") ||
        (contentLength > 0 && contentLength > MAX_RESPONSE_CHARS)) {
      return result("unexpected_response", response.status);
    }

    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_CHARS) return result("unexpected_response", response.status);
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return result("unexpected_response", response.status);
    }

    // The documented website report responds with a JSON array, including [] for
    // valid accounts that have no website metrics for the requested date.
    if (!Array.isArray(payload)) return result("unexpected_response", response.status);

    return result("authenticated", response.status);
  } catch (error) {
    if (signal.aborted ||
        (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))) {
      return result("timed_out");
    }
    return result("upstream_unavailable");
  }
}

/**
 * The MGID Ads (advertiser) API is distinct from MGID publisher reporting.
 * A successful advertiser check confirms credentials for only that API.
 * Always discard the account's wallet and other response fields.
 */
export async function checkMgidAdvertiserRestApi(input: {
  clientId: string | undefined;
  token: string | undefined;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<MgidAdvertiserProbe> {
  const clientId = input.clientId?.trim();
  const token = input.token?.trim();
  if (!clientId || !token) return { outcome: "missing_configuration" };
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(clientId) || /\s/.test(token)) {
    return { outcome: "invalid_configuration" };
  }

  // Only a fixed, documented, read-only MGID Ads account route is permitted.
  const url = "https://api.mgid.com/v1/clients/" + encodeURIComponent(clientId);
  const signal = AbortSignal.timeout(Math.min(Math.max(input.timeoutMs ?? 4_000, 1), 10_000));
  try {
    const response = await (input.fetcher ?? fetch)(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal,
    });
    const status = response.status;
    if (status === 401) return { outcome: "authentication_rejected", upstreamStatus: status };
    if (status === 403) return { outcome: "permission_denied", upstreamStatus: status };
    if (status === 429) return { outcome: "rate_limited", upstreamStatus: status };
    if (!response.ok) return { outcome: "upstream_unavailable", upstreamStatus: status };
    const mediaType = (response.headers.get("content-type") ?? "").toLowerCase();
    const size = Number(response.headers.get("content-length") ?? 0);
    if (!mediaType.includes("application/json") || size > MAX_RESPONSE_CHARS) {
      return { outcome: "unexpected_response", upstreamStatus: status };
    }
    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_CHARS) return { outcome: "unexpected_response", upstreamStatus: status };
    let data: unknown;
    try { data = JSON.parse(raw); } catch {
      return { outcome: "unexpected_response", upstreamStatus: status };
    }
    // The authenticated advertiser account endpoint has an id property.
    // Never return data, which may include advertiser account finances.
    if (!data || Array.isArray(data) || typeof data !== "object" ||
      !("id" in data) || String(data.id) !== clientId) {
      return { outcome: "unexpected_response", upstreamStatus: status };
    }
    return { outcome: "authenticated", upstreamStatus: status };
  } catch (error) {
    if (signal.aborted || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))) {
      return { outcome: "timed_out" };
    }
    return { outcome: "upstream_unavailable" };
  }
}

/**
 * Only check advertiser credentials if the publisher endpoint denies
 * authentication/authorization; no probing after a successful publisher check.
 */
export async function diagnoseMgidApiAccess(input: {
  clientId: string | undefined;
  token: string | undefined;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<MgidConnectionResult> {
  const publisher = await checkMgidPublisherRestApi(input);
  if (publisher.outcome !== "authentication_rejected" && publisher.outcome !== "permission_denied") {
    return publisher;
  }
  const advertiserProbe = await checkMgidAdvertiserRestApi(input);
  return { ...publisher, advertiserProbe };
}
