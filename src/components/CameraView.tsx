import { useEffect, useMemo, useRef } from 'react';
import type { SimConfig } from '../physics/types';
import { buildScene, type LightScene } from '../physics/light';
import { computeFrame, computeLive, effectiveExposure, effectiveReadout, exposureGain, lastCompleteFrame } from '../physics/exposure';
import { formatShutter, fmt } from '../physics/analysis';
import { useAnimatedCanvas } from '../sim/useCanvas';
import { COLORS, lightColor } from '../sim/draw';
import type { SimClock } from '../sim/clock';

export type ViewMode = 'video' | 'sensor' | 'eye';

const SIM_W = 640;
const SIM_H = 360;

let sceneBase: Uint8ClampedArray | null = null;

/** Paint the static scene (reflectance only) once, via the 2D canvas API. */
function getSceneBase(): Uint8ClampedArray {
  if (sceneBase) return sceneBase;
  const c = document.createElement('canvas');
  c.width = SIM_W;
  c.height = SIM_H;
  const g = c.getContext('2d')!;
  const W = SIM_W;
  const H = SIM_H;
  // wall
  const wall = g.createLinearGradient(0, 0, 0, H * 0.72);
  wall.addColorStop(0, '#d6d0c4');
  wall.addColorStop(1, '#b7b0a2');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, H);
  // ceiling strip + LED panel
  g.fillStyle = '#e4e0d8';
  g.fillRect(0, 0, W, 26);
  g.fillStyle = '#fbfaf6';
  g.fillRect(W * 0.36, 6, W * 0.28, 12);
  // colour checker on wall
  const cc = ['#735244', '#c29682', '#627a9d', '#576c43', '#8580b1', '#67bdaa', '#d67e2c', '#505ba6', '#c15a63', '#5e3c6c', '#9dbc40', '#e0a32e', '#383d96', '#469449', '#af363c', '#e7c71f', '#bb5695', '#0885a1', '#f3f3f2', '#c8c8c8', '#a0a0a0', '#7a7a79', '#555555', '#343434'];
  const cx = 52;
  const cy = 70;
  g.fillStyle = '#1d1d1f';
  g.fillRect(cx - 8, cy - 8, 6 * 26 + 12, 4 * 26 + 12);
  cc.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(cx + (i % 6) * 26, cy + Math.floor(i / 6) * 26, 22, 22);
  });
  // picture frame
  g.fillStyle = '#3a3027';
  g.fillRect(272, 64, 118, 84);
  const pic = g.createLinearGradient(0, 70, 0, 142);
  pic.addColorStop(0, '#8fb3d1');
  pic.addColorStop(0.55, '#d9c7a0');
  pic.addColorStop(1, '#6f8a4f');
  g.fillStyle = pic;
  g.fillRect(278, 70, 106, 72);
  g.fillStyle = '#4b5d3a';
  g.beginPath();
  g.moveTo(278, 142);
  g.lineTo(310, 104);
  g.lineTo(336, 128);
  g.lineTo(356, 110);
  g.lineTo(384, 142);
  g.fill();
  // bookshelf
  g.fillStyle = '#4a3423';
  g.fillRect(452, 44, 156, 222);
  g.fillStyle = '#2a1e15';
  for (let s = 0; s < 4; s++) g.fillRect(460, 52 + s * 54, 140, 46);
  const books = ['#9b2c2c', '#2c5282', '#d69e2e', '#276749', '#553c9a', '#c05621', '#2d3748', '#b83280', '#2b6cb0', '#975a16'];
  for (let s = 0; s < 4; s++) {
    let x = 463;
    let k = s * 3;
    while (x < 590) {
      const bw = 7 + ((k * 7) % 9);
      const bh = 30 + ((k * 13) % 14);
      g.fillStyle = books[k % books.length];
      g.fillRect(x, 52 + s * 54 + 46 - bh, bw, bh);
      x += bw + 1;
      k++;
    }
  }
  // floor
  g.fillStyle = '#6b5a4a';
  g.fillRect(0, H * 0.74, W, H * 0.26);
  // desk
  g.fillStyle = '#8a6440';
  g.fillRect(40, 240, 400, 18);
  g.fillStyle = '#5c4129';
  g.fillRect(52, 258, 14, 90);
  g.fillRect(414, 258, 14, 90);
  // laptop
  g.fillStyle = '#c7cbd1';
  g.fillRect(150, 172, 120, 68);
  g.fillStyle = '#2b3440';
  g.fillRect(156, 177, 108, 58);
  g.fillStyle = '#9aa3ae';
  g.fillRect(132, 236, 156, 6);
  // mug
  g.fillStyle = '#e8e4dc';
  g.fillRect(318, 214, 26, 26);
  g.strokeStyle = '#e8e4dc';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(346, 226, 7, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  // plant
  g.fillStyle = '#7a4a2a';
  g.fillRect(372, 212, 30, 28);
  g.fillStyle = '#3f7a3a';
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.ellipse(387 + Math.sin(i * 1.7) * 14, 196 - i * 3, 9, 15, i * 0.7, 0, Math.PI * 2);
    g.fill();
  }
  // gentle vignette
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  sceneBase = g.getImageData(0, 0, W, H).data;
  return sceneBase;
}

interface Props {
  config: SimConfig;
  mode: ViewMode;
  label?: string;
  showProfile?: boolean;
  onCanvas?: (c: HTMLCanvasElement | null) => void;
  clock?: SimClock;
  compact?: boolean;
}

export function CameraView({ config, mode, label, showProfile = true, onCanvas, clock, compact }: Props) {
  const scene: LightScene = useMemo(() => buildScene(config), [config.supply, config.lights]);
  const cam = config.camera;
  const state = useRef({
    off: null as HTMLCanvasElement | null,
    img: null as ImageData | null,
    rows: new Float32Array(SIM_H),
    cachedN: NaN,
    history: [] as number[],
    histN: NaN,
  });

  // invalidate frame cache when config changes
  useEffect(() => {
    state.current.cachedN = NaN;
    state.current.histN = NaN;
  }, [config]);

  const ref = useAnimatedCanvas((ctx, size, t) => {
    const s = state.current;
    if (!s.off) {
      s.off = document.createElement('canvas');
      s.off.width = SIM_W;
      s.off.height = SIM_H;
      s.img = s.off.getContext('2d')!.createImageData(SIM_W, SIM_H);
    }
    const base = getSceneBase();
    const rows = s.rows;
    const Te = effectiveExposure(cam);
    const Tr = effectiveReadout(cam);
    let frameN = lastCompleteFrame(cam, t);

    if (mode === 'video') {
      if (frameN !== s.cachedN) {
        computeFrame(scene, cam, frameN, rows);
        s.cachedN = frameN;
      }
    } else if (mode === 'sensor') {
      computeLive(scene, cam, t, rows);
      s.cachedN = NaN;
    } else {
      // Eye: perceived brightness = long-term average (flicker fusion)
      rows.fill(scene.mean);
      s.cachedN = NaN;
    }

    const gain = mode === 'eye' ? (scene.mean > 0 ? 0.6 / scene.mean : 0) : exposureGain(scene, cam);
    const data = s.img!.data;
    for (let y = 0; y < SIM_H; y++) {
      const g = rows[y] * gain;
      let i = y * SIM_W * 4;
      const end = i + SIM_W * 4;
      for (; i < end; i += 4) {
        data[i] = base[i] * g;
        data[i + 1] = base[i + 1] * g;
        data[i + 2] = base[i + 2] * g;
        data[i + 3] = 255;
      }
    }
    s.off.getContext('2d')!.putImageData(s.img!, 0, 0);

    const { w, h } = size;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const profW = showProfile && !compact ? Math.min(70, w * 0.12) : showProfile ? 34 : 0;
    const imgW = w - profW;
    // keep 16:9 inside area
    let dw = imgW;
    let dh = (imgW * 9) / 16;
    if (dh > h) {
      dh = h;
      dw = (h * 16) / 9;
    }
    const dx = (imgW - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(s.off, dx, dy, dw, dh);

    // Live readout line
    if (mode === 'sensor' && cam.shutterType === 'rolling' && Tr > 0) {
      const frameT = 1 / cam.fps;
      const o = (((t - Te) % frameT) + frameT) % frameT;
      if (o <= Tr) {
        const frac = o / Tr;
        const yy = dy + (cam.scanDir === 'down' ? frac : 1 - frac) * dh;
        ctx.strokeStyle = COLORS.warn;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(dx, yy);
        ctx.lineTo(dx + dw, yy);
        ctx.stroke();
        ctx.fillStyle = COLORS.warn;
        ctx.font = '600 11px ui-monospace, monospace';
        ctx.fillText('◀ readout', dx + dw - 76, yy - 4);
      }
    } else if (mode === 'sensor' && cam.shutterType === 'global') {
      const frameT = 1 / cam.fps;
      const o = (((t - Te) % frameT) + frameT) % frameT;
      if (o < frameT * 0.08) {
        ctx.strokeStyle = COLORS.warn;
        ctx.lineWidth = 3;
        ctx.strokeRect(dx + 1.5, dy + 1.5, dw - 3, dh - 3);
      }
    }

    // Row brightness profile
    if (showProfile) {
      const px = imgW + 4;
      const pw = profW - 8;
      ctx.fillStyle = '#0b1017';
      ctx.fillRect(imgW, 0, profW, h);
      ctx.strokeStyle = COLORS.grid;
      ctx.strokeRect(px + 0.5, dy + 0.5, pw - 1, dh - 1);
      const ref = scene.max > 0 ? scene.max : 1;
      ctx.strokeStyle = COLORS.light;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let y = 0; y < SIM_H; y += 2) {
        const v = Math.min(1.05, rows[y] / ref);
        const xx = px + v * pw;
        const yy = dy + (y / SIM_H) * dh;
        if (y === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      if (!compact) {
        ctx.fillStyle = COLORS.text;
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText('B(y)', px, Math.max(10, dy - 3) + (dy < 12 ? 10 : 0));
      }
    }

    // Light-now lamp
    const lnow = scene.max > 0 ? scene.valueAt(t) / scene.max : 0;
    const lx = dx + dw - 18;
    const ly = dy + 18;
    ctx.fillStyle = lightColor(lnow);
    ctx.shadowColor = lightColor(lnow, 0.9);
    ctx.shadowBlur = 14 * lnow;
    ctx.beginPath();
    ctx.arc(lx, ly, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();

    // HUD
    ctx.font = `600 ${compact ? 10 : 11}px ui-monospace, monospace`;
    const hud = `${label ? label + ' · ' : ''}${fmt(cam.fps, 3)} fps · ${formatShutter(Te)} · ${cam.shutterType === 'global' ? 'GS' : `RS ${fmt(Tr * 1000, 1)} ms`}`;
    const tw = ctx.measureText(hud).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(dx + 6, dy + 6, tw + 12, 18);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(hud, dx + 12, dy + 19);
    const modeTxt = mode === 'video' ? `REC  frame ${Math.max(0, frameN)}` : mode === 'sensor' ? 'SENSOR LIVE' : 'EYE VIEW';
    const mw = ctx.measureText(modeTxt).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(dx + 6, dy + dh - 24, mw + 12, 18);
    ctx.fillStyle = mode === 'video' ? '#f87171' : '#a5f3fc';
    ctx.fillText(modeTxt, dx + 12, dy + dh - 11);

    // Frame brightness history (video mode)
    if (mode === 'video' && !compact) {
      if (frameN !== s.histN) {
        const hist: number[] = [];
        const tmp = new Float32Array(48);
        for (let k = frameN - 39; k <= frameN; k++) {
          computeFrame(scene, cam, k, tmp);
          let sum = 0;
          for (let i = 0; i < tmp.length; i++) sum += tmp[i];
          hist.push(sum / tmp.length);
        }
        s.history = hist;
        s.histN = frameN;
      }
      const hw = 120;
      const hh = 26;
      const hx = dx + dw - hw - 8;
      const hy = dy + dh - hh - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(hx - 4, hy - 12, hw + 8, hh + 16);
      ctx.fillStyle = COLORS.text;
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('frame brightness', hx, hy - 3);
      const mean = scene.mean || 1;
      const bw = hw / s.history.length;
      s.history.forEach((v, i) => {
        const rel = Math.max(0, Math.min(2, v / mean));
        const bh = Math.max(1, (rel / 2) * hh);
        ctx.fillStyle = i === s.history.length - 1 ? '#f8fafc' : 'rgba(56,189,248,0.7)';
        ctx.fillRect(hx + i * bw, hy + hh - bh, Math.max(1, bw - 1), bh);
      });
    }
  }, clock);

  useEffect(() => {
    onCanvas?.(ref.current);
    return () => onCanvas?.(null);
  }, [onCanvas, ref]);

  return <canvas ref={ref} className={`camview ${compact ? 'compact' : ''}`} />;
}
