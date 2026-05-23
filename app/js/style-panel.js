// Left-panel "Style" section. Edits stroke + fill on the currently selected
// shapes — both attributes preserved from import and ones the user adds.
//
// Behavior:
//   - Reads the first selected shape; if all share the same value, that's
//     displayed. If they differ, "Mixed" appears in the dropdown.
//   - Color pickers + "None" checkboxes for stroke and fill independently.
//   - All changes apply to every selected shape and push an undo snapshot.
//
// Pen-plotter relevance: this is how you give an outline pass to a
// fill-only imported path — set a stroke color, and the layer's
// drawOutline implicitly kicks in for export.

import { state } from "./state.js";
import { $ } from "./dom.js";
import { render } from "./render.js";
import { snapshot } from "./history.js";

export function installStylePanel() {
    renderStylePanel();
}

export function renderStylePanel() {
    const root = $("#styleContent");
    if (!root) return;
    root.innerHTML = "";

    const selected = collectSelectedShapes();
    if (selected.length === 0) {
        root.innerHTML = `<div class="empty">Select shape(s) to edit style.</div>`;
        return;
    }

    const { strokeValue, fillValue } = summarize(selected);

    root.appendChild(paintRow("Stroke", strokeValue, (v) => applyPaint(selected, "_stroke", v)));
    root.appendChild(paintRow("Fill",   fillValue,   (v) => applyPaint(selected, "_fill",   v)));

    // Stroke width — purely visual (SVG view). Doesn't affect plotted
    // line thickness; layer.penWidth governs Simulation rendering and
    // the physical pen governs the plot itself.
    const widthValue = summarizeNumeric(selected, "_strokeWidth", 0.5);
    root.appendChild(numericRow("Width", widthValue, (v) => applyPaint(selected, "_strokeWidth", v)));
}

function summarizeNumeric(shapes, key, defaultValue) {
    const first = shapes[0][key] ?? defaultValue;
    for (const s of shapes) {
        if ((s[key] ?? defaultValue) !== first) return "__mixed__";
    }
    return first;
}

function numericRow(label, value, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const lab = document.createElement("label");
    lab.innerHTML = `${label} <small>mm (preview only)</small>`;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0.05"; input.max = "10"; input.step = "0.05";
    input.value = value === "__mixed__" ? "" : value;
    input.placeholder = value === "__mixed__" ? "mixed" : "";
    input.onchange = () => { if (input.value !== "") onChange(+input.value); };
    wrap.append(lab, input);
    return wrap;
}

function collectSelectedShapes() {
    const out = [];
    for (const layer of state.layers) {
        for (const s of layer.shapes) {
            if (state.selectedShapeIds.has(s.id)) out.push(s);
        }
    }
    return out;
}

function summarize(shapes) {
    const first = shapes[0];
    let strokeValue = first._stroke || null;     // string | null
    let fillValue   = first._fill   || null;
    let strokeMixed = false, fillMixed = false;
    for (const s of shapes) {
        if ((s._stroke || null) !== strokeValue) strokeMixed = true;
        if ((s._fill   || null) !== fillValue)   fillMixed   = true;
    }
    return {
        strokeValue: strokeMixed ? "__mixed__" : strokeValue,
        fillValue:   fillMixed   ? "__mixed__" : fillValue,
    };
}

function applyPaint(shapes, key, value) {
    snapshot();
    for (const s of shapes) {
        // null = explicit "none" (no paint). Distinct from `undefined`,
        // which means "inherit from the layer's <g> default".
        s[key] = value;
    }
    renderStylePanel();
    render();
}

// ---- field builder ----
// One swatch per paint row. Click it → custom popover with a "None" tile
// and a color picker. The swatch itself shows the current state: the
// color, or the white-with-red-stripe "none" indicator.
function paintRow(label, value, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "field paint-row";

    const lab = document.createElement("label");
    lab.textContent = label;

    const ctrls = document.createElement("div");
    ctrls.className = "paint-swatches";

    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch-btn";
    if (value === null) swatch.classList.add("none-swatch");
    else if (value && value !== "__mixed__") swatch.style.background = value;
    else swatch.classList.add("mixed-swatch");
    swatch.title = "Click to pick paint";
    swatch.onclick = (e) => {
        e.stopPropagation();
        openPaintPicker(swatch, value, onChange);
    };

    const status = document.createElement("span");
    status.className = "paint-status";
    status.textContent =
        value === "__mixed__" ? "mixed"
        : value === null      ? "none"
        : value;

    ctrls.append(swatch, status);
    wrap.append(lab, ctrls);
    wrap.style.gridTemplateColumns = "60px 1fr";
    return wrap;
}

// ---- popover picker ----
// Pen-plotter-friendly preset palette. Roughly arranged in rows: grays,
// warms, cools, plus a couple of earth/accent tones. All common fineliner
// or marker colors so a click maps directly to "what pen do I load".
const PRESET_COLORS = [
    "#000000", "#444444", "#888888", "#bbbbbb", "#ffffff",
    "#c4444f", "#e07b00", "#f5c800", "#7aa83a", "#0e639c",
    "#1034a6", "#5a3da6", "#a060b0", "#d04080", "#774422",
    "#3aa3ff", "#ff8a3d", "#3a8a3e", "#c40e3e", "#090700",
];

let _openPopover = null;

function openPaintPicker(anchor, currentValue, onPick) {
    closePaintPicker();
    const rect = anchor.getBoundingClientRect();
    const pop = document.createElement("div");
    pop.className = "paint-popover";
    pop.style.top = (rect.bottom + 4) + "px";
    pop.style.left = rect.left + "px";

    // Top row: "None" tile + custom-color tile (opens OS picker for any
    // color not in the preset grid).
    const topRow = document.createElement("div");
    topRow.className = "paint-popover-row";

    const noneTile = document.createElement("button");
    noneTile.type = "button";
    noneTile.className = "swatch-btn none-swatch paint-popover-tile";
    if (currentValue === null) noneTile.classList.add("active");
    noneTile.title = "No paint";
    noneTile.onclick = (e) => { e.stopPropagation(); onPick(null); closePaintPicker(); };

    // Hidden native color picker behind a "custom" tile.
    const customTile = document.createElement("button");
    customTile.type = "button";
    customTile.className = "swatch-btn paint-popover-tile custom-swatch";
    customTile.title = "Custom color";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = (currentValue && currentValue.startsWith("#")) ? currentValue : "#111111";
    colorInput.style.position = "absolute";
    colorInput.style.opacity = "0";
    colorInput.style.pointerEvents = "none";
    colorInput.style.width = "1px"; colorInput.style.height = "1px";
    customTile.appendChild(colorInput);
    customTile.onclick = (e) => { e.stopPropagation(); colorInput.click(); };
    colorInput.oninput = () => { onPick(colorInput.value); closePaintPicker(); };

    topRow.append(noneTile, customTile);

    // Preset swatch grid.
    const grid = document.createElement("div");
    grid.className = "paint-popover-grid";
    for (const c of PRESET_COLORS) {
        const sw = document.createElement("button");
        sw.type = "button";
        sw.className = "swatch-btn paint-popover-tile";
        sw.style.background = c;
        sw.title = c;
        if (currentValue && currentValue.toLowerCase() === c.toLowerCase()) sw.classList.add("active");
        sw.onclick = (e) => { e.stopPropagation(); onPick(c); closePaintPicker(); };
        grid.appendChild(sw);
    }

    // Hex input at the bottom for precise entry.
    const hex = document.createElement("input");
    hex.type = "text";
    hex.className = "paint-popover-hex";
    hex.value = (currentValue && currentValue.startsWith("#")) ? currentValue
              : (currentValue === null ? "" : "");
    hex.placeholder = "#rrggbb";
    hex.maxLength = 7;
    hex.onclick = (e) => e.stopPropagation();
    hex.onkeydown = (e) => {
        if (e.key === "Enter" && /^#[0-9a-fA-F]{6}$/.test(hex.value)) {
            onPick(hex.value);
            closePaintPicker();
        }
    };

    pop.append(topRow, grid, hex);
    document.body.appendChild(pop);
    _openPopover = pop;

    const dismiss = (ev) => { if (!pop.contains(ev.target)) closePaintPicker(); };
    setTimeout(() => document.addEventListener("mousedown", dismiss), 0);
    pop._dismiss = dismiss;
}

function closePaintPicker() {
    if (!_openPopover) return;
    document.removeEventListener("mousedown", _openPopover._dismiss);
    _openPopover.remove();
    _openPopover = null;
}
