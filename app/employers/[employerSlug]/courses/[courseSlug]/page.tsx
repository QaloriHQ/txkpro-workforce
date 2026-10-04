import { PublicLearningPage, publicLearningSiteUrl } from "../../../public-learning-page";
import { publicLearningMetadata } from "../../../public-learning-model";
import { getPublicLearningPage } from "@/lib/public/employer-learning";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ employerSlug: string; courseSlug: string }> };
async function pathFor({ params }: Props) { const { employerSlug, courseSlug } = await params; return `/employers/${employerSlug}/courses/${courseSlug}`; }
export async function generateMetadata(props: Props) { return publicLearningMetadata(await getPublicLearningPage(await pathFor(props)), publicLearningSiteUrl); }
export default async function Page(props: Props) { return <PublicLearningPage path={await pathFor(props)} />; }
