import { getEmployerContext } from "@/lib/employer/auth";
import {
  createHiringNeed,
  listHiringNeeds,
} from "@/lib/employer/repository";
import type { HiringNeedInput } from "@/lib/employer/types";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await getEmployerContext(employerId);
    if (!context) {
      return Response.json({ error: "Employer membership required." }, { status: 403 });
    }
    return Response.json({ hiringNeeds: await listHiringNeeds(context) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await getEmployerContext(employerId);
    if (!context) {
      return Response.json({ error: "Employer membership required." }, { status: 403 });
    }
    const input = (await request.json()) as HiringNeedInput;
    const hiringNeed = await createHiringNeed(context, input);
    return Response.json({ ok: true, hiringNeed }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
