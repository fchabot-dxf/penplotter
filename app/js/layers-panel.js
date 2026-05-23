// Layer panel UI on the left sidebar. Renders the layer list as a tree:
// layers with the same `group` property are nested under a collapsible
// group header. Loose layers (no group) appear flat at the bottom.

import { state, makeLayer } from "./state.js";
import { layersEl, $, toast } from "./dom.js";
import { render } from "./render.js";
import { renderActiveLayerPanel } from "./active-layer-panel.js";
import { snapshot } from "./history.js";

// group name → boolean (collapsed?)
const collapsed = new Map();

export function renderLayersPanel() {
    layersEl.innerHTML = "";

    // Group layers by `group` property, preserving insertion order. Layers
    // without a group go under the synthetic "" bucket = rendered flat.
    const groups = new Map();
    for (const layer of state.layers) {
        const key = layer.group || "";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(layer);
    }

    // Render groups in reverse so the panel reads top-down with the most
    // recently added layer at top (matches the previous behavior).
    const orderedGroupNames = [...groups.keys()].reverse();
    for (const name of orderedGroupNames) {
        const layers = groups.get(name).slice().reverse();
        if (name === "") {
            for (const layer of layers) layersEl.appendChild(layerRow(layer, false));
        } else {
            layersEl.appendChild(groupHeader(name, layers));
            if (!collapsed.get(name)) {
                for (const layer of layers) layersEl.appendChild(layerRow(layer, true));
            }
        }
    }
}

function groupHeader(name, layers) {
    const row = document.createElement("div");
    row.className = "group-row";

    const isCollapsed = !!collapsed.get(name);
    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = isCollapsed ? "▸" : "▾";

    // Bulk visibility for this group (SVG-side concern only).
    const visAll = document.createElement("span");
    visAll.className = "vis";
    const allVisible = layers.every(l => l.visible);
    visAll.textContent = allVisible ? "●" : "○";
    visAll.title = allVisible ? "Hide group" : "Show group";
    visAll.onclick = (e) => {
        e.stopPropagation();
        const target = !allVisible;
        for (const l of layers) l.visible = target;
        render();
    };

    const title = document.createElement("span");
    title.className = "group-name";
    title.textContent = name;

    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = `${layers.length}`;

    row.onclick = () => { collapsed.set(name, !isCollapsed); renderLayersPanel(); };
    row.append(chevron, visAll, title, count);
    return row;
}

function layerRow(layer, indented) {
    const row = document.createElement("div");
    row.className = "layer-row" + (indented ? " indented" : "");
    if (layer.id === state.activeLayerId) row.classList.add("active");

    // Count selected shapes in this layer for the visual indicator.
    let selectedCount = 0;
    for (const s of layer.shapes) {
        if (state.selectedShapeIds.has(s.id)) selectedCount++;
    }
    if (selectedCount > 0) row.classList.add("has-selection");

    const vis = el("span", { class: "vis", title: layer.visible ? "Hide on canvas" : "Show on canvas" },
                   layer.visible ? "●" : "○");
    vis.onclick = (e) => { e.stopPropagation(); layer.visible = !layer.visible; render(); };

    const sw = el("span", { class: "swatch", title: "Click to change color" });
    sw.style.background = layer.color;
    sw.onclick = (e) => {
        e.stopPropagation();
        const input = document.createElement("input");
        input.type = "color"; input.value = layer.color;
        input.oninput = (ev) => { layer.color = ev.target.value; render(); };
        input.click();
    };

    // Strip the "group / " prefix from the display name when nested —
    // the group header already gives that context.
    const baseName = indented && layer.group
        ? layer.name.replace(new RegExp("^" + escapeRe(layer.group) + "\\s*/\\s*"), "")
        : layer.name;

    const name = el("input", { class: "name", value: baseName });
    name.onclick = (e) => e.stopPropagation();
    name.onchange = (e) => {
        const v = e.target.value || "layer";
        layer.name = indented && layer.group ? `${layer.group} / ${v}` : v;
        renderLayersPanel();
    };

    // Optional badge showing how many shapes in this layer are selected.
    const badge = selectedCount > 0
        ? el("span", { class: "sel-count", title: `${selectedCount} selected` }, String(selectedCount))
        : null;

    const del = el("span", { class: "del", title: "Delete layer" }, "×");
    del.onclick = (e) => {
        e.stopPropagation();
        if (state.layers.length <= 1) { toast("Need at least one layer.", true); return; }
        snapshot();
        state.layers = state.layers.filter(l => l.id !== layer.id);
        if (state.activeLayerId === layer.id) state.activeLayerId = state.layers[state.layers.length - 1].id;
        render();
    };

    row.onclick = () => {
        state.activeLayerId = layer.id;
        renderLayersPanel();
        renderActiveLayerPanel();
    };
    row.append(vis, sw, name);
    if (badge) row.append(badge);
    row.append(del);
    return row;
}

function el(tag, attrs = {}, text) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function installLayerButtons() {
    $("#addLayer").onclick = () => {
        snapshot();
        const colors = ["#111111", "#c4444f", "#0e639c", "#3a8a3e", "#a060b0", "#c08020"];
        const color = colors[state.layers.length % colors.length];
        const layer = makeLayer(`layer ${state.layers.length + 1}`, color);
        state.layers.push(layer);
        state.activeLayerId = layer.id;
        render();
    };
    $("#clearLayer").onclick = () => {
        const l = state.layers.find(l => l.id === state.activeLayerId);
        if (!l || !l.shapes.length) return;
        if (!confirm(`Clear all shapes in "${l.name}"?`)) return;
        snapshot();
        l.shapes = [];
        render();
    };
    // Export-all / export-none buttons live on the right panel now
    // (toolpath-layers-panel.js wires them).
}
