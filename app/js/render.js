// Canvas rendering: rebuilds the SVG tree from state on every call.

import { state } from "./state.js";
import { canvas, SVG_NS, $ } from "./dom.js";
import { makeShapeElement, combinedBounds } from "./shapes.js";
import { findShape } from "./state.js";
import { renderLayersPanel } from "./layers-panel.js";
import { renderToolpathLayersPanel } from "./toolpath-layers-panel.js";
import { renderStylePanel } from "./style-panel.js";
import { buildToolpathOverlay, buildSimulationOverlay, requestPreview } from "./preview.js";
import { expandLayerWithFill } from "./fill/index.js";
import { expandLayerOutline } from "./outline/index.js";

export function render() {
    while (canvas.firstChild) canvas.removeChild(canvas.firstChild);

    canvas.appendChild(buildGrid());

    // SVG artwork — always rendered so clicks still hit shapes for
    // selection. In SVG mode the shapes are at full opacity; in toolpath
    // / simulation modes they fade to a ghost layer that the overlay
    // sits on top of, but stays pickable.
    const svgOpacity = state.preview.showSvg ? 1 : 0.18;
    for (const layer of state.layers) {
        if (!layer.visible) continue;
        const g = document.createElementNS(SVG_NS, "g");
        g.setAttribute("data-layer-id", layer.id);
        g.setAttribute("stroke", layer.color);
        g.setAttribute("fill", "none");
        g.setAttribute("stroke-width", "0.3");
        g.setAttribute("opacity", svgOpacity);
        for (const shape of svgViewShapes(layer)) {
            const el = makeShapeElement(shape);
            if (state.selectedShapeIds.has(shape.id)) el.classList.add("selected");
            g.appendChild(el);
        }
        canvas.appendChild(g);
    }

    // Server-side toolpath data is used by both toolpath + simulation views.
    const needsPreview = state.preview.showToolpath || state.preview.showSimulation;
    let stats = null;

    if (state.preview.showSimulation) {
        requestPreview();
        canvas.appendChild(buildSimulationOverlay());
    }

    if (state.preview.showToolpath) {
        requestPreview();
        const r = buildToolpathOverlay();
        canvas.appendChild(r.overlay);
        stats = r.stats;
    }

    // Selection overlay — each selected shape rendered again as an
    // unfilled outline in accent blue, drawn last so it's on top of
    // both the SVG view and the toolpath/simulation overlays.
    if (state.selectedShapeIds.size > 0) {
        canvas.appendChild(buildSelectionOverlay());
    }

    // Snap indicator: small marker drawn at the active snap point while
    // dragging a selection.
    const it = state.interaction;
    if (it && it.kind === "drag" && it.snapPoint) {
        canvas.appendChild(buildSnapMarker(it.snapPoint));
    }

    // Rubber-band marquee — drawn while dragging an empty area with Select.
    if (it && it.kind === "marquee") {
        canvas.appendChild(buildMarquee(it));
    }

    updateStatsLine(stats);
    renderLayersPanel();
    renderToolpathLayersPanel();
    renderStylePanel();
}

// SVG view: render shapes exactly as the source SVG would look — solid
// fills, strokes in their original colors. Outline styling (dashed/jagged/
// multi-pass) and fill patterns (hatch/etc.) are plotting-time concerns;
// flip to Toolpath or Simulation to preview those.
function svgViewShapes(layer) {
    return layer.shapes;
}

function updateStatsLine(stats) {
    const el = $("#stats");
    if (!el) return;
    if (!stats) { el.textContent = ""; return; }
    if (stats.error) {
        el.textContent = `preview error: ${stats.error}`;
        el.style.color = "#ff8a92";
        return;
    }
    el.style.color = "";
    if (stats.fetching && stats.strokeCount === 0) {
        el.textContent = "computing toolpath…";
        return;
    }
    const draw = stats.drawDist.toFixed(0);
    const travel = stats.travelDist.toFixed(0);
    const total = (stats.drawDist + stats.travelDist).toFixed(0);
    const prefix = stats.fetching ? "↻ " : "";
    el.textContent = `${prefix}${stats.strokeCount} strokes · draw ${draw} mm · travel ${travel} mm · total ${total} mm`;
}

function buildMarquee(it) {
    const minX = Math.min(it.startX, it.x), maxX = Math.max(it.startX, it.x);
    const minY = Math.min(it.startY, it.y), maxY = Math.max(it.startY, it.y);
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", minX); r.setAttribute("y", minY);
    r.setAttribute("width", maxX - minX); r.setAttribute("height", maxY - minY);
    // CAD convention: blue solid for window (LTR), green dashed for crossing (RTL).
    if (it.mode === "crossing") {
        r.setAttribute("fill", "rgba(58, 138, 62, 0.15)");
        r.setAttribute("stroke", "#3a8a3e");
        r.setAttribute("stroke-dasharray", "4 3");
    } else {
        r.setAttribute("fill", "rgba(17, 119, 187, 0.14)");
        r.setAttribute("stroke", "#1177bb");
    }
    r.setAttribute("stroke-width", "1");
    r.setAttribute("vector-effect", "non-scaling-stroke");
    r.setAttribute("pointer-events", "none");
    return r;
}

function buildSnapMarker([x, y]) {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("data-overlay", "snap");
    g.setAttribute("pointer-events", "none");
    const r = 1.6;
    const c1 = document.createElementNS(SVG_NS, "circle");
    c1.setAttribute("cx", x); c1.setAttribute("cy", y); c1.setAttribute("r", r);
    c1.setAttribute("fill", "none"); c1.setAttribute("stroke", "#ff9500");
    c1.setAttribute("stroke-width", "0.5");
    c1.setAttribute("vector-effect", "non-scaling-stroke");
    g.appendChild(c1);
    const c2 = document.createElementNS(SVG_NS, "circle");
    c2.setAttribute("cx", x); c2.setAttribute("cy", y); c2.setAttribute("r", "0.4");
    c2.setAttribute("fill", "#ff9500");
    g.appendChild(c2);
    return g;
}

function buildSelectionOverlay() {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("data-overlay", "selection");
    g.setAttribute("pointer-events", "none");
    g.setAttribute("fill", "none");
    g.setAttribute("stroke", "#1177bb");
    g.setAttribute("stroke-width", "2");
    g.setAttribute("stroke-linejoin", "round");
    g.setAttribute("stroke-linecap", "round");
    for (const sid of state.selectedShapeIds) {
        const s = findShape(sid);
        if (!s) continue;
        const el = makeShapeElement(s);
        // Strip any per-shape paint overrides so the accent blue stroke wins.
        el.removeAttribute("fill");
        el.removeAttribute("stroke");
        el.setAttribute("vector-effect", "non-scaling-stroke");
        el.classList.remove("shape");
        g.appendChild(el);
    }
    return g;
}

function buildGrid() {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("stroke", "#e8e8e0");
    g.setAttribute("stroke-width", "0.1");
    g.setAttribute("vector-effect", "non-scaling-stroke");
    for (let x = 0; x <= state.doc.w; x += 10) {
        const l = document.createElementNS(SVG_NS, "line");
        l.setAttribute("x1", x); l.setAttribute("y1", 0);
        l.setAttribute("x2", x); l.setAttribute("y2", state.doc.h);
        g.appendChild(l);
    }
    for (let y = 0; y <= state.doc.h; y += 10) {
        const l = document.createElementNS(SVG_NS, "line");
        l.setAttribute("x1", 0); l.setAttribute("y1", y);
        l.setAttribute("x2", state.doc.w); l.setAttribute("y2", y);
        g.appendChild(l);
    }
    return g;
}
