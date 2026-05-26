// Entry point: wires every module together, then boots.

import { initLayers } from "./state.js";
import { fitViewport, installWheelZoom } from "./viewport.js";
import { render } from "./render.js";
import { installToolbar } from "./tools.js";
import { installCanvasHandlers, installTransformHud } from "./interaction.js";
import { installKeyboard } from "./keyboard.js";
import { installLayerButtons } from "./layers-panel.js";
import { installSvgImport } from "./svg-import.js";
import { installExportButton } from "./export.js";
import { installSettingsPanel, loadDefaults } from "./settings.js";
import { installPreviewToggles } from "./preview-controls.js";
import { installActiveLayerPanel, renderActiveLayerPanel } from "./active-layer-panel.js";
import { installToolpathLayersPanel } from "./toolpath-layers-panel.js";
import { installHistory } from "./history.js";
import { installStylePanel } from "./style-panel.js";
import { installPlotColorsPanel } from "./plot-colors-panel.js";
import { installCloudPanel } from "./cloud-panel.js";

async function boot() {
    installToolbar();
    installCanvasHandlers();
    installTransformHud();
    installKeyboard();
    installWheelZoom();
    installLayerButtons();
    installSvgImport();
    installExportButton();
    installSettingsPanel();
    installPreviewToggles();
    installToolpathLayersPanel();
    installPlotColorsPanel();
    installCloudPanel();
    installStylePanel();
    installHistory(() => { render(); renderActiveLayerPanel(); });
    // Active-layer panel triggers a full re-render so the canvas reflects
    // outline/fill changes immediately (and the preview cache invalidates).
    installActiveLayerPanel(() => render());

    await loadDefaults();

    initLayers();
    renderActiveLayerPanel(); // refresh panel now that an active layer exists
    fitViewport();
    render();

    window.addEventListener("resize", () => { fitViewport(); render(); });
}

boot();
