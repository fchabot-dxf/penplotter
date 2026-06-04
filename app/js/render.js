// Canvas rendering: rebuilds the SVG tree from state on every call.

import { state } from "./state.js";
import { canvas, SVG_NS, $ } from "./dom.js";
import { makeShapeElement, combinedBounds, getNodes } from "./shapes.js";
import { findShape } from "./state.js";
import { renderLayersPanel } from "./layers-panel.js";
import { renderToolpathLayersPanel } from "./toolpath-layers-panel.js";
import { renderStylePanel } from "./style-panel.js";
import { renderPlotColorsPanel } from "./plot-colors-panel.js";
import { renderActiveLayerPanel } from "./active-layer-panel.js";
import { buildToolpathOverlay, buildSimulationOverlay, requestPreview } from "./preview.js";
import { expandLayerWithFill } from "./fill/index.js";
import { expandLayerOutline } from "./outline/index.js";

export function render() {
    while (canvas.firstChild) canvas.removeChild(canvas.firstChild);

    canvas.appendChild(buildPaper());
    canvas.appendChild(buildGrid());

    // SVG artwork — always rendered so clicks still hit shapes for
    // selection. In SVG mode the shapes are at full opacity; in toolpath
    // / simulation modes they fade to a ghost layer that the overlay
    // sits on top of, but stays pickable.
    // Artwork stays full opacity normally; in simulation view it fades to a
    // ghost so the pen-width strokes read clearly on top (still pickable).
    const svgOpacity = state.preview.simulatePens ? 0.18 : 1;
    for (const layer of state.artLayers) {
        if (!layer.visible) continue;
        const g = document.createElementNS(SVG_NS, "g");
        g.setAttribute("data-layer-id", layer.id);
        g.setAttribute("stroke", layer.color);
        g.setAttribute("fill", "none");
        g.setAttribute("stroke-width", "0.3");
        g.setAttribute("opacity", svgOpacity);
        for (const shape of svgViewShapes(layer)) {
            const el = makeShapeElement(shape);
            // Selection halo is rendered as a separate overlay over
            // the artwork — the asset itself stays untouched.
            g.appendChild(el);
        }
        canvas.appendChild(g);
    }

    // SVG selection — translucent black outline on TOP of the artwork
    // (matches the select hover ghost, just thinner).
    if (state.selectedShapeIds.size > 0) {
        canvas.appendChild(buildSelectionOverlay());
    }

    // Node-edit handles — show every node of the selected shape so the
    // user can see and click them.
    if (state.tool === "node" && state.selectedShapeIds.size === 1) {
        const h = buildNodeHandles();
        if (h) canvas.appendChild(h);
    }

    // Toolpath view — single overlay. When simulatePens is on it renders
    // each stroke at its pen width (the old "Simulation" mode); otherwise
    // thin diagnostic lines with travel moves between strokes.
    let stats = null;
    if (state.preview.showToolpath) {
        requestPreview();
        if (state.preview.simulatePens) {
            canvas.appendChild(buildSimulationOverlay());
        } else {
            const r = buildToolpathOverlay();
            canvas.appendChild(r.overlay);
            stats = r.stats;
        }
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
    updateTargetEditingBanner();
    renderLayersPanel();
    renderToolpathLayersPanel();
    renderStylePanel();
    renderActiveLayerPanel();
    renderPlotColorsPanel();
}

/** Floating banner above the canvas while the user is target-editing a
 *  toolpath — gives them a clear "you're in this mode" cue with an Esc
 *  hint. Lazily created and reused; removed when mode exits. */
function updateTargetEditingBanner() {
    let el = document.getElementById("targetEditBanner");
    const id = state.targetEditingToolpathId;
    if (!id) { if (el) el.remove(); return; }
    const tp = state.toolpaths.find(t => t.id === id);
    if (!tp) return;
    if (!el) {
        el = document.createElement("div");
        el.id = "targetEditBanner";
        el.className = "target-edit-banner";
        const wrap = document.getElementById("canvasWrap");
        if (wrap) wrap.appendChild(el);
    }
    el.textContent = `Editing target for "${tp.name}" — click shapes · Esc to finish`;
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

/** Dots at every node of the single selected shape, for the node-edit
 *  tool. Radius is in user units scaled to stay ~constant on screen. */
function buildNodeHandles() {
    const sid = [...state.selectedShapeIds][0];
    const shape = findShape(sid);
    if (!shape) return null;
    const nodes = getNodes(shape);
    if (!nodes) return null;
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("pointer-events", "none");
    const r = 4 / Math.max(0.001, state.viewport.scale);
    const active = state.activeNode && state.activeNode.shapeId === sid ? state.activeNode.index : -1;
    nodes.pts.forEach(([x, y], i) => {
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", x); c.setAttribute("cy", y);
        c.setAttribute("r", i === active ? r * 1.4 : r);
        c.setAttribute("class", i === active ? "node-handle active" : "node-handle");
        g.appendChild(c);
    });
    return g;
}

function buildSelectionOverlay() {
    // Matches the select hover ghost: a translucent BLACK outline (no fill)
    // on top of the artwork, thinner than the thicker hover stroke. Constant
    // visual thickness via non-scaling-stroke.
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("data-overlay", "selection");
    g.setAttribute("pointer-events", "none");
    g.setAttribute("fill", "none");
    g.setAttribute("stroke", "#111111");
    g.setAttribute("stroke-opacity", "0.65");
    g.setAttribute("stroke-width", "2");
    g.setAttribute("stroke-linejoin", "round");
    g.setAttribute("stroke-linecap", "round");
    for (const sid of state.selectedShapeIds) {
        const s = findShape(sid);
        if (!s) continue;
        const el = makeShapeElement(s);
        el.removeAttribute("fill"); el.style.fill = "none";
        el.removeAttribute("stroke");
        el.setAttribute("vector-effect", "non-scaling-stroke");
        el.classList.remove("shape");
        g.appendChild(el);
    }
    return g;
}

function buildPaper() {
    // The doc paper rectangle is drawn in user-space so it scrolls and
    // zooms with the viewBox — no CSS background needed.
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", 0); r.setAttribute("y", 0);
    r.setAttribute("width", state.doc.w);
    r.setAttribute("height", state.doc.h);
    // CSS vars don't resolve inside an SVG presentation attribute —
    // set the fill via style so the --canvas-bg theme variable works.
    r.style.fill = "var(--canvas-bg)";
    r.setAttribute("stroke", "#3e3e42");
    r.setAttribute("stroke-width", "1");
    r.setAttribute("vector-effect", "non-scaling-stroke");
    r.setAttribute("pointer-events", "none");
    return r;
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
