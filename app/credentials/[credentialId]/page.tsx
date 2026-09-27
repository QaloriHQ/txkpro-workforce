import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getPublicEmployerCertification } from "@/lib/public/employer-certification";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify Employer Certification",
  robots: { index: false, follow: true },
};

type RouteContext = {
  params: Promise<{ credentialId: string }>;
};

export default async function CredentialIdRedirectPage({
  params,
}: RouteContext) {
  const { credentialId } = await params;
  const credential = await getPublicEmployerCertification(
    decodeURIComponent(credentialId),
  );

  if (!credential.found) notFound();

  const destination = credential.redirectPath ?? credential.canonicalPath;
  if (!destination) notFound();

  permanentRedirect(destination);
}
