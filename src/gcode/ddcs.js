// DDCS Expert 1.1 dialect — codes verified against M350 firmware.
//
// QUIRKS to avoid:
//   G10  — broken on DDCS (offsets), avoid entirely
//   G28  — not configured on the Ultimate Bee; will home unpredictably
//
// SAFE to use:
//   G53  — VERIFIED working, but must be its own line with no trailing modifiers
//   G92  — works but use sparingly
//   G0, G1, G4, G21, G90, G94 — standard, no surprises
//   M0   — pause (for manual pen swap on multi-color jobs)
//   M30  — end of program

export const DIALECT = {
  units: 'mm',
  decimals: 3,
  coordMode: 'absolute',
};

// Default tunables. Each is exposed in the parameter panel; presets just
// flip several of these at once.
export const DEFAULTS = {
  // Pen
  tipWidth:        0.5,    // mm — physical pen tip width

  // Z heights
  penUpZ:          5.0,    // mm above paper — clears jigs/clamps
  penDownZ:       -1.5,    // mm below paper — spring overtravel = pressure

  // Feeds
  drawFeed:       2000,    // mm/min — pen drawing speed
  rapidFeed:      5000,    // mm/min — pen-up travel speed
  penLiftFeed:    1000,    // mm/min — Z up
  penDropFeed:     800,    // mm/min — Z down

  // Timing
  dwellAfterDown:  0.0,    // seconds — let ink start flowing (try 0.2 if dry start)

  // Hatch (auto-fill closed shapes that have a fill attribute)
  hatchEnabled:   false,
  hatchAngle:       45,    // degrees
  hatchSpacing:   0.35,    // mm — ≈ tipWidth × 0.7 at default tip
  hatchInset:     0.25,    // mm — ≈ tipWidth × 0.5 at default tip (keeps ink inside outline)
};

// Pen presets — flip several params at once. Selector in the UI calls
// applyPreset(name); each preset is a partial override merged into params.
//
// Tip-width-derived defaults (hatchSpacing, hatchInset) are precomputed here
// rather than recomputed at preset-apply time, so users can override after
// applying and not be surprised by recomputation.
export const PRESETS = {
  fineliner: {
    label: 'Fineliner (0.5 mm)',
    params: {
      tipWidth: 0.5,
      penDownZ: -1.5,
      drawFeed: 2500,
      hatchSpacing: 0.35,
      hatchInset: 0.25,
    },
  },
  brush: {
    label: 'Brush pen (~2 mm)',
    params: {
      tipWidth: 2.0,
      penDownZ: -1.0,
      drawFeed: 1500,
      hatchSpacing: 1.4,
      hatchInset: 1.0,
    },
  },
  marker: {
    label: 'Marker (5 mm)',
    params: {
      tipWidth: 5.0,
      penDownZ: -0.8,
      drawFeed: 900,
      hatchSpacing: 3.5,
      hatchInset: 2.5,
    },
  },
};
