// SVG / Toolpath toggle buttons at the top-left of the canvas.

import { state } from "./state.js";
import { $ } from "./dom.js";
import { render } from "./render.js";

// The three preview modes are mutually exclusive — exactly one is on at
// any time. Clicking the already-active one is a no-op (you can't turn
// off all views, that'd leave the canvas blank).
const KEYS = ["showSvg", "showToolpath", "showSimulation"];

export function installPreviewToggles() {
    ensureExactlyOne();
    syncToggleUI();
    bind("#toggleSvg", "showSvg");
    bind("#toggleToolpath", "showToolpath");
    bind("#toggleSimulation", "showSimulation");
}

function bind(selector, key) {
    $(selector).onclick = () => {
        if (state.preview[key]) return; // already active
        for (const k of KEYS) state.preview[k] = (k === key);
        syncToggleUI();
        render();
    };
}

function ensureExactlyOne() {
    if (!KEYS.some(k => state.preview[k])) state.preview.showSvg = true;
    let seen = false;
    for (const k of KEYS) {
        if (state.preview[k]) {
            if (seen) state.preview[k] = false;
            else seen = true;
        }
    }
}

function syncToggleUI() {
    $("#toggleSvg").classList.toggle("on", state.preview.showSvg);
    $("#toggleToolpath").classList.toggle("on", state.preview.showToolpath);
    $("#toggleSimulation").classList.toggle("on", state.preview.showSimulation);
    // Propagate the active mode to <body> so CSS can contextualize the
    // sidebars: svg-only sections (Tools, Style) hide in toolpath/sim;
    // plot-only sections (Toolpath Layers, Active Layer plot settings,
    // Plotter Settings) hide in svg.
    const mode = state.preview.showSvg ? "svg"
              : state.preview.showSimulation ? "simulation"
              : "toolpath";
    document.body.dataset.mode = mode;
}
