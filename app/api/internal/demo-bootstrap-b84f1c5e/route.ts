import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Temporary staging bootstrap. Remove immediately after demo identities are provisioned.

function demoPassword(email: string) {
  const digest = createHash("sha256")
    .update("txkpro-demo-2026:" + email)
    .digest("hex")
    .slice(0, 16);
  return "Txk!" + digest + "Aa9";
}

async function upsertDemoUser(params: {
  email: string;
  firstName: string;
  lastName: string;
  requestedRole: "student" | "educator";
}) {
  const admin = createAdminClient();
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const existing = listed.users.find(
    (user) => user.email?.toLowerCase() === params.email.toLowerCase(),
  );

  const attributes = {
    password: demoPassword(params.email),
    email_confirm: true,
    user_metadata: {
      first_name: params.firstName,
      last_name: params.lastName,
      requested_role: params.requestedRole,
    },
  };

  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(
      existing.id,
      attributes,
    );
    if (error || !data.user) {
      throw error ?? new Error("Unable to update demo user.");
    }
    return { id: data.user.id, email: params.email };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: params.email,
    ...attributes,
  });
  if (error || !data.user) {
    throw error ?? new Error("Unable to create demo user.");
  }
  return { id: data.user.id, email: params.email };
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  try {
    const [student, instructor] = await Promise.all([
      upsertDemoUser({
        email: "student.demo@txkpro.com",
        firstName: "Demo",
        lastName: "Student",
        requestedRole: "student",
      }),
      upsertDemoUser({
        email: "instructor.demo@txkpro.com",
        firstName: "Demo",
        lastName: "Instructor",
        requestedRole: "educator",
      }),
    ]);

    return Response.json({ ok: true, student, instructor });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown demo bootstrap error.";
    return Response.json(
      {
        ok: false,
        error: message,
        hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        hasSecret: Boolean(
          process.env.SUPABASE_SECRET_KEY ??
            process.env.SUPABASE_SERVICE_ROLE_KEY,
        ),
        vercelEnv: process.env.VERCEL_ENV ?? null,
      },
      { status: 500 },
    );
  }
}
