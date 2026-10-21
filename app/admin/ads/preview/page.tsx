import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { ListLayoutPreview } from "@/components/ads/list-layout-preview";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function AdPlacementPreviewPage() {
  await requireRole(["admin"]);
  return <><header className="topbar"><Brand/><div className="header-actions"><span className="pill pill-good">Platform Admin</span><ThemeToggle/><SignOutButton/></div></header>
    <main className="page-wrap"><p><Link href="/admin">← Platform administration</Link></p><div className="page-heading"><div><p className="eyebrow">ADS-01</p><h1>Native placement preview</h1><p className="card-sub">Presentation-only examples. Explore posts, events, polls, articles, comments and sidebar placements. Previewing does not serve inventory, record delivery, spend budget, or activate a provider.</p></div></div>
      <nav className="header-actions" aria-label="Sample content"><Link href="/student/community">Student feed</Link><Link href="/events">Events (Student gallery)</Link><Link href="/polls">Polls (Student gallery)</Link><Link href="/articles">Articles</Link><Link href="/community/posts/POST-ADS04-SAMPLE-ARTICLE-1">Sample article and comments</Link></nav>
      <ListLayoutPreview />

    </main></>;
}
