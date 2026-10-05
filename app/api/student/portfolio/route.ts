import {
  noStore,
  portfolioFailure,
  studentPortfolio,
} from "@/lib/student-portfolio/repository";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await studentPortfolio(), { headers: noStore });
  } catch (e) {
    return portfolioFailure(e);
  }
}
export async function PUT(request: Request) {
  try {
    const input = await request.json().catch(() => null);
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      JSON.stringify(input).length > 18000 ||
      ![
        "preferences",
        "layout",
        "project_save",
        "project_delete",
        "file_update",
      ].includes(input.op)
    )
      throw new Response("Invalid portfolio action.", { status: 400 });
    return Response.json(await studentPortfolio(input), { headers: noStore });
  } catch (e) {
    return portfolioFailure(e);
  }
}
