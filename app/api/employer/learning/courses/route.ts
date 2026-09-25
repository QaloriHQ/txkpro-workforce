import { requireEmployerContext } from "@/lib/employer/auth";
import {
  createEmployerMicroCert,
  listEmployerMicroCerts,
} from "@/lib/employer/learning-repository";
import {
  MICRO_CERT_STATUSES,
  type MicroCertInput,
  type MicroCertStatus,
} from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const context = await requireEmployerContext({
      employerId: url.searchParams.get("employerId"),
      approved: true,
    });
    const rawStatus = url.searchParams.get("status");
    const status =
      rawStatus && MICRO_CERT_STATUSES.includes(rawStatus as MicroCertStatus)
        ? (rawStatus as MicroCertStatus)
        : null;
    if (rawStatus && !status) {
      return Response.json(
        { error: "Invalid Micro-Certification status." },
        { status: 400 },
      );
    }
    return Response.json({
      courses: await listEmployerMicroCerts(context, status),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const context = await requireEmployerContext({
      employerId: url.searchParams.get("employerId"),
      approved: true,
    });
    const input = (await request.json()) as MicroCertInput;
    const course = await createEmployerMicroCert(context, input);
    return Response.json({ ok: true, course }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
