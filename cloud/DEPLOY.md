# Deployment cheat sheet

## 1. Static app → Cloudflare Pages

From the repo root:

```powershell
.\deploy-page.ps1
```

This runs `wrangler pages deploy ./app --project-name penplotter`. First
run creates the Pages project; subsequent runs publish a new version.
You get a URL like `https://penplotter.pages.dev` — the app loads from
anywhere with that URL.

> Plotting still needs the local Flask server (`start.ps1`) running on
> the machine connected to the plotter. The hosted app calls
> `127.0.0.1:5005` for `/api/preview` and `/api/plot`. So the design
> happens on Pages, the G-code generation stays local.

## 2. Cloud storage → Cloudflare Worker + R2

One-time:

```powershell
# 1. Enable R2 in https://dash.cloudflare.com → R2 → Enable (free tier)

# 2. Deploy the worker
cd C:\Users\danse\APPS\penplotter\cloud
wrangler deploy

# 3. Set the auth key
wrangler secret put API_KEY
# Type any random string — it's the password you'll paste into the app.
```

Wrangler prints a URL like
`https://penplotter-cloud.<your-subdomain>.workers.dev`. That + the API
key go into the app's settings dialog (next change to land in the
frontend).

## Updating

- Frontend changes → `.\deploy-page.ps1` again, pushes new build.
- Worker changes → `wrangler deploy` in `cloud/`.
- Rotate auth key → `wrangler secret put API_KEY` again.
