import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { isPlatformSuperAdmin } from "@/lib/institutions";
import { mgidConfiguration, mgidEventCounts } from "@/lib/mgid/delivery";
import { MgidConnectionCheck } from "@/components/admin/mgid-connection-check";

export const dynamic = "force-dynamic";

export default async function MgidIntegrationPage() {
  const account = await requireRole(["admin"]);
  if (!isPlatformSuperAdmin(account)) notFound();
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "staging") notFound();

  const config = mgidConfiguration();
  const counts = await mgidEventCounts();
  return (
    <main className="page-wrap">
      <p><Link href="/admin">Back to administration</Link></p>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TXKPRO operations / Integrations</p>
          <h1>MGID publisher API</h1>
          <p className="card-sub">Staging connection checks and external native delivery status.</p>
        </div>
      </div>
      <section className="card" aria-label="MGID native feed status">
        <h2>Native JSON feed</h2>
        <p>Feed credentials: {config.configured ? "Configured" : "Missing"}. Delivery switch: {config.enabled ? "Enabled" : "Disabled"}.</p>
        <p>Provider exclusion filters: {config.filtersConfirmed ? "Confirmed" : "Awaiting MGID confirmation — delivery blocked"}.</p>
        <p>Last 24 hours (TXKPRO measurements): {counts.map(item => `${item.eventType}: ${item.count ?? "unavailable"}`).join(" · ")}</p>
        <p>These counts are separate from direct campaign budgets and MGID payout reports. Revenue is not estimated from creative CPC.</p>
        <p>Approved exclusions: adult/dating, gambling, weapons, sensational health claims and get-rich-quick content.</p>
      </section>
      <MgidConnectionCheck />
      <p className="card-sub" style={{ marginTop: 16 }}>
        A successful report API check does not enable native auctions or verify
        MGID OpenRTB S2S permissions. JSON feed delivery uses separate credentials and activation gates.
      </p>
    </main>
  );
}
