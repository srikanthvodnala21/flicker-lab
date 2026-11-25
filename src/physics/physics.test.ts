import { describe, expect, it } from 'vitest';
import { buildLight, buildScene, cumulative } from './light';
import { computeFrame } from './exposure';
import { aliasFrequency, analyze, exposureContrast, simulateStats } from './analysis';
import { defaultCamera, defaultConfig, defaultLight, EXPERIMENTS } from './presets';
import type { SimConfig } from './types';

const supply50 = { acFreq: 50, voltageRms: 230, phaseDeg: 0 };

function withCam(over: Partial<SimConfig['camera']>, light = defaultLight()): SimConfig {
  return { supply: supply50, lights: [light], camera: defaultCamera(over) };
}

describe('light models', () => {
  it('full-wave LED on 50 Hz flickers at 100 Hz, half-wave at 50 Hz', () => {
    expect(buildLight(defaultLight({ rectification: 'full' }), supply50).fundamental).toBe(100);
    expect(buildLight(defaultLight({ rectification: 'half' }), supply50).fundamental).toBe(50);
  });

  it('PWM frequency is independent of mains', () => {
    const m = buildLight(defaultLight({ type: 'led_pwm', pwmFreq: 400, duty: 0.25, modDepth: 1 }), supply50);
    expect(m.fundamental).toBe(400);
    expect(m.mean).toBeCloseTo(0.25, 3); // duty sets average brightness
    expect(m.min).toBe(0);
  });

  it('modulation depth equals percent flicker', () => {
    const m = buildLight(defaultLight({ type: 'sine', sineFreq: 100, modDepth: 0.3 }), supply50);
    expect(m.modDepth).toBeCloseTo(0.3, 4);
  });

  it('constant-current LED is constant', () => {
    const m = buildLight(defaultLight({ type: 'led_cc', modDepth: 0 }), supply50);
    expect(m.fundamental).toBeNull();
    expect(m.max - m.min).toBeLessThan(1e-12);
  });

  it('incandescent and fluorescent have realistic ripple', () => {
    const inc = buildLight(defaultLight({ type: 'incandescent', thermalTauMs: 15 }), supply50);
    const flu = buildLight(defaultLight({ type: 'fluorescent', phosphorTauMs: 4 }), supply50);
    expect(inc.modDepth).toBeGreaterThan(0.05);
    expect(inc.modDepth).toBeLessThan(0.2);
    expect(flu.modDepth).toBeGreaterThan(0.2);
    expect(flu.modDepth).toBeLessThan(0.8);
  });

  it('cumulative integral is exact across many periods', () => {
    const m = buildLight(defaultLight({ type: 'led_pwm', pwmFreq: 400, duty: 0.5, modDepth: 1 }), supply50);
    // 1 second = 400 cycles each with 0.5 * 2.5 ms of ON time
    expect(cumulative(m, 1.0) - cumulative(m, 0)).toBeCloseTo(0.5, 6);
  });
});

describe('exposure integration', () => {
  it('1/50 s cancels 100 Hz flicker, 1/200 s does not', () => {
    const scene = buildScene(withCam({}));
    expect(exposureContrast(scene, 1 / 50)).toBeLessThan(1e-3);
    expect(exposureContrast(scene, 1 / 100)).toBeLessThan(1e-3);
    expect(exposureContrast(scene, 1 / 200)).toBeGreaterThan(0.2);
  });

  it('global shutter produces uniform rows', () => {
    const c = withCam({ shutterType: 'global', exposure: 1 / 500 });
    const scene = buildScene(c);
    const out = new Float32Array(100);
    computeFrame(scene, c.camera, 3, out);
    expect(Math.max(...out) - Math.min(...out)).toBeLessThan(1e-9);
  });

  it('band count = light frequency × readout', () => {
    const c = withCam({ exposure: 1 / 1000, readoutMs: 30, rows: 3000, fps: 25 }, defaultLight({ type: 'sine', sineFreq: 100, modDepth: 0.5 }));
    const scene = buildScene(c);
    const R = 3000;
    const out = new Float32Array(R);
    computeFrame(scene, c.camera, 0, out);
    // Count local maxima
    let peaks = 0;
    for (let r = 1; r < R - 1; r++) if (out[r] > out[r - 1] && out[r] >= out[r + 1]) peaks++;
    expect(peaks).toBeGreaterThanOrEqual(2);
    expect(peaks).toBeLessThanOrEqual(4); // 3 cycles → ~3 peaks
  });

  it('bands static when f/fps integer, moving otherwise; drift direction matches simulation', () => {
    const light = defaultLight({ type: 'sine', sineFreq: 100, modDepth: 0.5 });
    const s25 = simulateStats(buildScene(withCam({ fps: 25, exposure: 1 / 500 }, light)), defaultCamera({ fps: 25, exposure: 1 / 500 }));
    expect(s25.temporal).toBeLessThan(1e-3); // static frames
    expect(aliasFrequency(100, 30)).toBeCloseTo(10, 9);
    expect(aliasFrequency(100, 24)).toBeCloseTo(4, 9);
    expect(aliasFrequency(100, 60)).toBeCloseTo(-20, 9);

    // Verify predicted drift by tracking the crest between consecutive frames.
    for (const fps of [24, 60]) {
      const c = withCam({ fps, exposure: 1 / 1000, readoutMs: 15, rows: 2000 }, light);
      const scene = buildScene(c);
      const a = analyze(c, scene);
      const R = 2000;
      const f0 = new Float32Array(R);
      const f1 = new Float32Array(R);
      computeFrame(scene, c.camera, 0, f0);
      computeFrame(scene, c.camera, 1, f1);
      // best shift by brute-force correlation (rows), within ± half a band
      const bandRows = R / (100 * 0.015);
      let best = 0;
      let bestErr = Infinity;
      for (let s = -Math.floor(bandRows / 2); s <= Math.floor(bandRows / 2); s++) {
        let e = 0;
        for (let r = 700; r < R - 700; r++) e += (f1[r] - f0[r - s]) ** 2;
        if (e < bestErr) {
          bestErr = e;
          best = s;
        }
      }
      const predicted = a.driftPerFrame! * R;
      expect(Math.abs(best - predicted)).toBeLessThan(3);
    }
  });

  it('every predefined experiment analyses without error and gives expected verdicts', () => {
    const verdicts = Object.fromEntries(EXPERIMENTS.map((e) => [e.id, analyze(e.configA).verdict]));
    expect(verdicts.e1).toBe('clean');
    expect(verdicts.e2).toBe('static_bands');
    expect(verdicts.e3).toBe('clean');
    expect(analyze(EXPERIMENTS[2].configB!).verdict).toBe('rolling_bands');
    expect(verdicts.e4).toBe('clean');
    expect(analyze(EXPERIMENTS[3].configB!).verdict).toBe('static_bands');
    expect(analyze(EXPERIMENTS[5].configB!).verdict).toBe('frame_flicker');
    expect(analyze(EXPERIMENTS[6].configB!).verdict).toBe('clean');
  });

  it('default config analysis has readable explanation', () => {
    const a = analyze(defaultConfig());
    expect(a.paragraphs.length).toBeGreaterThan(3);
    expect(a.fL).toBe(100);
    expect(a.bandsPerFrame).toBeCloseTo(2.2, 6);
  });
});
