#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="${CODESPACE_VSCODE_FOLDER:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
ENV_FILE="$HOME/.txkpro-agent-env.sh"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if ! command -v cline >/dev/null 2>&1 || ! command -v vercel >/dev/null 2>&1 || ! command -v supabase >/dev/null 2>&1; then
  echo "[cline-discord] toolchain missing; running bootstrap"
  bash "$WORKSPACE_ROOT/.devcontainer/bootstrap-agent.sh"
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "[cline-discord] missing required Codespaces secret/environment variable: ${name}" >&2
    return 1
  fi
}

require_env OPENROUTER_API_KEY
require_env DISCORD_BOT_TOKEN
require_env DISCORD_ALLOWED_USER_ID
require_env DISCORD_APPLICATION_ID
require_env CODESPACE_NAME

PORT="${CLINE_CONNECTOR_PORT:-8788}"
DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
BASE_URL="https://${CODESPACE_NAME}-${PORT}.${DOMAIN}"
PUBLIC_KEY="${DISCORD_PUBLIC_KEY:-}"

if [[ -z "$PUBLIC_KEY" ]]; then
  echo "[cline-discord] resolving Discord application public key"
  application_json="$(
    curl -fsSL \
      -H "Authorization: Bot ${DISCORD_BOT_TOKEN}" \
      -H "User-Agent: TXKPRO-Cline-Codespace/1.0" \
      https://discord.com/api/v10/oauth2/applications/@me
  )"

  resolved_app_id="$(
    printf '%s' "$application_json" | node -e '
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => input += chunk);
      process.stdin.on("end", () => {
        try { process.stdout.write(String(JSON.parse(input)?.id ?? "")); }
        catch { process.exitCode = 1; }
      });
    '
  )"
  PUBLIC_KEY="$(
    printf '%s' "$application_json" | node -e '
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => input += chunk);
      process.stdin.on("end", () => {
        try { process.stdout.write(String(JSON.parse(input)?.verify_key ?? "")); }
        catch { process.exitCode = 1; }
      });
    '
  )"

  if [[ "$resolved_app_id" != "$DISCORD_APPLICATION_ID" ]]; then
    echo "[cline-discord] Discord token application ID does not match DISCORD_APPLICATION_ID" >&2
    exit 1
  fi
  if [[ -z "$PUBLIC_KEY" ]]; then
    echo "[cline-discord] unable to resolve Discord public key; add DISCORD_PUBLIC_KEY as a Codespaces secret" >&2
    exit 1
  fi
fi

echo "[cline-discord] refreshing Cline OpenRouter configuration"
cline auth --provider "$CLINE_PROVIDER" --apikey "$OPENROUTER_API_KEY" --modelid "$CLINE_ACT_MODEL" >/dev/null
node "$WORKSPACE_ROOT/.devcontainer/configure-cline.mjs"

if [[ -z "${PROJECTS_TOKEN:-}" ]]; then
  echo "[cline-discord] warning: PROJECTS_TOKEN is missing; roadmap Project #${TXKPRO_ROADMAP_PROJECT_NUMBER:-1} queries will fail until it is added as a Codespaces secret" >&2
else
  echo "[cline-discord] roadmap auth: PROJECTS_TOKEN available for ${TXKPRO_ROADMAP_OWNER:-QaloriHQ} Project #${TXKPRO_ROADMAP_PROJECT_NUMBER:-1}"
fi

# Codespaces resets public port visibility on restart, so restore it each start.
echo "[cline-discord] publishing Codespaces port ${PORT}"
if ! gh codespace ports visibility "${PORT}:public" -c "$CODESPACE_NAME"; then
  echo "[cline-discord] warning: could not make port ${PORT} public; Discord interactions may be unreachable" >&2
fi

cline connect discord --stop >/dev/null 2>&1 || true

HOOK_SCRIPT="$WORKSPACE_ROOT/.devcontainer/discord-access-hook.sh"
printf -v HOOK_COMMAND 'bash %q' "$HOOK_SCRIPT"

echo "[cline-discord] starting secured Discord connector"
cline connect discord \
  --application-id "$DISCORD_APPLICATION_ID" \
  --bot-token "$DISCORD_BOT_TOKEN" \
  --public-key "$PUBLIC_KEY" \
  --base-url "$BASE_URL" \
  --port "$PORT" \
  --cwd "$WORKSPACE_ROOT" \
  --mode plan \
  --enable-tools \
  --owner-user-id "$DISCORD_ALLOWED_USER_ID" \
  --hook-command "$HOOK_COMMAND"

health_ok=0
for attempt in {1..12}; do
  if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
    health_ok=1
    break
  fi
  sleep 2
done

if [[ "$health_ok" -ne 1 ]]; then
  echo "[cline-discord] warning: public health check did not succeed yet: ${BASE_URL}/health" >&2
fi

OAUTH_URL="https://discord.com/oauth2/authorize?client_id=${DISCORD_APPLICATION_ID}&permissions=274877975616&integration_type=0&scope=bot+applications.commands"

printf '[cline-discord] base URL: %s\n' "$BASE_URL"
printf '[cline-discord] interactions endpoint: %s/api/webhooks/discord\n' "$BASE_URL"
printf '[cline-discord] OAuth2 invite: %s\n' "$OAUTH_URL"
printf '[cline-discord] mode: plan | plan model: %s | act model: %s\n' "$CLINE_PLAN_MODEL" "$CLINE_ACT_MODEL"
