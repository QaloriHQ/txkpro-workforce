import { requireEmployerContext } from "@/lib/employer/auth";
import {
  createEmployerCertificationDefinition,
  listEmployerCertificationAwards,
  listEmployerCertificationDefinitions,
} from "@/lib/employer/learning-repository";
import type { EmployerCertificationInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const context = await requireEmployerContext({ approved: true });
    const url = new URL(request.url);
    const microCertId = url.searchParams.get("microCertId");
    const definitionId = url.searchParams.get("definitionId");
    const [definitions, awards] = await Promise.all([
      listEmployerCertificationDefinitions(context, microCertId),
      listEmployerCertificationAwards(context, definitionId),
    ]);
    return Response.json({ ok: true, definitions, awards });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as EmployerCertificationInput & {
      microCertId?: string;
    };
    if (!body.microCertId) {
      return Response.json(
        { error: "Micro-Certification course is required." },
        { status: 400 },
      );
    }
    const definition = await createEmployerCertificationDefinition(
      context,
      body.microCertId,
      body,
    );
    return Response.json({ ok: true, definition }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
