/**
 * timeline.js – Timeline strip canvas renderer and mouse controller.
 *
 * Draws chapter bands + time ruler + playhead on a canvas.
 * Handles drag-resizing of chapter start/end boundaries.
 */

import { msToTimeStr } from './export.js';

// ── Drawing constants ────────────────────────────────────────────────────────
const BAND_TOP    = 6;
const HANDLE_SIZE = 6; // px hit radius for resize handles

// ── Coordinate helpers ────────────────────────────────────────────────────────

/** Global ms → canvas X pixel. */
export function msToX(ms, totalDuration, canvasW) {
  return (ms / Math.max(totalDuration, 1)) * canvasW;
}

/** Canvas X pixel → global ms. */
export function xToMs(x, totalDuration, canvasW) {
  return (x / canvasW) * totalDuration;
}

// ── Draw ──────────────────────────────────────────────────────────────────────

/**
 * Renders the full timeline strip.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W  canvas CSS width
 * @param {number} H  canvas CSS height
 * @param {object} state      - EditorState
 * @param {number} playMs     - current playhead position in global ms
 */
export function drawTimeline(ctx, W, H, state, playMs) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(0, 0, W, H);

  const BAND_H = H - 22;

  if (state.totalDuration === 0) {
    ctx.fillStyle = '#333';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No chapters. Import a file or click + to add one.', W / 2, H / 2);
    return;
  }

  // ── Chapter bands ──────────────────────────────────────────────────────────
  state.chapters.forEach((ch, i) => {
    const x1 = msToX(ch.startMs, state.totalDuration, W);
    const x2 = msToX(ch.endMs,   state.totalDuration, W);
    const bw  = Math.max(x2 - x1, 1);
    const isSelected = i === state.selectedIdx;

    // Band fill
    ctx.fillStyle = ch.color + (isSelected ? 'bb' : '55');
    ctx.fillRect(x1, BAND_TOP, bw, BAND_H);

    // Border
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(x1 + 0.5, BAND_TOP + 0.5, bw - 1, BAND_H - 1);

    // Label (clipped to band)
    if (bw > 20) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x1 + 4, BAND_TOP, bw - 8, BAND_H);
      ctx.clip();
      ctx.fillStyle = '#fff';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch.name || '(empty)', x1 + 4, BAND_TOP + BAND_H / 2);
      ctx.restore();
    }

    // Resize handles (solid bar at each edge)
    ctx.fillStyle = ch.color;
    ctx.fillRect(x1, BAND_TOP, 4, BAND_H);
    ctx.fillRect(x2 - 4, BAND_TOP, 4, BAND_H);
  });

  // ── Time ruler ─────────────────────────────────────────────────────────────
  const rulerY = H - 14;
  ctx.fillStyle = '#444';
  ctx.fillRect(0, rulerY, W, 1);

  const interval = niceInterval(state.totalDuration, W / 60);
  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';

  for (let ms = 0; ms <= state.totalDuration; ms += interval) {
    const x = msToX(ms, state.totalDuration, W);
    ctx.fillStyle = '#555';
    ctx.fillRect(x, rulerY, 1, 4);
    ctx.fillStyle = '#888';
    // Show MM:SS for brevity
    ctx.fillText(msToTimeStr(ms).slice(3, 9), x, rulerY + 5);
  }

  // ── Playhead ────────────────────────────────────────────────────────────────
  const px = msToX(playMs, state.totalDuration, W);
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, H - 12);
  ctx.stroke();

  // Triangle marker at top
  ctx.fillStyle = '#ff4444';
  ctx.beginPath();
  ctx.moveTo(px - 5, 0);
  ctx.lineTo(px + 5, 0);
  ctx.lineTo(px, 7);
  ctx.closePath();
  ctx.fill();
}

// ── Hit testing ───────────────────────────────────────────────────────────────

/**
 * Returns a hit description for a given X position on the timeline.
 *
 * @param {number} x           - Mouse X in canvas CSS coords
 * @param {object} state       - EditorState
 * @param {number} canvasW     - Canvas CSS width
 * @returns {{ chIdx: number, edge: 'start'|'end'|'body' } | null}
 */
export function hitTest(x, state, canvasW) {
  for (let i = 0; i < state.chapters.length; i++) {
    const ch = state.chapters[i];
    const x1 = msToX(ch.startMs, state.totalDuration, canvasW);
    const x2 = msToX(ch.endMs,   state.totalDuration, canvasW);

    if (Math.abs(x - x1) <= HANDLE_SIZE) return { chIdx: i, edge: 'start' };
    if (Math.abs(x - x2) <= HANDLE_SIZE) return { chIdx: i, edge: 'end' };
    if (x > x1 && x < x2)               return { chIdx: i, edge: 'body' };
  }
  return null;
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Picks a "nice" round interval (in ms) so that ~steps labels fit in the ruler.
 */
export function niceInterval(totalMs, steps) {
  const raw = totalMs / Math.max(steps, 1);
  const levels = [100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000];
  for (const v of levels) if (v >= raw) return v;
  return 300000;
}
