// Right-panel layer list. Same tree as the left list but with export-
// oriented controls: per-layer export checkbox, group-level bulk export,
// no visibility / delete. Clicking a row activates that layer so the
// per-layer plot settings (pen, outline, fill) below reflect it.

import { state } from "./state.js";
import { $ } from "./dom.js";
import { render } from "./render.js";
import { renderActiveLayerPanel } from "./active-layer-panel.js";

const collapsed = new Map();

export function renderToolpathLayersPanel() {
    const root = $("#toolpathLayers");
    if (!root) return;
    root.innerHTML = "";

    const groups = new Map();
    for (const layer of state.layers) {
        const key = layer.group || "";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(layer);
    }

    const orderedGroupNames = [...groups.keys()].reverse();
    for (const name of orderedGroupNames) {
        const layers = groups.get(name).slice().reverse();
        if (name === "") {
            for (const layer of layers) root.appendChild(layerRow(layer, false));
        } else {
            root.appendChild(groupHeader(name, layers));
            if (!collapsed.get(name)) {
                for (const layer of layers) root.appendChild(layerRow(layer, true));
            }
        }
    }
}

function groupHeader(name, layers) {
    const row = document.createElement("div");
    row.className = "group-row";

    const isCollapsed = !!collapsed.get(name);
    const chev = document.createElement("span");
    chev.className = "chevron";
    chev.textContent = isCollapsed ? "▸" : "▾";

    const exp = document.createElement("input");
    exp.type = "checkbox";
    exp.className = "exp";
    exp.checked = layers.every(l => l.export);
    exp.indeterminate = !exp.checked && layers.some(l => l.export);
    exp.title = "Export entire group";
    exp.onclick = (e) => e.stopPropagation();
    exp.onchange = () => { for (const l of layers) l.export = exp.checked; render(); };

    const title = document.createElement("span");
    title.className = "group-name";
    title.textContent = name;

    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = `${layers.length}`;

    row.onclick = () => { collapsed.set(name, !isCollapsed); renderToolpathLayersPanel(); };
    row.append(chev, exp, title, count);
    return row;
}

function layerRow(layer, indented) {
    const row = document.createElement("div");
    row.className = "tp-layer-row" + (indented ? " indented" : "");
    if (layer.id === state.activeLayerId) row.classList.add("active");

    const exp = document.createElement("input");
    exp.type = "checkbox";
    exp.className = "exp";
    exp.checked = !!layer.export;
    exp.title = "Include in G-code export";
    exp.onclick = (e) => e.stopPropagation();
    exp.onchange = () => { layer.export = exp.checked; render(); };

    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = layer.color;

    const baseName = indented && layer.group
        ? layer.name.replace(new RegExp("^" + escapeRe(layer.group) + "\\s*/\\s*"), "")
        : layer.name;
    const name = document.createElement("span");
    name.className = "tp-layer-name";
    name.textContent = baseName;
    name.title = layer.name;

    row.onclick = () => {
        state.activeLayerId = layer.id;
        renderToolpathLayersPanel();
        renderActiveLayerPanel();
        // Also refresh left panel so its active highlight follows.
        import("./layers-panel.js").then(m => m.renderLayersPanel());
    };
    row.append(exp, sw, name);
    return row;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function installToolpathLayersPanel() {
    $("#exportAll").onclick = () => {
        for (const l of state.layers) l.export = true;
        render();
    };
    $("#exportNone").onclick = () => {
        for (const l of state.layers) l.export = false;
        render();
    };
}
