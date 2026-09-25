import { requireEmployerContext } from "@/lib/employer/auth";
import {
  getEmployerLearningReusableLibrary,
  insertEmployerLearningLessonTemplate,
  insertEmployerLearningReusableBlock,
  saveEmployerLearningLessonTemplate,
  saveEmployerLearningReusableBlock,
} from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    const context = await requireEmployerContext({ approved: true });
    return Response.json({
      library: await getEmployerLearningReusableLibrary(context),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as {
      action?: string;
      microCertId?: string;
      lessonId?: string;
      blockId?: string;
      reusableBlockId?: string;
      lessonTemplateId?: string;
      sectionId?: string | null;
      title?: string;
    };

    const microCertId = String(body.microCertId ?? "");
    if (!microCertId) {
      return Response.json({ error: "microCertId is required." }, { status: 400 });
    }

    switch (body.action) {
      case "save_block":
        return Response.json({
          ok: true,
          library: await saveEmployerLearningReusableBlock(
            context,
            microCertId,
            String(body.lessonId ?? ""),
            String(body.blockId ?? ""),
            String(body.title ?? ""),
          ),
        });
      case "insert_block":
        return Response.json({
          ok: true,
          course: await insertEmployerLearningReusableBlock(
            context,
            microCertId,
            String(body.lessonId ?? ""),
            String(body.reusableBlockId ?? ""),
          ),
        });
      case "save_lesson_template":
        return Response.json({
          ok: true,
          library: await saveEmployerLearningLessonTemplate(
            context,
            microCertId,
            String(body.lessonId ?? ""),
            String(body.title ?? ""),
          ),
        });
      case "insert_lesson_template":
        return Response.json({
          ok: true,
          course: await insertEmployerLearningLessonTemplate(
            context,
            microCertId,
            String(body.lessonTemplateId ?? ""),
            body.sectionId ?? null,
          ),
        });
      default:
        return Response.json({ error: "Unknown reusable content action." }, { status: 400 });
    }
  } catch (error) {
    return jsonError(error);
  }
}
