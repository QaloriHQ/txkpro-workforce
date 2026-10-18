import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./theme.css";
import "./community-shell.css";
import "./impersonation-banner.css";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { impersonationEnabled } from "@/lib/impersonation/session-contract";
import { getImpersonationRegistrySession } from "@/lib/impersonation/registry";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://staging-workforce.txkpro.com";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "TXKPRO Workforce",
  title: {
    default: "TXKPRO Workforce",
    template: "%s | TXKPRO Workforce",
  },
  description:
    "Verified local skilled-trades talent, instructor-backed capability, employer hiring workflows, and placement outcomes for the Greater Texarkana workforce.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "256x256" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "TXKPRO Workforce",
    title: "TXKPRO Workforce",
    description:
      "Connect verified local skilled-trades talent with Greater Texarkana employers.",
    images: [
      {
        url: "/og/txkpro-workforce.jpg",
        width: 1200,
        height: 627,
        alt: "TXKPRO Workforce",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TXKPRO Workforce",
    description:
      "Connect verified local skilled-trades talent with Greater Texarkana employers.",
    images: ["/og/txkpro-workforce.jpg"],
  },
};

const themeScript = `
(() => {
  try {
    const saved = localStorage.getItem("txkpro-theme");
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = saved === "dark" || saved === "light" ? saved : preferred;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = "light";
  }
})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Display a global Exit banner only after the full target authorization
  // bridge is independently certified. A registry entry alone is insufficient.
  let impersonationBanner: React.ReactNode = null;
  if (impersonationEnabled()) {
    try {
      const impersonation = await getImpersonationRegistrySession();
      if (impersonation) impersonationBanner = (
        <ImpersonationBanner targetName={impersonation.target.name}
          targetScope={impersonation.session.target_membership_key} />
      );
    } catch { /* Auth expiry/revocation must not leak another user context. */ }
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{impersonationBanner}{children}</body>
    </html>
  );
}
