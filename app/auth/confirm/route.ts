import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/onboarding";
}

function authErrorUrl(request: NextRequest, flow: "recovery" | "confirmation", code: string) {
  const url = new URL("/auth/error", request.url);
  url.searchParams.set("flow", flow);
  url.searchParams.set("code", code);
  return url;
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const flow: "recovery" | "confirmation" = type === "recovery" || next === "/reset-password" ? "recovery" : "confirmation";

  const upstreamError = request.nextUrl.searchParams.get("error_code") ?? request.nextUrl.searchParams.get("error");
  if (upstreamError) return NextResponse.redirect(authErrorUrl(request, flow, upstreamError));

  const supabase = await createServerSupabaseClient();

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      let resolvedNext = next;
      if (flow === "confirmation" && next === "/onboarding") {
        const requestedRole = data.user?.user_metadata?.requested_role;
        if (
          requestedRole === "student" ||
          requestedRole === "educator" ||
          requestedRole === "employer"
        ) {
          resolvedNext = `/onboarding?role=${requestedRole}`;
        }
      }
      return NextResponse.redirect(new URL(resolvedNext, request.url), 303);
    }
    const errorCode =
      typeof error.code === "string" ? error.code : "verification_failed";
    return NextResponse.redirect(authErrorUrl(request, flow, errorCode), 303);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url), 303);
    const errorCode = typeof error.code === "string" ? error.code : "code_exchange_failed";
    return NextResponse.redirect(authErrorUrl(request, flow, errorCode));
  }

  return NextResponse.redirect(
    authErrorUrl(request, flow, "missing_auth_parameters"),
    303,
  );
}
