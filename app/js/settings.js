// Right panel: document size + plotter settings.
// Defaults come from state.js — no server round-trip needed anymore.

import { state } from "./state.js";
import { $ } from "./dom.js";
import { fitViewport } from "./viewport.js";
import { render } from "./render.js";

const SETTINGS_MAP = {
    penUpZ:   "pen_up_z",
    penDownZ: "pen_down_z",
    drawFeed: "draw_feed",
    zFeed:    "z_feed",
    tol:      "tolerance_mm",
};

export function installSettingsPanel() {
    $("#docW").addEventListener("change", (e) => {
        state.doc.w = +e.target.value; fitViewport(); render();
    });
    $("#docH").addEventListener("change", (e) => {
        state.doc.h = +e.target.value; fitViewport(); render();
    });
    for (const [domId, key] of Object.entries(SETTINGS_MAP)) {
        $("#" + domId).addEventListener("change", (e) => {
            state.settings[key] = +e.target.value;
        });
    }
}

/** Sync the field inputs with whatever defaults state.settings carries
 *  (pure UI hydration; no async, no server). */
export async function loadDefaults() {
    const s = state.settings;
    $("#penUpZ").value   = s.pen_up_z;
    $("#penDownZ").value = s.pen_down_z;
    $("#drawFeed").value = s.draw_feed;
    $("#zFeed").value    = s.z_feed;
    $("#tol").value      = s.tolerance_mm;
}
