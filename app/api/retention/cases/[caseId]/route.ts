import {
  getRetentionCase,
  retentionRpc,
  RetentionError,
  retentionErrorResponse,
} from "@/lib/retention/repository";
import type { RetentionDetail } from "@/lib/retention/types";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ caseId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { caseId } = await context.params;
    return Response.json(
      { data: await getRetentionCase(caseId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return retentionErrorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new RetentionError(403, "Request origin denied.");
    if (Number(request.headers.get("content-length") ?? 0) > 16000)
      throw new RetentionError(400, "Request is too large.");
    const text = await request.text();
    if (text.length > 16000)
      throw new RetentionError(400, "Request is too large.");
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new RetentionError(400, "Invalid JSON.");
    }
    if (
      !body ||
      Array.isArray(body) ||
      typeof body !== "object" ||
      !Number.isSafeInteger(body.expectedVersion) ||
      body.expectedVersion < 0 ||
      typeof body.requestKey !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        body.requestKey,
      ) ||
      !body.command ||
      Array.isArray(body.command) ||
      typeof body.command !== "object"
    ) {
      throw new RetentionError(
        400,
        "Version, request key and command are required.",
      );
    }
    const { caseId } = await context.params;
    const data = await retentionRpc<RetentionDetail>("retention_case_update", {
      p_case_id: caseId,
      p_expected_version: body.expectedVersion,
      p_request_key: body.requestKey,
      p_command: body.command,
    });
    return Response.json(
      { data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return retentionErrorResponse(error);
  }
}
