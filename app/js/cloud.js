// Thin client for the penplotter Cloudflare Worker.
//
// Configuration (worker URL + API key) lives in
// `app/js/cloud-config.local.js`, which is gitignored so the secret
// never leaves the local machine.
//
// On a fresh clone:
//   1. `cp cloud-config.local.example.js cloud-config.local.js`
//   2. Edit it with your own values.
//
// To rebuild the key on a new machine:
//   - The worker secret on Cloudflare's side can't be read back. You
//     either reuse the key you already noted down somewhere, or rotate
//     it: `cd cloud && npx wrangler secret put API_KEY` (paste any
//     random string, e.g. `openssl rand -hex 24`), then paste the
//     SAME string into cloud-config.local.js so the frontend matches.
//   - The worker URL is visible in the Cloudflare dashboard:
//     https://dash.cloudflare.com → Workers & Pages → penplotter-cloud,
//     or re-deploy with `cd cloud && npx wrangler deploy`.
//
// See `cloud-config.local.example.js` for the full step-by-step.

import { WORKER_URL, API_KEY } from "./cloud-config.local.js";

// Routes used (see cloud/worker.js):
//   GET    /palettes              → [{ id, customMeta.name, savedAt, size }]
//   POST   /palettes              → { id, name }      body: { name, palette }
//   GET    /palettes/:id          → { name, palette }
//   DELETE /palettes/:id
//   GET    /projects              → [{ id, customMeta.name, savedAt, size }]
//   POST   /projects              → { id, name }      body: { name, project }
//   GET    /projects/:id          → { name, project }
//   DELETE /projects/:id

export function getConfig() {
    return { url: WORKER_URL.replace(/\/+$/, ""), apiKey: API_KEY };
}

export function isConfigured() {
    return !!(WORKER_URL && API_KEY && !WORKER_URL.includes("your-subdomain"));
}

async function call(method, path, body) {
    const { url, apiKey } = getConfig();
    if (!url || !apiKey) throw new Error("Cloud not configured — set Worker URL + API key in Settings.");
    const init = {
        method,
        headers: { "X-API-Key": apiKey },
    };
    if (body !== undefined) {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
    }
    let res;
    try {
        res = await fetch(`${url}${path}`, init);
    } catch (e) {
        throw new Error(`Network error reaching ${url}${path}`);
    }
    if (res.status === 401) throw new Error("Unauthorized — check your API key.");
    if (res.status === 404 && method === "GET") return null;
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Cloud ${method} ${path} → ${res.status}${text ? `: ${text}` : ""}`);
    }
    if (res.status === 204) return null;
    return res.json();
}

// ---------- palettes ----------

export function listPalettes()                 { return call("GET",    "/palettes"); }
export function savePalette(name, p, folder)   { return call("POST",   "/palettes", { name, palette: p, folder }); }
export function loadPalette(id)                { return call("GET",    `/palettes/${id}`); }
export function updatePalette(id, name, p, folder) { return call("PUT", `/palettes/${id}`, { name, palette: p, folder }); }
export function renamePalette(id, name)        { return call("PUT",    `/palettes/${id}`, { name }); }
export function setPaletteFolder(id, folder)   { return call("PUT",    `/palettes/${id}`, { folder }); }
export function deletePalette(id)              { return call("DELETE", `/palettes/${id}`); }

// ---------- projects ----------

export function listProjects()                 { return call("GET",    "/projects"); }
export function saveProject(name, p, folder)   { return call("POST",   "/projects", { name, project: p, folder }); }
export function loadProject(id)                { return call("GET",    `/projects/${id}`); }
export function updateProject(id, name, p, folder) { return call("PUT", `/projects/${id}`, { name, project: p, folder }); }
export function renameProject(id, name)        { return call("PUT",    `/projects/${id}`, { name }); }
export function setProjectFolder(id, folder)   { return call("PUT",    `/projects/${id}`, { folder }); }
export function deleteProject(id)              { return call("DELETE", `/projects/${id}`); }

// ---------- folder registry (per collection: "palettes" | "projects") ----------

export function listFolders(coll)          { return call("GET",    `/folders/${coll}`); }
export function saveFolders(coll, folders) { return call("PUT",    `/folders/${coll}`, { folders }); }
