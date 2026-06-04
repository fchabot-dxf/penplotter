// Generic "preset picker" popup — projects / palettes share this UI.
// Header has two actions (Save current / Save as); each row has rename,
// duplicate, delete; clicking a name loads.
//
// Adapters (all optional except list/save/load/del/title):
//   list()                  → Promise<[{ id, customMeta:{name}, savedAt }]>
//   save()                  → Promise<{ id, name, thumbnail? }>  — "Save as new"
//   saveCurrent()           → Promise<{ id, name, thumbnail? } | null>
//                              "Save" overwrite of the current id; returns
//                              null when there isn't one (falls back to save())
//   load(id)                → Promise<void>
//   del(id)                 → Promise<void>
//   rename(id, newName)     → Promise<void>
//   duplicate(id)           → Promise<{ id, name, thumbnail? }>
//   getThumbnail(id)        → Promise<string|null>     SVG markup
//   currentName             → string|null              header hint
//   title, saveLbl          → strings

import { toast } from "./dom.js";
import { uiPrompt, uiConfirm, uiChoose } from "./ui-dialog.js";

let openEl = null;
// Folder collapse state, keyed `${pickerTitle}|${folder}`, kept across opens.
const folderCollapsed = new Map();

function close() {
    if (!openEl) return;
    openEl.remove();
    openEl = null;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
}

function onOutside(e) {
    if (!openEl) return;
    if (!openEl.contains(e.target)) close();
}

function onKey(e) {
    if (e.key === "Escape") close();
}

export async function openPicker(anchorEl, opts) {
    const {
        list, save, saveCurrent, load, del,
        rename, duplicate, getThumbnail, getSwatches,
        currentName, title, saveLbl, modal,
        folders, saveFolders, setItemFolder,
    } = opts;

    close();
    const pop = document.createElement("div");
    pop.className = "preset-popover";
    if (getThumbnail) pop.classList.add("has-thumbs");

    const currentSpan = currentName ? `<span class="preset-current">${escapeHtml(currentName)}</span>` : "";
    const closeBtn = modal ? `<button class="preset-close" title="Close">✕</button>` : "";
    const headerLine =
        `<div class="preset-header"><span>${escapeHtml(title)}</span>${currentSpan}${closeBtn}</div>`;
    pop.innerHTML = `
        ${headerLine}
        <div class="preset-actions">
            ${saveCurrent ? `<button class="btn primary preset-save-current" ${currentName ? "" : "disabled"}>Save</button>` : ""}
            <button class="btn preset-save-as">${escapeHtml(saveLbl)}</button>
            ${setItemFolder ? `<button class="btn preset-new-folder" title="Create a folder">＋ Folder</button>` : ""}
        </div>
        <div class="preset-list">Loading…</div>
    `;

    if (modal) {
        // Centered dialog over a dimming backdrop. Clicking the backdrop or
        // the ✕ closes; Escape closes via onKey.
        pop.classList.add("preset-modal");
        const backdrop = document.createElement("div");
        backdrop.className = "preset-modal-backdrop";
        backdrop.appendChild(pop);
        // Clicking the backdrop (outside the dialog), the ✕, or Escape closes.
        backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
        pop.querySelector(".preset-close").onclick = close;
        document.body.appendChild(backdrop);
        openEl = backdrop;
    } else {
        const rect = anchorEl.getBoundingClientRect();
        pop.style.left = `${Math.max(8, rect.left)}px`;
        pop.style.top  = `${rect.bottom + 4}px`;
        document.body.appendChild(pop);
        openEl = pop;
    }

    // Local cache so UI reacts instantly — KV's list() is eventually
    // consistent and a fresh re-list won't reflect a brand-new write
    // for ~60s.
    let cachedItems = [];
    let knownFolders = new Set(); // registry + folders seen on items

    async function runSave(saveFn) {
        if (!saveFn) return;
        const btns = pop.querySelectorAll(".preset-actions button");
        const labels = [...btns].map(b => b.textContent);
        for (const b of btns) { b.disabled = true; }
        try {
            const r = await saveFn();
            if (r) {
                toast(`Saved "${r.name || ""}"`);
                // Optimistic insert (or update if same id already in cache).
                cachedItems = cachedItems.filter(x => x.id !== r.id);
                cachedItems.unshift({
                    id: r.id,
                    customMeta: { name: r.name },
                    savedAt: new Date().toISOString(),
                    folder: r.folder || "",
                    _thumb: r.thumbnail || null,
                });
                renderList();
            }
        } catch (e) {
            toast(e.message, true);
        } finally {
            btns.forEach((b, i) => { b.disabled = false; b.textContent = labels[i]; });
            // re-disable Save if there's no current
            const savCur = pop.querySelector(".preset-save-current");
            if (savCur && !currentName && saveCurrent) savCur.disabled = true;
        }
    }

    const saveCurrentBtn = pop.querySelector(".preset-save-current");
    if (saveCurrentBtn) saveCurrentBtn.onclick = () => runSave(saveCurrent);
    pop.querySelector(".preset-save-as").onclick = () => runSave(save);

    const newFolderBtn = pop.querySelector(".preset-new-folder");
    if (newFolderBtn) newFolderBtn.onclick = async () => {
        const name = (await uiPrompt("New folder name:") || "").trim();
        if (!name) return;
        if (name.includes("/")) { toast("Folder names can't contain '/'.", true); return; }
        knownFolders.add(name);
        folderCollapsed.set(`${title}|${name}`, false);
        renderList();
        if (saveFolders) { try { await saveFolders([...knownFolders]); } catch (e) { toast(e.message, true); } }
    };

    function renderList() {
        const listEl = pop.querySelector(".preset-list");
        cachedItems.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));

        // Group by folder; folder "" (or no folders feature) = top level.
        const groups = new Map();
        const root = [];
        for (const it of cachedItems) {
            const f = setItemFolder ? (it.folder || "").trim() : "";
            if (!f) root.push(it);
            else (groups.get(f) || groups.set(f, []).get(f)).push(it);
        }
        for (const f of knownFolders) if (f && !groups.has(f)) groups.set(f, []);

        listEl.innerHTML = "";
        if (!cachedItems.length && !groups.size) {
            listEl.innerHTML = `<div class="preset-empty">No saved entries yet.</div>`;
            return;
        }
        for (const it of root) listEl.appendChild(makeRow(it, false));
        for (const f of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
            const items = groups.get(f);
            listEl.appendChild(makeFolderHeader(f, items));
            if (!folderCollapsed.get(`${title}|${f}`)) {
                for (const it of items) listEl.appendChild(makeRow(it, true));
            }
        }
    }

    function makeFolderHeader(f, items) {
        const ck = `${title}|${f}`;
        const collapsed = !!folderCollapsed.get(ck);
        const h = document.createElement("div");
        h.className = "preset-folder-header";
        h.innerHTML = `
            <span class="preset-folder-caret">${collapsed ? "▸" : "▾"}</span>
            <span class="preset-folder-name">🗀 ${escapeHtml(f)}</span>
            <span class="preset-folder-count">${items.length}</span>`;
        h.onclick = () => { folderCollapsed.set(ck, !collapsed); renderList(); };
        return h;
    }

    function makeRow(it, inFolder) {
        const name = (it.customMeta && it.customMeta.name) || it.id;
        const when = it.savedAt ? new Date(it.savedAt).toLocaleString() : "";
        const row = document.createElement("div");
        row.className = inFolder ? "preset-row preset-row-foldered" : "preset-row";
        row.style.cursor = "pointer";
        // Clicking anywhere on the row loads it. The action buttons below
        // stopPropagation so they don't also trigger a load.
        row.onclick = async () => {
            try { await load(it.id); close(); }
            catch (e) { toast(e.message, true); }
        };

        // Thumbnail column (only if the caller provides a getter).
        if (getThumbnail) {
            const thumb = document.createElement("div");
            thumb.className = "preset-thumb";
            if (it._thumb) thumb.innerHTML = it._thumb;
            else {
                // Lazy-load when not pre-supplied.
                getThumbnail(it.id).then(svg => {
                    if (svg) { it._thumb = svg; thumb.innerHTML = svg; }
                }).catch(() => {});
            }
            row.appendChild(thumb);
        }

        const nameWrap = document.createElement("div");
        nameWrap.className = "preset-name-wrap";
        nameWrap.innerHTML = `
            <span class="preset-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            <span class="preset-when">${escapeHtml(when)}</span>
        `;
        // Inline horizontal swatch strip (e.g. a palette's pen colours),
        // lazily loaded the first time the row renders.
        if (getSwatches) {
            const strip = document.createElement("div");
            strip.className = "preset-swatches";
            const paint = (colors) => {
                strip.innerHTML = "";
                for (const c of colors || []) {
                    const safe = String(c || "").replace(/[^#0-9a-zA-Z(),.% ]/g, "");
                    if (!safe) continue;
                    const sw = document.createElement("span");
                    sw.style.background = safe;
                    strip.appendChild(sw);
                }
            };
            if (it._swatches) paint(it._swatches);
            else getSwatches(it.id).then(cols => { it._swatches = cols; paint(cols); }).catch(() => {});
            nameWrap.appendChild(strip);
        }
        row.appendChild(nameWrap);

        // Row actions: move, rename, duplicate, delete.
        const actions = document.createElement("div");
        actions.className = "preset-row-actions";

        if (setItemFolder) {
            const b = iconBtn("🗂", "Move to folder");
            b.onclick = async (e) => {
                e.stopPropagation();
                const cur = (it.folder || "").trim();
                const choices = [
                    { value: "", label: "— No folder —" },
                    ...[...knownFolders].filter(Boolean).sort().map(f => ({ value: f, label: f })),
                    { value: "__new__", label: "＋ New folder…" },
                ];
                let dest = await uiChoose(`Move "${name}" to:`, choices, { defaultValue: cur, okLabel: "Move" });
                if (dest === null) return;
                if (dest === "__new__") {
                    dest = (await uiPrompt("New folder name:") || "").trim();
                    if (!dest || dest.includes("/")) return;
                    knownFolders.add(dest);
                    if (saveFolders) saveFolders([...knownFolders]).catch(() => {});
                }
                try {
                    await setItemFolder(it.id, dest);
                    it.folder = dest;
                    toast(dest ? `Moved to "${dest}"` : "Moved out of folder");
                    renderList();
                } catch (err) { toast(err.message, true); }
            };
            actions.appendChild(b);
        }

        if (rename) {
            const b = iconBtn("✎", "Rename");
            b.onclick = async (e) => {
                e.stopPropagation();
                const next = await uiPrompt("Rename to:", name);
                if (!next || next === name) return;
                try {
                    await rename(it.id, next);
                    it.customMeta = { ...(it.customMeta || {}), name: next };
                    it.savedAt = new Date().toISOString();
                    toast(`Renamed to "${next}"`);
                    renderList();
                } catch (err) { toast(err.message, true); }
            };
            actions.appendChild(b);
        }

        if (duplicate) {
            const b = iconBtn("⎘", "Duplicate");
            b.onclick = async (e) => {
                e.stopPropagation();
                try {
                    const r = await duplicate(it.id);
                    if (r) {
                        toast(`Duplicated as "${r.name}"`);
                        cachedItems.unshift({
                            id: r.id,
                            customMeta: { name: r.name },
                            savedAt: new Date().toISOString(),
                            _thumb: r.thumbnail || it._thumb || null,
                        });
                        renderList();
                    }
                } catch (err) { toast(err.message, true); }
            };
            actions.appendChild(b);
        }

        const delBtn = iconBtn("×", "Delete");
        delBtn.classList.add("preset-del");
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (!await uiConfirm(`Delete "${name}"? This can't be undone.`)) return;
            try {
                await del(it.id);
                cachedItems = cachedItems.filter(x => x.id !== it.id);
                toast(`Deleted "${name}"`);
                renderList();
            } catch (err) { toast(err.message, true); }
        };
        actions.appendChild(delBtn);

        row.appendChild(actions);
        return row;
    }

    function iconBtn(label, title) {
        const b = document.createElement("button");
        b.className = "preset-icon-btn";
        b.textContent = label;
        b.title = title;
        return b;
    }

    async function refresh() {
        const listEl = pop.querySelector(".preset-list");
        listEl.textContent = "Loading…";
        try { cachedItems = (await list()) || []; }
        catch (e) {
            listEl.innerHTML = `<div class="preset-empty err">${escapeHtml(e.message)}</div>`;
            return;
        }
        // Folder registry (for empty folders) + any folders seen on items.
        knownFolders = new Set();
        if (folders) { try { for (const f of (await folders()) || []) if (f) knownFolders.add(f); } catch { /* ignore */ } }
        for (const it of cachedItems) if (it.folder) knownFolders.add(it.folder);
        renderList();
    }

    setTimeout(() => {
        document.addEventListener("mousedown", onOutside, true);
        document.addEventListener("keydown", onKey, true);
    }, 0);
    refresh();
}

function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
