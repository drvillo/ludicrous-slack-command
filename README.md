# Ludicrous Slack Command

Slack slash command `/ludicrous` that posts a ludicrous speed GIF to the channel. Runs as a Cloudflare Worker and deploys from Git (GitHub Actions).

## How it works

1. User types `/ludicrous` in a channel.
2. Slack sends a POST to this Worker with a `response_url`.
3. The Worker replies with 200 immediately, then POSTs to `response_url` with a message containing the GIF.
4. The GIF is served from the same Worker at `/ludicrous.gif` (static asset in `public/`).

## Setup (minimal manual steps)

### 1. Cloudflare

- [Create an API token](https://dash.cloudflare.com/profile/api-tokens): use the **Edit Cloudflare Workers** template, restrict to your account.
- [Find your Account ID](https://dash.cloudflare.com/?to=/:account/workers) (Workers & Pages → overview).

### 2. GitHub repository secrets

In the repo: **Settings → Secrets and variables → Actions** → **New repository secret**. Add:

| Secret name               | Value                          |
|---------------------------|---------------------------------|
| `CLOUDFLARE_API_TOKEN`    | Your Cloudflare API token       |
| `CLOUDFLARE_ACCOUNT_ID`   | Your Cloudflare account ID      |
| `SLACK_SIGNING_SECRET`    | (Add after creating the Slack app in step 3) |

You can add `SLACK_SIGNING_SECRET` later; the first deploy will still succeed, but the slash command will only work after this secret is set.

### 3. Slack app and slash command

1. [Create a Slack app](https://api.slack.com/apps?new_app=1): **Create New App** → **From scratch** → name it (e.g. “Ludicrous”) and pick your workspace.
2. **Basic Information** → copy the **Signing Secret** → paste it into the GitHub secret `SLACK_SIGNING_SECRET` (see step 2).
3. **Slash Commands** → **Create New Command**:
   - **Command:** `/ludicrous`
   - **Request URL:** `https://ludicrous-slack-command.<YOUR_SUBDOMAIN>.workers.dev`  
     Replace `<YOUR_SUBDOMAIN>` with your Workers subdomain (e.g. from the first deploy log or [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers) → your worker → **Quick edit** or **View** to see the URL).
   - **Short Description:** e.g. `Posts a ludicrous speed GIF`
   - **Usage Hint:** (optional) leave empty or e.g. ``
4. **Install to Workspace** (or **Install App**) and allow.

### 4. Deploy

Push to the `main` branch. The GitHub Action deploys the Worker and uploads `SLACK_SIGNING_SECRET`. No need to configure secrets in the Cloudflare dashboard.

After the first run, copy the Worker URL from the workflow log (e.g. `https://ludicrous-slack-command.<subdomain>.workers.dev`) and set it as the **Request URL** in the Slack slash command (step 3) if you used a placeholder.

### 5. Custom GIF (optional)

The app ships with a tiny placeholder GIF. To use your own:

- Replace `public/ludicrous.gif` with your GIF (must be a valid GIF).
- Commit and push; the next deploy will serve the new file.

## Local development

```bash
npm install
```

Create `.dev.vars` in the project root (not committed):

```
SLACK_SIGNING_SECRET=your_signing_secret_here
```

Then:

```bash
npm run dev
```

Slack must send requests to your public URL. Use a tunnel (e.g. [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/) or ngrok) and set the slash command Request URL to the tunnel URL while testing.

## Project layout

- `src/index.ts` – Worker: verifies Slack signature, parses form body, acks and POSTs image message to `response_url`.
- `public/ludicrous.gif` – GIF served at `/ludicrous.gif`.
- `wrangler.toml` – Worker name, entry point, static assets.
- `.github/workflows/deploy.yml` – Deploys on push to `main` and injects `SLACK_SIGNING_SECRET`.

## Requirements

- Node 18+
- A Slack workspace where you can install apps
- A Cloudflare account
- GitHub repo with Actions enabled
