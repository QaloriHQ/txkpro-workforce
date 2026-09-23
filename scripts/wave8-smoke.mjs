import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !secretKey) {
  console.error(
    "Wave 8 smoke test requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY (or legacy service-role key).",
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

async function count(table, filters = []) {
  let query = admin.from(table).select("*", { count: "exact", head: true });
  for (const [column, value] of filters) query = query.eq(column, value);
  const { count: value, error } = await query;
  return { count: value ?? 0, error };
}

async function run() {
  const candidates = await count("wf_student_profiles", [
    ["discoverability_status", "employer_discoverable"],
  ]);
  check(
    "Employer-discoverable staging candidates",
    !candidates.error && candidates.count >= 5,
    candidates.error?.message ?? `${candidates.count} candidates`,
  );

  const verified = await count("wf_student_skills", [["status", "verified"]]);
  check(
    "Verified skill evidence",
    !verified.error && verified.count >= 5,
    verified.error?.message ?? `${verified.count} verified skill rows`,
  );

  const scopes = await count("wf_employer_talent_scopes", [["active", true]]);
  check(
    "Employer Talent scopes",
    !scopes.error && scopes.count >= 1,
    scopes.error?.message ?? `${scopes.count} active scopes`,
  );

  const referrals = await count("wf_referrals");
  check(
    "Referral workflow data",
    !referrals.error && referrals.count >= 1,
    referrals.error?.message ?? `${referrals.count} referrals`,
  );

  const saved = await count("wf_saved_candidates");
  check(
    "Saved Candidate persistence",
    !saved.error && saved.count >= 1,
    saved.error?.message ?? `${saved.count} saved candidates`,
  );

  const { data: anonymousSaved, error: anonymousSavedError } = await anonymous
    .from("wf_saved_candidates")
    .select("saved_candidate_id");
  check(
    "Anonymous Saved Candidate read denied",
    !anonymousSavedError && (anonymousSaved?.length ?? 0) === 0,
    anonymousSavedError?.message ?? `${anonymousSaved?.length ?? 0} rows visible`,
  );

  const { data: anonymousNotes, error: anonymousNotesError } = await anonymous
    .from("wf_employer_candidate_notes")
    .select("note_id");
  check(
    "Anonymous Employer-private note read denied",
    !anonymousNotesError && (anonymousNotes?.length ?? 0) === 0,
    anonymousNotesError?.message ?? `${anonymousNotes?.length ?? 0} rows visible`,
  );

  const failed = checks.filter((item) => !item.pass);
  for (const item of checks) {
    console.log(
      `${item.pass ? "PASS" : "FAIL"}  ${item.name}${item.detail ? ` — ${item.detail}` : ""}`,
    );
  }
  console.log(
    `\nWave 8 smoke: ${checks.length - failed.length}/${checks.length} checks passed.`,
  );
  if (failed.length) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
