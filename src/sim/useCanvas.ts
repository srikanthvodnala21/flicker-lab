import { useEffect, useRef } from 'react';
import { SimClock, simClock } from './clock';

export interface CanvasSize {
  w: number;
  h: number;
  dpr: number;
}

/**
 * Attaches a canvas to the animation clock. `draw` is called every animation
 * frame with a context already scaled to CSS pixels.
 */
export function useAnimatedCanvas(
  draw: (ctx: CanvasRenderingContext2D, size: CanvasSize, t: number) => void,
  clock: SimClock = simClock,
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size: CanvasSize = { w: 0, h: 0, dpr: 1 };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.w = Math.max(1, rect.width);
      size.h = Math.max(1, rect.height);
      size.dpr = dpr;
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    let visible = true;
    const io = new IntersectionObserver((e) => (visible = e[0]?.isIntersecting ?? true));
    io.observe(canvas);
    const unsub = clock.subscribe((t) => {
      if (!visible) return;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      drawRef.current(ctx, size, t);
    });
    return () => {
      unsub();
      ro.disconnect();
      io.disconnect();
    };
  }, [clock]);

  return ref;
}

/** A local clock for small demo widgets that should run independently. */
export function useLocalClock(): SimClock {
  const ref = useRef<SimClock | null>(null);
  if (!ref.current) ref.current = new SimClock();
  return ref.current;
}
