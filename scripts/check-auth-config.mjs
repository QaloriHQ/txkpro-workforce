const port = process.env.PORT || "3000";
const rawConfiguredSite = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
const codespaceName = process.env.CODESPACE_NAME;
const forwardingDomain =
  process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev";
const codespaceOrigin = codespaceName
  ? `https://${codespaceName}-${port}.${forwardingDomain}`
  : null;
const localOrigin = `http://localhost:${port}`;

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopback(value) {
  const url = parseUrl(value);
  return Boolean(
    url &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname),
  );
}

function isGitHubWebsite(value) {
  const url = parseUrl(value);
  return Boolean(
    url && ["github.com", "www.github.com"].includes(url.hostname.toLowerCase()),
  );
}

function isHttps(value) {
  return parseUrl(value)?.protocol === "https:";
}

const configuredUrl = rawConfiguredSite ? parseUrl(rawConfiguredSite) : null;
const configuredOrigin = configuredUrl?.origin ?? "";
const resolvedOrigin =
  codespaceOrigin ||
  (configuredOrigin && !isGitHubWebsite(configuredOrigin)
    ? configuredOrigin
    : localOrigin);

const issues = [];

if (rawConfiguredSite && !configuredUrl) {
  issues.push("NEXT_PUBLIC_SITE_URL is not a valid absolute URL.");
}
if (configuredUrl && configuredUrl.pathname !== "/") {
  issues.push(
    "NEXT_PUBLIC_SITE_URL must be an application origin, not a repository/path URL. Example: https://workforce.txkpro.com",
  );
}
if (configuredOrigin && isGitHubWebsite(configuredOrigin)) {
  issues.push(
    "NEXT_PUBLIC_SITE_URL points to github.com. GitHub repository pages are not TXKPRO application callback hosts.",
  );
}
if (codespaceOrigin && configuredOrigin && configuredOrigin !== codespaceOrigin) {
  issues.push(
    "Codespaces is running on a forwarded app.github.dev host. Browser Auth callbacks will intentionally use the current Codespaces origin.",
  );
}
if (codespaceOrigin && configuredOrigin && isLoopback(configuredOrigin)) {
  issues.push(
    "Codespaces is public, but NEXT_PUBLIC_SITE_URL points to localhost. Leave it blank while using Codespaces.",
  );
}
if (process.env.NODE_ENV === "production") {
  if (!configuredOrigin) {
    issues.push("Production requires NEXT_PUBLIC_SITE_URL.");
  }
  if (configuredOrigin && !isHttps(configuredOrigin)) {
    issues.push("Production NEXT_PUBLIC_SITE_URL must use HTTPS.");
  }
}

console.log("TXKPRO Workforce Auth Configuration");
console.log("----------------------------------");
console.log(`Runtime origin: ${resolvedOrigin}`);
console.log(
  `Signup callback: ${resolvedOrigin}/auth/confirm?next=%2Fonboarding`,
);
console.log(
  `Recovery callback: ${resolvedOrigin}/auth/confirm?next=%2Freset-password`,
);
console.log(
  `Supabase URL configured: ${Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)}`,
);
console.log(
  `Publishable key configured: ${Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)}`,
);
console.log(
  `Server secret configured: ${Boolean(
    process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  )}`,
);

if (codespaceOrigin) {
  console.log("\nSupabase Auth URL Configuration must allow:");
  console.log("- https://**.app.github.dev/**");
  console.log(`- Exact current preview: ${codespaceOrigin}/**`);
  console.log(
    "Do not use a github.com repository URL as Site URL or NEXT_PUBLIC_SITE_URL.",
  );
}

if (issues.length) {
  console.error("\nConfiguration notes:");
  issues.forEach((issue) => console.error(`- ${issue}`));
  if (
    issues.some(
      (issue) =>
        issue.includes("not a valid") ||
        issue.includes("points to github.com") ||
        issue.includes("Production requires") ||
        issue.includes("must use HTTPS"),
    )
  ) {
    process.exitCode = 1;
  }
} else {
  console.log("\nAuth origin configuration looks valid for this environment.");
}
