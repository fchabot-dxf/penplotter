// Plot Colors panel — top of the right sidebar in plot/sim modes.
// Renders the pen palette discovered from imports and lets the user edit
// it. Each toolpath references a plot color by id, so renames/recolors
// here cascade to the Toolpath Layers list, toolpath preview, etc.

import { state, makePlotColor } from "./state.js";
import { $, toast } from "./dom.js";
import { snapshot } from "./history.js";
import { render } from "./render.js";
import * as cloud from "./cloud.js";
import { openPicker } from "./cloud-picker.js";

export function installPlotColorsPanel() {
    const addBtn = $("#addPlotColor");
    if (addBtn) addBtn.onclick = () => {
        snapshot();
        state.plotColors.push(makePlotColor(`pen ${state.plotColors.length + 1}`, "#111111"));
        render();
    };
    // Single "Presets…" button — opens a popup with save / list / delete.
    // Don't touch textContent; the HTML already has the label we want.
    const presetBtn = $("#palettePresetBtn");
    if (presetBtn) presetBtn.onclick = (e) => openPalettePicker(e.currentTarget);
}

function openPalettePicker(anchor) {
    openPicker(anchor, {
        title: "Palette presets",
        saveLbl: "Save as new",
        list: () => cloud.listPalettes(),
        save: async () => {
            if (!state.plotColors.length) { toast("No pens to save.", true); return null; }
            const name = prompt("Palette name:", suggestPaletteName());
            if (!name) return null;
            const payload = state.plotColors.map(pc => ({ ...pc }));
            return cloud.savePalette(name, payload);
        },
        load: async (id) => {
            const obj = await cloud.loadPalette(id);
            if (!obj || !Array.isArray(obj.palette)) { toast("Palette payload empty.", true); return; }
            applyPalette(obj.palette);
            toast(`Loaded palette "${obj.name || ""}"`);
        },
        del: (id) => cloud.deletePalette(id),
        rename: (id, newName) => cloud.renamePalette(id, newName),
        duplicate: async (id) => {
            const obj = await cloud.loadPalette(id);
            if (!obj || !Array.isArray(obj.palette)) throw new Error("Source palette missing.");
            const name = `${obj.name || "untitled"} (copy)`;
            return cloud.savePalette(name, obj.palette);
        },
    });
}

// ---------- cloud palette save / load ----------

async function onSavePalette() {
    if (!cloud.isConfigured()) { toast("Set Worker URL + API key in Settings first.", true); return; }
    if (!state.plotColors.length) { toast("No pens to save.", true); return; }
    const name = prompt("Palette name:", suggestPaletteName());
    if (!name) return;
    try {
        const payload = state.plotColors.map(pc => ({ ...pc }));
        const r = await cloud.savePalette(name, payload);
        toast(`Saved palette "${r.name}"`);
    } catch (e) {
        toast(e.message, true);
    }
}

/** Prompt the user with a list of saved palettes and load whichever
 *  they pick. Loaded palette REPLACES the current one — toolpaths whose
 *  plotColorId no longer exists in the new palette get reassigned to
 *  the nearest pen so nothing ends up unlinked. */
async function onLoadPalette() {
    if (!cloud.isConfigured()) { toast("Set Worker URL + API key in Settings first.", true); return; }
    let items;
    try { items = await cloud.listPalettes(); } catch (e) { toast(e.message, true); return; }
    if (!items || !items.length) { toast("No saved palettes yet.", true); return; }

    items.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
    const lines = items.map((it, i) => {
        const n = (it.customMeta && it.customMeta.name) || it.id;
        const t = it.savedAt ? ` (${new Date(it.savedAt).toLocaleDateString()})` : "";
        return `${i + 1}. ${n}${t}`;
    }).join("\n");
    const pick = prompt(`Saved palettes — type a number to load:\n\n${lines}`, "1");
    if (!pick) return;
    const idx = (parseInt(pick, 10) || 0) - 1;
    if (idx < 0 || idx >= items.length) { toast("Invalid selection.", true); return; }
    try {
        const obj = await cloud.loadPalette(items[idx].id);
        if (!obj || !Array.isArray(obj.palette)) { toast("Palette payload empty.", true); return; }
        applyPalette(obj.palette);
        toast(`Loaded palette "${obj.name || items[idx].customMeta?.name || ""}"`);
    } catch (e) {
        toast(e.message, true);
    }
}

/** Replace the current palette with `next`, gracefully reassigning
 *  any toolpaths whose pen disappeared to the nearest remaining pen. */
function applyPalette(next) {
    snapshot();
    const oldById = new Map(state.plotColors.map(pc => [pc.id, pc]));
    state.plotColors = next.map(pc => ({ ...pc }));
    const stillExists = new Set(state.plotColors.map(pc => pc.id));
    for (const tp of state.toolpaths) {
        if (tp.plotColorId && !stillExists.has(tp.plotColorId)) {
            const old = oldById.get(tp.plotColorId);
            tp.plotColorId = old ? nearestPen(old.color, state.plotColors).id : state.plotColors[0]?.id || null;
        }
    }
    render();
}

function suggestPaletteName() {
    const n = state.plotColors.length;
    return `palette-${n}-pens-${new Date().toISOString().slice(0, 10)}`;
}

export function renderPlotColorsPanel() {
    const root = $("#plotColors");
    if (!root) return;
    root.innerHTML = "";

    if (state.plotColors.length === 0) {
        root.innerHTML = `<div class="empty">Import an SVG or click + to add a pen.</div>`;
        return;
    }

    for (const pc of state.plotColors) {
        root.appendChild(plotColorRow(pc));
    }
}

function plotColorRow(pc) {
    const row = document.createElement("div");
    row.className = "pc-row";

    // Count how many toolpaths use this pen — small badge for at-a-glance
    // sense of which pens actually matter.
    const usedBy = state.toolpaths.filter(tp => tp.plotColorId === pc.id).length;

    // Swatch — click opens a native color picker that updates the pen.
    const swatch = document.createElement("button");
    swatch.className = "pc-swatch";
    swatch.style.background = pc.color;
    swatch.title = "Click to change pen color";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = pc.color;
    colorInput.style.position = "absolute";
    colorInput.style.opacity = "0";
    colorInput.style.pointerEvents = "none";
    colorInput.style.width = "1px"; colorInput.style.height = "1px";
    swatch.appendChild(colorInput);
    swatch.onclick = () => colorInput.click();
    let pickStarted = false;
    colorInput.oninput = () => {
        if (!pickStarted) { snapshot(); pickStarted = true; }
        pc.color = colorInput.value;
        render();
    };
    colorInput.onchange = () => { pickStarted = false; };

    // Name input — rename the pen.
    const name = document.createElement("input");
    name.className = "pc-name";
    name.type = "text";
    name.value = pc.name;
    name.onchange = () => {
        snapshot();
        pc.name = name.value || "pen";
        render();
    };

    const badge = document.createElement("span");
    badge.className = "pc-badge";
    badge.textContent = usedBy;
    badge.title = `${usedBy} toolpath${usedBy === 1 ? "" : "s"} using this pen`;

    const del = document.createElement("span");
    del.className = "pc-del";
    del.textContent = "×";
    del.title = "Delete pen — toolpaths get reassigned to the nearest remaining pen";
    del.onclick = (e) => {
        e.stopPropagation();
        const remaining = state.plotColors.filter(p => p.id !== pc.id);
        if (remaining.length === 0) {
            toast("Can't delete the last pen — at least one is required.", true);
            return;
        }
        let target = null;
        if (usedBy > 0) {
            target = nearestPen(pc.color, remaining);
            if (!confirm(`${usedBy} toolpath${usedBy === 1 ? "" : "s"} will be reassigned to "${target.name}" (closest color). Continue?`)) return;
        }
        snapshot();
        if (target) {
            for (const tp of state.toolpaths) {
                if (tp.plotColorId === pc.id) tp.plotColorId = target.id;
            }
        }
        state.plotColors = remaining;
        render();
    };

    row.append(swatch, name, badge, del);
    return row;
}

/** Find the pen in `pool` whose color is closest to `targetHex` in RGB
 *  Euclidean distance — used to gracefully reassign toolpaths when their
 *  pen is deleted. */
function nearestPen(targetHex, pool) {
    const [tr, tg, tb] = hexToRgb(targetHex);
    let best = pool[0], bestDist = Infinity;
    for (const p of pool) {
        const [r, g, b] = hexToRgb(p.color);
        const d = (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2;
        if (d < bestDist) { bestDist = d; best = p; }
    }
    return best;
}

function hexToRgb(h) {
    const m = (h || "#111111").trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return [17, 17, 17];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
