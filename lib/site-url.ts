function parseOrigin(value: string) {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function isLoopback(origin: string) {
  try {
    const url = new URL(origin);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    );
  } catch {
    return false;
  }
}

function isCodespacesOrigin(origin: string) {
  try {
    return new URL(origin).hostname.endsWith(".app.github.dev");
  } catch {
    return false;
  }
}

function isGitHubWebsiteOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === "github.com" || hostname === "www.github.com";
  } catch {
    return false;
  }
}

export function getPublicAppOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
    ? parseOrigin(process.env.NEXT_PUBLIC_SITE_URL)
    : null;

  if (typeof window !== "undefined") {
    const browserOrigin = window.location.origin;

    // A GitHub Codespaces forwarded port is the application host while testing.
    // Never let a repository URL or stale production/local env value send Auth
    // emails to github.com or localhost instead of the running preview.
    if (isCodespacesOrigin(browserOrigin)) return browserOrigin;
    if (configured && isGitHubWebsiteOrigin(configured)) return browserOrigin;
    if (configured && isLoopback(configured) && !isLoopback(browserOrigin)) {
      return browserOrigin;
    }

    return configured ?? browserOrigin;
  }

  if (configured && !isGitHubWebsiteOrigin(configured)) return configured;
  return "http://localhost:3000";
}

export function getAuthCallbackUrl(next: string) {
  const origin = getPublicAppOrigin();
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}
