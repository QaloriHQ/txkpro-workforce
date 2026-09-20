import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !secretKey) {
  console.error(
    "Wave 7 smoke test requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY (or legacy service-role key).",
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
  const { data: seeds, error: seedError } = await admin
    .from("wf_hiring_needs")
    .select("hiring_need_id, employer_id, status, seed_key")
    .like("seed_key", "wave7_%")
    .order("seed_key");
  check(
    "Wave 7 Hiring Needs table + production seed",
    !seedError && (seeds?.length ?? 0) >= 2 && seeds?.every((row) => row.status === "draft"),
    seedError?.message ?? `${seeds?.length ?? 0} draft seeds`,
  );

  const seedIds = (seeds ?? []).map((row) => row.hiring_need_id);
  const { data: events, error: eventError } = await admin
    .from("wf_domain_events")
    .select("event_type, target_id, result")
    .eq("event_type", "HIRING_NEED_CREATED")
    .in("target_id", seedIds.length ? seedIds : ["__none__"]);
  check(
    "Hiring Need domain events emitted",
    !eventError && (events?.length ?? 0) === seedIds.length,
    eventError?.message ?? `${events?.length ?? 0}/${seedIds.length} events`,
  );

  const { data: audits, error: auditError } = await admin
    .from("platform_audit_events")
    .select("action, entity_id, result, correlation_id")
    .eq("action", "HIRING_NEED_CREATED")
    .in("entity_id", seedIds.length ? seedIds : ["__none__"]);
  check(
    "Canonical audit records emitted",
    !auditError &&
      (audits?.length ?? 0) === seedIds.length &&
      audits?.every((row) => row.result === "success" && row.correlation_id),
    auditError?.message ?? `${audits?.length ?? 0}/${seedIds.length} audits`,
  );

  const { data: aliases, error: aliasError } = await admin
    .from("app_role_memberships")
    .select("role, scope_type, scope_id, status")
    .in("role", [
      "employer_owner",
      "employer_admin",
      "recruiter",
      "hiring_manager",
      "employer_read_only",
    ])
    .eq("status", "active");
  check(
    "Canonical Employer membership vocabulary available",
    !aliasError && (aliases?.length ?? 0) > 0,
    aliasError?.message ?? `${aliases?.length ?? 0} active canonical Employer memberships`,
  );

  const { error: profileError } = await admin
    .from("wf_contractor_profiles")
    .select(
      "contractor_id, service_area_json, hiring_roles_json, annual_hiring_volume, hiring_horizon, workforce_description, profile_version",
    )
    .limit(1);
  check(
    "Company Profile persistence columns available",
    !profileError,
    profileError?.message ?? "Employer profile extension readable",
  );

  const { error: onboardingError } = await admin
    .from("wf_onboarding_accounts")
    .select("status, current_step, employer_id")
    .limit(1);
  check(
    "Employer onboarding persistence linked",
    !onboardingError,
    onboardingError?.message ?? "Onboarding employer_id readable",
  );

  const { data: anonymousNeeds, error: anonymousError } = await anonymous
    .from("wf_hiring_needs")
    .select("hiring_need_id")
    .like("seed_key", "wave7_%");
  check(
    "Anonymous Hiring Need read denied by RLS",
    !anonymousError && (anonymousNeeds?.length ?? 0) === 0,
    anonymousError?.message ?? `${anonymousNeeds?.length ?? 0} rows visible anonymously`,
  );

  const failed = checks.filter((item) => !item.pass);
  for (const item of checks) {
    console.log(`${item.pass ? "PASS" : "FAIL"}  ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
  }

  console.log(`\nWave 7 smoke: ${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
