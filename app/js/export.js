// Export: serialize state to an SVG string, POST to /api/plot, download zip.

import { state } from "./state.js";
import { $, toast, api } from "./dom.js";
import { shapeToSvgString } from "./shapes.js";
import { expandLayerWithFill } from "./fill/index.js";
import { expandLayerOutline } from "./outline/index.js";

export function installExportButton() {
    $("#exportBtn").onclick = onExportClick;
}

async function onExportClick() {
    const btn = $("#exportBtn");
    if (state.layers.every(l => l.shapes.length === 0)) {
        return toast("Nothing to plot — draw or import something first.", true);
    }
    btn.disabled = true;
    btn.textContent = "Exporting…";
    try {
        const svg = buildExportSvg();
        const res = await fetch(api("/api/plot"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ svg, settings: state.settings }),
        });
        if (!res.ok) {
            let msg = `Export failed (${res.status})`;
            try {
                const err = await res.json();
                msg = err.error || msg;
                if (err.stderr) console.error("vpype stderr:", err.stderr);
            } catch {}
            throw new Error(msg);
        }
        const blob = await res.blob();
        downloadBlob(blob, "plotter_gcode.zip");
        toast("Exported plotter_gcode.zip");
    } catch (e) {
        toast(e.message, true);
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.textContent = "Export G-code (.zip)";
    }
}

export function buildExportSvg() {
    const lines = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"`);
    lines.push(`     width="${state.doc.w}mm" height="${state.doc.h}mm" viewBox="0 0 ${state.doc.w} ${state.doc.h}">`);
    let layerIdx = 0;
    for (const layer of state.layers) {
        if (!layer.export || layer.shapes.length === 0) continue;
        layerIdx++;
        const safeName = (layer.name || `layer_${layerIdx}`).replace(/[^a-z0-9_-]/gi, "_");
        // Outline style (dashed, jagged, multi-pass) — skipped entirely
        // for fill-only layers (drawOutline=false) so e.g. a "red (fill)"
        // layer outputs only the hatch lines, not the boundary outline.
        const outlineShapes = layer.drawOutline === false
            ? []
            : expandLayerOutline(layer.shapes, layer.outline);
        // Fill always uses the original shape list as boundary.
        const filled = expandLayerWithFill({ ...layer, shapes: layer.shapes });
        const fillOnly = filled.slice(layer.shapes.length);
        const finalShapes = [...outlineShapes, ...fillOnly];
        if (finalShapes.length === 0) continue;
        lines.push(`  <g inkscape:groupmode="layer" inkscape:label="${safeName}" id="layer_${layerIdx}" stroke="${layer.color}" fill="none" stroke-width="0.3">`);
        for (const s of finalShapes) lines.push("    " + shapeToSvgString(s));
        lines.push(`  </g>`);
    }
    lines.push(`</svg>`);
    return lines.join("\n");
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}
