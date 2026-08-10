/**
 * state.js – Central data model for the funscript editor.
 *
 * All mutable editor state lives here. Modules receive the state object
 * and read/write it directly; the component re-renders after mutations.
 */

/** Colour palette – one colour per chapter, cycles when > 14 chapters. */
export const PALETTE = [
  '#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ce93d8',
  '#80cbc4', '#fff176', '#ff8a65', '#a5d6a7', '#90caf9',
  '#ef9a9a', '#b39ddb', '#80deea', '#e6ee9c',
];

/**
 * Creates a fresh, empty state object.
 *
 * @returns {EditorState}
 *
 * @typedef {Object} Chapter
 * @property {string}   name
 * @property {number}   startMs
 * @property {number}   endMs
 * @property {Action[]} actions   – local time (0 = chapter start)
 * @property {string}   color
 *
 * @typedef {Object} Action
 * @property {number} at   – milliseconds (local to chapter)
 * @property {number} pos  – 0–100
 *
 * @typedef {Object} EditorState
 * @property {Chapter[]} chapters
 * @property {number}    selectedIdx   – index into chapters, -1 = none
 * @property {number}    totalDuration – ms
 */
export function createState() {
  return {
    chapters:      [],
    selectedIdx:   -1,
    totalDuration: 0,
    // Preserves top-level fields from an imported file so they round-trip on export.
    // { path?: string, filename?: string, metaDuration?: number }
    _importMeta:   {},
  };
}

/** Returns the currently selected chapter, or null. */
export function selectedChapter(state) {
  if (state.selectedIdx < 0 || state.selectedIdx >= state.chapters.length) return null;
  return state.chapters[state.selectedIdx];
}

/**
 * Clamps selectedIdx to valid range after chapters array changes.
 * Call this any time you splice/push into state.chapters.
 */
export function clampSelection(state) {
  if (state.chapters.length === 0) {
    state.selectedIdx = -1;
  } else {
    state.selectedIdx = Math.min(
      Math.max(state.selectedIdx, 0),
      state.chapters.length - 1,
    );
  }
}

/** Duration in ms of the selected chapter, or 0 if none selected. */
export function selectedDuration(state) {
  const ch = selectedChapter(state);
  return ch ? ch.endMs - ch.startMs : 0;
}
