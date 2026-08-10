/**
 * playback.js – Playback engine for the funscript editor.
 *
 * Manages play / pause / stop state and drives the animation loop.
 * Uses performance.now() for timing so it stays accurate under load.
 *
 * Usage:
 *   const pb = new Playback(onTick);
 *   pb.start(totalDurationMs);
 *   pb.pause();
 *   pb.stop();
 *   pb.currentMs  → current script position in ms
 */
export class Playback {
  /**
   * @param {function(number): void} onTick  - Called each animation frame with current ms.
   */
  constructor(onTick) {
    this._onTick     = onTick;
    this._playing    = false;
    this._wallStart  = 0;   // performance.now() when play started
    this._scriptBase = 0;   // script position when play started (ms)
    this._duration   = 0;   // total script duration (ms)
    this._speed      = 1;
    this._rafId      = null;
  }

  // ── Public state ────────────────────────────────────────────────────────────

  get isPlaying() {
    return this._playing;
  }

  get currentMs() {
    if (!this._playing) return this._scriptBase;
    const elapsed = (performance.now() - this._wallStart) * this._speed;
    return Math.min(this._scriptBase + elapsed, this._duration);
  }

  set speed(val) {
    if (this._playing) {
      // Re-anchor so position doesn't jump
      this._scriptBase = this.currentMs;
      this._wallStart  = performance.now();
    }
    this._speed = val;
  }

  get speed() {
    return this._speed;
  }

  // ── Controls ────────────────────────────────────────────────────────────────

  /**
   * Start or resume playback.
   * @param {number} totalDurationMs
   */
  start(totalDurationMs) {
    if (this._playing) return;
    this._duration = totalDurationMs;

    // If we're at the end, restart from the beginning
    if (this._scriptBase >= this._duration) this._scriptBase = 0;

    this._wallStart = performance.now();
    this._playing   = true;
    this._loop();
  }

  /** Pause playback, preserving current position. */
  pause() {
    if (!this._playing) return;
    this._scriptBase = this.currentMs;
    this._playing    = false;
    this._cancelRaf();
  }

  /** Stop playback and reset to position 0. */
  stop() {
    this._playing    = false;
    this._scriptBase = 0;
    this._cancelRaf();
    this._onTick(0);
  }

  /** Seek to a specific position in ms. */
  seekTo(ms) {
    this._scriptBase = Math.max(0, Math.min(ms, this._duration));
    if (this._playing) this._wallStart = performance.now();
    if (!this._playing) this._onTick(this._scriptBase);
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  _loop() {
    const ms = this.currentMs;
    this._onTick(ms);

    if (ms >= this._duration) {
      this._playing    = false;
      this._scriptBase = this._duration;
      this._cancelRaf();
      return;
    }

    this._rafId = requestAnimationFrame(() => this._loop());
  }

  _cancelRaf() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }
}

// ── Interpolation helper (used by both playback preview and keyframe canvas) ──

/**
 * Linearly interpolates position from a sorted actions array at a given ms.
 *
 * @param {Array<{at: number, pos: number}>} actions - Must be sorted by `at`.
 * @param {number} atMs - Time in ms (local to chapter).
 * @returns {number} Interpolated pos (0–100).
 */
export function interpolatePos(actions, atMs) {
  if (!actions || actions.length === 0) return 0;
  if (atMs <= actions[0].at) return actions[0].pos;
  if (atMs >= actions[actions.length - 1].at) return actions[actions.length - 1].pos;

  let lo = 0;
  let hi = actions.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (actions[mid].at <= atMs) lo = mid; else hi = mid;
  }

  const t = (atMs - actions[lo].at) / (actions[hi].at - actions[lo].at);
  return actions[lo].pos + (actions[hi].pos - actions[lo].pos) * t;
}
