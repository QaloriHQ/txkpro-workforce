import { getPublicEmployerCertification } from "@/lib/public/employer-certification";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ credentialId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { credentialId } = await context.params;
    const credential = await getPublicEmployerCertification(
      decodeURIComponent(credentialId),
    );

    if (!credential.found || !credential.canonicalPath) {
      return Response.json(
        { found: false },
        {
          status: 404,
          headers: {
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }

    return Response.json(credential, {
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { found: false, error: "Credential verification is unavailable." },
      {
        status: 500,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  }
}
