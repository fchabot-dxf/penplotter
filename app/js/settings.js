// Right panel: document size + plotter settings. Loads defaults from the server.

import { state } from "./state.js";
import { $, api } from "./dom.js";
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

export async function loadDefaults() {
    try {
        const r = await fetch(api("/api/defaults"));
        if (!r.ok) return;
        const d = await r.json();
        Object.assign(state.settings, d);
        $("#penUpZ").value   = d.pen_up_z;
        $("#penDownZ").value = d.pen_down_z;
        $("#drawFeed").value = d.draw_feed;
        $("#zFeed").value    = d.z_feed;
        $("#tol").value      = d.tolerance_mm;
    } catch {
        // Defaults already set in state.js — fine to start without the server.
    }
}
