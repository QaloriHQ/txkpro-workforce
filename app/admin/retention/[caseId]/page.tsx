import { RetentionWorkspacePage } from "@/components/retention/workspace-page";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  return <RetentionWorkspacePage platform caseId={(await params).caseId} />;
}
