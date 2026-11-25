# Flicker Lab

An interactive simulator that explains why indoor footage shows horizontal flicker bands. It covers mains AC, LED drivers, shutter speed, frame rate and rolling-shutter readout.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # physics unit tests
npm run build    # production build in dist/
```

## Architecture

- `src/physics/`: framework-free physics engine
  - `light.ts`: light-source models (incandescent, fluorescent, rectified-AC LED, PWM LED, constant-current LED, ideal sine). Each is one period sampled into a table with an exact cumulative integral, so ∫L dt over any window is O(1).
  - `exposure.ts`: row timing `t_start(y) = t_frame + (y/H)·T_readout` and the exposure integral `B(y) = (1/T_exp)∫L dt`.
  - `analysis.ts`: aliasing, band count, drift direction, safe shutters, verdict and the dynamic "Why am I seeing these bands?" text.
  - `presets.ts`: camera presets (including the Sony FX30, with approximate readout times) and the 7 experiments.
- `src/sim/`: shared deterministic simulation clock and canvas helpers.
- `src/components/`: control panels, camera view, oscilloscope, timing diagram, analysis panel, Chart.js chart.
- `src/pages/`: Simulator, Experiment Lab, Learn (6 modules), Tools, Glossary.

## Deploy

Live site: https://srikanthvodnala21.github.io/flicker-lab/

```bash
npm run deploy   # builds with the /flicker-lab/ base path and pushes dist/ to the gh-pages branch
```
