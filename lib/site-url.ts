function normalizeOrigin(value: string) {
  return value.trim().replace(/\/$/, "");
}

export function getPublicAppOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return normalizeOrigin(configured);

  if (typeof window !== "undefined") {
    return normalizeOrigin(window.location.origin);
  }

  return "http://localhost:3000";
}

export function getAuthCallbackUrl(next: string) {
  const origin = getPublicAppOrigin();
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}
