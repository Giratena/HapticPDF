/**
 * sidebar.js – Chapter sidebar rendering.
 *
 * Rebuilds the chapter list DOM from state.
 * Calls back into the component via the callbacks object so this module
 * stays free of direct component references.
 */

import { msToTimeStr } from './export.js';

/**
 * Re-renders the chapter list inside `container`.
 *
 * @param {object} state        - EditorState
 * @param {HTMLElement} container - The #chapter-list element
 * @param {object} callbacks
 * @param {function(number): void} callbacks.onSelect   - User clicked a chapter row
 * @param {function(number): void} callbacks.onEdit     - User clicked ✎ on a chapter
 * @param {function(number): void} callbacks.onDelete   - User clicked 🗑 on a chapter
 */
export function renderSidebar(state, container, callbacks) {
  container.innerHTML = '';

  if (state.chapters.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ch-item';
    empty.style.color = '#555';
    empty.style.fontSize = '11px';
    empty.style.padding = '10px';
    empty.textContent = 'No chapters. Click + to add one.';
    container.appendChild(empty);
    return;
  }

  state.chapters.forEach((ch, i) => {
    const item = _buildChapterItem(ch, i, i === state.selectedIdx, callbacks);
    container.appendChild(item);
  });
}

// ── Private ───────────────────────────────────────────────────────────────────

function _buildChapterItem(ch, idx, isSelected, callbacks) {
  const item = document.createElement('div');
  item.className = 'ch-item' + (isSelected ? ' selected' : '');

  // Colour dot
  const dot = document.createElement('div');
  dot.className = 'ch-color-dot';
  dot.style.backgroundColor = ch.color;

  // Name label
  const name = document.createElement('div');
  name.className = 'ch-name';
  name.textContent = ch.name || '(empty)';
  name.title = `${ch.name}\n${msToTimeStr(ch.startMs)} – ${msToTimeStr(ch.endMs)}`;

  // Action buttons
  const actWrap = document.createElement('div');
  actWrap.className = 'ch-actions';

  const btnEdit = _makeChBtn('✎', 'Edit chapter', () => callbacks.onEdit(idx));
  const btnDel  = _makeChBtn('🗑', 'Delete chapter', () => callbacks.onDelete(idx));
  btnDel.classList.add('del');

  actWrap.appendChild(btnEdit);
  actWrap.appendChild(btnDel);

  item.appendChild(dot);
  item.appendChild(name);
  item.appendChild(actWrap);

  item.addEventListener('click', () => callbacks.onSelect(idx));

  return item;
}

function _makeChBtn(label, title, onClick) {
  const btn = document.createElement('button');
  btn.className = 'ch-btn';
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}
