// Right-panel inspector for the currently active VCarve toolpath operation:
//   - Pen width
//   - Outline settings (for Outline toolpaths)
//   - Fill settings (for Fill toolpaths)

import { state, activeToolpath } from "./state.js";
import { $ } from "./dom.js";
import { FILL_PATTERNS, PATTERN_OPTIONS } from "./fill/index.js";
import { OUTLINE_STYLES, STYLE_OPTIONS } from "./outline/index.js";
import { snapshot } from "./history.js";

// Friendly labels + step/min/max for each numeric option.
const FIELD_META = {
    spacing:     { label: "Spacing", unit: "mm",  min: 0.2, max: 20,  step: 0.1 },
    offset:      { label: "Offset",  unit: "mm",  min: -20, max: 20,  step: 0.1 },
    angle:       { label: "Angle",   unit: "°",   min: 0,   max: 180, step: 1 },
    dash_length: { label: "Dash",    unit: "mm",  min: 0.2, max: 20,  step: 0.1 },
    dash_gap:    { label: "Gap",     unit: "mm",  min: 0.2, max: 20,  step: 0.1 },
    amplitude:   { label: "Amplitude", unit: "mm", min: 0.1, max: 5,  step: 0.1 },
    frequency:   { label: "Frequency", unit: "/mm", min: 0.1, max: 5, step: 0.1 },
};

// Default fill spacing (mm) per pattern. Concentric defaults denser so its
// nested rings don't look sparse out of the box; everything else uses 2.
const GENERIC_FILL_SPACING = 2;
const DEFAULT_FILL_SPACING = { concentric: 1.2 };
const defaultSpacingFor = (p) => DEFAULT_FILL_SPACING[p] ?? GENERIC_FILL_SPACING;

let triggerRerender = () => {};
export function installActiveLayerPanel(onChange) {
    triggerRerender = onChange;
    renderActiveLayerPanel();
}

export function renderActiveLayerPanel() {
    const root = $("#activeLayerContent");
    if (!root) return;
    root.innerHTML = "";

    const tp = activeToolpath();
    if (!tp) {
        root.innerHTML = `<div class="empty">No active toolpath.</div>`;
        const panelHeader = $("#activeLayerPanel h2");
        if (panelHeader) panelHeader.textContent = "Active Toolpath";
        return;
    }

    // Resolve the bulk-edit target set. When the user has multi-selected
    // (box-select or shift-click), edits apply to every selected toolpath
    // of a matching type. Style/fill specific fields skip incompatible
    // entries; pen width applies to all selected regardless.
    const targets = bulkTargets(tp);
    const isBulk = targets.length > 1;
    const sameTypeTargets = targets.filter(t => t.type === tp.type);

    const panelHeader = $("#activeLayerPanel h2");
    if (panelHeader) {
        panelHeader.textContent = isBulk
            ? `Toolpaths: ${targets.length} selected`
            : `Toolpath: ${tp.name}`;
    }

    if (isBulk) {
        const banner = document.createElement("div");
        banner.className = "bulk-banner";
        banner.textContent = `Bulk edit — ${targets.length} toolpaths (${sameTypeTargets.length} match the active type "${tp.type}")`;
        root.appendChild(banner);
    }

    // Stash target IDs so the change handlers re-resolve through
    // state.toolpaths every time they fire. Holding direct references
    // is fragile across renders (and an undo could swap out the array).
    const sameTypeIds = sameTypeTargets.map(t => t.id);
    const tpType = tp.type;

    const resolveSameType = () =>
        state.toolpaths.filter(t => sameTypeIds.includes(t.id));

    // Pen width lives on the pen now (edit it in the Pens panel), so it's
    // no longer shown here per-toolpath.

    if (tpType === "outline") {
        const outs = sameTypeTargets;
        root.appendChild(subhead(isBulk ? `Outline (${outs.length})` : "Outline"));
        root.appendChild(checkboxField("Draw outline",
            commonValue(outs, t => t.drawOutline !== false),
            (v) => {
                snapshot();
                for (const t of resolveSameType()) t.drawOutline = v;
                triggerRerender();
            }));
        root.appendChild(selectField("Style",
            commonExact(outs, t => t.outline.style),
            OUTLINE_STYLES, (v) => {
                snapshot();
                for (const t of resolveSameType()) t.outline.style = v;
                renderActiveLayerPanel();
                triggerRerender();
            }));
        root.appendChild(numberField("Passes", "×",
            commonValue(outs, t => t.outline.passes),
            1, 10, 1, (v) => {
                snapshot();
                for (const t of resolveSameType()) t.outline.passes = v;
                triggerRerender();
            }));
        for (const key of STYLE_OPTIONS[tp.outline.style] || []) {
            root.appendChild(bulkMetaField(key, outs, resolveSameType, t => t.outline, triggerRerender));
        }
    }

    if (tpType === "fill") {
        const fills = sameTypeTargets;
        root.appendChild(subhead(isBulk ? `Fill (${fills.length})` : "Fill"));
        root.appendChild(selectField("Pattern",
            commonExact(fills, t => t.fill.pattern),
            FILL_PATTERNS.filter(p => p !== "none"), (v) => {
                snapshot();
                for (const t of resolveSameType()) {
                    // Adopt the new pattern's default spacing only when the
                    // user hadn't moved it off the old pattern's default, so
                    // deliberate values survive a pattern switch.
                    if (t.fill.spacing === defaultSpacingFor(t.fill.pattern)) {
                        t.fill.spacing = defaultSpacingFor(v);
                    }
                    t.fill.pattern = v;
                }
                renderActiveLayerPanel();
                triggerRerender();
            }));
        for (const key of PATTERN_OPTIONS[tp.fill.pattern] || []) {
            root.appendChild(bulkMetaField(key, fills, resolveSameType, t => t.fill, triggerRerender));
        }
    }
}

/** Return the bulk-edit set — every selected toolpath, with the active
 *  one guaranteed to be included. Falls back to just the active when
 *  the multi-selection set is empty (eg. import default). */
function bulkTargets(activeTp) {
    const ids = state.selectedToolpathIds;
    if (!ids || ids.size <= 1) return [activeTp];
    const out = [];
    for (const tp of state.toolpaths) if (ids.has(tp.id)) out.push(tp);
    if (!out.length) return [activeTp];
    return out;
}

/** Read a value across the bulk set. Returns the common value if they
 *  all agree, otherwise the active (first) one's value — the user sees
 *  a definite number rather than blank, and editing pushes it to all. */
function commonValue(targets, accessor) {
    if (!targets.length) return undefined;
    const first = accessor(targets[0]);
    for (let i = 1; i < targets.length; i++) {
        if (accessor(targets[i]) !== first) return first;
    }
    return first;
}

/** Like commonValue, but returns undefined when the bulk set disagrees.
 *  Used for <select> fields so a mixed selection shows a "— mixed —"
 *  placeholder rather than a definite (and re-selectable-as-no-op) value. */
function commonExact(targets, accessor) {
    if (!targets.length) return undefined;
    const first = accessor(targets[0]);
    for (let i = 1; i < targets.length; i++) {
        if (accessor(targets[i]) !== first) return undefined;
    }
    return first;
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
    // `change` only fires on blur / Enter; users expect live updates
    // when typing or holding the arrow keys, so we also wire `input`.
    // Skip onChange while the field is empty (mid-typing "-" etc).
    const commit = () => {
        if (input.value === "") return;
        const v = +input.value;
        if (!Number.isFinite(v)) return;
        onChange(v);
    };
    input.oninput = commit;
    input.onchange = commit;
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
    // When the bulk selection disagrees, `value` won't be one of the
    // options. Show a leading "— mixed —" entry as the current value so
    // that picking ANY real option fires a change event — otherwise
    // re-selecting the already-displayed value is a no-op and the
    // mismatched toolpaths never update.
    const isMixed = !options.includes(value);
    if (isMixed) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "— mixed —";
        o.selected = true;
        select.appendChild(o);
    }
    for (const opt of options) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        if (!isMixed && opt === value) o.selected = true;
        select.appendChild(o);
    }
    select.onchange = () => { if (select.value !== "") onChange(select.value); };
    wrap.append(label, select);
    return wrap;
}

function metaField(key, target, onChange) {
    const m = FIELD_META[key] || { label: key, unit: "", min: 0, max: 100, step: 1 };
    return numberField(m.label, m.unit, target[key], m.min, m.max, m.step, (v) => {
        snapshot();
        target[key] = v;
        onChange();
    });
}

/** Like metaField, but updates the same sub-object across every
 *  toolpath returned by `resolve()` — re-resolved on each change so
 *  the latest state.toolpaths references are used (closures over
 *  stale references would not survive an undo / load). */
function bulkMetaField(key, displayTargets, resolve, subAccessor, onChange) {
    const m = FIELD_META[key] || { label: key, unit: "", min: 0, max: 100, step: 1 };
    let value;
    if (displayTargets.length) {
        value = subAccessor(displayTargets[0])[key];
    }
    return numberField(m.label, m.unit, value, m.min, m.max, m.step, (v) => {
        snapshot();
        for (const t of resolve()) subAccessor(t)[key] = v;
        onChange();
    });
}
