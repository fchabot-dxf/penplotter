// The canvas always shows the artwork + the toolpath together. The only
// view control is the "Simulate" toggle: when on, strokes render at their
// actual pen width and the artwork fades to a ghost behind them.

import { state } from "./state.js";
import { $ } from "./dom.js";
import { render } from "./render.js";

export function installPreviewToggles() {
    const sim = $("#toggleSimPens");
    if (!sim) return;
    sim.classList.toggle("on", !!state.preview.simulatePens);
    sim.onclick = () => {
        state.preview.simulatePens = !state.preview.simulatePens;
        sim.classList.toggle("on", state.preview.simulatePens);
        render();
    };
}
