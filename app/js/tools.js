// Tool selection + drawing-preview helpers shared with interaction.js.

import { state } from "./state.js";
import { canvas } from "./dom.js";

const TOOL_CLASSES = ["tool-select", "tool-rotate", "tool-scale", "tool-line", "tool-rect", "tool-ellipse", "tool-polyline", "tool-freehand"];

export function setTool(tool) {
    state.tool = tool;
    canvas.classList.remove(...TOOL_CLASSES);
    canvas.classList.add(`tool-${tool}`);
    document.querySelectorAll(".tool").forEach(b =>
        b.classList.toggle("active", b.dataset.tool === tool)
    );
    if (state.interaction) cancelInteraction();
}

let previewEl = null;

export function showPreview(el) {
    removePreview();
    el.classList.add("preview");
    el.classList.remove("shape");
    canvas.appendChild(el);
    previewEl = el;
}

export function removePreview() {
    if (previewEl && previewEl.parentNode) previewEl.parentNode.removeChild(previewEl);
    previewEl = null;
}

// Late import to avoid circular evaluation pain; render() is event-driven.
let _render = null;
async function lazyRender() {
    if (!_render) _render = (await import("./render.js")).render;
    _render();
}

export function cancelInteraction() {
    state.interaction = null;
    removePreview();
    lazyRender();
}

export function installToolbar() {
    document.querySelectorAll(".tool").forEach(b => b.onclick = () => setTool(b.dataset.tool));
}
