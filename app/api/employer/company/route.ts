import { getEmployerContext } from "@/lib/employer/auth";
import {
  getEmployerCompanyProfile,
  updateEmployerCompanyProfile,
} from "@/lib/employer/repository";
import type { EmployerCompanyProfilePatch } from "@/lib/employer/types";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await getEmployerContext(employerId);
    if (!context) {
      return Response.json({ error: "Employer membership required." }, { status: 403 });
    }
    return Response.json({ company: await getEmployerCompanyProfile(context) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await getEmployerContext(employerId);
    if (!context) {
      return Response.json({ error: "Employer membership required." }, { status: 403 });
    }
    const input = (await request.json()) as EmployerCompanyProfilePatch;
    const company = await updateEmployerCompanyProfile(context, input);
    return Response.json({ ok: true, company });
  } catch (error) {
    return jsonError(error);
  }
}
