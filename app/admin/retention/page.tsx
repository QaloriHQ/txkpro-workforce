import { RetentionWorkspacePage } from "@/components/retention/workspace-page";
import type { RetentionFilters } from "@/lib/retention/types";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RetentionFilters>;
}) {
  return <RetentionWorkspacePage platform filters={await searchParams} />;
}
