import type { CameraConfig, LightConfig, SimConfig } from './types';
import { buildScene, type LightModel, type LightScene } from './light';
import { computeFrame, effectiveExposure, effectiveReadout, shutterAngle } from './exposure';

// ---------- small helpers ----------

export function formatShutter(exposure: number): string {
  const x = 1 / exposure;
  if (x >= 10) {
    const r = Math.round(x);
    if (Math.abs(x - r) < 0.05) return `1/${r}`;
    return `1/${x.toFixed(1)}`;
  }
  if (exposure >= 1) return `${exposure.toFixed(2)} s`;
  return `1/${x.toFixed(2)}`;
}

export function fmt(v: number, digits = 1): string {
  if (!isFinite(v)) return '—';
  return v.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function fmtHz(f: number): string {
  if (f >= 1000) return `${fmt(f / 1000, 2)} kHz`;
  return `${fmt(f, 2)} Hz`;
}

export function fmtMs(s: number): string {
  const ms = s * 1000;
  if (ms < 1) return `${fmt(ms * 1000, 0)} µs`;
  return `${fmt(ms, ms < 10 ? 2 : 1)} ms`;
}

/** |sinc| attenuation of a sinusoidal flicker component of frequency f by a box exposure Te. */
export function sincAttenuation(f: number, Te: number): number {
  const x = Math.PI * f * Te;
  if (x < 1e-9) return 1;
  return Math.abs(Math.sin(x) / x);
}

/** Signed alias (beat) frequency of f sampled at fps, in (−fps/2, fps/2]. */
export function aliasFrequency(f: number, fps: number): number {
  return f - fps * Math.round(f / fps);
}

/**
 * Contrast (Lmax−Lmin)/(Lmax+Lmin) of the exposure-averaged light as the
 * exposure start sweeps through all phases. This is the strongest band
 * contrast a rolling shutter (or frame-to-frame flicker a global shutter) can show.
 */
export function exposureContrast(scene: LightScene, Te: number): number {
  if (scene.models.length === 0) return 0;
  let window: number;
  let n: number;
  if (scene.models.length === 1) {
    window = scene.models[0].period;
    n = 400;
  } else {
    window = 1;
    n = 5000;
  }
  let max = -Infinity;
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * window;
    const v = scene.integral(t, t + Te) / Te;
    if (v > max) max = v;
    if (v < min) min = v;
  }
  return max + min > 0 ? (max - min) / (max + min) : 0;
}

export interface SimStats {
  /** Average within-frame band contrast (rolling shutter bands). */
  spatial: number;
  /** Contrast of mean frame brightness across frames (temporal flicker). */
  temporal: number;
  /** Overall visible modulation. */
  overall: number;
}

/** Run the actual simulation over many frames and measure what ends up in the video. */
export function simulateStats(scene: LightScene, cam: CameraConfig, frames = 60, rows = 240): SimStats {
  const buf = new Float32Array(rows);
  let spatialSum = 0;
  let fMax = -Infinity;
  let fMin = Infinity;
  let gMax = -Infinity;
  let gMin = Infinity;
  for (let n = 0; n < frames; n++) {
    computeFrame(scene, cam, n, buf);
    let mx = -Infinity;
    let mn = Infinity;
    let sum = 0;
    for (let r = 0; r < rows; r++) {
      const v = buf[r];
      if (v > mx) mx = v;
      if (v < mn) mn = v;
      sum += v;
    }
    spatialSum += mx + mn > 0 ? (mx - mn) / (mx + mn) : 0;
    const mean = sum / rows;
    if (mean > fMax) fMax = mean;
    if (mean < fMin) fMin = mean;
    if (mx > gMax) gMax = mx;
    if (mn < gMin) gMin = mn;
  }
  const spatial = spatialSum / frames;
  const temporal = fMax + fMin > 0 ? (fMax - fMin) / (fMax + fMin) : 0;
  const overall = gMax + gMin > 0 ? (gMax - gMin) / (gMax + gMin) : 0;
  return { spatial, temporal, overall };
}

// ---------- recommendations ----------

export const STANDARD_SHUTTERS = [25, 30, 33.3, 40, 48, 50, 60, 80, 100, 120, 125, 160, 200, 250, 400, 500, 1000];
export const STANDARD_FPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 100, 119.88, 120];

export interface ShutterOption {
  exposure: number;
  label: string;
  angle: number;
  contrast: number;
  cycles: number | null;
}

/** Candidate exposures: whole multiples of every flicker period, plus standard speeds. */
export function shutterOptions(scene: LightScene, fps: number, limit = 6): ShutterOption[] {
  const frameT = 1 / fps;
  const cands = new Set<number>();
  for (const s of STANDARD_SHUTTERS) if (1 / s <= frameT + 1e-9) cands.add(1 / s);
  for (const m of scene.models) {
    if (!m.fundamental) continue;
    for (let k = 1; k <= 200; k++) {
      const te = k / m.fundamental;
      if (te > frameT + 1e-9) break;
      cands.add(te);
    }
  }
  const fL = dominantModel(scene)?.fundamental ?? null;
  const out: ShutterOption[] = [...cands].map((te) => ({
    exposure: te,
    label: formatShutter(te),
    angle: 360 * te * fps,
    contrast: exposureContrast(scene, te),
    cycles: fL ? te * fL : null,
  }));
  // Prefer clean results; among equally clean ones prefer an angle near 180°.
  out.sort((a, b) => {
    const ca = Math.round(a.contrast * 200);
    const cb = Math.round(b.contrast * 200);
    if (ca !== cb) return ca - cb;
    return Math.abs(a.angle - 180) - Math.abs(b.angle - 180);
  });
  const seen = new Set<string>();
  return out.filter((o) => (seen.has(o.label) ? false : (seen.add(o.label), true))).slice(0, limit);
}

export interface FpsOption {
  fps: number;
  best: ShutterOption | null;
  alias: number | null;
  ratio: number | null;
}

export function fpsOptions(scene: LightScene): FpsOption[] {
  const fL = dominantModel(scene)?.fundamental ?? null;
  return STANDARD_FPS.map((fps) => {
    const best = shutterOptions(scene, fps, 1)[0] ?? null;
    return {
      fps,
      best,
      alias: fL ? aliasFrequency(fL, fps) : null,
      ratio: fL ? fL / fps : null,
    };
  });
}

/** The light that contributes the most flicker (intensity × modulation). */
export function dominantModel(scene: LightScene): LightModel | null {
  let best: LightModel | null = null;
  let score = 0;
  for (const m of scene.models) {
    if (!m.fundamental) continue;
    const s = (m.max - m.min) * 1;
    if (s > score) {
      score = s;
      best = m;
    }
  }
  return best;
}

// ---------- full analysis + explanation ----------

export type Verdict = 'clean' | 'subtle' | 'static_bands' | 'rolling_bands' | 'frame_flicker' | 'dark';

export interface Analysis {
  scene: LightScene;
  exposure: number;
  exposureClamped: boolean;
  readout: number;
  readoutClamped: boolean;
  angle: number;
  dominant: LightModel | null;
  fL: number | null;
  cycles: number | null;
  attenuation: number | null;
  bandsPerFrame: number | null;
  bandHeightPct: number | null;
  alias: number | null;
  phaseStepDeg: number | null;
  /** Band displacement per frame in fractions of frame height (negative = moving up). */
  driftPerFrame: number | null;
  driftDir: 'up' | 'down' | 'static' | 'strobing' | null;
  stats: SimStats;
  verdict: Verdict;
  verdictText: string;
  paragraphs: string[];
  recommendations: string[];
  shutterOpts: ShutterOption[];
  warnings: string[];
}

function lightReason(m: LightModel, cfg: LightConfig, acFreq: number): string {
  const f = acFreq;
  switch (cfg.type) {
    case 'incandescent':
      return cfg.rectification === 'full'
        ? `electrical power ∝ V² peaks twice per mains cycle (2 × ${f} = ${2 * f} Hz), and the filament's thermal mass smooths that down to about ${fmt(m.modDepth * 100)} % modulation`
        : `a half-wave diode dimmer passes only one half-cycle, so power pulses once per mains cycle (${f} Hz); the filament smooths it to about ${fmt(m.modDepth * 100)} % modulation`;
    case 'fluorescent':
      return `the arc current peaks twice per mains cycle (${2 * f} Hz) and briefly extinguishes near each zero crossing; phosphor persistence only partly fills the gaps (≈ ${fmt(m.modDepth * 100)} % modulation)`;
    case 'led_ac':
      return cfg.rectification === 'full'
        ? `its driver full-wave rectifies the ${f} Hz mains, producing two brightness pulses per cycle (2 × ${f} = ${2 * f} Hz), and the smoothing capacitor leaves ${fmt(m.modDepth * 100)} % modulation`
        : `its driver half-wave rectifies the mains, so there is only one pulse per cycle (${f} Hz) with ${fmt(m.modDepth * 100)} % modulation`;
    case 'led_pwm':
      return `the PWM dimmer switches the LED on and off at its own oscillator frequency (${fmtHz(cfg.pwmFreq)}, ${fmt(cfg.duty * 100)} % duty) — completely independent of the ${f} Hz mains`;
    case 'led_cc':
      return m.fundamental
        ? `the constant-current driver removes almost all ripple, leaving a residual ${fmt(m.modDepth * 100, 2)} % at ${2 * f} Hz`
        : `the constant-current driver delivers steady current, so the light output is constant`;
    case 'sine':
      return `it is an idealised sinusoidal source modulated at ${fmtHz(cfg.sineFreq)} with depth M = ${fmt(cfg.modDepth, 2)}`;
  }
}

export function analyze(config: SimConfig, scene?: LightScene): Analysis {
  const sc = scene ?? buildScene(config);
  const cam = config.camera;
  const Te = effectiveExposure(cam);
  const Tr = effectiveReadout(cam);
  const angle = shutterAngle(cam);
  const warnings: string[] = [];
  const exposureClamped = cam.exposure > 1 / cam.fps + 1e-9;
  if (exposureClamped)
    warnings.push(
      `A ${formatShutter(cam.exposure)} exposure is longer than the ${fmtMs(1 / cam.fps)} frame interval at ${fmt(cam.fps, 3)} fps. A real camera can't do this; the simulation clamps the exposure to ${formatShutter(Te)} (360°).`,
    );
  const readoutClamped = cam.shutterType === 'rolling' && cam.readoutMs / 1000 > 1 / cam.fps + 1e-9;
  if (readoutClamped)
    warnings.push(
      `The sensor readout (${fmt(cam.readoutMs)} ms) cannot be longer than the frame interval (${fmtMs(1 / cam.fps)}). It is clamped. Real cameras limit the frame rate, or crop the sensor, to keep up.`,
    );

  const dom = dominantModel(sc);
  const fL = dom?.fundamental ?? null;
  const stats = simulateStats(sc, cam);
  const rolling = cam.shutterType === 'rolling';

  let cycles: number | null = null;
  let attenuation: number | null = null;
  let bandsPerFrame: number | null = null;
  let bandHeightPct: number | null = null;
  let alias: number | null = null;
  let phaseStepDeg: number | null = null;
  let driftPerFrame: number | null = null;
  let driftDir: Analysis['driftDir'] = null;

  if (fL) {
    cycles = Te * fL;
    attenuation = sincAttenuation(fL, Te);
    alias = aliasFrequency(fL, cam.fps);
    phaseStepDeg = (360 * alias) / cam.fps;
    if (rolling && Tr > 0) {
      bandsPerFrame = fL * Tr;
      bandHeightPct = 100 / bandsPerFrame;
      const sign = cam.scanDir === 'down' ? -1 : 1;
      driftPerFrame = (sign * (alias / cam.fps)) / (fL * Tr);
    }
    if (Math.abs(alias) < 1e-6) driftDir = 'static';
    else if (Math.abs(Math.abs(phaseStepDeg) - 180) < 1) driftDir = 'strobing';
    else if (driftPerFrame !== null) driftDir = driftPerFrame < 0 ? 'up' : 'down';
  }

  const vis = Math.max(stats.spatial, stats.temporal);
  let verdict: Verdict;
  if (sc.mean <= 1e-6) verdict = 'dark';
  else if (vis < 0.01) verdict = 'clean';
  else if (vis < 0.04) verdict = 'subtle';
  else if (!rolling || stats.spatial < stats.temporal * 0.5) verdict = 'frame_flicker';
  else if (driftDir === 'static') verdict = 'static_bands';
  else verdict = 'rolling_bands';

  const verdictText: Record<Verdict, string> = {
    dark: 'No light in the scene',
    clean: 'No visible flicker',
    subtle: 'Subtle flicker (barely visible)',
    static_bands: 'Static horizontal bands',
    rolling_bands: `Bands crawling ${driftDir === 'up' ? 'upward' : driftDir === 'down' ? 'downward' : ''}`.trim(),
    frame_flicker: 'Whole-frame brightness flicker',
  };

  // --- explanation paragraphs ---
  const P: string[] = [];
  const f = config.supply.acFreq;
  const shutterTxt = `${formatShutter(Te)} s shutter (${fmtMs(Te)} exposure, ${fmt(angle, 0)}° shutter angle)`;
  if (sc.mean <= 1e-6) {
    P.push('All light sources are switched off or have zero intensity, so there is nothing to record.');
  } else if (!dom) {
    P.push(
      `You are filming at ${fmt(cam.fps, 3)} fps with a ${shutterTxt}. The light in the scene has no periodic modulation, so every row collects exactly the same amount of light no matter when it is exposed. There is nothing for the shutter to sample, so no bands can form, whatever your frame rate, shutter speed or readout time.`,
    );
  } else {
    const cfg = dom.cfg;
    P.push(
      `You are filming at ${fmt(cam.fps, 3)} fps with a ${shutterTxt} under the ${dom.label}. The mains is ${f} Hz, but the light flickers at ${fmtHz(fL!)} because ${lightReason(dom, cfg, f)}.`,
    );
    const others = sc.models.filter((m) => m !== dom && m.fundamental);
    if (others.length)
      P.push(
        `The scene also contains ${others
          .map((m) => `${m.label} flickering at ${fmtHz(m.fundamental!)} (${fmt(Te * m.fundamental!, 2)} cycles per exposure)`)
          .join(' and ')}. Light adds linearly, so each source leaves its own residual pattern. A shutter is only completely safe if it holds a whole number of cycles of every flickering source.`,
      );
    const c = cycles!;
    const whole = Math.floor(c + 1e-6);
    const frac = c - whole;
    if (frac < 0.015 || frac > 0.985) {
      P.push(
        `Each sensor row integrates light for ${fmtMs(Te)}, which is ${fmt(Math.round(c), 0)} complete light cycle${Math.round(c) === 1 ? '' : 's'} (${fmtMs(Te)} × ${fmtHz(fL!)}). A whole number of cycles always collects the same total light, whenever the exposure starts. The flicker cancels inside the integral, which is why this shutter speed is "safe" for this light.`,
      );
    } else if (c < 1) {
      P.push(
        `Each sensor row integrates light for only ${fmtMs(Te)}, which is ${fmt(c * 100, 0)} % of one light cycle (${fmtMs(1 / fL!)}). The exposure is too short to average the flicker. A row exposed during a brightness peak records much more light than a row exposed during a dip, so the fundamental flicker survives at about ${fmt(attenuation! * 100, 0)} % of its original strength.`,
      );
    } else {
      P.push(
        `Each sensor row integrates light for ${fmtMs(Te)} = ${fmt(c, 2)} light cycles. The ${whole} complete cycle${whole === 1 ? '' : 's'} average out, but the leftover ${fmt(frac, 2)} of a cycle does not. Rows whose leftover fraction lands on a peak end up brighter than rows whose leftover lands in a dip, so the flicker is reduced to about ${fmt(attenuation! * 100, 0)} % but not removed.`,
      );
    }
    if (rolling && Tr > 0) {
      const b = bandsPerFrame!;
      P.push(
        `This is a rolling shutter: the sensor takes ${fmtMs(Tr)} to read from the ${cam.scanDir === 'down' ? 'top' : 'bottom'} row to the ${cam.scanDir === 'down' ? 'bottom' : 'top'} row, so each row starts its exposure slightly later than the one before. Over the height of the frame the light goes through ${fmtHz(fL!)} × ${fmtMs(Tr)} = ${fmt(b, 2)} cycles. ${
          b >= 1
            ? `The image therefore holds about ${fmt(b, 1)} bright/dark band pairs, each about ${fmt(bandHeightPct!, 0)} % of the frame tall.`
            : `That is less than one full cycle, so instead of distinct bands you see a broad brightness gradient across the frame.`
        }${b > 0.4 * cam.rows ? ' The bands are finer than two sensor rows, so they alias into a fine moiré-like texture.' : ''}`,
      );
    } else {
      P.push(
        `${cam.shutterType === 'global' ? 'This is a global shutter: every row starts and stops exposing at the same instant.' : 'The readout time is zero, so all rows are exposed together.'} No bands can form inside a frame. The whole frame gets brighter or darker depending on where in the light cycle that frame's exposure falls.`,
      );
    }
    const ratio = fL! / cam.fps;
    if (driftDir === 'static') {
      P.push(
        `The light frequency is exactly ${fmt(ratio, 3)} × the frame rate, an integer. Every frame starts at the same point in the light cycle, so ${rolling ? 'the bands stand still in the picture' : 'every frame has the same brightness'}.`,
      );
    } else {
      const a = alias!;
      const moveTxt = rolling
        ? driftDir === 'strobing'
          ? 'the band pattern flips by half a band each frame, so it looks like it strobes rather than moves in one direction'
          : `the bands shift by ${fmt(Math.abs(driftPerFrame!) * 100, 1)} % of the frame height every frame, so they crawl ${driftDir} the picture at ${fmt(Math.abs(driftPerFrame!) * cam.fps, 2)} frame-heights per second. A given row brightens and darkens ${fmt(Math.abs(a), 2)} times per second`
        : `the whole frame's brightness pulses ${fmt(Math.abs(a), 2)} times per second`;
      P.push(
        `${fmtHz(fL!)} ÷ ${fmt(cam.fps, 3)} fps = ${fmt(ratio, 3)}, which is not a whole number. Each new frame starts ${fmt(Math.abs(phaseStepDeg!), 0)}° ${a > 0 ? 'later' : 'earlier'} in the light cycle than the previous one (the alias or "beat" frequency is ${fmt(a, 2)} Hz), so ${moveTxt}.`,
      );
    }
    const pct = (x: number) => `${fmt(x * 100, 1)} %`;
    P.push(
      `Measured from the simulated frames: within-frame band contrast ${pct(stats.spatial)}, frame-to-frame brightness variation ${pct(stats.temporal)}. ${
        verdict === 'clean'
          ? 'That is below the ~1 % level at which flicker becomes noticeable, so the footage looks clean.'
          : verdict === 'subtle'
            ? 'That is around the threshold of visibility. It may show up on flat walls or after grading.'
            : 'That is clearly visible in footage.'
      }`,
    );
    if (fL! >= 80)
      P.push(
        `You don't see this flicker with your own eyes because human flicker fusion is roughly 60–90 Hz: at ${fmtHz(fL!)} your eye perceives only the average brightness. The camera samples each row over a short window and records the variation.`,
      );
  }

  // --- recommendations ---
  const R: string[] = [];
  const opts = shutterOptions(sc, cam.fps, 5);
  if (dom && verdict !== 'clean') {
    const good = opts.filter((o) => o.contrast < 0.01);
    if (good.length) {
      R.push(
        `At ${fmt(cam.fps, 3)} fps these shutter speeds cancel the flicker: ${good
          .slice(0, 4)
          .map((o) => `${o.label} (${fmt(o.angle, 0)}°)`)
          .join(', ')}.`,
      );
    } else {
      R.push(
        `At ${fmt(cam.fps, 3)} fps the frame interval (${fmtMs(1 / cam.fps)}) ${
          fL && 1 / cam.fps < 1 / fL ? `is shorter than one light cycle (${fmtMs(1 / fL)}), so no exposure can hold a whole cycle` : 'does not allow an exposure that is a whole multiple of every flicker period'
        }. The least-bad option is ${opts[0] ? `${opts[0].label} (${fmt(opts[0].contrast * 100, 1)} % residual)` : 'a longer exposure'}. You could also lower the frame rate, or replace or turn off the flickering light.`,
      );
    }
    if (fL && driftDir !== 'static') {
      const staticFps = STANDARD_FPS.filter((x) => Math.abs(aliasFrequency(fL, x)) < 1e-6);
      if (staticFps.length)
        R.push(`To make any remaining bands stand still instead of crawling, pick a frame rate that divides ${fmtHz(fL)} exactly: ${staticFps.map((x) => `${x} fps`).join(', ')}.`);
    }
    if (dom.cfg.type === 'led_pwm' && dom.fundamental && dom.fundamental > 1000)
      R.push('High-frequency PWM is easier to fix with a slightly longer exposure, or by tuning the shutter in fine steps until the bands disappear.');
  } else if (dom && verdict === 'clean') {
    R.push(`These settings already cancel the ${fmtHz(fL!)} flicker. Keep the exposure at a whole multiple of ${fmtMs(1 / fL!)}.`);
  }

  return {
    scene: sc,
    exposure: Te,
    exposureClamped,
    readout: Tr,
    readoutClamped,
    angle,
    dominant: dom,
    fL,
    cycles,
    attenuation,
    bandsPerFrame,
    bandHeightPct,
    alias,
    phaseStepDeg,
    driftPerFrame,
    driftDir,
    stats,
    verdict,
    verdictText: verdictText[verdict],
    paragraphs: P,
    recommendations: R,
    shutterOpts: opts,
    warnings,
  };
}
