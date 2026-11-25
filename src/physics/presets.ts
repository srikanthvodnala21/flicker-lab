import type { CameraConfig, LightConfig, SimConfig } from './types';

let idCounter = 0;
export const newId = () => `L${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function defaultLight(over: Partial<LightConfig> = {}): LightConfig {
  return {
    id: newId(),
    type: 'led_ac',
    enabled: true,
    rectification: 'full',
    pwmFreq: 400,
    duty: 0.5,
    modDepth: 0.8,
    intensity: 1,
    sineFreq: 100,
    phaseDeg: 0,
    thermalTauMs: 15,
    phosphorTauMs: 4,
    ...over,
  };
}

export interface CameraPreset {
  id: string;
  name: string;
  note: string;
  apply: Partial<CameraConfig>;
}

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'generic',
    name: 'Generic CMOS camera',
    note: 'Typical consumer CMOS rolling shutter, ~16 ms readout.',
    apply: { readoutMs: 16, rows: 1080, shutterType: 'rolling' },
  },
  {
    id: 'fx30_4k',
    name: 'Sony FX30 — 4K 24/25/30p (6K oversampled)',
    note: 'Full-width APS-C readout. Published measurements are roughly 20–25 ms; ~22 ms is used here. Measure your own body with the band-counting tool on the Tools page.',
    apply: { readoutMs: 22, rows: 2160, shutterType: 'rolling' },
  },
  {
    id: 'fx30_4k60',
    name: 'Sony FX30 — 4K 50/60p (1.6× crop)',
    note: 'The crop reads fewer sensor rows, so readout is faster (~15 ms assumed). Approximate; adjust to match your footage.',
    apply: { readoutMs: 15, rows: 2160, shutterType: 'rolling' },
  },
  {
    id: 'fx30_120',
    name: 'Sony FX30 — 4K/HD 100/120p',
    note: 'High-frame-rate modes need a fast readout (must be shorter than 1/120 s ≈ 8.3 ms); ~8 ms assumed.',
    apply: { readoutMs: 8, rows: 2160, shutterType: 'rolling' },
  },
  {
    id: 'phone',
    name: 'Smartphone (typical)',
    note: 'Small stacked sensors are often 10–20 ms; varies a lot with mode.',
    apply: { readoutMs: 12, rows: 2160, shutterType: 'rolling' },
  },
  {
    id: 'stacked',
    name: 'Fast stacked sensor (~4 ms)',
    note: 'High-end stacked CMOS with very fast readout.',
    apply: { readoutMs: 4, rows: 2160, shutterType: 'rolling' },
  },
  {
    id: 'global',
    name: 'Global-shutter camera',
    note: 'All rows exposed simultaneously (e.g. machine-vision or global-shutter cinema sensors).',
    apply: { readoutMs: 0, rows: 1080, shutterType: 'global' },
  },
  { id: 'custom', name: 'Custom', note: 'Your own settings.', apply: {} },
];

export function defaultCamera(over: Partial<CameraConfig> = {}): CameraConfig {
  return {
    presetId: 'fx30_4k',
    fps: 25,
    exposure: 1 / 200,
    readoutMs: 22,
    rows: 2160,
    shutterType: 'rolling',
    scanDir: 'down',
    autoExposure: true,
    ...over,
  };
}

export function defaultConfig(): SimConfig {
  return {
    supply: { acFreq: 50, voltageRms: 230, phaseDeg: 0 },
    lights: [defaultLight()],
    camera: defaultCamera(),
  };
}

export const FPS_CHOICES = [24, 25, 30, 50, 60, 100];
export const SHUTTER_CHOICES = [25, 50, 60, 100, 120, 200, 250, 500, 1000];

export function cloneConfig(c: SimConfig): SimConfig {
  return JSON.parse(JSON.stringify(c));
}

// ---------------- Experiments ----------------

export interface Experiment {
  id: string;
  title: string;
  setup: string[];
  observe: string;
  explanation: string[];
  configA: SimConfig;
  configB?: SimConfig;
  labels?: [string, string];
}

const ledAC = (over: Partial<LightConfig> = {}) => defaultLight({ type: 'led_ac', rectification: 'full', modDepth: 0.8, ...over });
const fx30 = (over: Partial<CameraConfig> = {}) => defaultCamera({ presetId: 'fx30_4k', readoutMs: 22, rows: 2160, ...over });
const cfg = (lights: LightConfig[], camera: CameraConfig, acFreq = 50): SimConfig => ({
  supply: { acFreq, voltageRms: acFreq === 50 ? 230 : 120, phaseDeg: 0 },
  lights,
  camera,
});

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'e1',
    title: '1 · The "safe" baseline: 25 fps at 1/50 s',
    setup: ['50 Hz mains, full-wave rectified LED', '100 Hz light ripple (80 % depth)', '25 fps, 1/50 s shutter', 'Rolling shutter, 22 ms readout (FX30 4K)'],
    observe: 'The image is clean even though the light is flickering heavily. Look at the oscilloscope: every exposure window holds exactly two light pulses.',
    explanation: [
      '1/50 s = 20 ms. At 100 Hz one light cycle lasts 10 ms, so every row integrates exactly 2 complete cycles.',
      'An integral over whole cycles is the same wherever it starts, so every row gets the same light even though each row starts at a different time. The rolling shutter has nothing to reveal.',
      'This is why 1/50 s (and 1/100 s, 1/25 s) is the standard advice for 50 Hz countries such as India.',
    ],
    configA: cfg([ledAC()], fx30({ fps: 25, exposure: 1 / 50 })),
  },
  {
    id: 'e2',
    title: '2 · Fast shutter: 25 fps at 1/200 s',
    setup: ['Same 100 Hz LED lighting', '25 fps, 1/200 s shutter'],
    observe: 'Strong horizontal bands appear and they do not move.',
    explanation: [
      '1/200 s = 5 ms is only half a light cycle. A row exposed during a peak gets much more light than one exposed in a trough.',
      'The rolling shutter starts each row a little later. Across the 22 ms readout the light completes 100 × 0.022 = 2.2 cycles, so you see about 2.2 bright/dark band pairs.',
      '100 Hz ÷ 25 fps = 4 exactly, so every frame starts at the same light phase. The bands are frozen in place.',
    ],
    configA: cfg([ledAC()], fx30({ fps: 25, exposure: 1 / 200 })),
  },
  {
    id: 'e3',
    title: '3 · Changing frame rate: 30 fps at 1/50 s (vs 1/60 s)',
    setup: ['Same 100 Hz LED lighting', 'A: 30 fps, 1/50 s', 'B: 30 fps, 1/60 s (the usual 180° choice for 30p)'],
    observe: 'A is clean. B shows bands rolling through the frame.',
    explanation: [
      'Frame rate alone does not cause banding. At 30 fps with 1/50 s each row still integrates exactly 2 light cycles, so A is clean.',
      'Most people shooting 30p use 1/60 s (the 180° rule). 1/60 s = 16.7 ms = 1.67 cycles of 100 Hz, so a residual survives.',
      '100 ÷ 30 = 3.33 is not an integer. Each frame starts 120° further along the light cycle, so the bands crawl (10 Hz beat). This is the typical "moving bands" seen when 60 Hz-country settings are used in a 50 Hz country.',
    ],
    configA: cfg([ledAC()], fx30({ fps: 30, exposure: 1 / 50 })),
    configB: cfg([ledAC()], fx30({ fps: 30, exposure: 1 / 60 })),
    labels: ['30 fps · 1/50', '30 fps · 1/60'],
  },
  {
    id: 'e4',
    title: '4 · PWM-dimmed LED at 400 Hz, 50 % duty',
    setup: ['50 Hz mains, but the LED is PWM-dimmed at 400 Hz', '50 % duty cycle, 100 % depth', 'A: 25 fps, 1/50 s', 'B: 25 fps, 1/500 s'],
    observe: 'A is clean: 20 ms holds exactly 8 PWM cycles. B shows many thin, hard-edged bands (400 Hz × 22 ms ≈ 8.8 bands).',
    explanation: [
      'A PWM driver flickers at its own oscillator frequency. The 50 Hz mains tells you nothing about it.',
      'The light is a square wave, not a sine. With a short exposure each row sees either mostly ON or mostly OFF time, which gives sharp-edged bands.',
      '1/50 s still works because 20 ms × 400 Hz = 8 whole cycles. 1/500 s = 2 ms = 0.8 cycles does not.',
      '400 ÷ 25 = 16 exactly, so the bands are static. Try 24 fps in the camera panel and the bands start to move.',
    ],
    configA: cfg([defaultLight({ type: 'led_pwm', pwmFreq: 400, duty: 0.5, modDepth: 1 })], fx30({ fps: 25, exposure: 1 / 50 })),
    configB: cfg([defaultLight({ type: 'led_pwm', pwmFreq: 400, duty: 0.5, modDepth: 1 })], fx30({ fps: 25, exposure: 1 / 500 })),
    labels: ['PWM 400 Hz · 1/50', 'PWM 400 Hz · 1/500'],
  },
  {
    id: 'e5',
    title: '5 · Sensor readout time changes band spacing',
    setup: ['100 Hz LED ripple', '25 fps, 1/200 s', 'A: 8 ms readout (fast sensor)', 'B: 30 ms readout (slow sensor)'],
    observe: 'A shows less than one band (a gradient). B shows about 3 band pairs.',
    explanation: [
      'The number of bands per frame = light frequency × readout time.',
      'A: 100 Hz × 8 ms = 0.8 cycles, a single broad gradient. B: 100 Hz × 30 ms = 3 cycles, three band pairs.',
      'Readout time does NOT change whether flicker is captured; that depends on exposure. It changes how the flicker is spread across the frame.',
      'This gives you a way to measure your camera: shoot a 100 Hz light at a fast shutter, count the band pairs N, and readout ≈ N / 100 s.',
    ],
    configA: cfg([ledAC()], fx30({ fps: 25, exposure: 1 / 200, readoutMs: 8, presetId: 'custom' })),
    configB: cfg([ledAC()], fx30({ fps: 25, exposure: 1 / 200, readoutMs: 30, presetId: 'custom' })),
    labels: ['Readout 8 ms', 'Readout 30 ms'],
  },
  {
    id: 'e6',
    title: '6 · Global shutter vs rolling shutter',
    setup: ['100 Hz LED ripple', '30 fps, 1/200 s', 'A: rolling shutter (22 ms)', 'B: global shutter'],
    observe: 'A shows moving bands. B shows no bands, but the whole frame pulses brighter and darker.',
    explanation: [
      'A global shutter exposes every row in the same window, so the spatial pattern disappears.',
      'The flicker is still sampled once per frame. At 30 fps against 100 Hz the start phase shifts 120° each frame, so whole frames alternate in brightness (10 Hz beat).',
      'A global shutter turns banding into whole-frame flicker. It does not remove it. Only the exposure duration can do that.',
    ],
    configA: cfg([ledAC()], fx30({ fps: 30, exposure: 1 / 200 })),
    configB: cfg([ledAC()], fx30({ fps: 30, exposure: 1 / 200, shutterType: 'global', readoutMs: 0, presetId: 'global' })),
    labels: ['Rolling shutter', 'Global shutter'],
  },
  {
    id: 'e7',
    title: '7 · Flickering LED vs flicker-free LED',
    setup: ['Same camera: 25 fps, 1/500 s (very fast)', 'A: cheap LED, 100 % ripple at 100 Hz', 'B: constant-current flicker-free LED'],
    observe: 'A shows deep bands. B is perfectly clean at any shutter speed.',
    explanation: [
      'With a constant light, L(t) is flat, so the integral over any window is the same and no camera setting can produce bands.',
      'A good LED driver regulates the current with enough filtering that ripple is negligible. Two LED bulbs on the same 50 Hz supply can behave completely differently.',
      'Lights sold for video ("flicker-free", high-frequency PWM above ~20 kHz, or DC-driven) are worth it for indoor work.',
    ],
    configA: cfg([ledAC({ modDepth: 1 })], fx30({ fps: 25, exposure: 1 / 500 })),
    configB: cfg([defaultLight({ type: 'led_cc', modDepth: 0 })], fx30({ fps: 25, exposure: 1 / 500 })),
    labels: ['Ripple LED', 'Flicker-free LED'],
  },
];
