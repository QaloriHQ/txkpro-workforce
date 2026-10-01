#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="${CODESPACE_VSCODE_FOLDER:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
ENV_FILE="$HOME/.txkpro-agent-env.sh"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if ! command -v cline >/dev/null 2>&1 || ! command -v vercel >/dev/null 2>&1 || ! command -v supabase >/dev/null 2>&1; then
  echo "[cline-slack] toolchain missing; running bootstrap"
  bash "$WORKSPACE_ROOT/.devcontainer/bootstrap-agent.sh"
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "[cline-slack] missing required Codespaces secret/environment variable: ${name}" >&2
    return 1
  fi
}

if [[ -d "$WORKSPACE_ROOT/.cline/hooks" ]]; then
  chmod +x "$WORKSPACE_ROOT"/.cline/hooks/* 2>/dev/null || true
fi

require_env OPENROUTER_API_KEY
require_env SLACK_BOT_TOKEN
require_env SLACK_APP_TOKEN
require_env SLACK_ALLOWED_USER_ID

echo "[cline-slack] validating Slack bot token and resolving workspace"
auth_json="$(
  curl -fsS -X POST     -H "Authorization: Bearer ${SLACK_BOT_TOKEN}"     -H "Content-Type: application/x-www-form-urlencoded"     https://slack.com/api/auth.test
)"

slack_ok="$(
  printf '%s' "$auth_json" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try { process.stdout.write(JSON.parse(input)?.ok === true ? "true" : "false"); }
      catch { process.stdout.write("false"); }
    });
  '
)"

resolved_team_id="$(
  printf '%s' "$auth_json" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try { process.stdout.write(String(JSON.parse(input)?.team_id ?? "")); }
      catch { process.stdout.write(""); }
    });
  '
)"

resolved_team_name="$(
  printf '%s' "$auth_json" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try { process.stdout.write(String(JSON.parse(input)?.team ?? "")); }
      catch { process.stdout.write(""); }
    });
  '
)"

resolved_bot_user_id="$(
  printf '%s' "$auth_json" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try { process.stdout.write(String(JSON.parse(input)?.user_id ?? "")); }
      catch { process.stdout.write(""); }
    });
  '
)"

if [[ "$slack_ok" != "true" || -z "$resolved_team_id" ]]; then
  echo "[cline-slack] Slack auth.test failed; verify SLACK_BOT_TOKEN and app installation" >&2
  exit 1
fi

if [[ -n "${SLACK_TEAM_ID:-}" && "$SLACK_TEAM_ID" != "$resolved_team_id" ]]; then
  echo "[cline-slack] configured SLACK_TEAM_ID does not match bot workspace" >&2
  exit 1
fi

export SLACK_TEAM_ID="$resolved_team_id"

echo "[cline-slack] refreshing Cline OpenRouter configuration"
cline auth --provider "$CLINE_PROVIDER" --apikey "$OPENROUTER_API_KEY" --modelid "$CLINE_ACT_MODEL" >/dev/null
node "$WORKSPACE_ROOT/.devcontainer/configure-cline.mjs"

if [[ -z "${PROJECTS_TOKEN:-}" ]]; then
  echo "[cline-slack] warning: PROJECTS_TOKEN is missing; roadmap Project #${TXKPRO_ROADMAP_PROJECT_NUMBER:-1} queries will fail until it is added as a Codespaces secret" >&2
else
  echo "[cline-slack] roadmap auth: PROJECTS_TOKEN available for ${TXKPRO_ROADMAP_OWNER:-QaloriHQ} Project #${TXKPRO_ROADMAP_PROJECT_NUMBER:-1}"
fi

echo "[cline-slack] refreshing origin/main for live repository discovery"
if git -C "$WORKSPACE_ROOT" fetch --quiet origin main; then
  local_repo_sha="$(git -C "$WORKSPACE_ROOT" rev-parse --short HEAD 2>/dev/null || true)"
  remote_repo_sha="$(git -C "$WORKSPACE_ROOT" rev-parse --short origin/main 2>/dev/null || true)"
  if [[ -n "$local_repo_sha" && -n "$remote_repo_sha" ]]; then
    printf '[cline-slack] repository view: local=%s origin/main=%s\n' "$local_repo_sha" "$remote_repo_sha"
  fi
else
  echo "[cline-slack] warning: could not refresh origin/main; live repository discovery may be stale" >&2
fi

cline connect slack --stop >/dev/null 2>&1 || true

HOOK_SCRIPT="$WORKSPACE_ROOT/.devcontainer/slack-access-hook.sh"
printf -v HOOK_COMMAND 'bash %q' "$HOOK_SCRIPT"

BOT_NAME="${SLACK_BOT_USERNAME:-TXKPRO-Cline}"

echo "[cline-slack] starting secured Slack socket-mode connector"
cline connect slack   --bot-token "$SLACK_BOT_TOKEN"   --app-token "$SLACK_APP_TOKEN"   --user-name "$BOT_NAME"   --cwd "$WORKSPACE_ROOT"   --mode plan   --enable-tools   --hook-command "$HOOK_COMMAND"

printf '[cline-slack] workspace: %s (%s)\n' "${resolved_team_name:-unknown}" "$resolved_team_id"
printf '[cline-slack] bot user id: %s\n' "${resolved_bot_user_id:-unknown}"
printf '[cline-slack] allowed owner user id: %s\n' "$SLACK_ALLOWED_USER_ID"
printf '[cline-slack] transport: socket mode (no public Codespaces webhook required)\n'
printf '[cline-slack] mode: plan | plan model: %s | act model: %s\n' "$CLINE_PLAN_MODEL" "$CLINE_ACT_MODEL"
