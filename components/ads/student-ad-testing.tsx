"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type AdTestMode = "image" | "text" | "live";
const AdTestContext = createContext<AdTestMode | null>(null);
export function useAdTestMode() { return useContext(AdTestContext); }

export function StudentAdTesting({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [mode, setMode] = useState<AdTestMode>("image");
  const path = usePathname();
  const surface = ["/student", "/student/community", "/events", "/polls", "/articles"].includes(path) || path.startsWith("/community/posts/");
  const active = enabled && surface;
  return <AdTestContext.Provider value={active ? mode : null}>
    {active ? <section className="student-ad-testing" aria-label="Staging ad testing">
      <div><strong>Staging ad testing</strong><p role="status">{mode === "live" ? "Live inventory: provider ads may be unavailable. Normal tracking applies." : "Sample ads: no provider requests, impressions or clicks are recorded."} Ads appear only in lists with at least 3 items.</p></div>
      <label>Ad display<select value={mode} onChange={event => setMode(event.target.value as AdTestMode)}><option value="image">Sample with image</option><option value="text">Sample text only</option><option value="live">Live inventory</option></select></label>
      <nav aria-label="Ad test locations"><Link href="/student/community">Community</Link><Link href="/student">Workspace</Link><Link href="/events">Events</Link><Link href="/polls">Polls</Link><Link href="/articles">Articles</Link><Link href="/community/posts/POST-ADS04-SAMPLE-ARTICLE-1">Sample comments</Link></nav>
    </section> : null}
    {children}
  </AdTestContext.Provider>;
}
