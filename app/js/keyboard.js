// Global keyboard shortcuts. Tools, delete, escape, polyline finish, space-pan.

import { state } from "./state.js";
import { canvas } from "./dom.js";
import { setTool, cancelInteraction } from "./tools.js";
import { render } from "./render.js";
import { commitPolyline } from "./interaction.js";
import { snapshot } from "./history.js";
import { exitTargetEditing } from "./toolpath-layers-panel.js";

const TOOL_KEYS = {
    v: "select", t: "rotate", s: "scale",
    l: "line", r: "rect", e: "ellipse", p: "polyline", f: "freehand",
};

export function installKeyboard() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
}

function onKeyDown(e) {
    if (e.target.tagName === "INPUT") return;

    if (e.code === "Space") {
        state.spaceDown = true;
        canvas.classList.add("panning");
        e.preventDefault();
        return;
    }
    if (e.key === "Escape") {
        if (state.targetEditingToolpathId) { exitTargetEditing(); return; }
        if (state.interaction) return cancelInteraction();
        // Nothing in-flight — Esc becomes a "deselect everything"
        // shortcut. Works in any mode, including toolpath mode where
        // there's no empty-canvas to click on near the panel.
        if (state.selectedShapeIds.size || state.selectedToolpathIds.size) {
            state.selectedShapeIds = new Set();
            state.selectedToolpathIds = new Set();
            state.activeToolpathId = null;
            render();
        }
        return;
    }
    if (e.key === "Enter") {
        if (state.interaction && state.interaction.kind === "polyline") commitPolyline();
        return;
    }
    if (e.key === "Delete" || e.key === "Backspace") return deleteSelected();

    const tool = TOOL_KEYS[e.key.toLowerCase()];
    if (tool) setTool(tool);
}

function onKeyUp(e) {
    if (e.code === "Space") {
        state.spaceDown = false;
        canvas.classList.remove("panning");
    }
}

function deleteSelected() {
    if (!state.selectedShapeIds.size) return;
    snapshot();
    for (const sid of state.selectedShapeIds) {
        for (const l of state.layers) {
            const i = l.shapes.findIndex(s => s.id === sid);
            if (i >= 0) l.shapes.splice(i, 1);
        }
    }
    state.selectedShapeIds.clear();
    render();
}
