import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !secretKey) {
  console.error(
    "Wave 9 smoke requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY (or legacy service-role key).",
  );
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonymous = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
}

async function run() {
  const { data: interviews, error: interviewsError } = await admin
    .from("wf_interview_requests")
    .select("interview_request_id,status,student_id")
    .eq("employer_id", "CON-704D9BFCBC7A");

  check(
    "Interview staging read model seed",
    !interviewsError && (interviews?.length ?? 0) >= 4,
    interviewsError?.message ?? `${interviews?.length ?? 0} interviews`,
  );

  const { data: placement, error: placementError } = await admin
    .from("wf_placements")
    .select("placement_id,status")
    .eq("placement_id", "PLC-STG-KAYLA")
    .maybeSingle();

  check(
    "Seed Placement exists",
    !placementError && placement?.placement_id === "PLC-STG-KAYLA",
    placementError?.message ?? placement?.status ?? "missing",
  );

  const { data: milestones, error: milestonesError } = await admin
    .from("wf_retention_milestones")
    .select("day_number,status")
    .eq("placement_id", "PLC-STG-KAYLA")
    .order("day_number");

  const days = (milestones ?? []).map((item) => item.day_number);
  check(
    "Hire creates exactly Day 30/60/90",
    !milestonesError &&
      days.length === 3 &&
      JSON.stringify(days) === JSON.stringify([30, 60, 90]),
    milestonesError?.message ?? JSON.stringify(days),
  );

  const privateTables = [
    "wf_interview_requests",
    "wf_interview_evaluations",
    "wf_placements",
    "wf_retention_milestones",
  ];

  for (const table of privateTables) {
    const { data, error } = await anonymous.from(table).select("*").limit(1);
    check(
      `Anonymous read denied: ${table}`,
      !error && (data?.length ?? 0) === 0,
      error?.message ?? `${data?.length ?? 0} rows visible`,
    );
  }

  const failed = checks.filter((item) => !item.pass);
  for (const item of checks) {
    console.log(
      `${item.pass ? "PASS" : "FAIL"}  ${item.name}${item.detail ? ` — ${item.detail}` : ""}`,
    );
  }
  console.log(
    `\nWave 9 smoke: ${checks.length - failed.length}/${checks.length} checks passed.`,
  );
  if (failed.length) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
