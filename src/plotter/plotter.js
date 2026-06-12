// Pen-plotter app entry. Wires UI panels to the SVG → polylines → G-code
// pipeline. Module scope holds the current document; everything else is
// stateless functions imported from src/*.
//
// Pipeline on every SVG load:
//   File → DOMParser → flattenSvg → { polylines, metadata }
//                  → hatchFills (auto-fill closed shapes with fill attr)
//                  → outlines + hatch concatenated
//                  → optimize (linemerge / linesort / linesimplify, stubs in M1)
//                  → render preview
// On parameter change:
//   same pipeline reruns from the cached SVG flatten output (cheaper than
//   re-parsing the file).
// On button / param change:
//   polylines → emit → textarea + download

import { el, bindClick } from '../util/dom.js';
import { flattenSvg } from '../svg/flatten.js';
import { hatchFills } from '../hatch/pipeline.js';
import { optimize } from '../optimize/pipeline.js';
import { emit as emitGcode } from '../gcode/emitter.js';
import { setupFileLoader } from './ui/file-loader.js';
import { setupParameterPanel } from './ui/parameter-panel.js';
import { setupPreviewCanvas } from './ui/preview-canvas.js';
import { setupGcodeOutput } from './ui/gcode-output.js';
import { setupStatusBar } from './ui/status-bar.js';

// Cached flatten output so param changes don't re-parse the SVG.
let cachedFlatten = null;
let currentPolylines = [];
let currentFilename = 'output';

const status = setupStatusBar({ rootId: 'status' });

const params = setupParameterPanel({
  rootEl: el('params-root'),
  presetSelectEl: el('preset'),
  onChange: () => {
    rebuildPolylines();
    regenerateGcode();
  },
});

const preview = setupPreviewCanvas(el('preview'));
const output = setupGcodeOutput({ textareaId: 'gcode', downloadId: 'download' });

setupFileLoader({
  pickerEl: el('file'),
  dropEl: el('drop'),
  onLoad: handleSvgLoad,
  onError: (err) => status.set(`Error: ${err.message}`),
});

bindClick('generate', () => regenerateGcode(true));

function handleSvgLoad(file, svgEl) {
  currentFilename = file.name.replace(/\.svg$/i, '');
  status.set(`Parsing ${file.name}…`);
  try {
    cachedFlatten = flattenSvg(svgEl);
    rebuildPolylines();
    regenerateGcode();
  } catch (err) {
    console.error(err);
    status.set(`Error: ${err.message}`);
    output.clear();
    preview.clear();
    cachedFlatten = null;
  }
}

// Recompute polylines from the cached flatten output using current params.
// Cheap — no SVG re-parse, just hatch + optimize.
function rebuildPolylines() {
  if (!cachedFlatten) return;
  const { polylines: outlines, metadata } = cachedFlatten;
  const p = params.get();

  const hatchSegments = hatchFills(outlines, metadata, {
    enabled: p.hatchEnabled,
    angle:   p.hatchAngle,
    spacing: p.hatchSpacing,
    inset:   p.hatchInset,
  });

  // Hatch first, outlines last — when M2's linesort is wired in, plot order
  // for two-pen workflows can split on this boundary (fills with pen 1,
  // outlines with pen 2 after M0 pause). For now they all plot one after
  // the other in this order.
  const combined = [...hatchSegments, ...outlines];
  currentPolylines = optimize(combined, p);

  preview.render(currentPolylines, { showTravel: true });
  status.summarize(currentPolylines, {
    hatch: hatchSegments.length,
    outlines: outlines.length,
  });
}

function regenerateGcode(forceMsg = false) {
  if (!currentPolylines.length) {
    output.clear();
    return;
  }
  const gcode = emitGcode(currentPolylines, params.get(), { title: currentFilename });
  output.setOutput(gcode, `${currentFilename}.gcode`);
  if (forceMsg) status.set('G-code regenerated');
}
