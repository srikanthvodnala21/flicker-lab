export interface GlossaryEntry {
  term: string;
  category: 'Electrical' | 'Lighting' | 'Camera' | 'Signal';
  def: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  ac: { term: 'Alternating current (AC)', category: 'Electrical', def: 'Electric current whose direction reverses periodically. Mains voltage follows a sine wave: v(t) = V_peak · sin(2πft).' },
  mainsFreq: { term: 'Mains frequency', category: 'Electrical', def: 'How many complete AC cycles happen per second: 50 Hz in India, Europe and most of Asia/Africa; 60 Hz in the Americas and parts of Japan. This is NOT automatically the light flicker frequency.' },
  vrms: { term: 'RMS voltage', category: 'Electrical', def: 'The "effective" voltage (230 V in India). The peak of the sine wave is √2 × RMS ≈ 325 V.' },
  rectification: { term: 'Rectification', category: 'Electrical', def: 'Converting AC into one-directional current with diodes. Full-wave rectification flips the negative half-cycles positive (|sin|), giving 2 pulses per mains cycle. Half-wave simply blocks one half (1 pulse per cycle).' },
  ripple: { term: 'Ripple', category: 'Electrical', def: 'The residual periodic variation left on a rectified, filtered supply. LED drivers with small smoothing capacitors pass ripple straight into the light output.' },
  driver: { term: 'LED driver', category: 'Lighting', def: 'The electronics between mains and the LED chips. Its design, not the mains frequency, decides how the LED flickers: capacitor-dropper/linear drivers ripple at 2× mains; PWM dimmers switch at their own frequency; constant-current switch-mode drivers can be practically flicker-free.' },
  pwm: { term: 'PWM (pulse-width modulation)', category: 'Lighting', def: 'Dimming by switching the LED fully on and off very quickly. The average brightness is set by the duty cycle; the flicker frequency is the PWM frequency (often 200 Hz – 40 kHz).' },
  duty: { term: 'Duty cycle', category: 'Lighting', def: 'Fraction of each PWM period during which the LED is ON. 25 % duty at full current ≈ 25 % average brightness.' },
  modDepth: { term: 'Modulation depth / percent flicker', category: 'Lighting', def: '(L_max − L_min) / (L_max + L_min). 0 % = constant light, 100 % = light falls to zero every cycle. In the formula L(t) = L_mean[1 + M cos(2πft + φ)], this is M.' },
  flickerIndex: { term: 'Flicker index', category: 'Lighting', def: 'IES metric: area of the light waveform above its mean divided by the total area. Accounts for waveform shape (a narrow PWM pulse scores worse than a sine with equal depth).' },
  flickerFreq: { term: 'Flicker frequency', category: 'Lighting', def: 'The fundamental frequency at which the LIGHT OUTPUT repeats. Full-wave on 50 Hz → 100 Hz; half-wave → 50 Hz; PWM → PWM frequency.' },
  thermal: { term: 'Thermal time constant', category: 'Lighting', def: 'How quickly a filament heats and cools. A large time constant (thick filament) smooths the 2× mains power pulses into a small brightness ripple.' },
  phosphor: { term: 'Phosphor persistence', category: 'Lighting', def: 'Fluorescent phosphors keep glowing for a few milliseconds after excitation, partially filling the dark gaps near AC zero crossings.' },
  fusion: { term: 'Flicker fusion threshold', category: 'Lighting', def: 'The frequency above which the human eye perceives a flickering light as steady: roughly 60–90 Hz for most people in typical conditions. Cameras have no such limit.' },
  fps: { term: 'Frame rate (fps)', category: 'Camera', def: 'Frames recorded per second. Frame n starts at t = n / fps.' },
  shutter: { term: 'Shutter speed', category: 'Camera', def: 'How long each sensor row collects light, written as a fraction of a second. 1/50 means an exposure of 20 ms.' },
  exposure: { term: 'Exposure duration', category: 'Camera', def: 'T_exp = 1 / shutter denominator. Each row\'s value is the average of the light over this window: B = (1/T_exp) ∫ L(t) dt.' },
  angle: { term: 'Shutter angle', category: 'Camera', def: 'Exposure expressed relative to the frame interval: angle = 360° × T_exp × fps. 180° = exposure is half the frame interval (the "180-degree rule").' },
  rule180: { term: '180-degree rule', category: 'Camera', def: 'Cinematic convention to use an exposure of 1 / (2 × fps) for natural motion blur: 1/50 at 25p, 1/48 (or 1/50) at 24p, 1/60 at 30p.' },
  rolling: { term: 'Rolling shutter', category: 'Camera', def: 'CMOS sensors read rows one after another. Each row starts exposing a little later than the row above, so different rows sample different moments of a flickering light.' },
  global: { term: 'Global shutter', category: 'Camera', def: 'All rows start and stop exposing simultaneously. No bands within a frame, but flicker can still change brightness from frame to frame.' },
  readout: { term: 'Sensor readout time', category: 'Camera', def: 'Time for a rolling shutter to scan from the first to the last row (often 5–30 ms). Bands per frame = light frequency × readout time.' },
  rows: { term: 'Sensor rows', category: 'Camera', def: 'Number of lines read out. The simulation offsets each row\'s exposure start by (y / H) × T_readout.' },
  scanDir: { term: 'Scan direction', category: 'Camera', def: 'Which edge of the image is read first. Reversing it reverses the apparent direction of band motion.' },
  autoExposure: { term: 'Auto exposure', category: 'Camera', def: 'When on, the simulation normalises the average image brightness (like auto ISO). When off, faster shutter speeds make the image darker, as on a camera in full manual.' },
  flickerReduction: { term: 'Anti-flicker / flicker reduction', category: 'Camera', def: 'A camera feature that detects flicker and times the exposure to the light peak. On most cameras it works for stills; video relies on choosing the right shutter speed (or a fine "variable shutter" setting).' },
  variableShutter: { term: 'Variable / fine shutter', category: 'Camera', def: 'Shutter adjustment in fine steps (e.g. 1/50.0, 1/50.6 …) or in tenths of a degree of shutter angle, so the exposure can match an odd flicker frequency exactly. Sony calls this "Variable Shutter"; some brands call it "Synchro Scan" or "Clear Scan".' },
  alias: { term: 'Aliasing / beat frequency', category: 'Signal', def: 'Sampling a fast periodic signal at a slower rate makes it appear at a low "alias" frequency f_alias = f − fps · round(f / fps). This is why 100 Hz bands seem to crawl slowly at 4 Hz when filmed at 24 fps.' },
  integration: { term: 'Exposure integration', category: 'Signal', def: 'A sensor pixel accumulates photons over the exposure window. Integrating over a whole number of flicker cycles always gives the same result, which is why such shutter speeds cancel flicker.' },
  sinc: { term: 'Sinc attenuation', category: 'Signal', def: 'A box-shaped exposure reduces a sinusoidal flicker component of frequency f by |sin(πfT)/(πfT)|. It is zero when T is a whole number of flicker periods.' },
  phase: { term: 'Phase', category: 'Signal', def: 'Position within a cycle, in degrees (0–360°). The phase of the light relative to the frame clock decides which part of the cycle each row sees.' },
};
