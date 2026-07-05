# AutoCVApply Discord bot

Bootstrap script for the community server. Secrets live in `.env` only.

## Developer portal (one-time)

Application: [Discord Developer Portal](https://discord.com/developers/applications/1523097041209921706)

| Field | Value |
|-------|--------|
| **Description** | Official AutoCVApply community bot. Get extension help, ATS tips, and product updates. Upload your CV once, autofill job forms on Greenhouse, Ashby, Workday & more - you review every field. |
| **Tags** | Productivity, Career, Chrome Extension, Job Search, AI Tools |
| **Terms of Service** | https://autocvapply.com/terms |
| **Privacy Policy** | https://autocvapply.com/privacy |
| **App icon** | Export `public/favicon.svg` as 1024×1024 PNG and upload under **Bot** |

**Bot tab**

- Username: `AutoCVApply`
- **Public Bot**: on (if you want others to add it to their servers - off for a single community server)
- **Privileged intents**: leave off unless you build moderation that reads message content

**OAuth2 → URL Generator**

- Scopes: `bot`, `applications.commands`
- Bot permissions: Manage Channels, Manage Roles, Send Messages, Manage Messages, Embed Links, Read Message History, View Channels, Create Instant Invite

Or open the generated invite:

```bash
npm run discord:invite
```

## Setup channels

1. Create a Discord server (or use an existing one).
2. Run `npm run discord:invite` and open the URL - add the bot to your server.
3. Copy **Server ID** (Developer Mode → right-click server → Copy Server ID).
4. Set `DISCORD_GUILD_ID=` in `.env`.
5. Run:

```bash
npm run discord:setup
```

Creates categories **Start here**, **Community**, **AutoCVApply**, roles `@Team` / `@Member`, welcome + rules posts, and prints a permanent invite URL for `DISCORD_INVITE_URL`.

## Env keys

| Key | Required | Notes |
|-----|----------|--------|
| `DISCORD_BOT_TOKEN` | Yes | Bot → Reset Token (never commit) |
| `DISCORD_GUILD_ID` | For setup | Target server |
| `DISCORD_INVITE_URL` | After setup | Permanent `discord.gg/…` for README & site |

`DISCORD_APPLICATION_ID` is fixed in `config/discord.php`.

## GitHub → #updates

The workflow [`.github/workflows/discord-updates.yml`](../../.github/workflows/discord-updates.yml) posts an embed to **#updates** on every push to `main`.

Add this **repository secret** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `DISCORD_BOT_TOKEN` | Same bot token as `.env` |

The **#updates** channel ID (`1523103313531240568`) is fixed in the workflow and `config/discord.php`.

After creating **#updates**, run `npm run discord:setup` once so permissions and the pinned intro post are applied.

```bash
# If you use GitHub CLI locally:
gh secret set DISCORD_BOT_TOKEN --repo tmwclaxton/autoapplycv
```
