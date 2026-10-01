#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="${CODESPACE_VSCODE_FOLDER:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CLINE_VERSION="${CLINE_CLI_VERSION:-3.0.65}"
VERCEL_VERSION="${VERCEL_CLI_VERSION:-59.19.1}"
SUPABASE_VERSION="${SUPABASE_CLI_VERSION:-2.117.0}"

retry() {
  local attempts="$1"
  shift
  local count=1
  until "$@"; do
    if (( count >= attempts )); then
      echo "[bootstrap] command failed after ${attempts} attempts: $*" >&2
      return 1
    fi
    count=$((count + 1))
    echo "[bootstrap] retry ${count}/${attempts}: $*" >&2
    sleep $((count * 2))
  done
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "[bootstrap] missing required Codespaces secret: ${name}" >&2
    return 1
  fi
}

mkdir -p "$HOME/.local" "$HOME/.supabase/bin"

cat > "$HOME/.txkpro-agent-env.sh" <<'EOF'
export PATH="$HOME/.local/bin:$HOME/.supabase/bin:$PATH"
export CLINE_API_PROVIDER="openrouter"
export CLINE_PROVIDER="openrouter"
export CLINE_PLAN_MODEL="qwen/qwen3-coder"
export CLINE_ACT_MODEL="deepseek/deepseek-chat"
export CLINE_PLAN_MAX_TOKENS="8192"
export CLINE_ACT_MAX_TOKENS="16384"
export TXKPRO_ROADMAP_OWNER="QaloriHQ"
export TXKPRO_ROADMAP_PROJECT_NUMBER="1"
export TXKPRO_ROADMAP_REPO="QaloriHQ/txkpro-workforce"
export TXKPRO_CLINE_PRIMARY_CONNECTOR="slack"
export TXKPRO_ENABLE_DISCORD_BACKUP="false"
export SLACK_BOT_USERNAME="TXKPRO-Cline"
export DISCORD_APPLICATION_ID="1554545511946526761"
export CLINE_CONNECTOR_PORT="8788"
EOF
chmod 600 "$HOME/.txkpro-agent-env.sh"

for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  touch "$rc"
  if ! grep -Fq '.txkpro-agent-env.sh' "$rc"; then
    printf '\n[ -f "$HOME/.txkpro-agent-env.sh" ] && . "$HOME/.txkpro-agent-env.sh"\n' >> "$rc"
  fi
done

# shellcheck disable=SC1090
source "$HOME/.txkpro-agent-env.sh"

cd "$WORKSPACE_ROOT"

echo "[bootstrap] installing repository dependencies"
retry 3 npm install

echo "[bootstrap] installing Cline and Vercel CLIs into user-global npm prefix"
retry 3 npm install --global --prefix "$HOME/.local" --allow-scripts=cline,esbuild,protobufjs "cline@${CLINE_VERSION}" "vercel@${VERCEL_VERSION}"

if ! command -v supabase >/dev/null 2>&1 || [[ "$(supabase --version 2>/dev/null || true)" != "$SUPABASE_VERSION" ]]; then
  echo "[bootstrap] installing Supabase CLI ${SUPABASE_VERSION}"
  installer="$(mktemp)"
  trap 'rm -f "$installer"' EXIT
  retry 3 curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install -o "$installer"
  env VERSION="$SUPABASE_VERSION" SUPABASE_INSTALL_DIR="$HOME/.supabase/bin" bash "$installer" --no-modify-path
  rm -f "$installer"
  trap - EXIT
fi

require_env OPENROUTER_API_KEY

echo "[bootstrap] configuring OpenRouter credentials in Cline"
cline auth --provider "$CLINE_PROVIDER" --apikey "$OPENROUTER_API_KEY" --modelid "$CLINE_ACT_MODEL" >/dev/null

node "$WORKSPACE_ROOT/.devcontainer/configure-cline.mjs"

if [[ -n "${SLACK_BOT_TOKEN:-}" && -n "${SLACK_APP_TOKEN:-}" && -n "${SLACK_ALLOWED_USER_ID:-}" ]]; then
  echo "[bootstrap] Slack connector credentials are available"
else
  echo "[bootstrap] Slack is the primary connector; add Codespaces secrets SLACK_BOT_TOKEN, SLACK_APP_TOKEN, and SLACK_ALLOWED_USER_ID before switching from Discord fallback" >&2
fi

if [[ -z "${PROJECTS_TOKEN:-}" ]]; then
  echo "[bootstrap] warning: PROJECTS_TOKEN is not available; GitHub Project #1 roadmap reads will be unavailable" >&2
else
  echo "[bootstrap] PROJECTS_TOKEN available for isolated read-only roadmap queries"
fi

echo "[bootstrap] verified toolchain"
printf 'node: %s\n' "$(node --version)"
printf 'npm: %s\n' "$(npm --version)"
printf 'cline: %s\n' "$(cline --version)"
printf 'vercel: %s\n' "$(vercel --version)"
printf 'supabase: %s\n' "$(supabase --version)"
