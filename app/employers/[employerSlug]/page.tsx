import { OrganizationPublicPage, organizationMetadata } from "@/components/public/organization-page";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ employerSlug: string }> };
async function pathFor({ params }: Props) { const { employerSlug } = await params; return `/employers/${employerSlug}`; }
export async function generateMetadata(props: Props) { return organizationMetadata(await pathFor(props)); }
export default async function Page(props: Props) { return <OrganizationPublicPage path={await pathFor(props)} />; }
