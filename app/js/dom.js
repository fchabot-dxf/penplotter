// DOM references and tiny UI primitives (toast).

export const $ = (sel) => document.querySelector(sel);

export const canvas = $("#canvas");
export const canvasWrap = $("#canvasWrap");
export const layersEl = $("#layers");
export const coordsEl = $("#coords");
export const docInfoEl = $("#docInfo");
export const toastEl = $("#toast");
export const dropOverlay = $("#dropOverlay");

export const SVG_NS = "http://www.w3.org/2000/svg";
export const INK_NS = "http://www.inkscape.org/namespaces/inkscape";

// Cloud Worker base URL — only used for save/load of palettes + projects.
// Set by the user via the Cloud settings dialog and persisted to
// localStorage. Empty string disables cloud features.
export const API_BASE = (typeof window !== "undefined")
    ? (window.__apiBase || localStorage.getItem("penplotter.cloudUrl") || "")
    : "";
export const api = (path) => API_BASE + path;

let toastTimer = null;
export function toast(msg, isError = false) {
    toastEl.textContent = msg;
    toastEl.classList.toggle("error", !!isError);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3000);
}
