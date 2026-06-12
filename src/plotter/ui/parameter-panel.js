// Parameter form: pen-up Z, pen-down Z, feeds, dwell, hatch, tip width.
//
// Inputs are tagged with data-param="<key>"; the panel reads/writes the
// params object based on those keys. Adding a new parameter is two lines:
// a default in ddcs.js DEFAULTS, an input tag in plotter.html. No JS edit.
//
// Both number inputs and checkboxes are supported (checkbox → boolean).
// A preset selector flips multiple params at once via the PRESETS table.

import { queryAll, on } from '../../util/dom.js';
import { DEFAULTS, PRESETS } from '../../gcode/ddcs.js';

export function setupParameterPanel({ rootEl, presetSelectEl, onChange }) {
  const params = { ...DEFAULTS };
  const inputs = queryAll('[data-param]', rootEl);

  function writeUI() {
    for (const input of inputs) {
      const key = input.dataset.param;
      if (!(key in params)) continue;
      if (input.type === 'checkbox') input.checked = !!params[key];
      else input.value = params[key];
    }
  }

  function readFromInput(input) {
    const key = input.dataset.param;
    if (!(key in params)) return;
    if (input.type === 'checkbox') {
      params[key] = input.checked;
    } else {
      const val = parseFloat(input.value);
      if (Number.isFinite(val)) params[key] = val;
    }
  }

  // Initial population.
  writeUI();

  for (const input of inputs) {
    const event = input.type === 'checkbox' ? 'change' : 'input';
    on(input, event, () => {
      readFromInput(input);
      onChange?.({ ...params });
    });
  }

  if (presetSelectEl) {
    // Populate options.
    for (const [key, preset] of Object.entries(PRESETS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = preset.label;
      presetSelectEl.appendChild(opt);
    }
    on(presetSelectEl, 'change', () => {
      const preset = PRESETS[presetSelectEl.value];
      if (!preset) return;
      Object.assign(params, preset.params);
      writeUI();
      onChange?.({ ...params });
    });
  }

  return {
    get: () => ({ ...params }),
    set: (key, value) => {
      params[key] = value;
      writeUI();
    },
  };
}
