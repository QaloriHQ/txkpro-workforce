import { AuditWorkspacePage } from "@/components/audit/workspace-page";
import { auditPageFilters } from "@/lib/audit-workspace/repository";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AuditWorkspacePage filters={auditPageFilters(await searchParams)} />;
}
