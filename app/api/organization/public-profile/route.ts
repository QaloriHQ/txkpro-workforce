import { getEmployerContext } from "@/lib/employer/auth";
import { getInstitutionContext } from "@/lib/institution/auth";
import {
  organizationSettings,
  type OrganizationSettingsInput,
} from "@/lib/public/organization-profile";

async function context(kind?: unknown, entityId?: unknown) {
  if (kind === "employer") {
    const employer = await getEmployerContext(typeof entityId === "string" ? entityId : undefined);
    if (employer) return { kind: "employer" as const, entityId: employer.employerId };
  }
  if (kind === "institution") {
    const institution = await getInstitutionContext(typeof entityId === "string" ? entityId : undefined);
    if (institution) return { kind: "institution" as const, entityId: institution.institutionId };
  }
  const employer = await getEmployerContext();
  if (employer) return { kind: "employer" as const, entityId: employer.employerId };
  const institution = await getInstitutionContext();
  if (institution) return { kind: "institution" as const, entityId: institution.institutionId };
  throw new Response("Organization membership required.", { status: 403 });
}

export async function GET() {
  try {
    const owner = await context();
    return Response.json({ profile: await organizationSettings(owner.kind, owner.entityId) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Profile settings are unavailable." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as OrganizationSettingsInput & { kind?: unknown; entityId?: unknown };
    const owner = await context(body.kind, body.entityId);
    const input = { ...body } as Record<string, unknown>;
    delete input.kind;
    delete input.entityId;
    return Response.json({ profile: await organizationSettings(owner.kind, owner.entityId, input as OrganizationSettingsInput) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Profile could not be saved." }, { status: 400 });
  }
}
