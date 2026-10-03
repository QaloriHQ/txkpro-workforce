import { RetentionWorkspacePage } from "@/components/retention/workspace-page";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  return <RetentionWorkspacePage caseId={(await params).caseId} />;
}
