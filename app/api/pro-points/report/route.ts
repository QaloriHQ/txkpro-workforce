import { activityCsv } from "@/lib/pro-points/csv";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("programId");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id))
    return Response.json({ error: "Program required" }, { status: 400 });
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("pro_program_report", { p_id: id });
  if (error)
    return Response.json(
      { error: "Program report unavailable for this scope." },
      { status: error.code === "42501" ? 403 : 400 },
    );
  const records = data as {
    name: string;
    kind: string;
    status: string;
    points: number;
    approved: number;
  }[];
  return new Response(activityCsv(records), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="program-activity.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
