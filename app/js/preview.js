// Exact toolpath preview. Calls /api/preview, which runs the same vpype
// pipeline as /api/plot (linemerge / linesort / linesimplify) and returns
// the actual stroke polylines. Renders them as an overlay with travel
// (pen-up) moves dashed between strokes — exactly what the plotter draws.

import { state } from "./state.js";
import { SVG_NS, toast, api } from "./dom.js";
import { buildExportSvg } from "./export.js";

const DEBOUNCE_MS = 350;

// ---- cache state (also stored on `state.preview` for visibility) ----
state.preview.cache = state.preview.cache || {
    polylineLayers: [],       // [{ id, name, strokes: [[[x,y],...]] }]
    sourceHash: null,         // hash of the input that produced the cache
    fetching: false,
    error: null,
};

let debounceTimer = null;

/** Hash of all inputs that affect the optimized polylines. Includes
 *  shapes, fill, outline, drawOutline, export flag, and the linesimplify
 *  tolerance — anything that changes the toolpath invalidates the cache. */
function sourceHash() {
    return JSON.stringify({
        tol: state.settings.tolerance_mm,
        layers: state.layers.map(l => ({
            v: l.visible, e: l.export, n: l.name,
            fill: l.fill, outline: l.outline, drawOutline: l.drawOutline,
            s: l.shapes.map(sh => [
                sh.type,
                ...Object.entries(sh)
                    .filter(([k]) => k !== "id" && k !== "type")
                    .map(([_, v]) => Array.isArray(v) ? v.flat() : v),
            ]),
        })),
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
    // Trigger a stats-line update while we wait.
    notifyRenderer();

    try {
        const svg = buildExportSvg();
        if (!svg.includes("<g")) {
            // No visible content — empty preview.
            cache.polylineLayers = [];
            cache.sourceHash = hashAtRequestTime;
            return;
        }
        const res = await fetch(api("/api/preview"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ svg, settings: state.settings }),
        });
        if (!res.ok) {
            let msg = `Preview failed (${res.status})`;
            try { const j = await res.json(); msg = j.error || msg; } catch {}
            throw new Error(msg);
        }
        const data = await res.json();
        cache.polylineLayers = data.layers || [];
        cache.sourceHash = hashAtRequestTime;
    } catch (e) {
        cache.error = e.message;
        toast("Preview: " + e.message, true);
    } finally {
        cache.fetching = false;
        notifyRenderer();
    }
}

// Late-resolved import to avoid a circular eval (preview ↔ render).
let _render = null;
async function notifyRenderer() {
    if (!_render) _render = (await import("./render.js")).render;
    _render();
}

/** Build the toolpath overlay <g> from the cached preview data.
 *  Also returns simple stats (stroke count + draw/travel distance). */
export function buildToolpathOverlay() {
    const overlay = document.createElementNS(SVG_NS, "g");
    overlay.setAttribute("data-overlay", "toolpath");
    overlay.setAttribute("fill", "none");

    const cache = state.preview.cache;
    let stats = { strokeCount: 0, drawDist: 0, travelDist: 0,
                  fetching: cache.fetching, error: cache.error };

    let lastPoint = null;
    for (const layer of cache.polylineLayers) {
        const appLayer = findAppLayer(layer.name);
        if (appLayer && !appLayer.visible) continue;
        // Toolpath uses scheme colors so it reads as a "diagnostic" view
        // independent of the artwork's own colors. Outline passes (the
        // strokes the pen traces) get one color; fill passes (hatch
        // lines) get another. Switch to Simulation to see the real
        // layer colors as plotted.
        const isFill = appLayer && appLayer.drawOutline === false;
        const color = isFill ? "#ff8a3d" : "#3aa3ff";

        const layerG = document.createElementNS(SVG_NS, "g");
        layerG.setAttribute("stroke", color);

        for (const stroke of layer.strokes) {
            if (stroke.length < 2) continue;

            // Travel from previous endpoint to this stroke's start.
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
                overlay.appendChild(travel);
                stats.travelDist += Math.hypot(sx - tx, sy - ty);
            }

            const poly = document.createElementNS(SVG_NS, "polyline");
            poly.setAttribute("points", stroke.map(p => `${p[0]},${p[1]}`).join(" "));
            poly.setAttribute("stroke-width", "0.6");
            poly.setAttribute("vector-effect", "non-scaling-stroke");
            poly.setAttribute("opacity", "0.95");
            layerG.appendChild(poly);

            // Start-of-stroke dot.
            const dot = document.createElementNS(SVG_NS, "circle");
            dot.setAttribute("cx", stroke[0][0]);
            dot.setAttribute("cy", stroke[0][1]);
            dot.setAttribute("r", "0.6");
            dot.setAttribute("fill", color);
            dot.setAttribute("stroke", "none");
            layerG.appendChild(dot);

            stats.drawDist += strokeLength(stroke);
            stats.strokeCount++;
            lastPoint = stroke[stroke.length - 1];
        }

        overlay.appendChild(layerG);
    }

    return { overlay, stats };
}

// vpype echoes back the sanitized inkscape:label from our export SVG (see
// buildExportSvg → safeName). To match the polyline layer back to the
// in-app layer, sanitize the candidate name the same way before comparing.
function sanitize(name) {
    return String(name).replace(/[^a-z0-9_-]/gi, "_");
}
function findAppLayer(sanitizedName) {
    for (const l of state.layers) {
        if (sanitize(l.name) === sanitizedName) return l;
    }
    return null;
}

function strokeLength(stroke) {
    let d = 0;
    for (let i = 1; i < stroke.length; i++) {
        d += Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]);
    }
    return d;
}

/** "Simulation" overlay — the optimized polylines rendered at each layer's
 *  pen width with round caps. Approximates what the plotted page looks like.
 *  No travel lines (pen-up = no ink). */
export function buildSimulationOverlay() {
    const overlay = document.createElementNS(SVG_NS, "g");
    overlay.setAttribute("data-overlay", "simulation");
    overlay.setAttribute("fill", "none");

    const cache = state.preview.cache;
    for (const layer of cache.polylineLayers) {
        const appLayer = findAppLayer(layer.name);
        if (appLayer && !appLayer.visible) continue;
        const color = appLayer ? appLayer.color : "#111";
        const penWidth = appLayer ? appLayer.penWidth : 0.5;

        const g = document.createElementNS(SVG_NS, "g");
        g.setAttribute("stroke", color);
        g.setAttribute("stroke-width", penWidth);
        g.setAttribute("stroke-linecap", "round");
        g.setAttribute("stroke-linejoin", "round");
        g.setAttribute("opacity", "0.9");
        for (const stroke of layer.strokes) {
            if (stroke.length < 2) continue;
            const p = document.createElementNS(SVG_NS, "polyline");
            p.setAttribute("points", stroke.map(pt => `${pt[0]},${pt[1]}`).join(" "));
            g.appendChild(p);
        }
        overlay.appendChild(g);
    }
    return overlay;
}
