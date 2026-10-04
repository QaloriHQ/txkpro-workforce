import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card, PageHeader, StatusBadge } from "@/components/design-system";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPublicLearningPage } from "@/lib/public/employer-learning";
import { publicLearningStructuredData, serializePublicJsonLd } from "./public-learning-model";

export const publicLearningSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://staging-workforce.txkpro.com").replace(/\/+$/, "");

export async function PublicLearningPage({ path }: { path: string }) {
  const page = await getPublicLearningPage(path);
  if (!page.found) notFound();
  if (page.redirectPath) permanentRedirect(page.redirectPath);
  const links = page.kind === "employer" ? page.courses : page.lessons;
  const structured = publicLearningStructuredData(page, publicLearningSiteUrl);
  return <>
    <header className="topbar"><Brand /><div className="header-actions"><Link href="/employers">Employers</Link><ThemeToggle /></div></header>
    <main className="page-wrap txk-prototype-content txk-public-learning">
      <nav aria-label="Breadcrumb" className="txk-public-learning-breadcrumb">
        <Link href="/employers">Employers</Link>
        {page.employer ? <Link href={page.employer.canonicalPath}>{page.employer.name}</Link> : null}
        {page.kind === "lesson" && page.course ? <Link href={page.course.canonicalPath}>{page.course.title}</Link> : null}
      </nav>
      <PageHeader eyebrow={page.kind === "employer" ? "Employer Learning" : "Employer Training"} title={page.title ?? "Employer Learning"} description={page.description} />
      {page.kind !== "employer" ? <StatusBadge tone="info">Employer Training · Version {page.versionNumber}</StatusBadge> : null}
      {page.learningObjective ? <Card><h2>Learning objective</h2><p>{page.learningObjective}</p>{page.durationMinutes != null ? <p>Estimated duration: {page.durationMinutes} minutes</p> : null}</Card> : null}
      {page.kind === "lesson" ? <Card><h2>Lesson content</h2>
        {page.blocks?.map((block, i) => <section key={i} className="txk-public-learning-block">
          {block.type === "divider" ? <hr /> : <>{block.title ? <h3>{block.title}</h3> : null}{block.text ? <p>{block.text}</p> : null}</>}
        </section>)}
        <p className="muted">Media, interactive assessments, and completion tracking are available through assigned Employer Training.</p>
      </Card> : null}
      {page.kind !== "lesson" ? <Card><h2>{page.kind === "employer" ? "Published courses" : "Published lessons"}</h2>
        {links?.length ? <ul className="txk-public-learning-list">{links.map(link => <li key={link.canonicalPath}><Link href={link.canonicalPath}>{link.title}</Link>{link.description ? <p>{link.description}</p> : null}</li>)}</ul> : <p className="muted">No public {page.kind === "employer" ? "courses" : "lessons"} available.</p>}
      </Card> : null}
      {page.kind !== "employer" ? <p className="muted">Employer Training is employer-issued learning. Viewing this page does not record completion or verify technical skills.</p> : null}
      {structured ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializePublicJsonLd(structured) }} /> : null}
    </main>
  </>;
}
