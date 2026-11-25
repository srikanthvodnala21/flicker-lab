import type { LightConfig, LightType, SimConfig, SupplyConfig } from './types';

/**
 * Light-source models.
 *
 * Every source is a *periodic* function of time. We sample one period into a
 * table (TABLE_N midpoint samples) and pre-compute its cumulative integral.
 * The exposure integral ∫ L(t) dt over ANY interval [a, b] is then
 *
 *     F(b) − F(a),   F(t) = n·(area of one period) + (partial area inside period)
 *
 * which is exact for the piecewise-constant table, independent of how many
 * cycles the interval spans. This lets us integrate a PWM square wave, a
 * filtered rectified sine, etc. for thousands of sensor rows every frame.
 */

export const TABLE_N = 4096;

export const LIGHT_LABELS: Record<LightType, string> = {
  incandescent: 'Incandescent bulb',
  fluorescent: 'Fluorescent tube (magnetic ballast)',
  led_ac: 'LED on rectified AC (basic driver)',
  led_pwm: 'PWM-dimmed LED',
  led_cc: 'Flicker-free constant-current LED',
  sine: 'Ideal sinusoidal modulation',
};

export interface LightModel {
  cfg: LightConfig;
  label: string;
  /** Period of the stored table (s). */
  period: number;
  /** Table step (s). */
  dt: number;
  samples: Float64Array;
  /** cum[i] = ∫ from 0 to i·dt (length N+1). */
  cum: Float64Array;
  /** Area of one full period. */
  total: number;
  /** Time shift applied before lookup (s): L(t) = table((t + offset) mod period). */
  offset: number;
  mean: number;
  max: number;
  min: number;
  /** Fundamental flicker frequency of the LIGHT (Hz), null if constant. */
  fundamental: number | null;
  /** Percent flicker (Lmax − Lmin)/(Lmax + Lmin), 0..1. */
  modDepth: number;
  /** IES flicker index: area above mean / total area. */
  flickerIndex: number;
  /** True if the waveform is derived from (and phase-locked to) the mains. */
  mainsLocked: boolean;
}

const TWO_PI = Math.PI * 2;

/** Steady-state response of a first-order low-pass filter to a periodic drive. */
export function lowpassSteady(drive: Float64Array, dt: number, tau: number): Float64Array {
  const n = drive.length;
  const out = new Float64Array(n);
  if (tau <= 0) {
    out.set(drive);
    return out;
  }
  const a = Math.exp(-dt / tau);
  const b = 1 - a;
  // One period starting from y=0 gives y_N = S. Steady state y0 satisfies y0 = a^N y0 + S.
  let y = 0;
  for (let i = 0; i < n; i++) y = a * y + b * drive[i];
  const aN = Math.pow(a, n);
  y = aN < 1 ? y / (1 - aN) : y;
  for (let i = 0; i < n; i++) {
    y = a * y + b * drive[i];
    out[i] = y;
  }
  return out;
}

/** Fundamental frequency of the light output, derived from physics of each driver. */
export function lightFundamental(cfg: LightConfig, supply: SupplyConfig): number | null {
  const f = supply.acFreq;
  switch (cfg.type) {
    case 'incandescent':
      // Power ∝ v². Direct AC → v² has period 1/(2f). Half-wave diode dimmer → only one pulse per cycle.
      return cfg.rectification === 'full' ? 2 * f : f;
    case 'fluorescent':
      return 2 * f;
    case 'led_ac':
      return cfg.modDepth > 0 ? (cfg.rectification === 'full' ? 2 * f : f) : null;
    case 'led_pwm':
      return cfg.modDepth > 0 && cfg.duty > 0 && cfg.duty < 1 ? cfg.pwmFreq : null;
    case 'led_cc':
      return cfg.modDepth > 0 ? 2 * f : null;
    case 'sine':
      return cfg.modDepth > 0 ? cfg.sineFreq : null;
  }
}

export function isMainsLocked(type: LightType): boolean {
  return type === 'incandescent' || type === 'fluorescent' || type === 'led_ac' || type === 'led_cc';
}

export function buildLight(cfg: LightConfig, supply: SupplyConfig): LightModel {
  const N = TABLE_N;
  const f = supply.acFreq;
  const M = Math.min(1, Math.max(0, cfg.modDepth));
  const mainsLocked = isMainsLocked(cfg.type);

  let period: number;
  if (cfg.type === 'led_pwm') period = 1 / Math.max(1e-3, cfg.pwmFreq);
  else if (cfg.type === 'sine') period = 1 / Math.max(1e-3, cfg.sineFreq);
  else period = 1 / f;

  const dt = period / N;
  let s: Float64Array = new Float64Array(N);
  const rect = (x: number) => (cfg.rectification === 'full' ? Math.abs(x) : Math.max(x, 0));
  // Percent-flicker-preserving mapping of a 0..1 shape g onto [Lmin, 1]: Lmin = (1−M)/(1+M).
  const shape = (g: number) => (1 - M + 2 * M * g) / (1 + M);

  for (let i = 0; i < N; i++) {
    const ph = (i + 0.5) / N; // midpoint phase in [0,1)
    const sn = Math.sin(TWO_PI * ph);
    switch (cfg.type) {
      case 'incandescent': {
        const v = rect(sn);
        s[i] = v * v; // electrical power ∝ V²/R
        break;
      }
      case 'fluorescent': {
        // Arc extinguishes near voltage zero-crossings (simplified threshold), output ∝ |i|.
        const th = 0.15;
        s[i] = Math.max(Math.abs(sn) - th, 0) / (1 - th);
        break;
      }
      case 'led_ac':
        s[i] = shape(rect(sn));
        break;
      case 'led_pwm':
        s[i] = ph < cfg.duty ? 1 : (1 - M) / (1 + M);
        break;
      case 'led_cc':
        // Residual ripple at 2× mains from imperfect output filtering.
        s[i] = shape(0.5 + 0.5 * Math.cos(TWO_PI * 2 * ph));
        break;
      case 'sine':
        s[i] = shape(0.5 + 0.5 * Math.cos(TWO_PI * ph));
        break;
    }
  }

  if (cfg.type === 'incandescent') s = lowpassSteady(s, dt, Math.max(0, cfg.thermalTauMs) / 1000);
  if (cfg.type === 'fluorescent') s = lowpassSteady(s, dt, Math.max(0, cfg.phosphorTauMs) / 1000);

  // Normalise peak to 1, then scale by intensity.
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, s[i]);
  const k = peak > 0 ? cfg.intensity / peak : 0;
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  for (let i = 0; i < N; i++) {
    s[i] *= k;
    sum += s[i];
    if (s[i] > max) max = s[i];
    if (s[i] < min) min = s[i];
  }
  const mean = sum / N;
  const cum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + s[i] * dt;
  let above = 0;
  for (let i = 0; i < N; i++) above += Math.max(0, s[i] - mean);
  const flickerIndex = sum > 0 ? above / sum : 0;
  const modDepth = max + min > 0 ? (max - min) / (max + min) : 0;

  const phaseTotal = cfg.phaseDeg + (mainsLocked ? supply.phaseDeg : 0);
  const offset = (((phaseTotal / 360) % 1) + 1) % 1 * period;

  const fundamental = modDepth > 1e-6 ? lightFundamental(cfg, supply) : null;

  return {
    cfg,
    label: LIGHT_LABELS[cfg.type],
    period,
    dt,
    samples: s,
    cum,
    total: cum[N],
    offset,
    mean,
    max,
    min,
    fundamental,
    modDepth,
    flickerIndex,
    mainsLocked,
  };
}

/** ∫₀ᵗ L(τ) dτ for a single light (exact for the table). */
export function cumulative(m: LightModel, t: number): number {
  const x = (t + m.offset) / m.period;
  const n = Math.floor(x);
  const r = (x - n) * TABLE_N;
  let i = Math.floor(r);
  if (i >= TABLE_N) i = TABLE_N - 1;
  const fr = r - i;
  return n * m.total + m.cum[i] + fr * m.samples[i] * m.dt;
}

export function valueAt(m: LightModel, t: number): number {
  const x = (t + m.offset) / m.period;
  const r = (x - Math.floor(x)) * TABLE_N;
  let i = Math.floor(r);
  if (i >= TABLE_N) i = TABLE_N - 1;
  return m.samples[i];
}

/** A set of lights illuminating the scene. Light adds linearly. */
export interface LightScene {
  models: LightModel[];
  mean: number;
  max: number;
  min: number;
  modDepth: number;
  valueAt(t: number): number;
  /** ∫ₐᵇ L dt */
  integral(a: number, b: number): number;
  /** Average over [a, b]. */
  average(a: number, b: number): number;
}

export function buildScene(cfg: Pick<SimConfig, 'supply' | 'lights'>): LightScene {
  const models = cfg.lights.filter((l) => l.enabled).map((l) => buildLight(l, cfg.supply));
  const valueAtFn = (t: number) => {
    let v = 0;
    for (const m of models) v += valueAt(m, t);
    return v;
  };
  const integral = (a: number, b: number) => {
    let v = 0;
    for (const m of models) v += cumulative(m, b) - cumulative(m, a);
    return v;
  };
  let mean = 0;
  for (const m of models) mean += m.mean;
  let max: number;
  let min: number;
  if (models.length === 0) {
    max = 0;
    min = 0;
  } else if (models.length === 1) {
    max = models[0].max;
    min = models[0].min;
  } else {
    // Sample the combined waveform over one second (covers beat patterns).
    max = -Infinity;
    min = Infinity;
    const n = 40000;
    for (let i = 0; i < n; i++) {
      const v = valueAtFn(i / n);
      if (v > max) max = v;
      if (v < min) min = v;
    }
  }
  return {
    models,
    mean,
    max,
    min,
    modDepth: max + min > 0 ? (max - min) / (max + min) : 0,
    valueAt: valueAtFn,
    integral,
    average: (a, b) => (b > a ? integral(a, b) / (b - a) : valueAtFn(a)),
  };
}

/** Instantaneous mains voltage (V). */
export function mainsVoltage(supply: SupplyConfig, t: number): number {
  const vpk = supply.voltageRms * Math.SQRT2;
  return vpk * Math.sin(TWO_PI * (supply.acFreq * t + supply.phaseDeg / 360));
}
