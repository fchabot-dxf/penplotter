// G-code output panel: textarea preview + download button.

import { el, on } from '../../util/dom.js';
import { downloadBlob } from '../../util/download.js';

export function setupGcodeOutput({ textareaId, downloadId }) {
  let currentGcode = '';
  let currentFilename = 'output.gcode';

  on(downloadId, 'click', () => {
    if (!currentGcode) return;
    downloadBlob(currentFilename, currentGcode, 'text/plain');
  });

  function setOutput(gcode, filename = 'output.gcode') {
    currentGcode = gcode;
    currentFilename = filename;
    const ta = el(textareaId);
    if (ta) ta.value = gcode;
    const btn = el(downloadId);
    if (btn) btn.disabled = !gcode;
  }

  function clear() { setOutput('', 'output.gcode'); }

  return { setOutput, clear };
}
