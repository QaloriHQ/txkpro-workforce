import { auditCsv } from "@/lib/audit-workspace/csv";
import { AuditError, auditErrorResponse, auditFilters, auditQuery } from "@/lib/audit-workspace/repository";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new AuditError(403, "Export request denied.");
    const data = await auditQuery(auditFilters(new URL(request.url).searchParams), true);
    return new Response(auditCsv(data.items), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="audit-events.csv"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "X-Export-Truncated": String(data.truncated), "X-Export-Rows": String(data.items.length),
    } });
  } catch (error) { return auditErrorResponse(error); }
}
