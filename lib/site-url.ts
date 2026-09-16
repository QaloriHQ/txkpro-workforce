function normalizeOrigin(value: string) {
  return value.trim().replace(/\/$/, "");
}

function isLoopback(origin: string) {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
}

export function getPublicAppOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL ? normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) : null;

  if (typeof window !== "undefined") {
    const browserOrigin = normalizeOrigin(window.location.origin);

    // Never send a user back to localhost when the app is actually running on a
    // public preview or production host. This is especially important in GitHub
    // Codespaces, where the browser origin is *.app.github.dev.
    if (configured && isLoopback(configured) && !isLoopback(browserOrigin)) return browserOrigin;
    return configured ?? browserOrigin;
  }

  return configured ?? "http://localhost:3000";
}

export function getAuthCallbackUrl(next: string) {
  const origin = getPublicAppOrigin();
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}
