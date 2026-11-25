import type { CameraConfig } from './types';
import type { LightScene } from './light';

/**
 * Rolling / global shutter exposure model.
 *
 *   Frame n starts at       t_frame(n) = n / fps
 *   Row y starts exposing   t_start(y) = t_frame + (y / H) · T_readout      (rolling)
 *                           t_start(y) = t_frame                            (global)
 *   Captured brightness     B(y) = (1 / T_exp) ∫_{t_start}^{t_start + T_exp} L(t) dt
 *
 * The integral is evaluated exactly with the light's cumulative table, so a
 * PWM square wave or rectified sine is integrated across however many cycles
 * fall inside the exposure window.
 */

/** Exposure cannot exceed the frame interval (a camera physically cannot). */
export function effectiveExposure(cam: CameraConfig): number {
  return Math.max(1e-6, Math.min(cam.exposure, 1 / cam.fps));
}

/** Readout time (s). Zero for a global shutter. Capped at the frame interval. */
export function effectiveReadout(cam: CameraConfig): number {
  if (cam.shutterType === 'global') return 0;
  return Math.max(0, Math.min(cam.readoutMs / 1000, 1 / cam.fps));
}

export function frameStart(cam: CameraConfig, n: number): number {
  return n / cam.fps;
}

/** Time offset (s) of sensor row y (0 = top of the image) from the frame start. */
export function rowOffset(cam: CameraConfig, y: number): number {
  const H = Math.max(1, Math.round(cam.rows));
  const Tr = effectiveReadout(cam);
  const ys = cam.scanDir === 'down' ? y : H - 1 - y;
  return (ys / H) * Tr;
}

/** Sensor row that a display row r (of R) samples. */
export function sensorRowFor(r: number, R: number, H: number): number {
  return Math.min(H - 1, Math.floor(((r + 0.5) * H) / R));
}

/** Captured brightness B(y) of sensor row y in frame n. */
export function rowBrightness(scene: LightScene, cam: CameraConfig, n: number, y: number): number {
  const Te = effectiveExposure(cam);
  const ts = frameStart(cam, n) + rowOffset(cam, y);
  return scene.integral(ts, ts + Te) / Te;
}

/**
 * Fill `out` (length R = display rows) with captured brightness for frame n.
 * Sensor rows are quantised to cam.rows, so a low row count looks blocky.
 */
export function computeFrame(scene: LightScene, cam: CameraConfig, n: number, out: Float32Array): void {
  const R = out.length;
  const H = Math.max(1, Math.round(cam.rows));
  const Te = effectiveExposure(cam);
  const t0 = frameStart(cam, n);
  let lastY = -1;
  let lastV = 0;
  for (let r = 0; r < R; r++) {
    const y = sensorRowFor(r, R, H);
    if (y !== lastY) {
      const ts = t0 + rowOffset(cam, y);
      lastV = scene.integral(ts, ts + Te) / Te;
      lastY = y;
    }
    out[r] = lastV;
  }
}

/**
 * Live sensor view: for every display row, the most recent frame whose
 * exposure for that row has finished by time t. Shows the readout "wiping" down.
 * Returns frame index per row in `frames` and brightness in `out`.
 */
export function computeLive(
  scene: LightScene,
  cam: CameraConfig,
  t: number,
  out: Float32Array,
  frames?: Int32Array,
): void {
  const R = out.length;
  const H = Math.max(1, Math.round(cam.rows));
  const Te = effectiveExposure(cam);
  let lastY = -1;
  let lastV = 0;
  let lastN = 0;
  for (let r = 0; r < R; r++) {
    const y = sensorRowFor(r, R, H);
    if (y !== lastY) {
      const off = rowOffset(cam, y);
      const n = Math.floor((t - off - Te) * cam.fps);
      const ts = frameStart(cam, n) + off;
      lastV = scene.integral(ts, ts + Te) / Te;
      lastN = n;
      lastY = y;
    }
    out[r] = lastV;
    if (frames) frames[r] = lastN;
  }
}

/** Index of the last frame that is completely read out at time t. */
export function lastCompleteFrame(cam: CameraConfig, t: number): number {
  const Te = effectiveExposure(cam);
  const Tr = effectiveReadout(cam);
  return Math.floor((t - Tr - Te) * cam.fps);
}

/** Shutter angle (degrees) = 360 · exposure · fps. */
export function shutterAngle(cam: CameraConfig): number {
  return 360 * effectiveExposure(cam) * cam.fps;
}

/** Exposure gain mapping row brightness to image brightness. */
export function exposureGain(scene: LightScene, cam: CameraConfig): number {
  if (cam.autoExposure) return scene.mean > 0 ? 0.6 / scene.mean : 0;
  // Fixed ISO / aperture, calibrated so 1/50 s under a 0.65-mean light looks normal.
  return (0.6 / 0.65) * (effectiveExposure(cam) / (1 / 50));
}
