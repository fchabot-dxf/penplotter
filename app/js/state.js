// Single source of truth for app state. Other modules import this directly.
// Keep this file dumb — no DOM, no rendering.

let nextId = 1;
export const uid = (prefix = "id") => `${prefix}${nextId++}`;

export const state = {
    doc: { w: 200, h: 200 },
    layers: [],
    activeLayerId: null,
    tool: "select",
    selectedShapeIds: new Set(),
    settings: { pen_up_z: 5, pen_down_z: -1, draw_feed: 2000, z_feed: 1000, tolerance_mm: 0.1 },
    viewport: { scale: 1, panX: 0, panY: 0 },
    interaction: null,
    spaceDown: false,
    preview: { showSvg: true, showToolpath: false, showSimulation: false },
};

/** Default fill settings applied to new and imported layers. */
export const DEFAULT_FILL = { pattern: "none", angle: 45, spacing: 2.0 };

export const DEFAULT_PEN_WIDTH = 0.5; // mm — typical fineliner
export const DEFAULT_OUTLINE = {
    style: "normal",
    passes: 1,
    dash_length: 2,
    dash_gap: 1,
    amplitude: 0.8,
    frequency: 0.7,
};

export function makeLayer(name, color = "#111111") {
    return {
        id: uid("layer"),
        name,
        color,
        visible: true,
        shapes: [],
        fill: { ...DEFAULT_FILL },
        outline: { ...DEFAULT_OUTLINE },
        penWidth: DEFAULT_PEN_WIDTH,
        // If false, the shape outlines aren't plotted — only the fill
        // pattern (if any). Set on fill-only layers created at import time
        // so a single SVG shape with both stroke + fill doesn't double-trace
        // the outline.
        drawOutline: true,
        // Include this layer in the G-code export. Independent of `visible`
        // (which controls canvas display).
        export: true,
        // Editorial role — affects display name + sensible defaults.
        // "outline" = strokes only; "fill" = fill-only (drawOutline=false,
        // fill.pattern=hatch); "mixed" = user-drawn (both possible).
        role: "mixed",
    };
}

export function initLayers() {
    const layer = makeLayer("layer 1");
    state.layers = [layer];
    state.activeLayerId = layer.id;
}

export function activeLayer() {
    return state.layers.find(l => l.id === state.activeLayerId) || null;
}

export function findShape(sid) {
    for (const l of state.layers) {
        const s = l.shapes.find(s => s.id === sid);
        if (s) return s;
    }
    return null;
}
