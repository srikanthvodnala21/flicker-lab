// Core data types for the Flicker Lab physics engine.
// Everything in src/physics is framework-free so it can be unit tested.

export type LightType =
  | 'incandescent' // filament, thermal low-pass of electrical power
  | 'fluorescent' // magnetic-ballast tube, simplified arc + phosphor persistence
  | 'led_ac' // LED on rectified mains with limited smoothing (ripple)
  | 'led_pwm' // LED dimmed by a PWM driver (square wave at its own frequency)
  | 'led_cc' // constant-current "flicker-free" LED driver (optional residual ripple)
  | 'sine'; // idealised sinusoidal modulation L = Lmean(1 + M cos(2πft + φ))

export type Rectification = 'full' | 'half';

export interface SupplyConfig {
  /** Mains frequency in Hz (50 in India/Europe, 60 in the Americas). */
  acFreq: number;
  /** RMS voltage. Illustrative only: it scales the voltage trace, not the light. */
  voltageRms: number;
  /** Phase of the mains relative to the camera's frame clock, degrees. */
  phaseDeg: number;
}

export interface LightConfig {
  id: string;
  type: LightType;
  enabled: boolean;
  rectification: Rectification;
  /** PWM frequency (Hz) for led_pwm. */
  pwmFreq: number;
  /** PWM duty cycle 0..1. */
  duty: number;
  /** Modulation depth 0..1, defined as percent flicker (Lmax-Lmin)/(Lmax+Lmin). */
  modDepth: number;
  /** Peak light output (relative). */
  intensity: number;
  /** Modulation frequency for the idealised sine source (Hz). */
  sineFreq: number;
  /** Phase of this light's own waveform, degrees of its waveform period. */
  phaseDeg: number;
  /** Filament thermal time constant (ms) for incandescent. */
  thermalTauMs: number;
  /** Phosphor persistence time constant (ms) for fluorescent. */
  phosphorTauMs: number;
}

export type ShutterType = 'rolling' | 'global';
export type ScanDir = 'down' | 'up';

export interface CameraConfig {
  presetId: string;
  fps: number;
  /** Exposure duration in seconds (shutter speed 1/x  =>  exposure = 1/x). */
  exposure: number;
  /** Rolling-shutter readout time in ms (time from first to last row). */
  readoutMs: number;
  /** Number of sensor rows simulated. */
  rows: number;
  shutterType: ShutterType;
  scanDir: ScanDir;
  /** Auto exposure keeps average image brightness constant (like auto ISO). */
  autoExposure: boolean;
}

export interface SimConfig {
  supply: SupplyConfig;
  lights: LightConfig[];
  camera: CameraConfig;
}
