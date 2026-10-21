import { isIP } from "node:net";

export type MgidCreative = {
  creativeId: string; category: string; advertiserName: string;
  headline: string; body: string; imageUrl: string; destinationUrl: string;
};

export function mgidHttpsUrl(value: unknown, hosts: string[]): string | null {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const url = new URL(value.startsWith("//") ? "https:" + value : value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !hosts.includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

// Only explicitly public routes can be disclosed. Never forward query strings,
// fragments, private group paths or the browser's arbitrary Referer verbatim.
export function mgidPublicPage(request: Request, contentId: string | null): string | null {
  try {
    const page = new URL(request.headers.get("referer") || "");
    if (page.origin !== new URL(request.url).origin || page.username || page.password) return null;
    const feed = ["/community", "/student/community", "/events", "/polls", "/articles"].includes(page.pathname);
    const detail = !!contentId && page.pathname === "/community/posts/" + encodeURIComponent(contentId);
    if (!feed && !detail) return null;
    return page.origin + page.pathname;
  } catch { return null; }
}

export async function requestMgidAd(input: {
  token?: string; ip: string; userAgent: string; language: string;
  page: string; sourceId: string; excludedCategories: string[]; fetcher?: typeof fetch;
}): Promise<MgidCreative | null> {
  if (!input.token || /\s/.test(input.token) || !isIP(input.ip) || !input.userAgent ||
    input.userAgent.length > 1024 || input.language.length > 256) return null;
  const url = new URL("https://api-wa.mgid.com/2099644");
  url.search = new URLSearchParams({ content_type: "json", src_id: input.sourceId,
    token: input.token, ip: input.ip, ua: input.userAgent, cn: "1", source_lang_iso2: "en" }).toString();
  try {
    const response = await (input.fetcher ?? fetch)(url, {
      headers: { Accept: "application/json", "Accept-Language": input.language || "en", Referer: input.page },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(2500),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json") ||
      Number(response.headers.get("content-length") || 0) > 65536 || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 65536) { await reader.cancel(); return null; }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(data) || data.length !== 1) return null;
    const row = data[0];
    if (!row || typeof row !== "object" || !/^[\w-]{1,128}$/.test(String(row.Id ?? "")) ||
      !/^\d{1,10}$/.test(String(row.category ?? "")) ||
      input.excludedCategories.includes(String(row.category)) ||
      typeof row.title !== "string" || !row.title.trim() || row.title.length > 200 ||
      (row.description != null && (typeof row.description !== "string" || row.description.length > 2000))) return null;
    const destinationUrl = mgidHttpsUrl(row.link, ["www.mgid.com", "mgid.com"]);
    const imageUrl = mgidHttpsUrl(row.image, ["imgg-cdn.mgid.com"]);
    if (!destinationUrl || !imageUrl) return null;
    // icon is deliberately discarded: MGID says it is optional for JSON feeds.
    // Never call it per teaser or accidentally render it as an advertiser logo.
    return { creativeId: String(row.Id), category: String(row.category),
      advertiserName: typeof row.adv === "string" && row.adv.trim() ? row.adv.slice(0, 120) : "MGID partner",
      headline: row.title, body: row.description || "", imageUrl, destinationUrl };
  } catch { return null; } // Never log the request URL, token or upstream error.
}
