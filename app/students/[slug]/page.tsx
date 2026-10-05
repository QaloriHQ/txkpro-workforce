import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { publicStudentPage } from "@/lib/student-public-profile/repository";
import { PortfolioView } from "@/components/student/portfolio-view";
import {ProgressCard} from "@/components/pro-points/progress-card";
import {publicPoints} from "@/lib/pro-points/server";
import { Brand } from "@/components/brand";
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
  return {
    title: `${page.displayName} | TXKPRO`,
    description: page.headline || "TXKPRO Student public profile",
    alternates: { canonical: page.path },
    robots: {
      index: page.robotsIndex ?? false,
      follow: page.robotsFollow ?? false,
    },
  };
}
export default async function PublicStudentProfile({ params }: Props) {
  const { slug } = await params;
  const page = await publicStudentPage(`/students/${slug}`);
  if (!page.found) notFound();
  if (page.redirect && page.path) permanentRedirect(page.path);
  const points = await publicPoints(`/students/${slug}`);
  return (
    <>
      <header className="topbar">
        <Brand />
      </header>
      <main className="page-wrap student-public-portfolio">
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
      </main>
    </>
  );
}
