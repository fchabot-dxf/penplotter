// Cloud panel — Worker URL + API key, plus the Projects list (save /
// load / delete the entire app state). Palette save/load is wired in
// plot-colors-panel.js because the controls live next to the palette
// itself, but they share the same cloud.js client.
//
// Project payload = a JSON snapshot of everything that defines a
// plotter session: document size, art layers, toolpaths, plot colors,
// and plotter settings. View state (selection, viewport, undo history)
// is excluded — opening a project shouldn't restore "the previous
// click."

import { state } from "./state.js";
import { $, toast } from "./dom.js";
import { render } from "./render.js";
import { fitViewport } from "./viewport.js";
import { snapshot } from "./history.js";
import * as cloud from "./cloud.js";
import { openPicker } from "./cloud-picker.js";
import { uiPrompt, uiConfirm } from "./ui-dialog.js";
import { loadDefaults } from "./settings.js";

export function installCloudPanel() {
    const url = $("#cloudUrl");
    const key = $("#cloudKey");
    if (url && key) {
        const cfg = cloud.getConfig();
        url.value = cfg.url;
        key.value = cfg.apiKey;
        url.addEventListener("change", () => cloud.setConfig({ url: url.value }));
        key.addEventListener("change", () => cloud.setConfig({ apiKey: key.value }));
    }

    // The button already has its folder-icon + "Projects" markup in
    // the HTML — just wire the click. Don't touch textContent (that
    // would wipe the icon).
    const projectBtn = $("#projectBtn");
    if (projectBtn) projectBtn.onclick = (e) => openProjectPicker(e.currentTarget);

    const saveBtn = $("#saveProjectBtn");
    if (saveBtn) saveBtn.onclick = quickSaveProject;
}

/** Disk button: overwrite the open project; if none is open yet, save as
 *  new (prompting for a name). */
async function quickSaveProject() {
    if (!cloud.isConfigured()) { toast("Set Worker URL + API key first.", true); return; }
    try {
        const payload = snapshotProject();
        const cur = state.currentProject;
        if (cur.id) {
            const r = await cloud.updateProject(cur.id, cur.name || "untitled", payload);
            state.currentProject = { id: r.id, name: r.name };
            toast(`Saved "${r.name}"`);
        } else {
            const name = await uiPrompt("Project name:", suggestProjectName());
            if (!name) return;
            const r = await cloud.saveProject(name, payload);
            state.currentProject = { id: r.id, name: r.name };
            toast(`Saved "${r.name}"`);
        }
        renderProjectList();
    } catch (e) {
        toast(e.message, true);
    }
}

function openProjectPicker(anchor) {
    openPicker(anchor, {
        modal: true,
        title: "Projects",
        saveLbl: "Save as new",
        currentName: state.currentProject.name,
        list: () => cloud.listProjects(),

        // Folders
        folders: () => cloud.listFolders("projects"),
        saveFolders: (arr) => cloud.saveFolders("projects", arr),
        setItemFolder: (id, folder) => cloud.setProjectFolder(id, folder),

        // "Save as new" — always a fresh entry. Becomes the current one.
        save: async () => {
            const name = await uiPrompt("Project name:", suggestProjectName());
            if (!name) return null;
            const payload = snapshotProject();
            const r = await cloud.saveProject(name, payload);
            state.currentProject = { id: r.id, name: r.name };
            return { ...r, thumbnail: payload.thumbnail };
        },

        // "Save" — overwrites the project that's currently open. Returns
        // null if there isn't one (the button is disabled in that case
        // by the picker, this is just defensive).
        saveCurrent: async () => {
            const cur = state.currentProject;
            if (!cur.id) return null;
            const payload = snapshotProject();
            const r = await cloud.updateProject(cur.id, cur.name || "untitled", payload);
            state.currentProject = { id: r.id, name: r.name };
            return { ...r, thumbnail: payload.thumbnail };
        },

        load: async (id) => {
            const obj = await cloud.loadProject(id);
            if (!obj || !obj.project) { toast("Project payload empty.", true); return; }
            applyProject(obj.project);
            state.currentProject = { id, name: obj.name || "untitled" };
            toast(`Loaded "${obj.name || ""}"`);
        },

        del: async (id) => {
            await cloud.deleteProject(id);
            if (state.currentProject.id === id) state.currentProject = { id: null, name: null };
        },

        rename: async (id, newName) => {
            await cloud.renameProject(id, newName);
            if (state.currentProject.id === id) state.currentProject.name = newName;
        },

        // Load → save-new with " (copy)" suffix. Lazy-loads the source
        // project value because the list endpoint only carries metadata.
        duplicate: async (id) => {
            const obj = await cloud.loadProject(id);
            if (!obj || !obj.project) throw new Error("Source project missing.");
            const name = `${obj.name || "untitled"} (copy)`;
            const r = await cloud.saveProject(name, obj.project);
            return { ...r, thumbnail: obj.project.thumbnail };
        },

        // Thumbnail isn't in the list response (KV metadata limit is
        // 1024 bytes); fetch the value lazily per row.
        getThumbnail: async (id) => {
            try {
                const obj = await cloud.loadProject(id);
                return obj?.project?.thumbnail || null;
            } catch { return null; }
        },
    });
}

// ---------------- Projects ----------------

async function onSaveProject() {
    if (!cloud.isConfigured()) { toast("Set Worker URL + API key first.", true); return; }
    const name = await uiPrompt("Project name:", suggestProjectName());
    if (!name) return;
    try {
        const payload = snapshotProject();
        const r = await cloud.saveProject(name, payload);
        toast(`Saved project "${r.name}"`);
        renderProjectList();
    } catch (e) {
        toast(e.message, true);
    }
}

async function onLoadProject(id, name) {
    if (!await uiConfirm(`Open project "${name}"? Unsaved changes will be lost.`)) return;
    try {
        const obj = await cloud.loadProject(id);
        if (!obj || !obj.project) { toast("Project payload empty.", true); return; }
        applyProject(obj.project);
        toast(`Loaded "${obj.name || name}"`);
    } catch (e) {
        toast(e.message, true);
    }
}

async function onDeleteProject(id, name) {
    if (!await uiConfirm(`Delete cloud project "${name}"? This can't be undone.`)) return;
    try {
        await cloud.deleteProject(id);
        toast(`Deleted "${name}"`);
        renderProjectList();
    } catch (e) {
        toast(e.message, true);
    }
}

export async function renderProjectList() {
    const root = $("#projectList");
    if (!root) return;
    if (!cloud.isConfigured()) {
        root.innerHTML = `<div class="empty">Set Worker URL + API key above to enable cloud save/load.</div>`;
        return;
    }
    root.innerHTML = `<div class="empty">Loading…</div>`;
    let items;
    try {
        items = await cloud.listProjects();
    } catch (e) {
        root.innerHTML = `<div class="empty err">${escapeHtml(e.message)}</div>`;
        return;
    }
    if (!items || !items.length) {
        root.innerHTML = `<div class="empty">No projects yet — click "Save project" to upload the current state.</div>`;
        return;
    }
    // Newest first.
    items.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
    root.innerHTML = "";
    for (const it of items) root.appendChild(projectRow(it));
}

function projectRow(it) {
    const row = document.createElement("div");
    row.className = "cloud-row";
    const name = document.createElement("span");
    name.className = "cloud-name";
    name.textContent = (it.customMeta && it.customMeta.name) || it.id;
    name.title = name.textContent;
    name.onclick = () => onLoadProject(it.id, name.textContent);

    const meta = document.createElement("span");
    meta.className = "cloud-meta";
    meta.textContent = it.savedAt ? new Date(it.savedAt).toLocaleString() : "";

    const del = document.createElement("button");
    del.className = "cloud-del";
    del.textContent = "×";
    del.title = "Delete cloud project";
    del.onclick = (e) => { e.stopPropagation(); onDeleteProject(it.id, name.textContent); };

    row.append(name, meta, del);
    return row;
}

// ---------------- payload helpers ----------------

/** Serialize the parts of state that define a project. Skips
 *  selection / viewport / undo so opening doesn't restore stale
 *  view state. Uses JSON.stringify with a getter-safe round-trip
 *  so Set/Map values are normalized into arrays. */
function snapshotProject() {
    return {
        doc: { ...state.doc },
        settings: { ...state.settings },
        plotColors: state.plotColors.map(pc => ({ ...pc })),
        artLayers: state.artLayers.map(l => ({
            id: l.id, name: l.name, color: l.color,
            visible: l.visible, group: l.group || "",
            groupPath: Array.isArray(l.groupPath) ? [...l.groupPath] : [],
            shapes: l.shapes.map(s => ({ ...s })),
        })),
        toolpaths: state.toolpaths.map(tp => ({ ...tp,
            outline: { ...tp.outline },
            fill: { ...tp.fill },
            targetShapeIds: [...(tp.targetShapeIds || [])],
        })),
        activeArtLayerId: state.activeArtLayerId,
        activeToolpathId: state.activeToolpathId,
        // Compact SVG thumbnail of the artwork — shown next to the
        // project name in the Projects popup so the user can pick by
        // sight. Just the art layers, no toolpath overlay / grid.
        thumbnail: buildThumbnail(),
        savedAt: new Date().toISOString(),
        version: 1,
    };
}

/** Build a minimal standalone SVG of the current artwork — used as the
 *  preview image in the Projects popup. Doc size sets the viewBox so
 *  the artwork fits regardless of aspect. Each shape is emitted with
 *  whatever paint it carries (fill / stroke / both); shapes that have
 *  no paint default to a thin dark stroke so they're at least visible.
 *  Returned as an SVG string (no XML prolog, ready to drop into
 *  innerHTML or wrap in a data URL). */
function buildThumbnail() {
    const w = state.doc.w || 200;
    const h = state.doc.h || 200;
    const parts = [];
    parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="#fff"/>`);
    for (const layer of state.artLayers) {
        if (!layer.visible) continue;
        for (const s of layer.shapes) {
            parts.push(shapeMarkup(s, layer.color));
        }
    }
    // Tiny, valid SVG. xmlns is required so the browser parses it when
    // the string is dropped into innerHTML.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
}

function shapeMarkup(s, layerColor) {
    const fill   = s._fill   === undefined ? "none"        : (s._fill   ?? "none");
    const stroke = s._stroke === undefined ? layerColor    : (s._stroke ?? "none");
    const sw     = s._strokeWidth !== undefined ? s._strokeWidth : 0.5;
    const attrs  = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"`;
    switch (s.type) {
        case "line":
            return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" ${attrs}/>`;
        case "rect":
            return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" ${attrs}/>`;
        case "ellipse":
            return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" ${attrs}/>`;
        case "polyline":
            return `<polyline points="${(s.points || []).map(p => `${p[0]},${p[1]}`).join(" ")}" ${attrs}/>`;
        case "path":
            return `<path d="${escapeAttr(s.d)}" ${attrs}/>`;
        default:
            return "";
    }
}

function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Apply a previously saved project payload back into state. */
function applyProject(p) {
    snapshot(); // push current state onto undo stack first
    if (p.doc) Object.assign(state.doc, p.doc);
    if (p.settings) Object.assign(state.settings, p.settings);
    if (Array.isArray(p.plotColors))  state.plotColors  = p.plotColors;
    if (Array.isArray(p.artLayers))   state.artLayers   = p.artLayers;
    if (Array.isArray(p.toolpaths))   state.toolpaths   = p.toolpaths;
    if (p.activeArtLayerId)   state.activeArtLayerId   = p.activeArtLayerId;
    if (p.activeToolpathId)   state.activeToolpathId   = p.activeToolpathId;
    state.selectedShapeIds    = new Set();
    state.selectedToolpathIds = new Set();
    // Sync hard-wired inputs (doc size, plotter settings) with the
    // restored values so the user sees the right numbers.
    if ($("#docW")) $("#docW").value = state.doc.w;
    if ($("#docH")) $("#docH").value = state.doc.h;
    loadDefaults();
    fitViewport();
    render();
}

function suggestProjectName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `plot-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
