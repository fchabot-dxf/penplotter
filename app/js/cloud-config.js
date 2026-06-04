// Committed cloud config — safe to ship. The worker is KEYLESS (no auth
// secret in the frontend), so there's nothing sensitive here — just the
// public worker URL. Same model as the other apps.

export const WORKER_URL = "https://penplotter-cloud.dansemur.workers.dev";
export const API_KEY = "";
