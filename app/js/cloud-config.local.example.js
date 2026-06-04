// Optional local override — copy this file to `cloud-config.local.js`
// (gitignored) ONLY if you need to point the app at a different worker
// (e.g. a local/staging deploy) or set an API key.
//
// Normally you don't need this: the shipped cloud-config.js already points
// at the shared, keyless `projects-dansemur` worker under /penplotter.
//
// You can also set these at runtime in the app's Settings panel (stored in
// localStorage), which takes precedence over cloud-config.js.

export const WORKER_URL = "https://projects-dansemur.dansemur.workers.dev/penplotter";
export const API_KEY    = "";
