document.addEventListener('keydown', (e) => {
  if (viewer.classList.contains('hidden')) return;

  if (e.key === 'Escape' && State.editMode) { setEditMode(false); return; }

  if (e.key === 'f' || e.key === 'F') {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    return;
  }

  if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(zoom + ZOOM_STEP); return; }
  if (e.ctrlKey && e.key === '-') { e.preventDefault(); setZoom(zoom - ZOOM_STEP); return; }
  if (e.ctrlKey && e.key === '0') { e.preventDefault(); resetZoom(); return; }

  if (State.editMode) return;

  if (e.key === 'ArrowDown')  { goNext(); return; }
  if (e.key === 'ArrowUp')    { goPrev(); return; }
  if (e.key === 'ArrowRight') { State.rtl ? goPrev() : goNext(); }
  if (e.key === 'ArrowLeft')  { State.rtl ? goNext() : goPrev(); }
});
