// Tiny event bus. Modules subscribe to named events, host emits them.
// Used to decouple UI panels from the plotter core without a heavyweight
// framework. Currently unused in v0 but stubbed for M2.

export class EventBus {
  constructor() { this._listeners = new Map(); }

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this._listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    for (const h of this._listeners.get(event) || []) {
      try { h(payload); } catch (e) {
        console.error(`[EventBus] handler for "${event}" threw:`, e);
      }
    }
  }
}
