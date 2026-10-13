import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { publicStudentPage } from "@/lib/student-public-profile/repository";
import { PortfolioView } from "@/components/student/portfolio-view";
import {ProgressCard} from "@/components/pro-points/progress-card";
import {publicPoints} from "@/lib/pro-points/server";
import { Brand } from "@/components/brand";
import Link from "next/link";
import { absolutePublicUrl, publicPageMetadata, serializeJsonLd } from "@/lib/public/seo";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await publicStudentPage(`/students/${slug}`);
  if (!page.found)
    return {
      title: "Profile unavailable",
      robots: { index: false, follow: false },
    };
  return publicPageMetadata({ title: `${page.displayName} | TXKPRO`, description: page.headline || "TXKPRO Student public profile", path: page.path || `/students/${slug}`, index: page.robotsIndex, follow: page.robotsFollow, type: "profile" });
}
export default async function PublicStudentProfile({ params }: Props) {
  const { slug } = await params;
  const page = await publicStudentPage(`/students/${slug}`);
  if (!page.found) notFound();
  if (page.redirect && page.path) permanentRedirect(page.path);
  const points = await publicPoints(`/students/${slug}`);
  const schema = { "@context": "https://schema.org", "@type": "ProfilePage", url: absolutePublicUrl(page.path || `/students/${slug}`), mainEntity: { "@type": "Person", name: page.displayName, description: page.headline || undefined } };
  return (
    <>
      <header className="topbar">
        <Brand />
      </header>
      <main className="page-wrap student-public-portfolio">
        <nav className="txk-public-learning-breadcrumb" aria-label="Breadcrumb"><Link href="/students">Students</Link><span aria-current="page">{page.displayName}</span></nav>
        {page.portfolio ? (
          <PortfolioView
            portfolio={page.portfolio}
            displayName={page.displayName || "Student"}
            headline={page.headline}
            bio={page.bio}
            publicView
          />
        ) : (
          <article className="card">
            <h1>{page.displayName}</h1>
            <p>{page.headline}</p>
          </article>
        )}
        <ProgressCard summary={points}/>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      </main>
    </>
  );
}
