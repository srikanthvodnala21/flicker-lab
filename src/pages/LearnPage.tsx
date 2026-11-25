import { useEffect, useState, type ReactNode } from 'react';
import { AcDemo, BandDemo, ExposureDemo, LedDriversDemo, ScanDemo, ShutterTable } from '../learn/widgets';
import { Note, Term } from '../components/ui';

const MODULES = [
  { id: 'm1', n: 1, title: 'AC electricity' },
  { id: 'm2', n: 2, title: 'Light flickering' },
  { id: 'm3', n: 3, title: 'Camera shutter' },
  { id: 'm4', n: 4, title: 'Rolling shutter' },
  { id: 'm5', n: 5, title: 'Flicker banding' },
  { id: 'm6', n: 6, title: 'How to avoid flicker' },
];

function Eq({ children }: { children: ReactNode }) {
  return <div className="eq">{children}</div>;
}

function Module1() {
  return (
    <>
      <p>
        <Term k="ac">Alternating current</Term> reverses direction continuously. The mains voltage at your wall socket follows a sine wave:
      </p>
      <Eq>v(t) = V_peak · sin(2π · f_mains · t),  V_peak = √2 × V_rms ≈ 325 V for 230 V India</Eq>
      <ul>
        <li>
          <b>50 Hz</b> means 50 complete cycles per second. Each cycle lasts 20 ms, and the voltage crosses zero twice per cycle (every 10 ms). India, Europe, most of Asia, Africa and Australia use 50 Hz.
        </li>
        <li>
          <b>60 Hz</b> means each cycle lasts 16.67 ms, with zero crossings every 8.33 ms. Used in the Americas, Korea, Taiwan and western Japan.
        </li>
        <li>
          <Term k="rectification">Half-wave rectification</Term> blocks one polarity: one pulse per cycle, so 50 pulses/s on 50 Hz mains.
        </li>
        <li>
          <b>Full-wave rectification</b> (a diode bridge) flips the negative half positive: |sin|. You get two pulses per cycle, so <b>100 pulses per second from 50 Hz mains</b>. This is why most flickering lights in India flicker at 100 Hz, not 50 Hz.
        </li>
        <li>A plain resistive lamp (incandescent) needs no rectifier, but power = V²/R peaks at both the positive and negative peaks, so it also pulses at 2 × mains.</li>
      </ul>
      <AcDemo />
      <Note kind="model">Real mains is not a perfect sine (harmonics, voltage dips). The simulator uses an ideal sinusoid.</Note>
    </>
  );
}

function Module2() {
  return (
    <>
      <p>
        An LED emits light almost instantly in proportion to its current, with no thermal smoothing like a filament. Whatever current waveform the{' '}
        <Term k="driver">driver</Term> delivers appears directly in the light. The <b>driver</b>, not the mains, decides the flicker:
      </p>
      <ul>
        <li>
          <b>Basic rectified-AC drivers</b> (capacitor dropper, linear drivers in cheap bulbs and strips) follow the rectified sine. The flicker is at <b>2 × mains</b> (100 Hz in India), and the <Term k="modDepth">modulation depth</Term> depends on the smoothing capacitor: 100 % with none, 10–30 % with a decent one.
        </li>
        <li>
          <b>
            <Term k="pwm">PWM dimming</Term>
          </b>{' '}
          switches the LED fully ON/OFF at the driver's own oscillator frequency (anything from 200 Hz to 40 kHz). The <Term k="duty">duty cycle</Term> sets the average brightness. A 400 Hz PWM LED on 50 Hz mains flickers at 400 Hz.
        </li>
        <li>
          <b>Constant-current switch-mode drivers</b> regulate the LED current with an inductor and output capacitor. Good ones have &lt; 1 % ripple, which is effectively flicker-free.
        </li>
      </ul>
      <p>
        Two key metrics: <Term k="flickerFreq">flicker frequency</Term> (how often the light repeats) and <Term k="modDepth">percent flicker</Term> = (L_max − L_min)/(L_max + L_min). The textbook sinusoidal model is
      </p>
      <Eq>L(t) = L_mean · [1 + M · cos(2πft + φ)]</Eq>
      <p>
        This is why <b>two LED bulbs on the same 50 Hz supply can behave completely differently</b>. One may ripple 100 % at 100 Hz, another may be PWM-dimmed at 2 kHz, and a third may be perfectly steady:
      </p>
      <LedDriversDemo />
    </>
  );
}

function Module3() {
  return (
    <>
      <p>
        <Term k="shutter">Shutter speed</Term> is the <Term k="exposure">exposure duration</Term>: how long each pixel collects light. "1/200" means 5 ms. The <Term k="fps">frame rate</Term> is how often a new frame starts. The two are independent, except that exposure can never be longer than the frame interval (1/fps).
      </p>
      <Eq>T_exp = 1 / shutter     shutter angle = 360° × T_exp × fps</Eq>
      <p>
        The <Term k="rule180">180-degree rule</Term> sets exposure to half the frame interval (1/50 at 25p, 1/60 at 30p) for natural-looking motion blur.
      </p>
      <p>
        The sensor records the <b>average</b> of the light over the exposure (<Term k="integration">integration</Term>):
      </p>
      <Eq>B = (1 / T_exp) · ∫ L(t) dt   over [t_start, t_start + T_exp]</Eq>
      <ul>
        <li>
          <b>Exposure = whole number of light cycles</b> (1/100, 1/50, 1/33, 1/25 for 100 Hz): every window collects the same light regardless of when it starts. The flicker cancels exactly.
        </li>
        <li>
          <b>Short exposures</b> (1/500, 1/1000) see only part of a cycle, so different windows give very different results. Almost the full flicker survives.
        </li>
        <li>
          <b>Long but non-matching exposures</b> (1/60 at 100 Hz = 1.67 cycles) average most of it out. The leftover fraction of a cycle still leaks through (<Term k="sinc">sinc attenuation</Term>).
        </li>
      </ul>
      <p>Below, the purple window slides along a 100 Hz light. The lower plot shows the average the sensor would record for each start time. Flat = no flicker in the footage.</p>
      <ExposureDemo />
    </>
  );
}

function Module4() {
  return (
    <>
      <p>
        A CMOS sensor is a grid of photodiodes read out <b>row by row</b> through shared column amplifiers and ADCs. Most cameras (including the Sony FX30) cannot read all rows at once. They reset and read one row after another, so each row's exposure window is shifted slightly in time. This is the{' '}
        <Term k="rolling">rolling shutter</Term>.
      </p>
      <Eq>t_start(y) = t_frame + (y / H) · T_readout</Eq>
      <ul>
        <li>
          <Term k="readout">Readout time</Term> T_readout is the time from the first to the last row, typically 5–30 ms. It is set by the sensor and the recording mode (oversampling and full-width readout are slower; crop modes are faster).
        </li>
        <li>Every row still gets the same exposure duration. Only the start time differs.</li>
        <li>Under a flickering light, row y averages the light over a window that begins later than row y−1. Rows that land on a light peak come out brighter, which produces horizontal bands.</li>
        <li>
          A <Term k="global">global shutter</Term> exposes all rows in the same window. There are no bands, but a whole frame can be brighter or darker than the next.
        </li>
      </ul>
      <ScanDemo />
    </>
  );
}

function Module5() {
  return (
    <>
      <p>
        Combine the three ideas: <b>flickering light</b> + <b>exposure that doesn't cancel the flicker</b> + <b>rows sampled at different times</b> = horizontal bands.
      </p>
      <ul>
        <li>
          <b>Why bands are horizontal:</b> all pixels in a row share the same exposure window, so a whole row gets one brightness.
        </li>
        <li>
          <b>Band spacing:</b> over the readout the light completes f × T_readout cycles. 100 Hz × 22 ms = 2.2 bright/dark pairs per frame. A faster readout gives fewer, wider bands; a higher flicker frequency gives more, thinner ones.
        </li>
        <li>
          <b>Band contrast</b> is set by the exposure. Whole light cycles give 0 %; short exposures give nearly the full light modulation.
        </li>
        <li>
          <b>Why bands move:</b> if f_light / fps is not an integer, every frame starts at a different phase of the light. The bands appear to crawl at the <Term k="alias">alias frequency</Term>:
        </li>
      </ul>
      <Eq>f_alias = f_light − fps · round(f_light / fps)</Eq>
      <ul>
        <li>100 Hz at 25 fps: 100/25 = 4 → static bands.</li>
        <li>100 Hz at 24 fps: 4.17 → 4 Hz beat, bands slowly crawl.</li>
        <li>100 Hz at 30 fps: 3.33 → 10 Hz beat, bands roll through the frame quickly.</li>
        <li>Direction depends on the sign of f_alias and on the scan direction.</li>
      </ul>
      <p>Play with the settings below. The left view is the recorded video; the right diagram shows exactly which part of the light each row integrates.</p>
      <BandDemo />
    </>
  );
}

function Module6() {
  return (
    <>
      <h4>1. Pick the shutter speed from the LIGHT frequency</h4>
      <p>
        Choose an exposure that is a <b>whole multiple of the light period</b>. In India (50 Hz) almost all mains flicker is at 100 Hz (period 10 ms), so <b>1/100, 1/50, 1/33 and 1/25</b> are safe, subject to the frame rate allowing it:
      </p>
      <ShutterTable fL={100} />
      <h4>2. Pick the frame rate</h4>
      <ul>
        <li>
          <b>25p / 50p</b> are the natural choices in India: 1/50 or 1/100 keep the 180° rule and cancel 100 Hz flicker.
        </li>
        <li>
          <b>24p</b> works with 1/50 (173°, visually indistinguishable from 180°).
        </li>
        <li>
          <b>30p</b> works with 1/50 (216°) or 1/100 (108°), but <b>not</b> with the habitual 1/60.
        </li>
        <li>
          <b>60p</b> works with 1/100 (216°). <b>100p</b> works with 1/100 (360°). <b>120p</b> can't contain a full 10 ms cycle (frame = 8.3 ms), so expect some residual flicker. Use flicker-free lights for slow motion.
        </li>
      </ul>
      <h4>3. Identify problematic lights before you shoot</h4>
      <ul>
        <li>Set your camera (or phone pro mode) to 1/1000–1/4000 s and look at the light or a wall it lights. Bands mean it flickers. The number of bands tells you the frequency (bands ≈ f × readout).</li>
        <li>Phone slow-motion (240 fps) of the light shows visible pulsing for 100 Hz flicker.</li>
        <li>If bands persist at 1/50 and 1/100, the light is not flickering at 100 Hz. It is probably PWM at another frequency. Try the fine shutter adjustment below.</li>
        <li>Dimmed lights are the usual suspects: many LED dimmers use low-frequency PWM.</li>
      </ul>
      <h4>4. Flicker reduction and fine shutter adjustment</h4>
      <ul>
        <li>
          <Term k="flickerReduction">Anti-flicker shooting</Term> on most Sony bodies times <b>still photos</b> to the light peak. It doesn't change video recording, so for video the shutter value is what matters.
        </li>
        <li>
          <Term k="variableShutter">Variable / fine shutter</Term>: many cinema-oriented cameras let you set the shutter in small steps or in shutter angle. Watch a flat wall on a large monitor and nudge the shutter until the bands stop. Check your FX30 menu and firmware for shutter-angle and variable-shutter options.
        </li>
        <li>
          On the Sony FX30, switch shutter mode to <b>angle</b> if you prefer: at 25p, 180° = 1/50 s which is already safe. At 30p, use 216° (= 1/50) or 108° (= 1/100).
        </li>
      </ul>
      <h4>5. Why matching the mains frequency alone isn't enough</h4>
      <ul>
        <li>The light usually flickers at 2 × mains (100 Hz), not at the mains frequency. 1/50 works because it is two cycles of 100 Hz, not because it "matches 50 Hz".</li>
        <li>PWM drivers flicker at frequencies unrelated to mains (e.g. 360 Hz, 1 kHz, 2.5 kHz). Only fine-tuned shutters or longer exposures remove them.</li>
        <li>Fast shutter speeds (for crisp action or slow motion) can't contain whole cycles.</li>
        <li>High frame rates (100/120p) cap the exposure below one light cycle.</li>
        <li>Mixed lighting (different drivers) means no single shutter is a multiple of every period. Turn off or replace the worst light.</li>
      </ul>
      <h4>Practical FX30 checklist for indoor India shoots</h4>
      <ol>
        <li>Record 25p (or 50p) and set the shutter to 1/50 (or 1/100 at 50p). Set the camera's NTSC/PAL selector to PAL so the 25/50p modes are available.</li>
        <li>Do a quick 1/1000 test shot of each light to find any that flicker. Replace or switch off non-essential PWM-dimmed lights.</li>
        <li>For dimmed or PWM lights, keep dimmers at 100 % or use video-rated flicker-free lights (CRI 95+).</li>
        <li>For slow motion (100/120p), light the scene with flicker-free LEDs or daylight. Mains lighting will show bands.</li>
        <li>Check on a big screen: flat walls and ceilings reveal faint bands that the camera LCD hides.</li>
      </ol>
      <Note kind="info">
        Use the Tools page to estimate your FX30's readout time from a test shot: band pairs ÷ 100 Hz = readout time.
      </Note>
    </>
  );
}

const CONTENT: Record<string, () => ReactNode> = { m1: Module1, m2: Module2, m3: Module3, m4: Module4, m5: Module5, m6: Module6 };

export function LearnPage() {
  const [active, setActive] = useState(() => {
    const m = window.location.hash.match(/learn\/(m\d)/);
    return m ? m[1] : 'm1';
  });
  useEffect(() => {
    const onHash = () => {
      const m = window.location.hash.match(/learn\/(m\d)/);
      if (m && CONTENT[m[1]]) setActive(m[1]);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const Body = CONTENT[active];
  const mod = MODULES.find((m) => m.id === active)!;
  const go = (id: string) => {
    setActive(id);
    window.history.replaceState(null, '', `#/learn/${id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const idx = MODULES.findIndex((m) => m.id === active);
  return (
    <div className="page learn">
      <nav className="module-nav">
        {MODULES.map((m) => (
          <button key={m.id} className={m.id === active ? 'on' : ''} onClick={() => go(m.id)}>
            <span className="mod-n">{m.n}</span>
            {m.title}
          </button>
        ))}
      </nav>
      <article className="module">
        <div className="eyebrow">Module {mod.n}</div>
        <h1>{mod.n === 6 ? 'How to avoid flickering' : `Understanding ${mod.title.toLowerCase().replace('ac ', 'AC ')}`}</h1>
        <Body />
        <div className="module-pager">
          {idx > 0 && (
            <button className="btn" onClick={() => go(MODULES[idx - 1].id)}>
              ← Module {idx}: {MODULES[idx - 1].title}
            </button>
          )}
          <span />
          {idx < MODULES.length - 1 && (
            <button className="btn primary" onClick={() => go(MODULES[idx + 1].id)}>
              Module {idx + 2}: {MODULES[idx + 1].title} →
            </button>
          )}
        </div>
      </article>
    </div>
  );
}
