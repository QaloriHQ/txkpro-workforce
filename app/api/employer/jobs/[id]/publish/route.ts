import { requireEmployerContext } from "@/lib/employer/auth";
import { jsonError } from "@/lib/http";

// ATS-02 will replace this explicit gate after a published, same-tenant,
// immutable pipeline version can be validated and assigned atomically.
export async function POST(request: Request) {
  try {
    await requireEmployerContext({
      employerId: new URL(request.url).searchParams.get("employerId"),
      approved: true,
    });
    return Response.json({
      error: "Publication requires a published pipeline version. Complete ATS-02 first.",
      dependency: "ATS-02",
    }, { status: 409 });
  } catch (error) { return jsonError(error); }
}
