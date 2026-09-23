import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://staging-workforce.txkpro.com";

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
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: ["/favicon.svg"],
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
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "TXKPRO Workforce — Verified local talent. Human hiring decisions.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TXKPRO Workforce",
    description:
      "Connect verified local skilled-trades talent with Greater Texarkana employers.",
    images: ["/opengraph-image"],
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
