// Right-panel section for the currently active layer:
//   - Pen width
//   - Outline style + style-specific params + passes
//   - Fill pattern + pattern-specific params

import { state } from "./state.js";
import { $ } from "./dom.js";
import { FILL_PATTERNS, PATTERN_OPTIONS } from "./fill/index.js";
import { OUTLINE_STYLES, STYLE_OPTIONS } from "./outline/index.js";

// Friendly labels + step/min/max for each numeric option.
const FIELD_META = {
    spacing:     { label: "Spacing", unit: "mm",  min: 0.2, max: 20,  step: 0.1 },
    angle:       { label: "Angle",   unit: "°",   min: 0,   max: 180, step: 1 },
    dash_length: { label: "Dash",    unit: "mm",  min: 0.2, max: 20,  step: 0.1 },
    dash_gap:    { label: "Gap",     unit: "mm",  min: 0.2, max: 20,  step: 0.1 },
    amplitude:   { label: "Amplitude", unit: "mm", min: 0.1, max: 5,  step: 0.1 },
    frequency:   { label: "Frequency", unit: "/mm", min: 0.1, max: 5, step: 0.1 },
};

let triggerRerender = () => {};
export function installActiveLayerPanel(onChange) {
    triggerRerender = onChange;
    renderActiveLayerPanel();
}

export function renderActiveLayerPanel() {
    const root = $("#activeLayerContent");
    root.innerHTML = "";
    const layer = state.layers.find(l => l.id === state.activeLayerId);
    if (!layer) {
        root.innerHTML = `<div class="empty">No active layer.</div>`;
        return;
    }

    // Pen width
    root.appendChild(subhead("Pen"));
    root.appendChild(numberField("Pen width", "mm", layer.penWidth, 0.05, 5, 0.05, (v) => {
        layer.penWidth = v;
        triggerRerender();
    }));

    // Outline
    root.appendChild(subhead("Outline"));
    root.appendChild(checkboxField("Draw outline", layer.drawOutline !== false, (v) => {
        layer.drawOutline = v;
        triggerRerender();
    }));
    root.appendChild(selectField("Style", layer.outline.style, OUTLINE_STYLES, (v) => {
        layer.outline.style = v;
        renderActiveLayerPanel();
        triggerRerender();
    }));
    root.appendChild(numberField("Passes", "×", layer.outline.passes, 1, 10, 1, (v) => {
        layer.outline.passes = v;
        triggerRerender();
    }));
    for (const key of STYLE_OPTIONS[layer.outline.style] || []) {
        root.appendChild(metaField(key, layer.outline, triggerRerender));
    }

    // Fill
    root.appendChild(subhead("Fill"));
    root.appendChild(selectField("Pattern", layer.fill.pattern, FILL_PATTERNS, (v) => {
        layer.fill.pattern = v;
        renderActiveLayerPanel();
        triggerRerender();
    }));
    for (const key of PATTERN_OPTIONS[layer.fill.pattern] || []) {
        root.appendChild(metaField(key, layer.fill, triggerRerender));
    }
}

// ----- builders -----

function subhead(text) {
    const el = document.createElement("div");
    el.className = "subhead";
    el.textContent = text;
    return el;
}

function numberField(labelText, unit, value, min, max, step, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.innerHTML = `${labelText} <small>${unit}</small>`;
    const input = document.createElement("input");
    input.type = "number";
    input.value = value;
    input.min = min; input.max = max; input.step = step;
    input.onchange = () => onChange(+input.value);
    wrap.append(label, input);
    return wrap;
}

function checkboxField(labelText, checked, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!checked;
    input.style.justifySelf = "end";
    input.style.accentColor = "var(--accent)";
    input.onchange = () => onChange(input.checked);
    wrap.append(label, input);
    return wrap;
}

function selectField(labelText, value, options, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.textContent = labelText;
    const select = document.createElement("select");
    for (const opt of options) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        if (opt === value) o.selected = true;
        select.appendChild(o);
    }
    select.onchange = () => onChange(select.value);
    wrap.append(label, select);
    return wrap;
}

function metaField(key, target, onChange) {
    const m = FIELD_META[key] || { label: key, unit: "", min: 0, max: 100, step: 1 };
    return numberField(m.label, m.unit, target[key], m.min, m.max, m.step, (v) => {
        target[key] = v;
        onChange();
    });
}
