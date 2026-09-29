# Headless Cline + Discord in GitHub Codespaces

This repository bootstraps a headless Cline CLI workspace for TXKPRO Workforce and exposes it through the official Cline Discord connector.

## Codespaces secrets

The bootstrap expects these Codespaces secrets:

- `OPENROUTER_API_KEY`
- `DISCORD_BOT_TOKEN`
- `DISCORD_ALLOWED_USER_ID`

Optional:

- `DISCORD_PUBLIC_KEY` — if omitted, startup resolves the application's `verify_key` from Discord using the bot token.

Do not commit secret values to this repository.

## Fixed runtime configuration

- Provider: OpenRouter
- Plan model: `qwen/qwen3-coder`
- Act model: `deepseek/deepseek-chat`
- Discord application ID: `1554545511946526761`
- Discord connector port: `8788`

The Cline state is configured with separate Plan and Act models. The connector starts in Plan mode. Repository rules require explicit owner approval before mutation.

## Lifecycle

On initial Codespace creation:

1. Repository dependencies install.
2. Cline and Vercel install in the user-global npm prefix.
3. Supabase CLI installs from the official Supabase CLI installer.
4. Cline authenticates to OpenRouter without writing the API key into Git.
5. Cline Plan/Act model state is configured.

On every Codespace start:

1. Codespaces port 8788 is restored to public visibility.
2. Discord application metadata is validated.
3. The owner-only access hook is activated.
4. The official Cline Discord connector starts in the background.
5. The bridge prints its health URL, Discord Interactions Endpoint URL, and OAuth2 invite URL.

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
curl "https://${CODESPACE_NAME}-8788.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}/health"
```

To restart the bridge manually:

```bash
bash .devcontainer/start-agent.sh
```

To stop it:

```bash
cline connect discord --stop
```

## Security

Discord requests are filtered through `.devcontainer/discord-access-hook.sh`. Only the participant key matching `DISCORD_ALLOWED_USER_ID` is allowed. The connector also marks the same Discord user ID as its owner.

The bot token and OpenRouter API key remain environment-only and are never written to repository files.
