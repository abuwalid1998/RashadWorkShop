/**
 * A damped spring you can re-target at any moment.
 *
 * Unlike a CSS transition it has no fixed duration: `set()` changes the
 * destination and the motion continues from the current value *and velocity*,
 * so an animation interrupted half-way never jumps or stalls.
 *
 * `response` is roughly how long it takes to reach the target (seconds);
 * `damping` 1 settles with no overshoot, lower values bounce.
 */
export class Spring {
  constructor({ value = 0, response = 0.35, damping = 1, precision = 0.001, onUpdate, onRest } = {}) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.precision = precision;
    this.onUpdate = onUpdate;
    this.onRest = onRest;
    this.configure({ response, damping });
    this.frame = 0;
    this.last = 0;
    this.tick = this.tick.bind(this);
  }

  configure({ response, damping }) {
    const omega = (2 * Math.PI) / response;
    this.stiffness = omega * omega;
    this.friction = 2 * damping * omega;
  }

  /** Animate towards `target`, keeping the current value and velocity. */
  set(target, { velocity } = {}) {
    this.target = target;
    if (velocity !== undefined) this.velocity = velocity;
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  /** Move instantly, with no animation. */
  jump(value) {
    this.stop();
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.onUpdate?.(value);
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  tick(now) {
    // Fixed small steps keep the integration stable when frames are dropped.
    let remaining = Math.min((now - this.last) / 1000, 0.064);
    this.last = now;
    const step = 1 / 240;
    while (remaining > 0) {
      const dt = Math.min(step, remaining);
      const force = this.stiffness * (this.target - this.value) - this.friction * this.velocity;
      this.velocity += force * dt;
      this.value += this.velocity * dt;
      remaining -= dt;
    }
    const settled = Math.abs(this.target - this.value) < this.precision && Math.abs(this.velocity) < this.precision * 10;
    if (settled) {
      this.value = this.target;
      this.velocity = 0;
      this.frame = 0;
      this.onUpdate?.(this.value);
      this.onRest?.(this.value);
      return;
    }
    this.onUpdate?.(this.value);
    this.frame = requestAnimationFrame(this.tick);
  }
}

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = () => reducedMotionQuery.matches;
