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

// API base URL. When the app is loaded directly from the Flask server
// (port 5005) it's same-origin and we use a relative path. When loaded
// from a dev server (e.g. VS Code Live Server on :5500), we fall back to
// the Flask backend on :5005 — flask-cors is enabled so cross-origin
// works. Override by setting window.__apiBase before this module loads.
export const API_BASE = (function () {
    if (typeof window !== "undefined" && window.__apiBase) return window.__apiBase;
    const sameOrigin = location.port === "5005" || location.port === "";
    return sameOrigin ? "" : "http://127.0.0.1:5005";
})();
export const api = (path) => API_BASE + path;

let toastTimer = null;
export function toast(msg, isError = false) {
    toastEl.textContent = msg;
    toastEl.classList.toggle("error", !!isError);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3000);
}
