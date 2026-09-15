import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TXKPRO Workforce",
  description: "Verified local skilled-trades talent for the Greater Texarkana workforce.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
