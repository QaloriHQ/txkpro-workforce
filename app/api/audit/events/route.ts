import { auditErrorResponse, auditFilters, auditQuery } from "@/lib/audit-workspace/repository";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return Response.json({ data: await auditQuery(auditFilters(new URL(request.url).searchParams)) },
    { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return auditErrorResponse(error); }
}
