import { requireStudentContext } from "@/lib/student/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ assignmentId: string }> };

export async function POST(_request: Request, routeContext: RouteContext) {
  try {
    await requireStudentContext();
    const { assignmentId } = await routeContext.params;
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("student_employer_training_preview", {
      p_assignment_id: decodeURIComponent(assignmentId),
    });
    if (error) {
      if (/membership required|not found|cancelled/i.test(error.message))
        return Response.json({ error: "Assignment not found" }, { status: 404 });
      throw error;
    }
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
