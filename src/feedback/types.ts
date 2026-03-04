/** Every discrete feedback-worthy event in the app. */
export enum FeedbackEvent {
  // Confirmatory (short pulse)
  SatelliteSelected   = 'satellite-selected',
  SatelliteDeselected = 'satellite-deselected',
  ToggleChanged       = 'toggle-changed',
  ViewModeSwitch      = 'view-mode-switch',
  ShortcutActivated   = 'shortcut-activated',

  // Attention / lock (distinct, medium)
  CameraLockSat       = 'camera-lock-sat',
  BeamLock            = 'beam-lock',
  BeamUnlock          = 'beam-unlock',
  PlanetClick         = 'planet-click',

  // Continuous / scrub (throttled by store)
  ObserverDrag        = 'observer-drag',
  OrbitScrub          = 'orbit-scrub',
  TimeScrub           = 'time-scrub',
  BeamAimDrag         = 'beam-aim-drag',

  // State events
  SatBelowHorizon     = 'sat-below-horizon',
  TimeWarpComplete    = 'time-warp-complete',
  PassPredictionDone  = 'pass-prediction-done',
  TLELoaded           = 'tle-loaded',
}

export interface AudioEffect {
  type: 'click' | 'tone' | 'sweep' | 'blip' | 'chirp';
  freq?: number;
  freqEnd?: number;
  duration?: number;
  volume?: number;
}

export interface FeedbackEffect {
  haptic?: number[];
  audio?: AudioEffect;
  buttplug?: { intensity: number; durationMs?: number };
}

/** Static mapping from event to effect recipe. */
export const FEEDBACK_MAP: Record<FeedbackEvent, FeedbackEffect> = {
  // Confirmatory
  [FeedbackEvent.SatelliteSelected]:   { haptic: [30],         audio: { type: 'click', volume: 0.3 },                                          buttplug: { intensity: 0.2, durationMs: 100 } },
  [FeedbackEvent.SatelliteDeselected]: { haptic: [20],         audio: { type: 'click', volume: 0.15 },                                         buttplug: { intensity: 0.1, durationMs: 80 } },
  [FeedbackEvent.ToggleChanged]:       { haptic: [15],         audio: { type: 'click', volume: 0.2 },                                          buttplug: { intensity: 0.1, durationMs: 50 } },
  [FeedbackEvent.ViewModeSwitch]:      { haptic: [40],         audio: { type: 'tone', freq: 660, duration: 0.08, volume: 0.2 },                 buttplug: { intensity: 0.3, durationMs: 150 } },
  [FeedbackEvent.ShortcutActivated]:   { haptic: [15],         audio: { type: 'click', volume: 0.15 } },

  // Attention / lock
  [FeedbackEvent.CameraLockSat]:       { haptic: [50, 30, 50], audio: { type: 'tone', freq: 880, duration: 0.12, volume: 0.3 },                buttplug: { intensity: 0.5, durationMs: 300 } },
  [FeedbackEvent.BeamLock]:            { haptic: [60, 40, 60], audio: { type: 'chirp', freq: 440, freqEnd: 880, duration: 0.15, volume: 0.3 },  buttplug: { intensity: 0.6, durationMs: 400 } },
  [FeedbackEvent.BeamUnlock]:          { haptic: [40],         audio: { type: 'tone', freq: 330, duration: 0.1, volume: 0.2 },                  buttplug: { intensity: 0.2, durationMs: 150 } },
  [FeedbackEvent.PlanetClick]:         { haptic: [50],         audio: { type: 'blip', freq: 550, duration: 0.1, volume: 0.25 },                 buttplug: { intensity: 0.4, durationMs: 200 } },

  // Continuous (throttled at store level, minimal per-tick)
  [FeedbackEvent.ObserverDrag]:        { haptic: [5] },
  [FeedbackEvent.OrbitScrub]:          { haptic: [5] },
  [FeedbackEvent.TimeScrub]:           { haptic: [5] },
  [FeedbackEvent.BeamAimDrag]:         { haptic: [5] },

  // State events
  [FeedbackEvent.SatBelowHorizon]:     { haptic: [20, 10, 20], audio: { type: 'tone', freq: 220, duration: 0.2, volume: 0.15 } },
  [FeedbackEvent.TimeWarpComplete]:    { haptic: [30],         audio: { type: 'blip', freq: 660, duration: 0.08, volume: 0.2 } },
  [FeedbackEvent.PassPredictionDone]:  { haptic: [25],         audio: { type: 'chirp', freq: 550, freqEnd: 770, duration: 0.1, volume: 0.2 } },
  [FeedbackEvent.TLELoaded]:           { haptic: [20],         audio: { type: 'blip', freq: 770, duration: 0.06, volume: 0.15 } },
};

/** Set of events that are throttled as continuous (drag/scrub). */
export const CONTINUOUS_EVENTS = new Set<string>([
  FeedbackEvent.ObserverDrag,
  FeedbackEvent.OrbitScrub,
  FeedbackEvent.TimeScrub,
  FeedbackEvent.BeamAimDrag,
]);
