// Pen Plotter cloud worker — Workers KV backed.
//
// Two collections (palettes, projects). One-key auth via X-API-Key.
// CORS open.
//
// Routes (kind = palettes | projects):
//   GET    /{kind}              list [{ id, customMeta.name, savedAt }]
//   POST   /{kind}              create new      body: { name, palette|project }
//   GET    /{kind}/:id          fetch one       → { name, palette|project }
//   PUT    /{kind}/:id          overwrite OR rename — if body has the data
//                                field it's a full update; otherwise just the
//                                metadata `name` is updated.
//                                body: { name?, palette?|project? }
//   DELETE /{kind}/:id          delete

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
};

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const notFound = () => new Response("not found", { status: 404, headers: CORS });

async function listKind(kv, kind) {
    const out = [];
    let cursor;
    do {
        const page = await kv.list({ prefix: kind + "/", cursor, limit: 1000 });
        for (const k of page.keys) {
            const meta = k.metadata || {};
            out.push({
                id: k.name.slice(kind.length + 1),
                customMeta: { name: meta.name || "" },
                savedAt: meta.savedAt || null,
                folder: meta.folder || "",
            });
        }
        cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return out;
}

async function saveKind(kv, kind, body) {
    const id = crypto.randomUUID();
    const meta = {
        name: String(body.name || "untitled").slice(0, 100),
        savedAt: new Date().toISOString(),
        folder: String(body.folder || "").slice(0, 80),
    };
    await kv.put(kind + "/" + id, JSON.stringify(body), { metadata: meta });
    return { id, name: meta.name, folder: meta.folder };
}

/** PUT semantics:
 *    body.{project|palette} present → overwrite the stored value
 *    body.{project|palette} absent  → keep the stored value, only update name
 *  Either way the savedAt timestamp gets bumped. */
async function updateKind(kv, kind, id, body) {
    const existing = await kv.getWithMetadata(kind + "/" + id);
    if (existing.value == null) return null;
    const oldMeta = existing.metadata || {};
    const dataKey = kind === "palettes" ? "palette" : "project";
    const hasNewData = body[dataKey] !== undefined;
    const meta = {
        name: String(body.name || oldMeta.name || "untitled").slice(0, 100),
        savedAt: new Date().toISOString(),
        folder: body.folder !== undefined ? String(body.folder).slice(0, 80) : (oldMeta.folder || ""),
    };
    const value = hasNewData ? JSON.stringify(body) : existing.value;
    await kv.put(kind + "/" + id, value, { metadata: meta });
    return { id, name: meta.name, folder: meta.folder };
}

async function getKind(kv, kind, id) {
    const raw = await kv.get(kind + "/" + id);
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

async function deleteKind(kv, kind, id) {
    await kv.delete(kind + "/" + id);
}

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
        // Keyless: no X-API-Key required (matches the other apps). Access is
        // gated only by knowledge of the worker URL. Real secrets the worker
        // itself needs stay as Worker secrets, never sent by the frontend.

        const url = new URL(request.url);
        const parts = url.pathname.split("/").filter(Boolean);
        const [kind, id] = parts;

        // Folder registry: GET/PUT /folders/{palettes|projects} → the list
        // of folder names for that collection (so empty folders persist).
        if (kind === "folders") {
            if (id !== "palettes" && id !== "projects") return notFound();
            const fkey = "folders/" + id;
            try {
                if (request.method === "GET") {
                    const raw = await env.KV.get(fkey);
                    return json(raw ? JSON.parse(raw) : []);
                }
                if (request.method === "PUT") {
                    const body = await request.json();
                    const arr = Array.isArray(body.folders)
                        ? [...new Set(body.folders.map(f => String(f).slice(0, 80)).filter(Boolean))].slice(0, 200)
                        : [];
                    await env.KV.put(fkey, JSON.stringify(arr));
                    return json(arr);
                }
            } catch (e) { return json({ error: e.message }, 500); }
            return notFound();
        }

        if (kind !== "palettes" && kind !== "projects") return notFound();

        try {
            if (!id) {
                if (request.method === "GET")  return json(await listKind(env.KV, kind));
                if (request.method === "POST") return json(await saveKind(env.KV, kind, await request.json()));
            } else {
                if (request.method === "GET") {
                    const data = await getKind(env.KV, kind, id);
                    return data ? json(data) : notFound();
                }
                if (request.method === "PUT") {
                    const r = await updateKind(env.KV, kind, id, await request.json());
                    return r ? json(r) : notFound();
                }
                if (request.method === "DELETE") {
                    await deleteKind(env.KV, kind, id);
                    return json({ ok: true });
                }
            }
        } catch (e) {
            return json({ error: e.message }, 500);
        }
        return notFound();
    },
};
