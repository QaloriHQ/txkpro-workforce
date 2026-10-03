import { getAccountContext } from "@/lib/auth";
import { onboardingInstitutions } from "@/lib/institutions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

const ALLOWED_ROLES = new Set<Role>(["student", "educator", "employer", "admin"]);
type JsonObject = Record<string, unknown>;

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function requestedRole(value: unknown): Role | null {
  return typeof value === "string" && ALLOWED_ROLES.has(value as Role) ? (value as Role) : null;
}

function safeProfileData(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length > 24_000) throw new Error("Onboarding data is too large.");
  return JSON.parse(serialized) as JsonObject;
}

async function syncStudentRetentionSmsConsent(
  account: NonNullable<Awaited<ReturnType<typeof getAccountContext>>>,
  profileData: JsonObject,
) {
  const admin = createAdminClient();
  const phone = text(profileData.phone, 60) || account.phone || null;
  const consented = profileData.smsRetentionConsent === true;

  if (consented) {
    const now = new Date().toISOString();
    const { error } = await admin.from("wf_sms_consents").upsert(
      {
        user_id: account.legacyUserId,
        category: "retention",
        status: "consented",
        phone_snapshot: phone,
        sms_consent_at: now,
        consent_source: "student_onboarding",
        opt_out_at: null,
        updated_at: now,
      },
      { onConflict: "user_id,category" },
    );
    if (error) throw error;
    return;
  }

  const { data: existing, error: readError } = await admin
    .from("wf_sms_consents")
    .select("consent_id")
    .eq("user_id", account.legacyUserId)
    .eq("category", "retention")
    .maybeSingle();
  if (readError) throw readError;

  if (!existing) {
    const { error } = await admin.from("wf_sms_consents").insert({
      user_id: account.legacyUserId,
      category: "retention",
      status: "unknown",
      phone_snapshot: phone,
      consent_source: "student_onboarding",
    });
    if (error) throw error;
  }
}

export async function GET() {
  const account = await getAccountContext();
  if (!account) return Response.json({ error: "Unauthorized or workforce account is not linked." }, { status: 401 });
  try {
    return Response.json({ account, institutions: await onboardingInstitutions() });
  } catch {
    return Response.json({ error: "Institution directory is unavailable. Please try again shortly." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const account = await getAccountContext();
    if (!account) return Response.json({ error: "Unauthorized or workforce account is not linked." }, { status: 401 });
    const body = await request.json();
    const role = requestedRole(body.role) ?? account.onboarding?.selected_role ?? account.role;
    if (!role) return Response.json({ error: "Choose an account type." }, { status: 400 });
    if (account.role && role !== account.role) return Response.json({ error: "Your provisioned TXKPRO role cannot be changed through onboarding." }, { status: 403 });
    if (role === "admin" && account.role !== "admin") return Response.json({ error: "Administrator access must be provisioned by TXKPRO." }, { status: 403 });
    if (role === "admin" && account.role === "admin") {
      return Response.json({ ok: true, role: "admin", status: "complete", redirectTo: "/admin" });
    }

    const incoming = safeProfileData(body.profileData);
    const profileData = { ...(account.onboarding?.profile_data ?? {}), ...incoming };
    const currentStep = Math.min(6, Math.max(1, Number(body.currentStep) || 1));

    if (role === "employer" || role === "student") {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.rpc(
        role === "employer"
          ? "save_employer_onboarding_step"
          : "save_student_onboarding_step",
        {
          p_current_step: currentStep,
          p_profile_data: profileData,
        },
      );
      if (error) throw error;
      return Response.json(data ?? { ok: true, role, currentStep, profileData });
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("save_educator_onboarding", {
      p_profile_data: profileData, p_current_step: Math.min(4, currentStep), p_complete: false,
    });
    if (error) return Response.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save onboarding.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await getAccountContext();
    if (!account) return Response.json({ error: "Unauthorized or workforce account is not linked." }, { status: 401 });
    const body = await request.json();
    const role = requestedRole(body.role) ?? account.onboarding?.selected_role ?? account.role;
    if (!role) return Response.json({ error: "Choose an account type." }, { status: 400 });
    if (account.role && role !== account.role) return Response.json({ error: "Your provisioned TXKPRO role cannot be changed through onboarding." }, { status: 403 });
    if (role === "admin" && account.role !== "admin") return Response.json({ error: "Administrator access must be provisioned by TXKPRO." }, { status: 403 });
    if (role === "admin" && account.role === "admin") {
      return Response.json({ ok: true, role: "admin", status: "complete", redirectTo: "/admin" });
    }

    const incoming = safeProfileData(body.profileData);
    const profileData = { ...(account.onboarding?.profile_data ?? {}), ...incoming };
    const firstName = text(profileData.firstName, 100) || account.firstName;
    const lastName = text(profileData.lastName, 100) || account.lastName;
    if (!firstName || !lastName) return Response.json({ error: "First and last name are required." }, { status: 400 });

    const retentionSmsConsent = role === "student" && profileData.smsRetentionConsent === true;
    const retentionPhone = text(profileData.phone, 60) || account.phone;
    if (retentionSmsConsent && !retentionPhone) {
      return Response.json(
        { error: "Add a mobile phone number before opting in to retention SMS check-ins." },
        { status: 400 },
      );
    }

    if (role === "employer" || role === "student") {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.rpc(
        role === "employer"
          ? "complete_employer_onboarding"
          : "complete_student_onboarding",
        { p_profile_data: profileData },
      );
      if (error) throw error;
      if (role === "student") {
        await syncStudentRetentionSmsConsent(account, profileData);
      }
      return Response.json(
        data ??
          (role === "employer"
            ? {
                ok: true,
                status: "pending_review",
                role: "employer",
                redirectTo: "/onboarding?pending=1",
              }
            : {
                ok: true,
                status: "complete",
                role: "student",
                redirectTo: "/dashboard",
              }),
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("save_educator_onboarding", {
      p_profile_data: profileData, p_current_step: 4, p_complete: true,
    });
    if (error) return Response.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete onboarding.";
    return Response.json({ error: message }, { status: 400 });
  }
}
