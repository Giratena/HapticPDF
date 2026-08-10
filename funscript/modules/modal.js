/**
 * modal.js – Add / Edit chapter modal logic.
 *
 * Opens a modal dialog pre-populated with chapter data (or blank for new),
 * resolves with the edited data on OK, or null on cancel.
 *
 * Usage:
 *   Modal.open(els, editIdx, state)  → Promise<{name, startMs, endMs} | null>
 */

export const Modal = {
  /**
   * Opens the modal and returns a promise that resolves when the user
   * clicks OK or Cancel.
   *
   * @param {object} els        - Shadow DOM elements: overlay, title, name, start, end
   * @param {number|null} editIdx - Chapter index to edit, or null for new
   * @param {object} state      - EditorState (used to pre-fill values)
   * @returns {Promise<{name:string, startMs:number, endMs:number} | null>}
   */
  open(els, editIdx, state) {
    return new Promise((resolve) => {
      const isEdit = editIdx !== null;

      els.title.textContent = isEdit ? 'Edit Chapter' : 'Add Chapter';

      if (isEdit) {
        const ch = state.chapters[editIdx];
        els.name.value  = ch.name;
        els.start.value = ch.startMs;
        els.end.value   = ch.endMs;
      } else {
        els.name.value  = '';
        els.start.value = state.totalDuration;
        els.end.value   = state.totalDuration + 5000;
      }

      els.overlay.classList.remove('hidden');
      setTimeout(() => els.name.focus(), 40);

      // ── Handlers ────────────────────────────────────────────────────────────
      const cleanup = () => {
        els.overlay.classList.add('hidden');
        els.btnOk.removeEventListener('click', onOk);
        els.btnCancel.removeEventListener('click', onCancel);
        els.overlay.removeEventListener('click', onOverlayClick);
        els.name.removeEventListener('keydown', onEnter);
      };

      const onOk = () => {
        cleanup();
        const name    = els.name.value.trim() || '(unnamed)';
        const startMs = Math.max(0, parseInt(els.start.value, 10) || 0);
        const endMs   = Math.max(startMs + 1, parseInt(els.end.value, 10) || startMs + 5000);
        resolve({ name, startMs, endMs });
      };

      const onCancel = () => { cleanup(); resolve(null); };

      const onOverlayClick = (e) => {
        if (e.target === els.overlay) onCancel();
      };

      const onEnter = (e) => {
        if (e.key === 'Enter') onOk();
        if (e.key === 'Escape') onCancel();
      };

      els.btnOk.addEventListener('click', onOk);
      els.btnCancel.addEventListener('click', onCancel);
      els.overlay.addEventListener('click', onOverlayClick);
      els.name.addEventListener('keydown', onEnter);
    });
  },
};
