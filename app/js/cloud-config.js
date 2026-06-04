// Committed cloud config — safe to ship. The worker is KEYLESS (no auth
// secret in the frontend), so there's nothing sensitive here — just the
// public worker URL. Same model as the other apps.
//
// Penplotter now shares the single `projects-dansemur` worker (same one the
// other apps use) under the /penplotter path prefix, backed by the same KV
// namespace as before — so existing saved projects/palettes carry over.
export const WORKER_URL = "https://projects-dansemur.dansemur.workers.dev/penplotter";
export const API_KEY = "";
