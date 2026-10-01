# Headless Cline + Discord in GitHub Codespaces

Discord is retained as an optional TXKPRO Cline fallback transport. Slack is now the primary remote connector; see `docs/CLINE_SLACK_CODESPACE.md`.

The Discord launcher remains available at `.devcontainer/start-discord-agent.sh`.

## Codespaces secrets

The bootstrap expects these Codespaces secrets:

- `OPENROUTER_API_KEY`
- `DISCORD_BOT_TOKEN`
- `DISCORD_ALLOWED_USER_ID`
- `PROJECTS_TOKEN` — GitHub token with at least `read:project` access to the user-owned `QaloriHQ` Project #1

Optional:

- `DISCORD_PUBLIC_KEY` — if omitted, startup resolves the application's `verify_key` from Discord using the bot token.

Do not commit secret values to this repository.

> `PROJECTS_TOKEN` must be added separately as a **Codespaces secret**. A repository Actions secret with the same name is not automatically injected into Codespaces.

## Fixed runtime configuration

- Provider: OpenRouter
- Plan model: `qwen/qwen3-coder`
- Plan output limit: `8192` tokens
- Act model: `deepseek/deepseek-chat`
- Act output limit: `16384` tokens
- Roadmap owner: GitHub user `QaloriHQ`
- Roadmap: GitHub Projects v2 Project #1
- Roadmap repository: `QaloriHQ/txkpro-workforce`
- Discord application ID: `1554545511946526761`
- Discord connector port: `8788`

The Cline state is configured with separate Plan and Act models. The connector starts in Plan mode. Repository rules require explicit owner approval before mutation.

Cline model output limits are persisted as OpenRouter model overrides in `~/.cline/data/settings/models.json`. This prevents the OpenRouter catalog's larger model default from causing a request to reserve more output tokens than the configured API key can afford.

## Live repository discovery

The running Codespace may intentionally contain local edits or may lag behind GitHub `main`. Cline must not treat the local working tree as the only repository view.

For file/document discovery, use:

```bash
node scripts/repo-latest.mjs status
node scripts/repo-latest.mjs find "design"
node scripts/repo-latest.mjs grep "design system|style guide"
node scripts/repo-latest.mjs read docs/product-sources/ui/UI_DESIGN_SYSTEM_STANDARD.txt
```

Each helper invocation first fetches `origin/main`, then reads directly from that remote ref. It never merges, checks out, resets, stages, or overwrites working-tree files. This lets Cline see newly committed repository files even when the active Codespace has unrelated local changes.

On bridge startup, `.devcontainer/start-agent.sh` also refreshes `origin/main` and prints the local and remote short SHAs.

The Cline rules explicitly prohibit claiming that a repository file is missing until `origin/main` has been refreshed and searched.

## Roadmap authentication

Normal repository work continues to use the Codespace's regular GitHub identity.

Roadmap reads are deliberately isolated:

```text
PROJECTS_TOKEN
    ↓
scripts/roadmap-next-planned.mjs
    ↓ sets GH_TOKEN only for the child process
gh api graphql
    ↓
QaloriHQ user Project #1
```

The project token is **not** exported as the session-wide `GH_TOKEN`. This prevents a read-only project credential from replacing the Codespace identity Cline uses for normal issue, branch, commit, and pull-request operations.

The canonical "what's next?" rule is:

1. Read GitHub user `QaloriHQ` Project #1.
2. Use the Project item's own `Status` field as the source of truth.
3. Keep only open issues from `QaloriHQ/txkpro-workforce` with `Status = Planned`.
4. Sort by the Project item's `createdAt` ascending.
5. Return the earliest-added item. Issue creation time and issue number are tie-breakers only.

The helper paginates Project items and reads dependencies from the selected issue body.

## Lifecycle

On initial Codespace creation:

1. Repository dependencies install.
2. Cline and Vercel install in the user-global npm prefix.
3. Supabase CLI installs from the official Supabase CLI installer.
4. Cline authenticates to OpenRouter without writing the API key into Git.
5. Cline Plan/Act model state and output-token overrides are configured.
6. Bootstrap reports whether `PROJECTS_TOKEN` is available for roadmap reads.

On every Codespace start:

1. Cline/OpenRouter configuration is refreshed.
2. Roadmap token availability is reported without exposing the secret.
3. Codespaces port 8788 is restored to public visibility.
4. Discord application metadata is validated.
5. The owner-only access hook is activated.
6. The official Cline Discord connector starts in the background.
7. The bridge prints its health URL, Discord Interactions Endpoint URL, and OAuth2 invite URL.

## Discord Developer Portal

The connector prints a URL in this form:

```text
https://<codespace>-8788.app.github.dev/api/webhooks/discord
```

Set that exact value as the Discord application's **Interactions Endpoint URL**.

The bot also needs **Message Content Intent** enabled if normal messages, replies, and DMs should include message text.

## Verify inside the Codespace

```bash
node --version
npm --version
cline --version
vercel --version
supabase --version
cline config
cat ~/.cline/data/settings/models.json
node scripts/roadmap-next-planned.mjs --json
curl "https://${CODESPACE_NAME}-8788.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}/health"
```

The OpenRouter section in `models.json` should include:

```json
{
  "qwen/qwen3-coder": {
    "maxTokens": 8192
  },
  "deepseek/deepseek-chat": {
    "maxTokens": 16384
  }
}
```

If the roadmap helper reports:

```text
[roadmap] missing PROJECTS_TOKEN
```

add `PROJECTS_TOKEN` to the repository/user Codespaces secrets and restart the Codespace. If GitHub returns `Resource not accessible by integration`, verify that the token has `read:project` access to the user-owned Project #1.

To start Discord explicitly:

```bash
bash .devcontainer/start-discord-agent.sh
```

`bash .devcontainer/start-agent.sh` now routes to Slack first and uses Discord only when configured as fallback.

To stop it:

```bash
cline connect discord --stop
```

## Security

Discord requests are filtered through `.devcontainer/discord-access-hook.sh`. Only the participant key matching `DISCORD_ALLOWED_USER_ID` is allowed. The connector also marks the same Discord user ID as its owner.

The Discord bot token, OpenRouter API key, and GitHub project token remain environment-only and are never written to repository files.
