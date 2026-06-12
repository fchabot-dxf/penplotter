// Drag-and-drop + file picker for SVG inputs.
// Calls onLoad(file, svgEl) when a valid SVG arrives; onError(err) on failure.

import { on } from '../../util/dom.js';
import { loadSvgFile } from '../../svg/load.js';

export function setupFileLoader({ pickerEl, dropEl, onLoad, onError }) {
  on(pickerEl, 'change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await handle(file, onLoad, onError);
    // Reset value so re-selecting the same file fires change again.
    e.target.value = '';
  });

  if (dropEl) {
    on(dropEl, 'dragover', (e) => {
      e.preventDefault();
      dropEl.classList.add('drag-over');
    });
    on(dropEl, 'dragleave', () => dropEl.classList.remove('drag-over'));
    on(dropEl, 'drop', async (e) => {
      e.preventDefault();
      dropEl.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) await handle(file, onLoad, onError);
    });
  }
}

async function handle(file, onLoad, onError) {
  const isSvg =
    file.name.toLowerCase().endsWith('.svg') ||
    file.type === 'image/svg+xml';
  if (!isSvg) {
    onError?.(new Error(`Not an SVG: ${file.name}`));
    return;
  }
  try {
    const svg = await loadSvgFile(file);
    onLoad?.(file, svg);
  } catch (err) {
    onError?.(err);
  }
}
