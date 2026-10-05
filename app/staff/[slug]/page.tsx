import { ProfessionalPublicPage, professionalMetadata } from "@/components/professional/public-page";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) { const { slug } = await params; return professionalMetadata(`/staff/${slug}`); }
export default async function Page({ params }: Props) { const { slug } = await params; return <ProfessionalPublicPage path={`/staff/${slug}`} />; }
