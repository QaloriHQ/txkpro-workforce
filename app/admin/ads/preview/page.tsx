import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { SponsoredPlacement } from "@/components/ads/sponsored-placement";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function AdPlacementPreviewPage() {
  await requireRole(["admin"]);
  return <><header className="topbar"><Brand/><div className="header-actions"><span className="pill pill-good">Platform Admin</span><ThemeToggle/><SignOutButton/></div></header>
    <main className="page-wrap"><p><Link href="/admin">← Platform administration</Link></p><div className="page-heading"><div><p className="eyebrow">ADS-01</p><h1>Native placement preview</h1><p className="card-sub">Presentation-only examples. Previewing does not serve inventory, record delivery, spend budget, or activate a provider.</p></div></div>
      <div className="ad-preview-grid">{(["in_feed","in_comments","in_article","multiplex"] as const).map(placement=><section className="card" key={placement}><h2>{placement.replaceAll("_"," ")}</h2><SponsoredPlacement placement={placement} preview/></section>)}</div>
    </main></>;
}
