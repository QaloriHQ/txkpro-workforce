import type { MgidDiagnostic } from "./diagnostics";
import { isIP } from "node:net";

export type MgidCreative = {
  creativeId: string | null; category: string | null; advertiserName: string;
  headline: string; body: string; imageUrl: string; destinationUrl: string;
};

export function mgidHttpsUrl(value: unknown, hosts: string[]): string | null {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const url = new URL(value.startsWith("//") ? "https:" + value : value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port ||
      !hosts.includes(url.hostname)) return null;
    // MGID documents legacy HTTP assets. Upgrade only a reviewed provider host,
    // preserving the path/query and never allowing mixed-content rendering.
    if (url.protocol === "http:") url.protocol = "https:";
    return url.href;
  } catch { return null; }
}

// Only explicitly public routes can be disclosed. Never forward query strings,
// fragments, private group paths or the browser's arbitrary Referer verbatim.
export function mgidPublicPage(request: Request, contentId: string | null): string | null {
  try {
    const page = new URL(request.headers.get("referer") || "");
    if (page.origin !== new URL(request.url).origin || page.username || page.password) return null;
    // Workspace placements use only the independently validated public article
    // list. Disclose its public URL, never the private workspace path or query.
    if (page.pathname === "/student") return page.origin + "/articles";
    const feed = ["/community", "/student/community", "/events", "/polls", "/articles"].includes(page.pathname);
    const detail = !!contentId && page.pathname === "/community/posts/" + encodeURIComponent(contentId);
    if (!feed && !detail) return null;
    return page.origin + page.pathname;
  } catch { return null; }
}

export async function requestMgidAd(input: {
  token?: string; ip: string; userAgent: string; language: string;
  page: string; sourceId: string; excludedCategories: string[]; fetcher?: typeof fetch;
  onDiagnostic?: (diagnostic: MgidDiagnostic) => void;
}): Promise<MgidCreative | null> {
  const fail = (outcome: MgidDiagnostic["outcome"], status?: number, field?: MgidDiagnostic["field"], host?: string): null => { input.onDiagnostic?.({ outcome, ...(status ? {status} : {}), ...(field ? {field} : {}), ...(host ? {host} : {}) }); return null; };
  if (!input.token || /\s/.test(input.token) || !isIP(input.ip) || !input.userAgent ||
    input.userAgent.length > 1024 || input.language.length > 256) return fail("invalid_input");
  const url = new URL("https://api-wa.mgid.com/2099644");
  url.search = new URLSearchParams({ content_type: "json", src_id: input.sourceId,
    token: input.token, ip: input.ip, ua: input.userAgent, cn: "1", source_lang_iso2: "en" }).toString();
  try {
    const response = await (input.fetcher ?? fetch)(url, {
      headers: { Accept: "application/json", "Accept-Language": input.language || "en", Referer: input.page },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return fail("http_error", response.status);
    // The feed contract is JSON; validate its bytes and shape rather than
    // discarding a valid feed solely because an upstream MIME label differs.
    if (!response.body) return fail("invalid_response");
    if (Number(response.headers.get("content-length") || 0) > 65536) return fail("oversized_response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 65536) { await reader.cancel(); return fail("oversized_response"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let data: unknown;
    try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return fail("invalid_response"); }
    if (Array.isArray(data) && data.length === 0) return fail("empty");
    if (!Array.isArray(data) || data.length !== 1) return fail("invalid_response");
    const row = data[0];
    if (!row || typeof row !== "object" || Array.isArray(row)) return fail("invalid_creative", undefined, "record");
    if (typeof row.title !== "string" || !row.title.trim() || row.title.length > 200) return fail("invalid_creative", undefined, "title");
    if (row.description != null && (typeof row.description !== "string" || row.description.length > 2000)) return fail("invalid_creative", undefined, "description");
    // IDs/category are provider metadata, not fields required to safely render
    // a title, image and tracked link. Never invent an ID/category when absent.
    const metadata = (value: unknown): string | null => {
      if (typeof value !== "string" && !(typeof value === "number" && Number.isSafeInteger(value))) return null;
      const text = String(value).trim();
      return text && text.length <= 128 ? text : null;
    };
    const creativeId = metadata(row.Id);
    const category = metadata(row.category);
    // A configured local numeric blocklist must remain enforceable. Provider
    // filters are separately mandatory before this function can serve live ads.
    if (input.excludedCategories.length && (!category || !/^\d{1,10}$/.test(category))) return fail("invalid_creative", undefined, "category");
    if (category && input.excludedCategories.includes(category)) return fail("excluded_category");
    const destinationUrl = mgidHttpsUrl(row.link, ["www.mgid.com", "mgid.com", "clck.mgid.com"]);
    const imageUrl = mgidHttpsUrl(row.image, ["imgg-cdn.mgid.com", "imggprx.mgid.com"]);
    if (!destinationUrl || !imageUrl) {
      for (const [field, valid, value] of [["click_url", destinationUrl, row.link], ["image_url", imageUrl, row.image]] as const) {
        if (valid) continue;
        let host: string | undefined;
        try { if (typeof value === "string") host = new URL(value.startsWith("//") ? "https:" + value : value).hostname; } catch { /* No raw value or error logging. */ }
        fail("unsafe_url", undefined, field, host);
      }
      return null;
    }
    // icon is deliberately discarded: MGID says it is optional for JSON feeds.
    // Never call it per teaser or accidentally render it as an advertiser logo.
    return { creativeId, category,
      advertiserName: typeof row.adv === "string" && row.adv.trim() ? row.adv.slice(0, 120) : "MGID partner",
      headline: row.title, body: row.description || "", imageUrl, destinationUrl };
  } catch (error) {
    return fail(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "network_error");
  } // Never log the request URL, token or upstream error.
}
