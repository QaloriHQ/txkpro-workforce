import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArticleGallery } from "@/components/community/article-gallery";
import { listPublicArticles } from "@/lib/community/public-repository";
export const dynamic = "force-dynamic";
export default async function ArticlesPage() {
  const articles = await listPublicArticles();
  return <><header className="topbar"><Brand /><div className="header-actions"><ThemeToggle /><Link href="/community">Community</Link></div></header><main className="page-wrap"><h1>Articles</h1><p>Ideas and updates from the TXKPRO community.</p><ArticleGallery items={articles} /></main></>;
}
