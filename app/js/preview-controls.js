// SVG / Toolpath toggle buttons at the top-left of the canvas, plus the
// "simulate pen widths" checkbox in the Toolpath Operations panel.
//
// Two preview modes — SVG or Toolpath — mutually exclusive. Clicking the
// already-active one is a no-op (can't blank the canvas). When Toolpath
// mode is active, simulatePens decides whether strokes render at their
// pen width (formerly "Simulation" mode) or as thin diagnostic lines.

import { state } from "./state.js";
import { $ } from "./dom.js";
import { render } from "./render.js";
import { cancelInteraction } from "./tools.js";

const KEYS = ["showSvg", "showToolpath"];

export function installPreviewToggles() {
    ensureExactlyOne();
    syncToggleUI();
    bind("#toggleSvg", "showSvg");
    bind("#toggleToolpath", "showToolpath");

    // "Pen widths" floating toggle next to SVG / Toolpath. Behaves
    // like the other view-toggle buttons (.on = active). Clicking it
    // also switches into Toolpath view if you're still in SVG view —
    // simulated pen widths are a Toolpath-mode concern, so it would
    // do nothing visible from SVG.
    const sim = $("#toggleSimPens");
    if (sim) {
        sim.classList.toggle("on", !!state.preview.simulatePens);
        sim.onclick = () => {
            state.preview.simulatePens = !state.preview.simulatePens;
            sim.classList.toggle("on", state.preview.simulatePens);
            if (state.preview.simulatePens && !state.preview.showToolpath) {
                cancelInteraction();
                for (const k of KEYS) state.preview[k] = (k === "showToolpath");
                syncToggleUI();
            }
            render();
        };
    }
}

function bind(selector, key) {
    $(selector).onclick = () => {
        if (state.preview[key]) return; // already active
        cancelInteraction();
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
    document.body.dataset.mode = state.preview.showSvg ? "svg" : "toolpath";
}
