// Mouse handlers on the canvas. Dispatches by current tool.
// All shape geometry changes happen here; commits push onto the active layer.

import { state, uid, activeArtLayer, findShape } from "./state.js";
import { canvas, coordsEl, SVG_NS, toast } from "./dom.js";
import { screenToSvg, applyViewport } from "./viewport.js";
import { translateShape, rotateShape, scaleShape, shapeCenter, deepCopyShape, combinedBounds, shapeBounds, getNodes, setNodes } from "./shapes.js";
import { gatherSnapCandidates, shapeVertices, findSnapDelta } from "./snapping.js";
import { resolveToolpathShapes } from "./preview.js";
import { syncTargetEditingSelection } from "./toolpath-layers-panel.js";
import { closedPolygonFor } from "./fill/utils.js";
import { crossingParams, trimSpanAt, removedSpanAt } from "./trim.js";

// Snap threshold is in SCREEN pixels — converted to mm per drag frame
// using the current viewport scale. That way a snap engages at a constant
// visual distance regardless of zoom level: looser when zoomed out, tight
// when zoomed in so you can place vertices precisely.
const SNAP_THRESHOLD_PX = 10;
import { render } from "./render.js";
import { showPreview, removePreview, cancelInteraction } from "./tools.js";
import { snapshot } from "./history.js";

function isSvgMode() {
    return state.preview.showSvg;
}

export function installCanvasHandlers() {
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("dblclick", onDblClick);
}

function onDown(e) {
    // Middle mouse or space-drag → pan
    if (e.button === 1 || (state.spaceDown && e.button === 0)) {
        state.interaction = {
            kind: "pan",
            startX: e.clientX, startY: e.clientY,
            originPanX: state.viewport.panX, originPanY: state.viewport.panY,
        };
        canvas.classList.add("panning");
        e.preventDefault();
        return;
    }
    if (e.button !== 0) return;

    const p = screenToSvg(e.clientX, e.clientY);

    // Toolpath / simulation mode: even when SVG view is off, the Select
    // tool still needs to work — it picks a toolpath from the overlay
    // via data-toolpath-id. Run startSelect, which has the showToolpath
    // branch built in.
    if (state.preview.showToolpath && state.tool === "select") {
        return startSelect(e, p);
    }

    if (!isSvgMode()) {
        // Other tools (draw, rotate, scale) are SVG-mode only — the
        // canvas is preview-only in pure toolpath/simulation views.
        return;
    }

    if (state.tool === "select") return startSelect(e, p);
    if (state.tool === "rotate") return startRotate(e, p);
    if (state.tool === "scale")  return startScale(e, p);
    if (state.tool === "scissors") return doScissors(e, p);
    if (state.tool === "node") return doNodeEdit(e, p);

    const layer = activeArtLayer();
    if (!layer) return;

    if (state.tool === "polyline") return startOrExtendPolyline(p);
    if (state.tool === "freehand") return startFreehand(p);
    return startDraw(p);
}

function onMove(e) {
    const p = screenToSvg(e.clientX, e.clientY);
    coordsEl.textContent = `${p.x.toFixed(2)}, ${p.y.toFixed(2)} mm`;

    // Scissors: highlight the span that a click would snip, as you hover.
    if (state.tool === "scissors" && !state.interaction && isSvgMode()) {
        updateTrimHover(e, p);
        return;
    }
    // Node edit: highlight the node a click would delete.
    if (state.tool === "node" && !state.interaction && isSvgMode()) {
        updateNodeHover(e, p);
        return;
    }

    const it = state.interaction;
    if (!it) return;

    if (it.kind === "pan") {
        // panX/panY are the viewBox top-left in user-space (mm) since
        // we switched to viewBox-based zoom. To follow the cursor we
        // subtract the cursor screen delta converted to user-space:
        // dragging right reveals more of the doc on the left, which
        // means the viewBox slides left.
        const dxMm = (e.clientX - it.startX) / state.viewport.scale;
        const dyMm = (e.clientY - it.startY) / state.viewport.scale;
        state.viewport.panX = it.originPanX - dxMm;
        state.viewport.panY = it.originPanY - dyMm;
        applyViewport();
        return;
    }
    if (it.kind === "drag") {
        // Absolute delta from drag start. Reset shapes to originals, then
        // apply the delta. This lets us compute snapping against the
        // current absolute position rather than accumulating drift.
        let dx = p.x - it.startX, dy = p.y - it.startY;
        for (let i = 0; i < it.shapes.length; i++) {
            Object.assign(it.shapes[i], deepCopyShape(it.originals[i]));
            translateShape(it.shapes[i], dx, dy);
        }
        // Snap: collect all moving vertices in their current positions,
        // see if any land near a candidate, nudge the whole translation.
        const movingVerts = it.shapes.flatMap(shapeVertices);
        const thresholdMm = SNAP_THRESHOLD_PX / Math.max(0.001, state.viewport.scale);
        const snap = findSnapDelta(movingVerts, it.snapCandidates, thresholdMm);
        if (snap) {
            for (const s of it.shapes) translateShape(s, snap.dx, snap.dy);
            it.snapPoint = snap.snapPoint;
        } else {
            it.snapPoint = null;
        }
        render();
        return;
    }
    if (it.kind === "draw") {
        it.x = p.x; it.y = p.y;
        showPreview(buildDrawPreviewEl(it));
        return;
    }
    if (it.kind === "marquee") {
        it.x = p.x; it.y = p.y;
        updateMarquee(it);
        render();
        return;
    }
    if (it.kind === "rotate") {
        if (it.released) return; // post-mouseup edits go through the HUD
        const delta = Math.atan2(p.y - it.center[1], p.x - it.center[0]) - it.startAngle;
        it.value = delta * 180 / Math.PI;
        applyRotate(it);
        updateHud(it);
        return;
    }
    if (it.kind === "scale") {
        if (it.released) return;
        const d = Math.hypot(p.x - it.center[0], p.y - it.center[1]);
        it.value = Math.max(0.05, d / it.startDist);
        applyScale(it);
        updateHud(it);
        return;
    }
    if (it.kind === "polyline") {
        it.points[it.points.length - 1] = [p.x, p.y];
        showPreview(buildPolylinePreviewEl(it));
        return;
    }
    if (it.kind === "freehand") {
        const last = it.points[it.points.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) > 0.3) {
            it.points.push([p.x, p.y]);
            showPreview(buildFreehandPreviewEl(it));
        }
    }
}

function onUp() {
    const it = state.interaction;
    if (!it) return;
    if (it.kind === "pan")      { canvas.classList.remove("panning"); state.interaction = null; return; }
    if (it.kind === "drag")     { state.interaction = null; return; }
    if (it.kind === "draw")     { commitDraw(); return; }
    if (it.kind === "freehand") { commitFreehand(); return; }
    if (it.kind === "rotate" || it.kind === "scale") {
        // Don't clear yet — leave the HUD up so the user can fine-tune
        // the value by typing, then commit with OK or revert with Cancel.
        it.released = true;
        return;
    }
    if (it.kind === "marquee") {
        // No drag = plain click on empty space → clear selection (unless
        // shift was held, which would keep the prior selection).
        // In toolpath mode we also clear the shape selection so the
        // user can wipe a stale shape-pick made before switching modes
        // (otherwise + Outline / + Fill would silently use it).
        const moved = (it.x !== it.startX) || (it.y !== it.startY);
        if (!moved && !it.additive) {
            if (it.scope === "toolpath") {
                state.selectedToolpathIds = new Set();
                state.activeToolpathId = null;
                state.selectedShapeIds = new Set();
            } else {
                state.selectedShapeIds = new Set();
            }
        }
        // Marquee changes drove selectedShapeIds — push that into the
        // toolpath being target-edited, if any.
        if (it.scope !== "toolpath") syncTargetEditingSelection();
        state.interaction = null;
        render();
        if (it.scope === "toolpath") {
            import("./active-layer-panel.js").then(m => m.renderActiveLayerPanel());
        }
        return;
    }
    // polyline waits for Enter / dblclick
}

function onDblClick() {
    if (state.interaction && state.interaction.kind === "polyline") commitPolyline();
}

// -------- select --------
function startSelect(e, p) {
    // In toolpath mode, clicking a polyline activates its toolpath
    // instead of selecting an underlying shape. Shift-click toggles
    // multi-selection; empty-area drag starts a box-select that picks
    // every toolpath whose target geometry falls in the box.
    if (state.preview.showToolpath) {
        let n = e.target;
        while (n && n !== canvas) {
            const tpid = n.dataset && n.dataset.toolpathId;
            if (tpid) {
                if (e.shiftKey) {
                    // Toggle: shift-click on already-selected removes,
                    // otherwise adds.
                    if (state.selectedToolpathIds.has(tpid)) {
                        state.selectedToolpathIds.delete(tpid);
                    } else {
                        state.selectedToolpathIds.add(tpid);
                    }
                } else {
                    state.selectedToolpathIds = new Set([tpid]);
                }
                state.activeToolpathId = tpid;
                render();
                import("./active-layer-panel.js").then(m => m.renderActiveLayerPanel());
                return;
            }
            n = n.parentNode;
        }
        // Empty area in toolpath mode → rubber-band marquee that picks
        // toolpaths (not shapes). Shift keeps the current selection.
        state.interaction = {
            kind: "marquee",
            scope: "toolpath",
            startX: p.x, startY: p.y, x: p.x, y: p.y,
            additive: e.shiftKey,
            initialSelection: new Set(state.selectedToolpathIds),
        };
        render();
        return;
    }
    const sid = e.target.dataset && e.target.dataset.shapeId;
    if (sid) {
        // In target-editing mode, clicking a shape toggles its
        // membership in the target rather than starting a drag. Shift
        // toggles individually; plain click toggles too (since the
        // typical action is to build the target up by clicking around).
        if (state.targetEditingToolpathId) {
            if (state.selectedShapeIds.has(sid) && (e.shiftKey || e.ctrlKey || e.metaKey)) {
                state.selectedShapeIds.delete(sid);
            } else {
                if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    if (state.selectedShapeIds.has(sid)) {
                        state.selectedShapeIds.delete(sid);
                    } else {
                        state.selectedShapeIds.add(sid);
                    }
                } else {
                    state.selectedShapeIds.add(sid);
                }
            }
            syncTargetEditingSelection();
            render();
            return;
        }
        if (!e.shiftKey) state.selectedShapeIds.clear();
        state.selectedShapeIds.add(sid);
        snapshot(); // about to move shapes
        const shapeIds = new Set(state.selectedShapeIds);
        const movingShapes = [...shapeIds].map(findShape).filter(Boolean);
        state.interaction = {
            kind: "drag",
            startX: p.x, startY: p.y,
            shapeIds,
            shapes: movingShapes,
            originals: movingShapes.map(deepCopyShape),
            snapCandidates: gatherSnapCandidates(shapeIds),
            snapPoint: null, // mm coords of active snap (for visual indicator)
        };
    } else {
        // Empty-area click → start a rubber-band marquee. Shift keeps
        // existing selection; without shift we'll clear it on mouseup.
        state.interaction = {
            kind: "marquee",
            startX: p.x, startY: p.y, x: p.x, y: p.y,
            additive: e.shiftKey,
            initialSelection: new Set(state.selectedShapeIds),
        };
    }
    render();
}

function updateMarquee(it) {
    const minX = Math.min(it.startX, it.x), maxX = Math.max(it.startX, it.x);
    const minY = Math.min(it.startY, it.y), maxY = Math.max(it.startY, it.y);
    // Standard CAD convention:
    //   left → right  = window  : only shapes fully inside the box
    //   right → left  = crossing: any shape that touches the box
    const isWindow = it.x >= it.startX;
    it.mode = isWindow ? "window" : "crossing";

    // Toolpath-scope marquee — pick toolpaths whose target geometry
    // falls in (window) / touches (crossing) the box. Bounds come from
    // the toolpath's resolved target shapes so the selection matches
    // what the user actually sees in the preview.
    if (it.scope === "toolpath") {
        const next = new Set(it.additive ? it.initialSelection : []);
        for (const tp of state.toolpaths) {
            if (!tp.visible) continue;
            const shapes = resolveToolpathShapes(tp);
            if (!shapes.length) continue;
            const b = combinedBounds(shapes);
            const fullyInside = b.minX >= minX && b.maxX <= maxX
                             && b.minY >= minY && b.maxY <= maxY;
            const touches = !(b.maxX < minX || b.minX > maxX
                           || b.maxY < minY || b.minY > maxY);
            const hit = isWindow ? fullyInside : touches;
            if (hit) next.add(tp.id);
        }
        state.selectedToolpathIds = next;
        // Keep activeToolpathId synced — primary stays valid if still
        // selected; otherwise fall back to the first in the new set.
        if (next.size && !next.has(state.activeToolpathId)) {
            state.activeToolpathId = [...next][0];
        } else if (!next.size) {
            state.activeToolpathId = null;
        }
        return;
    }

    const next = new Set(it.additive ? it.initialSelection : []);
    for (const layer of state.layers) {
        if (!layer.visible) continue;
        for (const s of layer.shapes) {
            const b = shapeBounds(s);
            const fullyInside = b.minX >= minX && b.maxX <= maxX
                             && b.minY >= minY && b.maxY <= maxY;
            const touches = !(b.maxX < minX || b.minX > maxX
                           || b.maxY < minY || b.minY > maxY);
            const hit = isWindow ? fullyInside : touches;
            if (hit) next.add(s.id);
        }
    }
    state.selectedShapeIds = next;
}

// -------- transform HUD (rotate / scale popup) --------
// Shown when a rotate or scale interaction starts. While dragging,
// updates the displayed value live. After mouseup, the user can type an
// exact value (Enter or OK applies it; Cancel reverts to originals).

function showHud(it) {
    const hud = document.getElementById("transformHud");
    if (!hud) return;
    document.getElementById("transformHudLabel").textContent = it.kind === "rotate" ? "angle" : "scale";
    document.getElementById("transformHudUnit").textContent = it.kind === "rotate" ? "°" : "×";
    const input = document.getElementById("transformHudInput");
    input.step = it.kind === "rotate" ? "0.1" : "0.01";
    input.value = (it.kind === "rotate" ? 0 : 1).toFixed(it.kind === "rotate" ? 1 : 2);
    hud.hidden = false;
}

function updateHud(it) {
    const input = document.getElementById("transformHudInput");
    if (!input) return;
    input.value = (it.kind === "rotate"
        ? it.value.toFixed(1)
        : it.value.toFixed(3));
}

function hideHud() {
    const hud = document.getElementById("transformHud");
    if (hud) hud.hidden = true;
}

function applyRotate(it) {
    const radians = it.value * Math.PI / 180;
    for (let i = 0; i < it.shapes.length; i++) {
        Object.assign(it.shapes[i], deepCopyShape(it.originals[i]));
        rotateShape(it.shapes[i], radians, it.center[0], it.center[1]);
    }
    render();
}

function applyScale(it) {
    const factor = Math.max(0.001, it.value);
    for (let i = 0; i < it.shapes.length; i++) {
        Object.assign(it.shapes[i], deepCopyShape(it.originals[i]));
        scaleShape(it.shapes[i], factor, it.center[0], it.center[1]);
    }
    render();
}

export function installTransformHud() {
    const input = document.getElementById("transformHudInput");
    const ok    = document.getElementById("transformHudOk");
    const cncl  = document.getElementById("transformHudCancel");
    if (!input || !ok || !cncl) return;

    input.oninput = () => {
        const it = state.interaction;
        if (!it || (it.kind !== "rotate" && it.kind !== "scale")) return;
        const v = parseFloat(input.value);
        if (Number.isNaN(v)) return;
        it.value = v;
        if (it.kind === "rotate") applyRotate(it);
        else applyScale(it);
    };
    input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); ok.click(); } };

    ok.onclick = () => {
        // Current shape state is the committed result — just dismiss.
        state.interaction = null;
        hideHud();
        render();
    };
    cncl.onclick = () => {
        const it = state.interaction;
        if (it && (it.kind === "rotate" || it.kind === "scale")) {
            for (let i = 0; i < it.shapes.length; i++) {
                Object.assign(it.shapes[i], deepCopyShape(it.originals[i]));
            }
        }
        state.interaction = null;
        hideHud();
        render();
    };
}

// -------- rotate / scale (operate on the entire selection) --------
function startRotate(e, p) {
    const targets = prepareTransformTargets(e);
    if (!targets) return;
    snapshot();
    const { shapes, center } = targets;
    state.interaction = {
        kind: "rotate",
        shapes,
        center,
        startAngle: Math.atan2(p.y - center[1], p.x - center[0]),
        originals: shapes.map(deepCopyShape),
        value: 0,
        released: false,
    };
    showHud(state.interaction);
    render();
}

function startScale(e, p) {
    const targets = prepareTransformTargets(e);
    if (!targets) return;
    snapshot();
    const { shapes, center } = targets;
    state.interaction = {
        kind: "scale",
        shapes,
        center,
        startDist: Math.max(0.5, Math.hypot(p.x - center[0], p.y - center[1])),
        originals: shapes.map(deepCopyShape),
        value: 1,
        released: false,
    };
    showHud(state.interaction);
    render();
}

/** Resolve which shapes to transform and the pivot point. If the user
 *  clicked a selected shape, the whole selection moves together around
 *  the group centroid. If they clicked an unselected shape, that one
 *  becomes the new (single) selection. */
function prepareTransformTargets(e) {
    // Rotate/scale always operate on the current selection. Drag anywhere
    // on the canvas — the click target doesn't matter. If nothing's
    // selected, the tool does nothing (use the Select tool first).
    if (state.selectedShapeIds.size === 0) return null;
    const shapes = [...state.selectedShapeIds].map(findShape).filter(Boolean);
    if (!shapes.length) return null;
    const b = combinedBounds(shapes);
    return { shapes, center: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] };
}

// -------- draw (line/rect/ellipse) --------
function startDraw(p) {
    state.interaction = { kind: "draw", startX: p.x, startY: p.y, x: p.x, y: p.y };
}

function commitDraw() {
    const it = state.interaction;
    const layer = activeArtLayer();
    if (!layer) { state.interaction = null; return; }
    const moved = Math.hypot(it.x - it.startX, it.y - it.startY) > 0.5;
    if (!moved) { cancelInteraction(); return; }

    snapshot(); // about to add a shape
    let shape = null;
    if (state.tool === "line") {
        shape = { id: uid("s"), type: "line", x1: it.startX, y1: it.startY, x2: it.x, y2: it.y };
    } else if (state.tool === "rect") {
        shape = { id: uid("s"), type: "rect",
            x: Math.min(it.startX, it.x), y: Math.min(it.startY, it.y),
            w: Math.abs(it.x - it.startX), h: Math.abs(it.y - it.startY) };
    } else if (state.tool === "ellipse") {
        shape = { id: uid("s"), type: "ellipse",
            cx: (it.startX + it.x) / 2, cy: (it.startY + it.y) / 2,
            rx: Math.abs(it.x - it.startX) / 2, ry: Math.abs(it.y - it.startY) / 2 };
    }
    if (shape) layer.shapes.push(shape);
    state.interaction = null;
    removePreview();
    render();
}

function buildDrawPreviewEl(it) {
    let el;
    if (state.tool === "line") {
        el = document.createElementNS(SVG_NS, "line");
        el.setAttribute("x1", it.startX); el.setAttribute("y1", it.startY);
        el.setAttribute("x2", it.x); el.setAttribute("y2", it.y);
    } else if (state.tool === "rect") {
        el = document.createElementNS(SVG_NS, "rect");
        el.setAttribute("x", Math.min(it.startX, it.x));
        el.setAttribute("y", Math.min(it.startY, it.y));
        el.setAttribute("width", Math.abs(it.x - it.startX));
        el.setAttribute("height", Math.abs(it.y - it.startY));
    } else if (state.tool === "ellipse") {
        el = document.createElementNS(SVG_NS, "ellipse");
        el.setAttribute("cx", (it.startX + it.x) / 2);
        el.setAttribute("cy", (it.startY + it.y) / 2);
        el.setAttribute("rx", Math.abs(it.x - it.startX) / 2);
        el.setAttribute("ry", Math.abs(it.y - it.startY) / 2);
    }
    return el;
}

// -------- polyline --------
function startOrExtendPolyline(p) {
    if (!state.interaction || state.interaction.kind !== "polyline") {
        state.interaction = { kind: "polyline", points: [[p.x, p.y], [p.x, p.y]] };
    } else {
        state.interaction.points[state.interaction.points.length - 1] = [p.x, p.y];
        state.interaction.points.push([p.x, p.y]);
    }
    showPreview(buildPolylinePreviewEl(state.interaction));
}

export function commitPolyline() {
    const it = state.interaction;
    if (!it || it.points.length < 3) { cancelInteraction(); return; }
    const layer = activeArtLayer();
    if (!layer) { cancelInteraction(); return; }
    snapshot();
    const pts = it.points.slice(0, -1); // drop live preview vertex
    layer.shapes.push({ id: uid("s"), type: "polyline", points: pts });
    state.interaction = null;
    removePreview();
    render();
}

function buildPolylinePreviewEl(it) {
    const el = document.createElementNS(SVG_NS, "polyline");
    el.setAttribute("points", it.points.map(p => `${p[0]},${p[1]}`).join(" "));
    return el;
}

// -------- freehand --------
function startFreehand(p) {
    state.interaction = { kind: "freehand", points: [[p.x, p.y]] };
}

function commitFreehand() {
    const it = state.interaction;
    if (!it || it.points.length < 2) { cancelInteraction(); return; }
    const layer = activeArtLayer();
    if (!layer) { cancelInteraction(); return; }
    snapshot();
    const d = "M " + it.points.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L ");
    layer.shapes.push({ id: uid("s"), type: "path", d });
    state.interaction = null;
    removePreview();
    render();
}

function buildFreehandPreviewEl(it) {
    const el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", "M " + it.points.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L "));
    return el;
}

// ----- scissors / trim -----

/** Convert a shape to { pts:[[x,y],…], closed } for trimming. */
function shapeToPolyline(shape) {
    if (shape.type === "line") {
        return { pts: [[shape.x1, shape.y1], [shape.x2, shape.y2]], closed: false };
    }
    if (shape.type === "polyline") {
        const pts = shape.points.map(p => [p[0], p[1]]);
        let closed = false;
        if (pts.length > 2) {
            const a = pts[0], b = pts[pts.length - 1];
            if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) { closed = true; pts.pop(); }
        }
        return { pts, closed };
    }
    const poly = closedPolygonFor(shape); // rect / ellipse / path → closed ring
    if (!poly) return null;
    const pts = poly.map(p => [p[0], p[1]]);
    if (pts.length > 1) {
        const a = pts[0], b = pts[pts.length - 1];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) pts.pop();
    }
    return { pts, closed: true };
}

/** Resolve the hovered/clicked shape + its cutters (every other visible
 *  vector) for the scissors tool. Returns null when not over a shape. */
function trimContext(e) {
    const sid = e.target.dataset && e.target.dataset.shapeId;
    if (!sid) return null;
    let target = null, layer = null;
    for (const l of state.artLayers) {
        const s = l.shapes.find(s => s.id === sid);
        if (s) { target = s; layer = l; break; }
    }
    if (!target) return null;
    const tpl = shapeToPolyline(target);
    if (!tpl || tpl.pts.length < 2) return null;
    const cutters = [];
    for (const l of state.artLayers) {
        if (!l.visible) continue;
        for (const s of l.shapes) {
            if (s.id === sid) continue;
            const pl = shapeToPolyline(s);
            if (pl && pl.pts.length >= 2) cutters.push(pl);
        }
    }
    return { target, layer, tpl, cutters };
}

/** Hover feedback: draw the span the click would snip, in red. */
function updateTrimHover(e, p) {
    const ctx = trimContext(e);
    if (!ctx) { removePreview(); return; }
    const cuts = crossingParams(ctx.tpl.pts, ctx.tpl.closed, ctx.cutters);
    const span = removedSpanAt(ctx.tpl.pts, ctx.tpl.closed, cuts, [p.x, p.y]);
    if (!span || span.length < 2) { removePreview(); return; }
    const el = document.createElementNS(SVG_NS, "polyline");
    el.setAttribute("points", span.map(pt => `${pt[0]},${pt[1]}`).join(" "));
    el.classList.add("trim-cut");
    showPreview(el);
}

/** Scissors: snip the clicked vector, removing the span between its two
 *  nearest crossings with other visible vectors. The remainder stays as
 *  open polyline(s); a closed shape re-closes across the cut. */
function doScissors(e, p) {
    const ctx = trimContext(e);
    if (!ctx) return;
    const { target, layer, tpl, cutters } = ctx;

    const cuts = crossingParams(tpl.pts, tpl.closed, cutters);
    const pieces = trimSpanAt(tpl.pts, tpl.closed, cuts, [p.x, p.y]);
    if (!pieces || !pieces.length) {
        toast("Nothing to trim here — the vector must cross another at this spot.", true);
        return;
    }

    removePreview();
    snapshot();
    const idx = layer.shapes.indexOf(target);
    const made = pieces.map(piece => {
        const points = piece.map(p => [p[0], p[1]]);
        // Trimming a closed shape closes the remainder back up (a straight
        // chord across the cut) so it stays a filled region.
        if (tpl.closed && points.length >= 2) points.push([points[0][0], points[0][1]]);
        const sh = { id: uid("shape"), type: "polyline", points };
        if (tpl.closed && target._fill !== undefined) sh._fill = target._fill;
        if (target._stroke !== undefined) sh._stroke = target._stroke;
        if (target._strokeWidth !== undefined) sh._strokeWidth = target._strokeWidth;
        return sh;
    });
    layer.shapes.splice(idx, 1, ...made);
    state.selectedShapeIds = new Set(made.map(s => s.id));
    render();
}

// ----- node edit -----

const NODE_PICK_PX = 12;

function nearestNode(pts, pt) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
        const d = Math.hypot(pts[i][0] - pt[0], pts[i][1] - pt[1]);
        if (d < bd) { bd = d; bi = i; }
    }
    return { i: bi, d: bd };
}

/** The single shape currently selected for node editing (must be node-
 *  editable), with its node list — or null. */
function selectedNodeShape() {
    if (state.selectedShapeIds.size !== 1) return null;
    const sid = [...state.selectedShapeIds][0];
    for (const l of state.artLayers) {
        const s = l.shapes.find(x => x.id === sid);
        if (s) { const nodes = getNodes(s); return nodes ? { shape: s, layer: l, nodes } : null; }
    }
    return null;
}

/** Hover feedback: ring the node a click would delete (on the selected
 *  shape, whose nodes are all shown as handles). */
function updateNodeHover(e, p) {
    const sel = selectedNodeShape();
    if (!sel) { removePreview(); return; }
    const thr = NODE_PICK_PX / Math.max(0.001, state.viewport.scale);
    const nn = nearestNode(sel.nodes.pts, [p.x, p.y]);
    if (nn.i < 0 || nn.d > thr) { removePreview(); return; }
    const c = sel.nodes.pts[nn.i];
    const el = document.createElementNS(SVG_NS, "circle");
    el.setAttribute("cx", c[0]); el.setAttribute("cy", c[1]);
    el.setAttribute("r", Math.max(0.4, thr * 0.45));
    el.classList.add("node-hi");
    showPreview(el);
}

/** Node tool click: if a node of the selected shape is under the cursor,
 *  delete it (neighbours join straight; closed stays closed). Otherwise
 *  select the shape under the cursor so all its nodes show as handles. */
function doNodeEdit(e, p) {
    const sel = selectedNodeShape();
    if (sel) {
        const thr = NODE_PICK_PX / Math.max(0.001, state.viewport.scale);
        const nn = nearestNode(sel.nodes.pts, [p.x, p.y]);
        if (nn.i >= 0 && nn.d <= thr) {
            const minNodes = sel.nodes.closed ? 3 : 2;
            if (sel.nodes.pts.length <= minNodes) { toast("Can't delete — too few nodes left.", true); return; }
            snapshot();
            sel.nodes.pts.splice(nn.i, 1);
            setNodes(sel.shape, sel.nodes.pts, sel.nodes.closed);
            removePreview();
            render();
            return;
        }
    }
    // Not on a node → (re)select the shape under the cursor to edit it.
    const sid = e.target.dataset && e.target.dataset.shapeId;
    state.selectedShapeIds = sid ? new Set([sid]) : new Set();
    removePreview();
    render();
}
