// Committed cloud config — safe to ship (public worker URL, NO secret).
//
// The API key is NOT stored here: it's entered once at runtime in the
// Settings panel and kept in the browser's localStorage (see cloud.js
// getConfig/setConfig). That way the git-deployed site never carries the
// worker's auth secret — same approach as the other apps.

export const WORKER_URL = "https://projects-dansemur.dansemur.workers.dev";
export const API_KEY = "";
