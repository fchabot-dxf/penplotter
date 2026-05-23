// Mouse handlers on the canvas. Dispatches by current tool.
// All shape geometry changes happen here; commits push onto the active layer.

import { state, uid, activeLayer, findShape } from "./state.js";
import { canvas, coordsEl, SVG_NS } from "./dom.js";
import { screenToSvg, applyViewport } from "./viewport.js";
import { translateShape, rotateShape, scaleShape, shapeCenter, deepCopyShape, combinedBounds, shapeBounds } from "./shapes.js";
import { gatherSnapCandidates, shapeVertices, findSnapDelta } from "./snapping.js";

// Snap threshold is in SCREEN pixels — converted to mm per drag frame
// using the current viewport scale. That way a snap engages at a constant
// visual distance regardless of zoom level: looser when zoomed out, tight
// when zoomed in so you can place vertices precisely.
const SNAP_THRESHOLD_PX = 10;
import { render } from "./render.js";
import { showPreview, removePreview, cancelInteraction } from "./tools.js";
import { snapshot } from "./history.js";

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

    if (state.tool === "select") return startSelect(e, p);
    if (state.tool === "rotate") return startRotate(e, p);
    if (state.tool === "scale")  return startScale(e, p);

    const layer = activeLayer();
    if (!layer) return;

    if (state.tool === "polyline") return startOrExtendPolyline(p);
    if (state.tool === "freehand") return startFreehand(p);
    return startDraw(p);
}

function onMove(e) {
    const p = screenToSvg(e.clientX, e.clientY);
    coordsEl.textContent = `${p.x.toFixed(2)}, ${p.y.toFixed(2)} mm`;

    const it = state.interaction;
    if (!it) return;

    if (it.kind === "pan") {
        state.viewport.panX = it.originPanX + (e.clientX - it.startX);
        state.viewport.panY = it.originPanY + (e.clientY - it.startY);
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
        const delta = Math.atan2(p.y - it.center[1], p.x - it.center[0]) - it.startAngle;
        for (let i = 0; i < it.shapes.length; i++) {
            Object.assign(it.shapes[i], deepCopyShape(it.originals[i]));
            rotateShape(it.shapes[i], delta, it.center[0], it.center[1]);
        }
        render();
        return;
    }
    if (it.kind === "scale") {
        const d = Math.hypot(p.x - it.center[0], p.y - it.center[1]);
        const factor = Math.max(0.05, d / it.startDist);
        for (let i = 0; i < it.shapes.length; i++) {
            Object.assign(it.shapes[i], deepCopyShape(it.originals[i]));
            scaleShape(it.shapes[i], factor, it.center[0], it.center[1]);
        }
        render();
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
    if (it.kind === "rotate" || it.kind === "scale") { state.interaction = null; return; }
    if (it.kind === "marquee")  { state.interaction = null; render(); return; }
    // polyline waits for Enter / dblclick
}

function onDblClick() {
    if (state.interaction && state.interaction.kind === "polyline") commitPolyline();
}

// -------- select --------
function startSelect(e, p) {
    const sid = e.target.dataset && e.target.dataset.shapeId;
    if (sid) {
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
    };
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
    };
    render();
}

/** Resolve which shapes to transform and the pivot point. If the user
 *  clicked a selected shape, the whole selection moves together around
 *  the group centroid. If they clicked an unselected shape, that one
 *  becomes the new (single) selection. */
function prepareTransformTargets(e) {
    const sid = e.target.dataset && e.target.dataset.shapeId;
    const clickedSelected = sid && state.selectedShapeIds.has(sid);

    if (clickedSelected && state.selectedShapeIds.size > 0) {
        const shapes = [...state.selectedShapeIds].map(findShape).filter(Boolean);
        if (!shapes.length) return null;
        const b = combinedBounds(shapes);
        return { shapes, center: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] };
    }
    if (sid) {
        const shape = findShape(sid);
        if (!shape) return null;
        state.selectedShapeIds.clear();
        state.selectedShapeIds.add(sid);
        return { shapes: [shape], center: shapeCenter(shape) };
    }
    return null;
}

// -------- draw (line/rect/ellipse) --------
function startDraw(p) {
    state.interaction = { kind: "draw", startX: p.x, startY: p.y, x: p.x, y: p.y };
}

function commitDraw() {
    const it = state.interaction;
    const layer = activeLayer();
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
    const layer = activeLayer();
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
    const layer = activeLayer();
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
