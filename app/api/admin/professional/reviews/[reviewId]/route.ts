import { moderateProfessionalReview } from "@/lib/professional-profile/reviews";

export async function PUT(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const { reviewId } = await params;
    const body = await request.json();
    if (!["published", "hidden", "removed"].includes(body.status)) {
      return Response.json({ error: "Choose a valid moderation status." }, { status: 400 });
    }
    return Response.json(await moderateProfessionalReview(reviewId, body.status, String(body.note || "")));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Review moderation failed." }, { status: 400 });
  }
}
