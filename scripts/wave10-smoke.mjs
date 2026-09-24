import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !secretKey) {
  console.error(
    "Wave 10 smoke requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY (or legacy service-role key).",
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
  const canonicalTables = [
    "wf_sms_consents",
    "wf_retention_messages",
    "wf_retention_responses",
    "wf_retention_cases",
    "wf_retention_case_notes",
  ];

  for (const table of canonicalTables) {
    const { error } = await admin.from(table).select("*").limit(1);
    check(
      `Service role can read canonical table: ${table}`,
      !error,
      error?.message ?? "available",
    );
  }

  const { data: milestones, error: milestonesError } = await admin
    .from("wf_retention_milestones")
    .select("day_number,status")
    .eq("placement_id", "PLC-STG-KAYLA")
    .order("day_number");

  const days = (milestones ?? []).map((item) => item.day_number);
  check(
    "Seed Placement retains exactly Day 30/60/90 milestones",
    !milestonesError &&
      days.length === 3 &&
      JSON.stringify(days) === JSON.stringify([30, 60, 90]),
    milestonesError?.message ?? JSON.stringify(days),
  );

  for (const table of canonicalTables) {
    const { data, error } = await anonymous.from(table).select("*").limit(1);
    check(
      `Anonymous read denied: ${table}`,
      Boolean(error) || (data?.length ?? 0) === 0,
      error?.message ?? `${data?.length ?? 0} rows visible`,
    );
  }

  const { error: anonymousClaimError } = await anonymous.rpc(
    "retention_claim_due_milestones",
    { p_limit: 1 },
  );
  check(
    "Anonymous scheduler claim RPC denied",
    Boolean(anonymousClaimError),
    anonymousClaimError?.message ?? "unexpected access",
  );

  const failed = checks.filter((item) => !item.pass);
  for (const item of checks) {
    console.log(
      `${item.pass ? "PASS" : "FAIL"}  ${item.name}${item.detail ? ` — ${item.detail}` : ""}`,
    );
  }
  console.log(
    `\nWave 10 smoke: ${checks.length - failed.length}/${checks.length} checks passed.`,
  );
  if (failed.length) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
