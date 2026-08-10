/**
 * export.js – Funscript import parser and export builder.
 *
 * Import: takes a raw funscript JSON object and populates editor state.
 * Export: takes editor state and produces a valid funscript JSON object.
 */

import { PALETTE } from './state.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses a funscript time string ("00:01:22.208") into milliseconds.
 * Returns null if the string is invalid.
 */
export function parseTimeStr(str) {
  if (!str) return null;
  const m = str.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return (parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3])) * 1000;
}

/**
 * Formats milliseconds as "HH:MM:SS.mmm".
 */
export function msToTimeStr(ms) {
  const totalS = ms / 1000;
  const h = Math.floor(totalS / 3600);
  const min = Math.floor((totalS % 3600) / 60);
  const sec = (totalS % 60).toFixed(3).padStart(6, '0');
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${sec}`;
}

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Loads a parsed funscript JSON object into editor state.
 * Mutates state in place.
 *
 * @param {object} json    - Parsed funscript JSON
 * @param {object} state   - EditorState (from state.js)
 */
export function loadJSON(json, state) {
  state.chapters    = [];
  state.selectedIdx = -1;

  const rawMeta     = json.metadata || {};
  const rawChapters = rawMeta.chapters || [];
  const allActions  = json.actions || [];

  // Preserve game-engine top-level fields so they round-trip on export.
  state._importMeta = {
    path:        json.path     ?? null,
    filename:    json.filename ?? null,
    metaDuration: rawMeta.duration ?? null,
  };

  // Determine total duration from chapter endpoints and action timestamps.
  // Note: metadata.duration is preserved separately and not used for the
  // timeline, since it often reflects video length rather than script content.
  let maxMs = 0;
  allActions.forEach(a => { if (a.at > maxMs) maxMs = a.at; });
  rawChapters.forEach(ch => {
    const end = ch.EndTimeMilis ?? parseTimeStr(ch.endTime) ?? 0;
    if (end > maxMs) maxMs = end;
  });
  state.totalDuration = maxMs || 10000;

  rawChapters.forEach((ch, i) => {
    const startMs = ch.StartTimeMilis ?? parseTimeStr(ch.startTime) ?? 0;
    const endMs   = ch.EndTimeMilis   ?? parseTimeStr(ch.endTime)   ?? startMs + 5000;

    // Extract the global actions that belong to this chapter's time window,
    // then convert them to chapter-local time (at = 0 means chapter start).
    const localActions = allActions
      .filter(a => a.at >= startMs && a.at <= endMs)
      .map(a => ({ at: a.at - startMs, pos: a.pos }))
      .sort((a, b) => a.at - b.at);

    state.chapters.push({
      // Use ?? '' so that intentional empty-string names ("") are preserved,
      // only falling back when the field is truly null/undefined.
      name:    ch.name ?? '',
      startMs,
      endMs,
      actions: localActions,
      color:   PALETTE[i % PALETTE.length],
    });
  });

  // Fallback: no chapters defined but actions present → one default chapter
  if (state.chapters.length === 0 && allActions.length > 0) {
    state.chapters.push({
      name:    'default',
      startMs: 0,
      endMs:   state.totalDuration,
      actions: allActions
        .map(a => ({ at: a.at, pos: a.pos }))
        .sort((a, b) => a.at - b.at),
      color: PALETTE[0],
    });
  }

  if (state.chapters.length > 0) state.selectedIdx = 0;
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Builds a valid funscript JSON object from editor state.
 * Chapter-local action times are offset back to global timeline.
 *
 * @param {object} state - EditorState
 * @returns {object}     - Funscript JSON object (ready for JSON.stringify)
 */
export function buildExportObject(state) {
  // Merge all chapter actions back onto the global timeline.
  // Use a Map keyed by `at` to deduplicate: chapters that share the same
  // time range (e.g. an idle chapter and an orgasm chapter both at 0–11004ms)
  // intentionally produce the same keyframes — we keep one copy per timestamp.
  const actionMap = new Map();
  state.chapters.forEach(ch => {
    ch.actions.forEach(a => {
      const globalAt = a.at + ch.startMs;
      if (!actionMap.has(globalAt)) {
        actionMap.set(globalAt, a.pos);
      }
    });
  });

  const merged = Array.from(actionMap.entries())
    .map(([at, pos]) => ({ pos, at }))
    .sort((a, b) => a.at - b.at);

  const chapters = state.chapters.map(ch => ({
    name:           ch.name,
    startTime:      msToTimeStr(ch.startMs),
    endTime:        msToTimeStr(ch.endMs),
    StartTimeMilis: ch.startMs,
    EndTimeMilis:   ch.endMs,
  }));

  // Restore the original metadata.duration if one was imported; otherwise
  // derive it from the current total duration.
  const meta    = state._importMeta || {};
  const durSecs = meta.metaDuration != null
    ? meta.metaDuration
    : state.totalDuration / 1000;

  const obj = {
    version:  '1.0',
    inverted: false,
    range:    100,
    metadata: {
      chapters,
      creator:     '',
      description: '',
      duration:    durSecs,
      license:     '',
      notes:       '',
      performers:  [],
      scriptUrl:   '',
      tags:        [],
      title:       '',
      type:        'basic',
      videoUrl:    '',
    },
    actions: merged,
  };

  // Re-attach game-engine top-level fields if they were present on import.
  if (meta.path     != null) obj.path     = meta.path;
  if (meta.filename != null) obj.filename = meta.filename;

  return obj;
}

/**
 * Triggers a browser file download of the funscript JSON.
 *
 * @param {object} obj      - Output of buildExportObject()
 * @param {string} filename - e.g. "output.funscript"
 */
export function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
