// SVG import: drag-drop and file picker.
//
// Layer-detection rules, in priority order:
//   1. If the SVG contains <g inkscape:groupmode="layer"> wrappers, use
//      them — Inkscape's native layer model.
//   2. Otherwise, walk every shape resolving its effective pen color
//      (= fill if filled, else stroke, inherited along the SVG tree)
//      and group by that color. Each unique color becomes one layer.
//      "One color = one pen = one layer" matches pen-plotter conventions.

import { state, makeLayer } from "./state.js";
import { canvasWrap, dropOverlay, $, toast, INK_NS } from "./dom.js";
import { fitViewport } from "./viewport.js";
import { render } from "./render.js";
import { snapshot } from "./history.js";

export function installSvgImport() {
    $("#importBtn").onclick = () => $("#importFile").click();
    $("#importFile").addEventListener("change", (e) => {
        const f = e.target.files[0];
        if (f) loadSvgFile(f);
        e.target.value = "";
    });

    canvasWrap.addEventListener("dragover", (e) => { e.preventDefault(); dropOverlay.classList.add("show"); });
    canvasWrap.addEventListener("dragleave", () => dropOverlay.classList.remove("show"));
    canvasWrap.addEventListener("drop", (e) => {
        e.preventDefault();
        dropOverlay.classList.remove("show");
        const f = e.dataTransfer.files[0];
        if (f) loadSvgFile(f);
    });
}

async function loadSvgFile(file) {
    const text = await file.text();
    try {
        importSvgText(text);
        toast(`Imported ${file.name}`);
    } catch (err) {
        toast("Import failed: " + err.message, true);
    }
}

export function importSvgText(text) {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const root = doc.documentElement;
    if (root.tagName.toLowerCase() !== "svg") throw new Error("Not an SVG file.");
    snapshot(); // import is a single undoable action

    // Document size: width/height → viewBox → 200x200 fallback.
    let w = parseLen(root.getAttribute("width"));
    let h = parseLen(root.getAttribute("height"));
    const vb = (root.getAttribute("viewBox") || "").trim().split(/[ ,]+/).map(Number);
    if (!w && vb.length === 4) w = vb[2];
    if (!h && vb.length === 4) h = vb[3];
    state.doc.w = Math.round(w || 200);
    state.doc.h = Math.round(h || 200);
    $("#docW").value = state.doc.w;
    $("#docH").value = state.doc.h;

    state.layers = [];

    const inkscapeLayers = Array.from(root.children).filter(n =>
        n.tagName.toLowerCase() === "g"
        && n.getAttributeNS(INK_NS, "groupmode") === "layer"
    );

    if (inkscapeLayers.length > 0) {
        importFromInkscapeLayers(inkscapeLayers);
    } else {
        importByColorGrouping(root);
    }

    if (state.layers.length === 0) {
        state.layers.push(makeLayer("imported"));
    }
    state.activeLayerId = state.layers[state.layers.length - 1].id;
    state.selectedShapeIds.clear();
    fitViewport();
    render();
}

const EMPTY_PAINT = { fill: null, stroke: null };

function importFromInkscapeLayers(layerGroups) {
    for (const g of layerGroups) {
        const name = g.getAttributeNS(INK_NS, "label")
            || g.getAttribute("id")
            || `layer ${state.layers.length + 1}`;
        const inherited = inheritPaint(g, EMPTY_PAINT);
        const shapes = [];
        for (const node of Array.from(g.children)) collectShapes(node, inherited, shapes);
        const layerColor = penColorFor(inherited) || "#111111";
        const layer = makeLayer(name, layerColor);
        layer.shapes = shapes;
        state.layers.push(layer);
    }
}

function importByColorGrouping(root) {
    // Hybrid: respect the source SVG tree AND split by color/role.
    //   - Each top-level <g> becomes a cluster, named after its
    //     inkscape:label or id.
    //   - Loose shapes at the SVG root form an implicit "ungrouped" cluster.
    //   - Within each cluster, shapes split by (color, role) into sub-
    //     layers — one pen per sub-layer.
    //   - A shape with both fill and stroke produces two entries in the
    //     cluster (one per role).
    const clusters = []; // [{ groupName, items: [{ shape, color, role }] }]
    const topLevel = Array.from(root.children);

    const looseShapes = topLevel.filter(n => n.tagName?.toLowerCase() !== "g");
    if (looseShapes.length) {
        const items = [];
        for (const node of looseShapes) walk(node, EMPTY_PAINT, items);
        if (items.length) clusters.push({ groupName: "ungrouped", items });
    }

    let groupIdx = 0;
    for (const g of topLevel) {
        if (g.tagName?.toLowerCase() !== "g") continue;
        groupIdx++;
        const items = [];
        const groupPaint = inheritPaint(g, EMPTY_PAINT);
        for (const child of Array.from(g.children)) walk(child, groupPaint, items);
        if (!items.length) continue;
        const name = g.getAttributeNS(INK_NS, "label")
            || g.getAttribute("id")
            || `group ${groupIdx}`;
        clusters.push({ groupName: name, items });
    }

    // Within each cluster: bucket by (color, role).
    const onlyOneCluster = clusters.length === 1;
    for (const cluster of clusters) {
        const buckets = new Map();
        for (const item of cluster.items) {
            const key = `${item.color}|${item.role}`;
            if (!buckets.has(key)) {
                buckets.set(key, { color: item.color, role: item.role, shapes: [] });
            }
            buckets.get(key).shapes.push(item.shape);
        }
        // Fills first (render behind strokes in SVG view + plot first).
        const ordered = [...buckets.values()].sort((a, b) =>
            a.role === b.role ? 0 : (a.role === "fill" ? -1 : 1)
        );
        const prefix = onlyOneCluster ? "" : `${cluster.groupName} / `;
        for (const b of ordered) {
            const baseName = b.role === "fill"
                ? `${colorName(b.color)} (fill)`
                : colorName(b.color);
            const layer = makeLayer(prefix + baseName, b.color);
            layer.shapes = b.shapes;
            layer.role = b.role;
            layer.group = cluster.groupName;
            if (b.role === "fill") {
                layer.fill.pattern = "hatch";
                layer.drawOutline = false;
            } else {
                layer.fill.pattern = "none";
                layer.drawOutline = true;
            }
            state.layers.push(layer);
        }
    }
}

function walk(node, parentPaint, out) {
    const paint = inheritPaint(node, parentPaint);
    const tag = node.tagName && node.tagName.toLowerCase();
    if (tag === "g" || tag === "svg") {
        for (const child of Array.from(node.children)) walk(child, paint, out);
        return;
    }
    const shape = nodeToShape(node);
    if (!shape) return;
    // Emit one entry per role the shape has. A shape with both fill and
    // stroke → two entries, two layers, two pens.
    if (paint.fill) {
        out.push({
            shape: { ...shape, id: shape.id + "_f", _fill: paint.fill },
            color: paint.fill, role: "fill",
        });
    }
    if (paint.stroke) {
        out.push({
            shape: { ...shape, id: shape.id + "_s", _stroke: paint.stroke },
            color: paint.stroke, role: "stroke",
        });
    }
    // No fill, no stroke → default to a thin black outline.
    if (!paint.fill && !paint.stroke) {
        out.push({
            shape: { ...shape, _stroke: "#000000" },
            color: "#000000", role: "stroke",
        });
    }
}

function collectShapes(node, parentPaint, out) {
    const tag = node.tagName && node.tagName.toLowerCase();
    if (!tag) return;
    if (tag === "g") {
        const paint = inheritPaint(node, parentPaint);
        for (const c of Array.from(node.children)) collectShapes(c, paint, out);
        return;
    }
    const s = nodeToShape(node);
    if (s) out.push(s);
}

/** Resolve effective fill + stroke for a node, inheriting from the parent
 *  paint state. Honors both XML attributes and inline `style="..."`. */
function inheritPaint(node, parentPaint) {
    if (!node || node.nodeType !== 1) return parentPaint;
    const fill = readPaint(node, "fill");
    const stroke = readPaint(node, "stroke");
    return {
        fill: fill === undefined ? parentPaint.fill : fill,
        stroke: stroke === undefined ? parentPaint.stroke : stroke,
    };
    // undefined = "not set on this element" (use parent)
    // null      = "explicitly none" or no-paint
    // string    = a color
}

function readPaint(node, attr) {
    const direct = node.getAttribute && node.getAttribute(attr);
    if (direct != null) {
        const v = direct.trim().toLowerCase();
        if (v === "none" || v === "transparent") return null;
        if (v !== "") return normalizeColor(direct);
    }
    const style = node.getAttribute && node.getAttribute("style");
    if (style) {
        const re = new RegExp(`(?:^|;)\\s*${attr}\\s*:\\s*([^;]+)`, "i");
        const m = style.match(re);
        if (m) {
            const v = m[1].trim().toLowerCase();
            if (v === "none" || v === "transparent") return null;
            return normalizeColor(m[1].trim());
        }
    }
    return undefined;
}

/** Pen color = fill if it exists and isn't none, else stroke, else null.
 *  Filled shapes drive the layer color because that's the visible color
 *  the user designed with — and a pen plotter realizes "fill" as a
 *  hatching pattern in the same color. */
function penColorFor(paint) {
    if (paint.fill) return paint.fill;
    if (paint.stroke) return paint.stroke;
    return null;
}

function nodeToShape(node) {
    const tag = node.tagName && node.tagName.toLowerCase();
    if (!tag) return null;
    const sid = () => "s" + (++_sCounter);
    switch (tag) {
        case "line":
            return { id: sid(), type: "line",
                x1: +node.getAttribute("x1") || 0, y1: +node.getAttribute("y1") || 0,
                x2: +node.getAttribute("x2") || 0, y2: +node.getAttribute("y2") || 0 };
        case "rect":
            return { id: sid(), type: "rect",
                x: +node.getAttribute("x") || 0, y: +node.getAttribute("y") || 0,
                w: +node.getAttribute("width") || 0, h: +node.getAttribute("height") || 0 };
        case "ellipse":
            return { id: sid(), type: "ellipse",
                cx: +node.getAttribute("cx") || 0, cy: +node.getAttribute("cy") || 0,
                rx: +node.getAttribute("rx") || 0, ry: +node.getAttribute("ry") || 0 };
        case "circle": {
            const r = +node.getAttribute("r") || 0;
            return { id: sid(), type: "ellipse",
                cx: +node.getAttribute("cx") || 0, cy: +node.getAttribute("cy") || 0,
                rx: r, ry: r };
        }
        case "polyline":
        case "polygon": {
            const pts = (node.getAttribute("points") || "").trim().split(/[ ,]+/).map(Number);
            const arr = [];
            for (let i = 0; i + 1 < pts.length; i += 2) arr.push([pts[i], pts[i + 1]]);
            if (tag === "polygon" && arr.length) arr.push(arr[0]);
            return arr.length >= 2 ? { id: sid(), type: "polyline", points: arr } : null;
        }
        case "path": {
            const d = node.getAttribute("d");
            return d ? { id: sid(), type: "path", d } : null;
        }
    }
    return null;
}
let _sCounter = 0;

/** Convert any CSS color (named, #rgb, #rrggbb, rgb(...)) to lowercase #rrggbb. */
function normalizeColor(color) {
    if (!color) return "#111111";
    const c = String(color).trim().toLowerCase();
    // Hex shorthand.
    if (/^#[0-9a-f]{3}$/.test(c)) {
        return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    }
    if (/^#[0-9a-f]{6}$/.test(c)) return c;
    // rgb(...) / rgba(...).
    const rgb = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (rgb) {
        const hex = (n) => Math.max(0, Math.min(255, +n)).toString(16).padStart(2, "0");
        return "#" + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
    }
    // Named color — defer to the browser via a throwaway element.
    if (!_colorProbe) {
        _colorProbe = document.createElement("div");
        _colorProbe.style.display = "none";
        document.body.appendChild(_colorProbe);
    }
    _colorProbe.style.color = "";
    _colorProbe.style.color = c;
    // Inline `.style.color` echoes the input string ("red"). We need the
    // *resolved* color, which only `getComputedStyle` returns.
    const computed = window.getComputedStyle(_colorProbe).color;
    if (computed) {
        const m = computed.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
        if (m) {
            const hex = (n) => Math.max(0, Math.min(255, +n)).toString(16).padStart(2, "0");
            return "#" + hex(m[1]) + hex(m[2]) + hex(m[3]);
        }
    }
    return "#111111";
}
let _colorProbe = null;

/** Friendly layer name from a hex color. */
function colorName(hex) {
    const known = {
        "#000000": "black", "#111111": "black",
        "#ffffff": "white",
        "#ff0000": "red", "#00ff00": "green", "#0000ff": "blue",
        "#ffff00": "yellow", "#ff00ff": "magenta", "#00ffff": "cyan",
    };
    return known[hex] || hex;
}

function parseLen(v) {
    if (!v) return null;
    const m = String(v).trim().match(/^([\d.]+)\s*(mm|cm|in|px|)?$/);
    if (!m) return null;
    const n = +m[1];
    switch (m[2]) {
        case "cm": return n * 10;
        case "in": return n * 25.4;
        case "px": return n * 25.4 / 96;
        default: return n;
    }
}
