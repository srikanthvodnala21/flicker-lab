/**
 * Deterministic simulation clock shared by every canvas.
 * Simulated time t advances by (real dt × speed). Pausing freezes t exactly,
 * so all views (camera, oscilloscope, timing diagram) stay consistent.
 */
type Sub = (t: number) => void;

export class SimClock {
  t = 0;
  speed = 1;
  paused = false;
  private subs = new Set<Sub>();
  private last = 0;
  private raf = 0;

  subscribe(fn: Sub): () => void {
    this.subs.add(fn);
    if (this.subs.size === 1) this.start();
    fn(this.t);
    return () => {
      this.subs.delete(fn);
      if (this.subs.size === 0) this.stop();
    };
  }

  private start() {
    this.last = 0;
    const loop = (now: number) => {
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
      this.last = now;
      if (!this.paused) this.t += dt * this.speed;
      this.subs.forEach((f) => f(this.t));
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  step(dtSim: number) {
    this.t = Math.max(0, this.t + dtSim);
  }

  reset() {
    this.t = 0;
  }
}

export const simClock = new SimClock();
