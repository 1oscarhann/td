import { clamp } from './units.js';

/**
 * Fixed-timestep game loop.
 *
 * Physics always advances in identical `dt` slices, however fast or slow the screen refreshes,
 * so a 144 Hz monitor and a 30 fps laptop get the same braking distances. Rendering runs once
 * per animation frame and gets `alpha` (0..1): how far we are between the last two physics
 * states, so it can interpolate and stay smooth. https://gafferongames.com/post/fix_your_timestep/
 */

/**
 * The accumulator maths on its own, so it can be unit-tested.
 * @param {number} accumulator unsimulated seconds carried over from last frame
 * @param {number} frameTime seconds to add this frame (already scaled for pause / time warp)
 * @param {number} dt physics step in seconds
 * @param {number} [maxFrameTime] cap, so a long stall (tab in the background) can't queue thousands of steps
 * @returns {{ steps: number, accumulator: number, alpha: number }}
 */
export function advanceAccumulator(accumulator, frameTime, dt, maxFrameTime = 0.25) {
  let acc = accumulator + clamp(frameTime, 0, maxFrameTime);
  // The epsilon stops float error turning exactly 2 steps into 1.9999999 → 1.
  const steps = Math.floor(acc / dt + 1e-6);
  acc = Math.max(0, acc - steps * dt);
  return { steps, accumulator: acc, alpha: Math.min(1, acc / dt) };
}

/**
 * @param {object} opts
 * @param {number} opts.dt physics step in seconds
 * @param {(dt: number) => void} opts.step advance the simulation by exactly dt
 * @param {(alpha: number, frameTime: number) => void} opts.render draw a frame
 * @param {(frameTime: number) => void} [opts.frameStart] runs once per frame before physics (read input here)
 * @param {() => number} [opts.timeScale] 0 = paused, 1 = real time
 * @param {number} [opts.maxFrameTime]
 * @returns {{ stop: () => void }}
 */
export function startFixedLoop({ dt, step, render, frameStart = () => {}, timeScale = () => 1, maxFrameTime = 0.25 }) {
  let last = performance.now() / 1000;
  let accumulator = 0;
  let running = true;
  let handle = 0;

  const frame = () => {
    if (!running) return;
    const now = performance.now() / 1000;
    const frameTime = Math.min(now - last, maxFrameTime);
    last = now;
    frameStart(frameTime);
    const scale = timeScale();
    const r = advanceAccumulator(accumulator, frameTime * scale, dt, maxFrameTime * Math.max(1, scale));
    accumulator = r.accumulator;
    for (let i = 0; i < r.steps; i++) step(dt);
    render(r.alpha, frameTime);
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(handle);
    },
  };
}
