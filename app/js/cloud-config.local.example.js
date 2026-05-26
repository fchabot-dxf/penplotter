// Template — copy this file to `cloud-config.local.js` (which is
// gitignored) and fill in your own worker URL + API key.
//
// ─── First-time setup on a fresh clone ──────────────────────────────
//
//  1. Get your worker URL.
//        Already deployed? Find it at:
//          https://dash.cloudflare.com → Workers & Pages → penplotter-cloud
//        Not deployed yet? From the repo root:
//          cd cloud
//          npx wrangler deploy
//        Wrangler prints the URL like
//          https://penplotter-cloud.<your-subdomain>.workers.dev
//
//  2. (Re)set the API key.
//        Cloudflare doesn't let you read an existing secret back. To
//        rotate or rebuild the key:
//          cd cloud
//          npx wrangler secret put API_KEY
//        It prompts; paste any random string (or generate one:
//          openssl rand -hex 24
//        ). Save that string somewhere safe — it's the password the
//        frontend uses to authenticate against the worker.
//
//  3. Paste both values below, rename this file to
//     `cloud-config.local.js`, and you're done.
//
// ────────────────────────────────────────────────────────────────────

export const WORKER_URL = "https://penplotter-cloud.YOUR-SUBDOMAIN.workers.dev";
export const API_KEY    = "PASTE-YOUR-API-KEY-HERE";
