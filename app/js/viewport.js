// Canvas viewport: fit-to-doc, pan, zoom, and screen↔SVG coord conversion.

import { state } from "./state.js";
import { canvas, canvasWrap, docInfoEl } from "./dom.js";

export function fitViewport() {
    const wrap = canvasWrap.getBoundingClientRect();
    const margin = 24;
    const sx = (wrap.width - margin * 2) / state.doc.w;
    const sy = (wrap.height - margin * 2) / state.doc.h;
    state.viewport.scale = Math.max(0.1, Math.min(sx, sy));
    state.viewport.panX = 0;
    state.viewport.panY = 0;
    applyViewport();
}

export function applyViewport() {
    const { scale, panX, panY } = state.viewport;
    canvas.setAttribute("width", state.doc.w * scale);
    canvas.setAttribute("height", state.doc.h * scale);
    canvas.setAttribute("viewBox", `0 0 ${state.doc.w} ${state.doc.h}`);
    canvas.style.transform = `translate(${panX}px, ${panY}px)`;
    docInfoEl.textContent = `${state.doc.w} × ${state.doc.h} mm  ·  ${(scale * 25.4 / 96).toFixed(2)}× display`;
}

export function screenToSvg(clientX, clientY) {
    const pt = canvas.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = canvas.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const s = pt.matrixTransform(ctm.inverse());
    return { x: s.x, y: s.y };
}

// Wheel zoom that keeps the point under the cursor stationary.
export function installWheelZoom() {
    canvasWrap.addEventListener("wheel", (e) => {
        e.preventDefault();
        const before = screenToSvg(e.clientX, e.clientY);
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        state.viewport.scale = Math.max(0.05, state.viewport.scale * factor);
        applyViewport();
        const after = screenToSvg(e.clientX, e.clientY);
        state.viewport.panX += (after.x - before.x) * state.viewport.scale;
        state.viewport.panY += (after.y - before.y) * state.viewport.scale;
        applyViewport();
    }, { passive: false });
}
