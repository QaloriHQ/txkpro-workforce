import { reportProfessionalReview } from "@/lib/professional-profile/reviews";

export async function POST(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const { reviewId } = await params;
    const body = await request.json();
    return Response.json(await reportProfessionalReview(reviewId, String(body.reason || "")));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Report could not be submitted." }, { status: 400 });
  }
}
