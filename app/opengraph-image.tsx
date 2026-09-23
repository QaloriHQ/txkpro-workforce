/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";

export const alt = "TXKPRO Workforce — Verified local talent. Human hiring decisions.";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
    "https://staging-workforce.txkpro.com";
  const logoUrl = new URL("/txkpro-logo-dark.svg", siteUrl).toString();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "54px 62px",
          color: "#f7f9fc",
          background:
            "linear-gradient(135deg, #0b0f14 0%, #101923 58%, #0c1420 100%)",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <img
            src={logoUrl}
            width="300"
            height="74"
            alt=""
            style={{ objectFit: "contain" }}
          />
          <div
            style={{
              display: "flex",
              padding: "11px 16px",
              border: "1px solid #29415b",
              borderRadius: "999px",
              color: "#7db9f2",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "0.12em",
            }}
          >
            WORKFORCE
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 920 }}>
          <div
            style={{
              display: "flex",
              marginBottom: 16,
              color: "#56a7f2",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.1em",
            }}
          >
            GREATER TEXARKANA
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 62,
              lineHeight: 1.02,
              fontWeight: 900,
              letterSpacing: "-0.045em",
            }}
          >
            Verified local talent.
            <br />
            Human hiring decisions.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              color: "#a7b2c2",
              fontSize: 25,
              lineHeight: 1.4,
            }}
          >
            Students prove capability. Educators verify. Employers hire.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            {["Students", "Educators", "Employers"].map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  padding: "9px 14px",
                  borderRadius: "999px",
                  background: "#14283d",
                  color: "#d8e9fb",
                  fontSize: 17,
                  fontWeight: 700,
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              color: "#8d9bad",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            workforce.txkpro.com
          </div>
        </div>
      </div>
    ),
    size,
  );
}
