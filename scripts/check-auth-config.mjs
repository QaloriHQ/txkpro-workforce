const port = process.env.PORT || "3000";
const configuredSite = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
const codespaceName = process.env.CODESPACE_NAME;
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev";
const codespaceOrigin = codespaceName ? `https://${codespaceName}-${port}.${forwardingDomain}` : null;
const localOrigin = `http://localhost:${port}`;
const resolvedOrigin = configuredSite || codespaceOrigin || localOrigin;

function isLoopback(value) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isHttps(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const issues = [];

if (configuredSite) {
  try {
    new URL(configuredSite);
  } catch {
    issues.push("NEXT_PUBLIC_SITE_URL is not a valid absolute URL.");
  }
}

if (codespaceOrigin && configuredSite && isLoopback(configuredSite)) {
  issues.push("Codespaces is public, but NEXT_PUBLIC_SITE_URL points to localhost. Leave it blank while using Codespaces.");
}

if (process.env.NODE_ENV === "production") {
  if (!configuredSite) issues.push("Production requires NEXT_PUBLIC_SITE_URL.");
  if (configuredSite && !isHttps(configuredSite)) issues.push("Production NEXT_PUBLIC_SITE_URL must use HTTPS.");
}

console.log("TXKPRO Workforce Auth Configuration");
console.log("----------------------------------");
console.log(`Runtime origin: ${resolvedOrigin}`);
console.log(`Signup callback: ${resolvedOrigin}/auth/confirm?next=%2Fonboarding`);
console.log(`Recovery callback: ${resolvedOrigin}/auth/confirm?next=%2Freset-password`);
console.log(`Supabase URL configured: ${Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)}`);
console.log(`Publishable key configured: ${Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)}`);
console.log(`Server secret configured: ${Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)}`);

if (issues.length) {
  console.error("\nConfiguration issues:");
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exitCode = 1;
} else {
  console.log("\nAuth origin configuration looks valid for this environment.");
}
