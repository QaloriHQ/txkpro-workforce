import { requireEmployerContext } from "@/lib/employer/auth";
import {
  getEmployerMicroCert,
  updateEmployerMicroCert,
} from "@/lib/employer/learning-repository";
import type { MicroCertInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({
      employerId: new URL(request.url).searchParams.get("employerId"),
      approved: true,
    });
    return Response.json({
      course: await getEmployerMicroCert(context, decodeURIComponent(id)),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({
      employerId: new URL(request.url).searchParams.get("employerId"),
      approved: true,
    });
    const body = (await request.json()) as MicroCertInput & {
      expectedVersionNumber?: number;
    };
    const { expectedVersionNumber, ...input } = body;
    const course = await updateEmployerMicroCert(
      context,
      decodeURIComponent(id),
      input,
      expectedVersionNumber,
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
