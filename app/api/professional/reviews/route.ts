import {
  professionalReviewContext,
  saveProfessionalReview,
} from "@/lib/professional-profile/reviews";

function pathFrom(request: Request) {
  return new URL(request.url).searchParams.get("path")?.trim() || "";
}

export async function GET(request: Request) {
  try {
    return Response.json({ context: await professionalReviewContext(pathFrom(request)) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Review eligibility is unavailable." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    return Response.json({ context: await saveProfessionalReview(pathFrom(request), body) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Review could not be saved." }, { status: 400 });
  }
}
