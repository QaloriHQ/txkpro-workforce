import { OrganizationPublicPage, organizationMetadata } from "@/components/public/organization-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type Props = { params: Promise<{ institutionSlug: string }> };
async function pathFor({ params }: Props) { return `/institutions/${(await params).institutionSlug}`; }
export async function generateMetadata(props: Props) { return organizationMetadata(await pathFor(props)); }
export default async function Page(props: Props) { return <OrganizationPublicPage path={await pathFor(props)} />; }
