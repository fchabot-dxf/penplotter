# Pen Plotter Cloud Worker

A tiny Cloudflare Worker that stores plot-color palettes and full
projects in R2, behind a single API key. The app's "Save to cloud" /
"Load from cloud" features talk to this worker.

## One-time setup

1. **Enable R2** on your Cloudflare account
   (https://dash.cloudflare.com → R2 → Enable). Free tier covers everything
   this worker needs.

2. **Install wrangler** (only if you don't have it):
   ```powershell
   npm install -g wrangler
   wrangler login
   ```

3. **Deploy the worker** (from this folder):
   ```powershell
   cd C:\Users\danse\APPS\penplotter\cloud
   wrangler deploy
   ```
   First run creates the `penplotter-cloud` R2 bucket and the worker.
   Wrangler prints a URL like `https://penplotter-cloud.your-subdomain.workers.dev`.

4. **Set the API key** (one-time secret, never re-typed):
   ```powershell
   wrangler secret put API_KEY
   ```
   Type any random string (e.g. a UUID). You'll paste the same string into
   the app once.

## Using it from the app

Open the pen plotter app → Plot Colors panel → ☁ Cloud → paste the worker
URL and the API key on first use. After that:

- **Save palette / Load palette** — keeps named plot-color sets
- **Save project / Load project** — full app state snapshot (art layers,
  toolpaths, plot colors, document settings)

## Endpoints

| Method   | Path             | Body                | Description                |
|----------|------------------|---------------------|----------------------------|
| `GET`    | `/palettes`      |                     | List saved palettes        |
| `POST`   | `/palettes`      | `{name, palette}`   | Save a palette             |
| `GET`    | `/palettes/:id`  |                     | Load one                   |
| `DELETE` | `/palettes/:id`  |                     | Delete one                 |
| `GET`    | `/projects`      |                     | List saved projects        |
| `POST`   | `/projects`      | `{name, project}`   | Save a project             |
| `GET`    | `/projects/:id`  |                     | Load one                   |
| `DELETE` | `/projects/:id`  |                     | Delete one                 |

All requests must include `X-API-Key: <your key>`. CORS is wide-open
(`*`) since this is your personal worker — you're the only one with the
URL + key.
