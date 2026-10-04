import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { publicStudentPage } from "@/lib/student-public-profile/repository";
import { Brand } from "@/components/brand";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await publicStudentPage(`/students/${slug}`);
  if (!page.found) return { title: "Profile unavailable", robots: { index: false, follow: false } };
  return { title: `${page.displayName} | TXKPRO`, description: page.headline || "TXKPRO Student public profile", alternates: { canonical: page.path }, robots: { index: page.robotsIndex ?? false, follow: page.robotsFollow ?? false } };
}
export default async function PublicStudentProfile({ params }: Props) {
  const { slug } = await params;
  const page = await publicStudentPage(`/students/${slug}`);
  if (!page.found) notFound();
  if (page.redirect && page.path) permanentRedirect(page.path);
  return <><header className="topbar"><Brand /></header><main className="page-wrap"><article className="card"><p className="eyebrow">Student public profile</p><h1>{page.displayName}</h1>{page.headline ? <p className="card-sub">{page.headline}</p> : null}{page.bio ? <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{page.bio}</p> : null}<p className="muted">Profile text is supplied by the Student. Instructor Verified Skills are separate records.</p></article></main></>;
}
