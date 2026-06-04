// Mobile / narrow layout helpers. On small screens #app stacks canvas over
// a single tabbed panel (SVG | Toolpath) split by a drag handle. The CSS
// (index.html @media) does the layout; this wires the tabs and the splitter.

import { fitViewport } from "./viewport.js";
import { render } from "./render.js";
import { $ } from "./dom.js";

export function installMobileLayout() {
    const app = $("#app");
    if (!app) return;

    // Tabs: toggle which side-panel shows in the shared bottom area.
    const tabs = [...document.querySelectorAll("#mobileTabs .mtab")];
    for (const b of tabs) {
        b.addEventListener("click", () => {
            document.body.classList.toggle("mtab-toolpath", b.dataset.mtab === "toolpath");
            tabs.forEach(x => x.classList.toggle("active", x === b));
        });
    }

    // Splitter: drag to resize the canvas/panel split (sets --mobile-canvas).
    const split = $("#mobileSplit");
    if (!split) return;
    let dragging = false, raf = 0;

    const applyAt = (clientY) => {
        const rect = app.getBoundingClientRect();
        const h = Math.max(140, Math.min(rect.height - 180, clientY - rect.top));
        app.style.setProperty("--mobile-canvas", h + "px");
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; fitViewport(); render(); });
    };
    const onMove = (e) => {
        if (!dragging) return;
        e.preventDefault();
        applyAt(e.touches ? e.touches[0].clientY : e.clientY);
    };
    const onUp = () => { dragging = false; };

    split.addEventListener("pointerdown", (e) => { dragging = true; e.preventDefault(); });
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
}

/** Desktop: drag the dividers flanking the canvas to resize the side panels.
 *  Each handle drives one grid column var (--left-w / --right-w). */
export function installPanelSplitters() {
    const app = $("#app");
    if (!app) return;

    const wire = (id, varName, fromRight) => {
        const handle = $("#" + id);
        if (!handle) return;
        let raf = 0;
        const applyAt = (clientX) => {
            const rect = app.getBoundingClientRect();
            const raw = fromRight ? rect.right - clientX : clientX - rect.left;
            const w = Math.max(160, Math.min(rect.width - 360, raw));
            app.style.setProperty(varName, w + "px");
            if (!raf) raf = requestAnimationFrame(() => { raf = 0; fitViewport(); render(); });
        };
        const onMove = (e) => applyAt(e.clientX);
        const onUp = () => {
            handle.classList.remove("dragging");
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        handle.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            handle.classList.add("dragging");
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
        });
    };

    wire("vsplitLeft", "--left-w", false);
    wire("vsplitRight", "--right-w", true);
}
