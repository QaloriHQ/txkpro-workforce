import { requireEmployerContext } from "@/lib/employer/auth";
import {
  finalizeEmployerLearningMediaDelete,
  guardEmployerLearningMediaDelete,
} from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ mediaId: string }> };

export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { mediaId } = await routeContext.params;
    const decoded = decodeURIComponent(mediaId);
    const context = await requireEmployerContext({ approved: true });
    const guarded = await guardEmployerLearningMediaDelete(context, decoded);

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.storage
      .from(guarded.bucketId)
      .remove([guarded.storagePath]);

    if (error) {
      throw new Error(error.message);
    }

    await finalizeEmployerLearningMediaDelete(context, decoded);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
