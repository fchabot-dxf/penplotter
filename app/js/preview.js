// Exact toolpath preview. Runs the vpype pipeline (linemerge / linesort
// / linesimplify) entirely in the browser via app/js/vpype/, producing
// the same polylines the plotter will draw. No backend required.

import { state } from "./state.js";
import { SVG_NS, toast } from "./dom.js";
import { toolpathColor } from "./state.js";
import { toolpathToPolylines } from "./vpype/index.js";
import { expandLayerWithFill } from "./fill/index.js";
import { expandLayerOutline } from "./outline/index.js";

const DEBOUNCE_MS = 350;

// ---- cache state (also stored on `state.preview` for visibility) ----
state.preview.cache = state.preview.cache || {
    polylineLayers: [],       // [{ id, name, strokes: [[[x,y],...]] }]
    sourceHash: null,         // hash of the input that produced the cache
    fetching: false,
    error: null,
};

let debounceTimer = null;

/** Hash of all inputs that affect the optimized polylines. */
function sourceHash() {
    return JSON.stringify({
        tol: state.settings.tolerance_mm,
        artLayers: state.artLayers.map(al => ({
            v: al.visible, n: al.name, c: al.color,
            s: al.shapes.map(sh => [
                sh.type,
                ...Object.entries(sh)
                    .filter(([k]) => k !== "id" && k !== "type" && !k.startsWith("_"))
                    .map(([_, v]) => Array.isArray(v) ? v.flat() : v),
            ]),
        })),
        toolpaths: state.toolpaths.map(tp => ({
            n: tp.name, e: tp.export, t: tp.type, tt: tp.targetType,
            al: tp.targetArtLayerId, sids: tp.targetShapeIds,
            pw: tp.penWidth, do: tp.drawOutline,
            fill: tp.fill, outline: tp.outline,
        })),
        selectedShapeIds: [...state.selectedShapeIds].sort(),
    });
}

/** Ensure the preview cache is up-to-date with current state. Debounced. */
export function requestPreview() {
    const wantHash = sourceHash();
    const cache = state.preview.cache;
    if (cache.sourceHash === wantHash && !cache.error) return; // already current
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchPreview(wantHash), DEBOUNCE_MS);
}

async function fetchPreview(hashAtRequestTime) {
    const cache = state.preview.cache;
    cache.fetching = true;
    cache.error = null;
    notifyRenderer();

    try {
        // Resolve each exportable toolpath into a set of optimized polylines
        // using the in-browser vpype pipeline. The output shape matches what
        // the old /api/preview endpoint returned: one entry per toolpath,
        // each with a name + an array of strokes (point arrays).
        const layers = [];
        const opts = {
            mergeTol: 0.05,
            simplifyTol: state.settings.tolerance_mm || 0.1,
        };
        for (const tp of state.toolpaths) {
            if (!tp.visible || tp.export === false) continue;
            const targetShapes = resolveToolpathShapes(tp);
            if (!targetShapes.length) continue;
            // A fill toolpath plots HATCH LINES inside each shape, not
            // its outline. An outline toolpath plots the outline (with
            // optional dash/jagged styling and pass repetition). Expand
            // accordingly — same as the export pipeline does — before
            // running the vpype optimizer.
            const finalShapes = expandToolpathShapes(tp, targetShapes);
            if (!finalShapes.length) continue;
            const strokes = toolpathToPolylines(finalShapes, opts);
            if (!strokes.length) continue;
            // hitShapes = the geometry users click to select this
            // toolpath in the preview. For fills, that's the original
            // shape AREA (so you don't have to hit a thin hatch line);
            // for outlines, null and we fall back to thick invisible
            // strokes over the polylines.
            layers.push({
                id: tp.id, name: tp.name, type: tp.type, strokes,
                hitShapes: tp.type === "fill" ? targetShapes : null,
            });
        }
        cache.polylineLayers = layers;
        cache.sourceHash = hashAtRequestTime;
    } catch (e) {
        cache.error = e.message;
        toast("Preview: " + e.message, true);
    } finally {
        cache.fetching = false;
        notifyRenderer();
    }
}

/** Apply outline/fill expansion to a toolpath's target shapes — same
 *  logic the G-code export uses, so preview and plot match exactly. */
function expandToolpathShapes(tp, targetShapes) {
    if (tp.type === "fill") {
        // Hatch the inside; ignore the outline.
        const filled = expandLayerWithFill({ ...tp, shapes: targetShapes });
        return filled.slice(targetShapes.length);
    }
    // Outline: trace the shape's contour, possibly dashed / jagged / multi-pass.
    if (tp.drawOutline === false) return [];
    return expandLayerOutline(targetShapes, tp.outline);
}

/** Resolve a toolpath's `targetShapeIds` (or `targetArtLayerId`) into
 *  the underlying shape objects from state.artLayers. */
export function resolveToolpathShapes(tp) {
    if (tp.targetShapeIds && tp.targetShapeIds.length) {
        const ids = new Set(tp.targetShapeIds);
        const out = [];
        for (const al of state.artLayers) {
            for (const s of al.shapes) if (ids.has(s.id)) out.push(s);
        }
        return out;
    }
    if (tp.targetArtLayerId) {
        const al = state.artLayers.find(l => l.id === tp.targetArtLayerId);
        return al ? al.shapes.slice() : [];
    }
    return [];
}

// Late-resolved import to avoid a circular eval.
let _render = null;
async function notifyRenderer() {
    if (!_render) _render = (await import("./render.js")).render;
    _render();
}

/** Build the toolpath overlay <g> from the cached preview data. */
export function buildToolpathOverlay() {
    const overlay = document.createElementNS(SVG_NS, "g");
    overlay.setAttribute("data-overlay", "toolpath");
    overlay.setAttribute("fill", "none");

    const cache = state.preview.cache;
    let stats = { strokeCount: 0, drawDist: 0, travelDist: 0,
                  fetching: cache.fetching, error: cache.error };

    let lastPoint = null;
    for (const layer of cache.polylineLayers) {
        const tp = findToolpath(layer);
        if (tp && !tp.visible) continue;
        const color = toolpathColor(tp);
        // "Active" highlight applies to anything in the multi-selection
        // (so box-selected toolpaths all light up together) as well as
        // the single click-active toolpath.
        const isActive = tp && (
            tp.id === state.activeToolpathId ||
            state.selectedToolpathIds.has(tp.id)
        );

        const layerG = document.createElementNS(SVG_NS, "g");
        layerG.setAttribute("stroke", color);
        layerG.classList.add("tp-group");
        if (isActive) layerG.classList.add("tp-active");
        // data-toolpath-id lets interaction.js pick up clicks on any
        // descendant polyline/dot/hit-zone and resolve back to the toolpath.
        if (tp) layerG.setAttribute("data-toolpath-id", tp.id);

        // Hit zone — invisible, but pickable. For fill toolpaths it's
        // the original shape interior (so users click the AREA, not a
        // thin hatch line that's easy to miss and easy to confuse with
        // a stroke toolpath). For outlines it's a wide transparent
        // twin of each polyline.
        const hitG = document.createElementNS(SVG_NS, "g");
        hitG.classList.add("tp-hit");
        if (layer.type === "fill" && layer.hitShapes) {
            for (const sh of layer.hitShapes) {
                const el = makeHitShapeElement(sh);
                if (el) hitG.appendChild(el);
            }
        } else {
            for (const stroke of layer.strokes) {
                if (stroke.length < 2) continue;
                const hp = document.createElementNS(SVG_NS, "polyline");
                hp.setAttribute("points", stroke.map(p => `${p[0]},${p[1]}`).join(" "));
                hp.setAttribute("fill", "none");
                hp.setAttribute("stroke", "transparent");
                hp.setAttribute("stroke-width", "3");
                hp.setAttribute("vector-effect", "non-scaling-stroke");
                hp.style.pointerEvents = "stroke";
                hp.style.cursor = "pointer";
                hitG.appendChild(hp);
            }
        }
        layerG.appendChild(hitG);

        // Selection halo for active/selected toolpaths — translucent
        // blue, thick, drawn UNDER the actual plot lines so the user
        // sees the toolpath's plot color unmodified. Rendered as a
        // sub-group beneath .tp-visible (appended first).
        if (isActive) {
            const haloG = document.createElementNS(SVG_NS, "g");
            haloG.classList.add("tp-halo");
            haloG.setAttribute("fill", "none");
            haloG.setAttribute("stroke", "rgba(17, 119, 187, 0.55)");
            haloG.setAttribute("stroke-width", "3");
            haloG.setAttribute("stroke-linecap", "round");
            haloG.setAttribute("stroke-linejoin", "round");
            haloG.setAttribute("vector-effect", "non-scaling-stroke");
            haloG.setAttribute("pointer-events", "none");
            for (const stroke of layer.strokes) {
                if (stroke.length < 2) continue;
                const hp = document.createElementNS(SVG_NS, "polyline");
                hp.setAttribute("points", stroke.map(p => `${p[0]},${p[1]}`).join(" "));
                haloG.appendChild(hp);
            }
            layerG.appendChild(haloG);
        }

        // Visible geometry — rendered on top of the halo + hit zone so
        // the user sees the actual strokes in their plot color.
        const visibleG = document.createElementNS(SVG_NS, "g");
        visibleG.classList.add("tp-visible");

        for (const stroke of layer.strokes) {
            if (stroke.length < 2) continue;

            if (lastPoint) {
                const [tx, ty] = lastPoint;
                const [sx, sy] = stroke[0];
                const travel = document.createElementNS(SVG_NS, "line");
                travel.setAttribute("x1", tx); travel.setAttribute("y1", ty);
                travel.setAttribute("x2", sx); travel.setAttribute("y2", sy);
                travel.setAttribute("stroke", "#888");
                travel.setAttribute("stroke-width", "0.2");
                travel.setAttribute("stroke-dasharray", "1.5 1.5");
                travel.setAttribute("vector-effect", "non-scaling-stroke");
                travel.setAttribute("pointer-events", "none");
                overlay.appendChild(travel);
                stats.travelDist += Math.hypot(sx - tx, sy - ty);
            }

            const poly = document.createElementNS(SVG_NS, "polyline");
            poly.setAttribute("points", stroke.map(p => `${p[0]},${p[1]}`).join(" "));
            // Constant diagnostic width regardless of selection — the
            // blue halo behind communicates selection without altering
            // the plot color or thickness.
            poly.setAttribute("stroke-width", "0.6");
            poly.setAttribute("vector-effect", "non-scaling-stroke");
            poly.setAttribute("opacity", "0.95");
            poly.setAttribute("pointer-events", "none");
            visibleG.appendChild(poly);

            const dot = document.createElementNS(SVG_NS, "circle");
            dot.setAttribute("cx", stroke[0][0]);
            dot.setAttribute("cy", stroke[0][1]);
            dot.setAttribute("r", "0.6");
            dot.setAttribute("fill", color);
            dot.setAttribute("stroke", "none");
            dot.setAttribute("pointer-events", "none");
            visibleG.appendChild(dot);

            stats.drawDist += strokeLength(stroke);
            stats.strokeCount++;
            lastPoint = stroke[stroke.length - 1];
        }

        layerG.appendChild(visibleG);
        overlay.appendChild(layerG);
    }

    return { overlay, stats };
}

// Polyline layers now come from our own pipeline carrying the toolpath
// id directly, so resolution is exact — no name-sanitization hop needed.
function findToolpath(layerOrId) {
    const id = typeof layerOrId === "string" ? layerOrId : layerOrId?.id;
    if (!id) return null;
    return state.toolpaths.find(tp => tp.id === id) || null;
}

function strokeLength(stroke) {
    let d = 0;
    for (let i = 1; i < stroke.length; i++) {
        d += Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]);
    }
    return d;
}

/** "Simulation" overlay — simulated pen widths with round caps. */
export function buildSimulationOverlay() {
    const overlay = document.createElementNS(SVG_NS, "g");
    overlay.setAttribute("data-overlay", "simulation");
    overlay.setAttribute("fill", "none");

    const cache = state.preview.cache;
    for (const layer of cache.polylineLayers) {
        const tp = findToolpath(layer);
        if (tp && !tp.visible) continue;
        // Simulation = same plot color as Toolpath mode, but rendered at
        // the toolpath's pen width with round caps so it looks like ink
        // on paper.
        const color = toolpathColor(tp);
        const penWidth = tp ? tp.penWidth : 0.5;
        // "Active" highlight applies to anything in the multi-selection
        // (so box-selected toolpaths all light up together) as well as
        // the single click-active toolpath.
        const isActive = tp && (
            tp.id === state.activeToolpathId ||
            state.selectedToolpathIds.has(tp.id)
        );

        const layerG = document.createElementNS(SVG_NS, "g");
        layerG.classList.add("tp-group");
        if (isActive) layerG.classList.add("tp-active");
        if (tp) layerG.setAttribute("data-toolpath-id", tp.id);

        // Hit zone — same logic as the toolpath overlay: fills click on
        // their area, outlines on a thickened invisible twin.
        const hitG = document.createElementNS(SVG_NS, "g");
        hitG.classList.add("tp-hit");
        if (layer.type === "fill" && layer.hitShapes) {
            for (const sh of layer.hitShapes) {
                const el = makeHitShapeElement(sh);
                if (el) hitG.appendChild(el);
            }
        } else {
            for (const stroke of layer.strokes) {
                if (stroke.length < 2) continue;
                const hp = document.createElementNS(SVG_NS, "polyline");
                hp.setAttribute("points", stroke.map(p => `${p[0]},${p[1]}`).join(" "));
                hp.setAttribute("fill", "none");
                hp.setAttribute("stroke", "transparent");
                hp.setAttribute("stroke-width", Math.max(3, penWidth + 1));
                hp.setAttribute("vector-effect", "non-scaling-stroke");
                hp.style.pointerEvents = "stroke";
                hp.style.cursor = "pointer";
                hitG.appendChild(hp);
            }
        }
        layerG.appendChild(hitG);

        // Halo for selected/active toolpaths — translucent blue, sized
        // a bit thicker than the pen width so it peeks out around the
        // ink stroke. Drawn beneath the visible group.
        if (isActive) {
            const haloG = document.createElementNS(SVG_NS, "g");
            haloG.classList.add("tp-halo");
            haloG.setAttribute("fill", "none");
            haloG.setAttribute("stroke", "rgba(17, 119, 187, 0.55)");
            haloG.setAttribute("stroke-width", Math.max(0.8, penWidth + 0.8));
            haloG.setAttribute("stroke-linecap", "round");
            haloG.setAttribute("stroke-linejoin", "round");
            haloG.setAttribute("pointer-events", "none");
            for (const stroke of layer.strokes) {
                if (stroke.length < 2) continue;
                const hp = document.createElementNS(SVG_NS, "polyline");
                hp.setAttribute("points", stroke.map(pt => `${pt[0]},${pt[1]}`).join(" "));
                haloG.appendChild(hp);
            }
            layerG.appendChild(haloG);
        }

        // Visible "ink" strokes — full opacity always; the halo behind
        // communicates selection without dimming the ink.
        const visibleG = document.createElementNS(SVG_NS, "g");
        visibleG.classList.add("tp-visible");
        visibleG.setAttribute("stroke", color);
        visibleG.setAttribute("stroke-width", penWidth);
        visibleG.setAttribute("stroke-linecap", "round");
        visibleG.setAttribute("stroke-linejoin", "round");
        for (const stroke of layer.strokes) {
            if (stroke.length < 2) continue;
            const p = document.createElementNS(SVG_NS, "polyline");
            p.setAttribute("points", stroke.map(pt => `${pt[0]},${pt[1]}`).join(" "));
            p.setAttribute("pointer-events", "none");
            visibleG.appendChild(p);
        }
        layerG.appendChild(visibleG);

        overlay.appendChild(layerG);
    }
    return overlay;
}

/** Build an invisible "hit" SVG element for a shape — used so clicks
 *  on a fill toolpath's area resolve to that toolpath. */
function makeHitShapeElement(shape) {
    let el;
    switch (shape.type) {
        case "line":
            el = document.createElementNS(SVG_NS, "line");
            el.setAttribute("x1", shape.x1); el.setAttribute("y1", shape.y1);
            el.setAttribute("x2", shape.x2); el.setAttribute("y2", shape.y2);
            // A line has no interior — fall back to stroke hit testing.
            el.setAttribute("stroke", "transparent");
            el.setAttribute("stroke-width", "3");
            el.setAttribute("fill", "none");
            el.setAttribute("vector-effect", "non-scaling-stroke");
            el.style.pointerEvents = "stroke";
            el.style.cursor = "pointer";
            return el;
        case "rect":
            el = document.createElementNS(SVG_NS, "rect");
            el.setAttribute("x", shape.x); el.setAttribute("y", shape.y);
            el.setAttribute("width", shape.w); el.setAttribute("height", shape.h);
            break;
        case "ellipse":
            el = document.createElementNS(SVG_NS, "ellipse");
            el.setAttribute("cx", shape.cx); el.setAttribute("cy", shape.cy);
            el.setAttribute("rx", shape.rx); el.setAttribute("ry", shape.ry);
            break;
        case "polyline":
            el = document.createElementNS(SVG_NS, "polyline");
            el.setAttribute("points", shape.points.map(p => `${p[0]},${p[1]}`).join(" "));
            break;
        case "path":
            el = document.createElementNS(SVG_NS, "path");
            el.setAttribute("d", shape.d);
            break;
        default:
            return null;
    }
    el.setAttribute("fill", "transparent");
    el.setAttribute("stroke", "none");
    el.style.pointerEvents = "fill";
    el.style.cursor = "pointer";
    return el;
}
