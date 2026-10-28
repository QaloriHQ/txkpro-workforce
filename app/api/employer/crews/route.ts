import { boundedRequest, classError } from "@/lib/classes/request";
import {
  canManageCompany,
  getEmployerContext,
} from "@/lib/employer/auth";
import { createEmployerCrew } from "@/lib/employer/crews";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return Response.json({ error: "Origin denied" }, { status: 403 });

    const context = await getEmployerContext();
    if (
      !context ||
      context.approvalStatus !== "approved" ||
      context.accountStatus !== "active" ||
      !canManageCompany(context.role)
    )
      return Response.json(
        { error: "Crew management is unavailable for this account." },
        { status: 403 },
      );

    const input = await (await boundedRequest(request, 64000)).json();
    if (!input || typeof input !== "object" || Array.isArray(input))
      return Response.json({ error: "Object required" }, { status: 400 });

    const crew = await createEmployerCrew({
      employerId: context.employerId,
      name: typeof input.name === "string" ? input.name : "",
      description:
        typeof input.description === "string" ? input.description : null,
      memberUserIds: Array.isArray(input.memberUserIds)
        ? input.memberUserIds.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : [],
    });

    return Response.json(
      { crew },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return classError(error);
  }
}
