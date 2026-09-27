import { requireEmployerContext } from "@/lib/employer/auth";
import {
  createEmployerCompanyBadge,
  listEmployerCompanyBadgeAwards,
  listEmployerCompanyBadges,
} from "@/lib/employer/learning-repository";
import type { EmployerCompanyBadgeInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    const context = await requireEmployerContext({ approved: true });
    const [badges, awards] = await Promise.all([
      listEmployerCompanyBadges(context),
      listEmployerCompanyBadgeAwards(context),
    ]);
    return Response.json({ ok: true, badges, awards });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as EmployerCompanyBadgeInput;
    const badge = await createEmployerCompanyBadge(context, body);
    return Response.json({ ok: true, badge }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
