/**
 * keyframes.js – Keyframe editor canvas renderer and mouse controller.
 *
 * Draws an X/Y graph (time × position) for the selected chapter's actions.
 * Click = add point, drag = move point, right-click = delete point.
 */

import { niceInterval } from './timeline.js';
import { selectedChapter, selectedDuration } from './state.js';

// ── Layout constants ──────────────────────────────────────────────────────────
const PAD_LEFT   = 40;  // space for Y-axis labels
const PAD_RIGHT  = 20;
const PAD_TOP    = 20;
const PAD_BOTTOM = 30;
const POINT_R    = 4;   // normal point radius
const HOVER_R    = 6;
const DRAG_R     = 7;
const HIT_R      = 8;   // hit-test radius

// ── Coordinate helpers ────────────────────────────────────────────────────────

export function msToX(ms, duration, canvasW) {
  return (ms / Math.max(duration, 1)) * (canvasW - PAD_LEFT - PAD_RIGHT) + PAD_LEFT;
}

export function xToMs(x, duration, canvasW) {
  return Math.round(((x - PAD_LEFT) / (canvasW - PAD_LEFT - PAD_RIGHT)) * duration);
}

export function posToY(pos, canvasH) {
  return (1 - pos / 100) * (canvasH - PAD_TOP - PAD_BOTTOM) + PAD_TOP;
}

export function yToPos(y, canvasH) {
  return Math.round((1 - (y - PAD_TOP) / (canvasH - PAD_TOP - PAD_BOTTOM)) * 100);
}

// ── Draw ──────────────────────────────────────────────────────────────────────

/**
 * Renders the full keyframe editor canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W        - canvas CSS width
 * @param {number} H        - canvas CSS height
 * @param {object} state    - EditorState
 * @param {number} playMs   - current global playhead ms
 * @param {object|null} hoverPt  - { chIdx, ptIdx } or null
 * @param {object|null} dragPt   - { chIdx, ptIdx } or null
 */
export function drawKeyframes(ctx, W, H, state, playMs, hoverPt, dragPt) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(0, 0, W, H);

  const ch = selectedChapter(state);

  if (!ch) {
    ctx.fillStyle = '#334';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Select or create a chapter to edit keyframes.', W / 2, H / 2);
    return;
  }

  const dur = selectedDuration(state);

  _drawGrid(ctx, W, H, dur, ch);
  _drawLines(ctx, W, H, ch);
  _drawPlayhead(ctx, W, H, ch, dur, playMs);
  _drawPoints(ctx, W, H, ch, state.selectedIdx, dur, hoverPt, dragPt);
  _drawAxisLabels(ctx, W, H, dur);
}

// ── Private drawing helpers ───────────────────────────────────────────────────

function _drawGrid(ctx, W, H, dur, ch) {
  // Chapter colour tint
  ctx.fillStyle = ch.color + '0e';
  ctx.fillRect(PAD_LEFT, PAD_TOP, W - PAD_LEFT - PAD_RIGHT, H - PAD_TOP - PAD_BOTTOM);

  // Horizontal grid lines at pos 0, 25, 50, 75, 100
  ctx.strokeStyle = '#1a2a3a';
  ctx.lineWidth = 1;
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  [0, 25, 50, 75, 100].forEach(p => {
    const y = posToY(p, H);
    ctx.strokeStyle = p === 0 ? '#334' : '#1a2a3a';
    ctx.beginPath();
    ctx.moveTo(PAD_LEFT, y);
    ctx.lineTo(W - PAD_RIGHT, y);
    ctx.stroke();

    ctx.fillStyle = '#556';
    ctx.fillText(p, PAD_LEFT - 6, y);
  });

  // Y axis line
  ctx.strokeStyle = '#334';
  ctx.beginPath();
  ctx.moveTo(PAD_LEFT, PAD_TOP - 2);
  ctx.lineTo(PAD_LEFT, H - PAD_BOTTOM);
  ctx.stroke();

  // Vertical time grid lines
  const interval = niceInterval(dur, (W - PAD_LEFT - PAD_RIGHT) / 60);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let ms = 0; ms <= dur; ms += interval) {
    const x = msToX(ms, dur, W);
    ctx.strokeStyle = '#1e2d3d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, PAD_TOP);
    ctx.lineTo(x, H - PAD_BOTTOM);
    ctx.stroke();
    ctx.fillStyle = '#556';
    ctx.fillText((ms / 1000).toFixed(1) + 's', x, H - PAD_BOTTOM + 2);
  }
}

function _drawLines(ctx, W, H, ch) {
  if (ch.actions.length < 2) return;
  const dur = ch.endMs - ch.startMs;

  ctx.strokeStyle = ch.color + 'cc';
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  ch.actions.forEach((a, i) => {
    const x = msToX(a.at, dur, W);
    const y = posToY(a.pos, H);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

function _drawPlayhead(ctx, W, H, ch, dur, playMs) {
  const localMs = playMs - ch.startMs;
  if (localMs < 0 || localMs > dur) return;

  const px = msToX(localMs, dur, W);
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(px, PAD_TOP);
  ctx.lineTo(px, H - PAD_BOTTOM);
  ctx.stroke();
  ctx.setLineDash([]);
}

function _drawPoints(ctx, W, H, ch, selectedIdx, dur, hoverPt, dragPt) {
  ch.actions.forEach((a, idx) => {
    const x = msToX(a.at, dur, W);
    const y = posToY(a.pos, H);

    const isHover = hoverPt && hoverPt.chIdx === selectedIdx && hoverPt.ptIdx === idx;
    const isDrag  = dragPt  && dragPt.chIdx  === selectedIdx && dragPt.ptIdx  === idx;

    const r = isDrag ? DRAG_R : isHover ? HOVER_R : POINT_R;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = isDrag ? '#fff' : ch.color + 'cc';
    ctx.fill();
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

function _drawAxisLabels(ctx, W, H, dur) {
  ctx.fillStyle = '#445';
  ctx.font = '10px system-ui';

  // X label
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`time  (0 – ${(dur / 1000).toFixed(2)} s)`, W / 2, H - 1);

  // Y label (rotated)
  ctx.save();
  ctx.translate(10, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'top';
  ctx.fillText('pos', 0, 0);
  ctx.restore();
}

// ── Hit testing ───────────────────────────────────────────────────────────────

/**
 * Returns the action index under (x, y), or null.
 *
 * @param {number} x
 * @param {number} y
 * @param {object} state    - EditorState
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {number|null}
 */
export function hitTest(x, y, state, canvasW, canvasH) {
  const ch = selectedChapter(state);
  if (!ch) return null;
  const dur = selectedDuration(state);

  for (let i = 0; i < ch.actions.length; i++) {
    const px = msToX(ch.actions[i].at, dur, canvasW);
    const py = posToY(ch.actions[i].pos, canvasH);
    if (Math.hypot(x - px, y - py) <= HIT_R) return i;
  }
  return null;
}
