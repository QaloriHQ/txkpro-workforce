import { normalizeRole, type Membership } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AuthMode = "password" | "otp";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: AuthMode;
      email?: string;
      password?: string;
      token?: string;
    };

    const mode = body.mode;
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!email || !mode) {
      return Response.json(
        { error: "Email and authentication mode are required." },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const authResult =
      mode === "password"
        ? await supabase.auth.signInWithPassword({
            email,
            password: body.password ?? "",
          })
        : await supabase.auth.verifyOtp({
            email,
            token: (body.token ?? "").replace(/\s+/g, ""),
            type: "email",
          });

    if (authResult.error || !authResult.data.user) {
      return Response.json(
        {
          error:
            authResult.error?.code === "invalid_credentials"
              ? "Email or password is incorrect."
              : authResult.error?.message ?? "Authentication failed.",
        },
        { status: 401 },
      );
    }

    const userId = authResult.data.user.id;
    const { data: memberships, error: membershipError } = await supabase
      .from("app_role_memberships")
      .select("role, status, scope_type, scope_id")
      .eq("auth_user_id", userId)
      .eq("status", "active");

    if (membershipError) throw membershipError;

    const role = normalizeRole((memberships ?? []) as Membership[]);
    const destination = role === "admin" ? "/admin" : "/dashboard";

    return Response.json({
      ok: true,
      destination,
      role,
      userId,
    });
  } catch (error) {
    return jsonError(error);
  }
}
