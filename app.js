pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const landing   = document.getElementById('landing');
const viewer    = document.getElementById('viewer');
const canvas    = document.getElementById('pdf-canvas');
const imgEl     = document.getElementById('img-display');
const pageInfos = [document.getElementById('page-info'), document.getElementById('page-info-bottom')];

// ── Sidebar refs ──────────────────────────────────────────────────────────────
const editSidebar         = document.getElementById('edit-sidebar');
const regionNameInput     = document.getElementById('region-name-input');
const regionScriptInput   = document.getElementById('region-script-input');
const regionScriptSelect  = document.getElementById('region-script-select');
const sidebarClose      = document.getElementById('sidebar-close');
const sidebarDelete     = document.getElementById('sidebar-delete');
const regionPriorityInput = document.getElementById('region-priority-input');
const sidebarBringTop   = document.getElementById('sidebar-bring-top');
const sidebarResize     = document.getElementById('sidebar-resize');
const debugHover        = document.getElementById('debug-hover');

// ── State ────────────────────────────────────────────────────────────────────
let pages     = [];
let current   = 0;
let pdfDoc    = null;
let rendering = false;
let editMode  = false;

// ── Regions & Config & ScriptDefinitions init ─────────────────────────────────
Regions.init(document.getElementById('region-overlay'));
Config.init();
ScriptDefinitions.init();
window.addEventListener('resize', () => Regions.redraw());

// ── RTL state (owned by Config) ───────────────────────────────────────────────
let rtl = false;
Config.setOnRTLChange((isRTL) => {
  rtl = isRTL;
  applyDirectionVisuals();
});

// ── Zoom mode (owned by Config) ───────────────────────────────────────────────
Config.setOnZoomModeChange(() => {
  // Cached bitmaps were rendered at the old scale — invalidate them
  PageCache.clear();
  if (pdfDoc && pages.length) {
    PageCache.init(pdfDoc, pages, (nativeVP) => {
      const wrap     = document.getElementById('content-wrap');
      const zoomMode = Config.zoomMode;
      if (zoomMode === 'fit-width') {
        return (wrap.clientWidth / nativeVP.width) * window.devicePixelRatio;
      } else if (zoomMode === 'actual-size') {
        return window.devicePixelRatio;
      } else {
        return Math.min(
          wrap.clientWidth  / nativeVP.width,
          wrap.clientHeight / nativeVP.height
        ) * window.devicePixelRatio;
      }
    });
  }
  // Re-render the current page so the new zoom mode takes effect immediately
  if (pages.length && !rendering) renderPage(pages[current]).then(() => {
    requestAnimationFrame(() => Regions.redraw());
  });
});

// ── Script definitions: populate dropdowns ───────────────────────────────────
const fillerScriptInput  = document.getElementById('config-filler-script');
const fillerScriptSelect = document.getElementById('config-filler-script-select');

ScriptDefinitions.setOnChange((names) => {
  const opts = '<option value="">— pick a script —</option>' +
    names.map(n => `<option value="${n}">${n}</option>`).join('');
  const hasNames = names.length > 0;

  regionScriptSelect.classList.toggle('hidden', !hasNames);
  regionScriptSelect.innerHTML = opts;

  fillerScriptSelect.classList.toggle('hidden', !hasNames);
  fillerScriptSelect.innerHTML = opts;
  if (hasNames) fillerScriptSelect.value = fillerScriptInput.value;
});

fillerScriptSelect.addEventListener('change', () => {
  if (!fillerScriptSelect.value) return;
  fillerScriptInput.value = fillerScriptSelect.value;
  fillerScriptInput.dispatchEvent(new Event('input'));
});

// ── Sidebar: selection change ─────────────────────────────────────────────────
Regions.setOnSelectionChange((idx, region) => {
  if (idx === null || region === null) {
    editSidebar.classList.remove('open');
  } else {
    regionNameInput.value     = region.name     || '';
    regionScriptInput.value   = region.script   || '';
    regionScriptSelect.value  = region.script   || '';
    regionPriorityInput.value = region.priority ?? 1;
    editSidebar.classList.add('open');
  }
});

// ── Sidebar: name input ───────────────────────────────────────────────────────
regionNameInput.addEventListener('input', () => {
  Regions.renameSelected(regionNameInput.value);
});

// Prevent arrow keys inside the input from navigating pages
regionNameInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
});

// ── Sidebar: script input ─────────────────────────────────────────────────────
regionScriptInput.addEventListener('input', () => {
  Regions.renameSelectedScript(regionScriptInput.value);
});

regionScriptInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
});

// ── Sidebar: script select (picker → fills text input) ───────────────────────
regionScriptSelect.addEventListener('change', () => {
  if (!regionScriptSelect.value) return;
  regionScriptInput.value = regionScriptSelect.value;
  Regions.renameSelectedScript(regionScriptSelect.value);
});

// ── Sidebar: priority input ───────────────────────────────────────────────────
regionPriorityInput.addEventListener('input', () => {
  const val = parseInt(regionPriorityInput.value, 10);
  if (!isNaN(val) && val >= 1) Regions.setPrioritySelected(val);
});

regionPriorityInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
});

// ── Sidebar: bring to top button ──────────────────────────────────────────────
sidebarBringTop.addEventListener('click', () => {
  Regions.bringSelectedToTop();
  // onSelectionChange will fire and update the priority input automatically
});

// ── Sidebar: resize button ────────────────────────────────────────────────────
sidebarResize.addEventListener('click', () => {
  Regions.startResize();
  editSidebar.classList.remove('open'); // close panel so user can draw
});

// ── Sidebar: close button ─────────────────────────────────────────────────────
sidebarClose.addEventListener('click', () => {
  editSidebar.classList.remove('open');
  // Don't deselect the region — user just closed the panel
});

// ── Sidebar: delete button ────────────────────────────────────────────────────
sidebarDelete.addEventListener('click', () => {
  Regions.deleteSelected();
  // sidebar will close via the onSelectionChange callback
});

// ── Debug hover label + EDI play (non-edit mode) ──────────────────────────────
Regions.setOnHoverRegion((name, region) => {
  if (name !== null) {
    debugHover.textContent = `Region: ${name}`;
    // Only show the label if the setting is enabled
    if (Config.showRegionFeedback) debugHover.classList.remove('hidden');
    // Fire EDI play if this region has a script assigned
    if (region && region.script) {
      Edi.play(region.script);
    }
  } else {
    debugHover.classList.add('hidden'); // always hide when no region hovered
    // No region hovered — play filler or stop
    const filler = Config.fillerScript;
    if (filler) {
      Edi.play(filler);
    } else {
      Edi.stop();
    }
  }
});

// ── Open ZIP ──────────────────────────────────────────────────────────────────
document.getElementById('btn-open-zip').addEventListener('click', async () => {
  const result = await ZipLoader.open();
  if (!result) return;

  pages  = result.pages;
  pdfDoc = null;
  await Regions.setSource(result.fileHandle, 'zip', result.baseName);

  try {
    const hapticHandles = await window.showOpenFilePicker({
      types: [{ description: 'Haptic config', accept: { 'application/json': ['.haptic'] } }],
    });
    await Regions.loadHapticFile(hapticHandles[0]);
  } catch {
    // User cancelled — start fresh
  }

  openViewer(0);
});

// ── Open Folder (File System Access API) ─────────────────────────────────────
document.getElementById('btn-open-folder').addEventListener('click', async () => {
  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch { return; } // user cancelled

  const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];
  const entries = [];

  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file') continue;
    const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
    if (IMAGE_EXTS.includes(ext)) entries.push({ name, handle });
  }

  if (!entries.length) return;
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  pages = await Promise.all(entries.map(async ({ name, handle }) => {
    const file = await handle.getFile();
    return { type: 'img', name, url: URL.createObjectURL(file) };
  }));

  pdfDoc = null;
  await Regions.setSource(dirHandle, 'folder', null);
  openViewer(0);
});

// ── Open PDF (File System Access API) ────────────────────────────────────────
document.getElementById('btn-open-pdf').addEventListener('click', async () => {
  let fileHandles;
  try {
    fileHandles = await window.showOpenFilePicker({
      types: [{ description: 'PDF files', accept: { 'application/pdf': ['.pdf'] } }],
    });
  } catch { return; } // user cancelled

  const fileHandle = fileHandles[0];
  const file       = await fileHandle.getFile();
  const buffer     = await file.arrayBuffer();

  pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
  pages  = Array.from({ length: pdfDoc.numPages }, (_, i) => ({
    type:  'pdf',
    index: i + 1,
    name:  `page_${i + 1}`,
  }));

  // Initialise the page cache with a scale function that mirrors renderPage logic
  PageCache.init(pdfDoc, pages, (nativeVP) => {
    const wrap     = document.getElementById('content-wrap');
    const zoomMode = Config.zoomMode;
    if (zoomMode === 'fit-width') {
      return (wrap.clientWidth / nativeVP.width) * window.devicePixelRatio;
    } else if (zoomMode === 'actual-size') {
      return window.devicePixelRatio;
    } else {
      return Math.min(
        wrap.clientWidth  / nativeVP.width,
        wrap.clientHeight / nativeVP.height
      ) * window.devicePixelRatio;
    }
  });

  const pdfBaseName = file.name.replace(/\.pdf$/i, '');
  await Regions.setSource(fileHandle, 'pdf', pdfBaseName);

  // Prompt for an existing .haptic file (user can cancel if they don't have one yet)
  try {
    const hapticHandles = await window.showOpenFilePicker({
      types: [{ description: 'Haptic config', accept: { 'application/json': ['.haptic'] } }],
    });
    await Regions.loadHapticFile(hapticHandles[0]);
  } catch {
    // User cancelled — start fresh, no regions loaded
  }

  openViewer(0);
});

// ── Viewer ────────────────────────────────────────────────────────────────────
function openViewer(index) {
  landing.classList.add('hidden');
  viewer.classList.remove('hidden');
  goTo(index);
}

async function goTo(index) {
  if (rendering) return;
  if (index < 0 || index >= pages.length) return;
  current = index;
  resetZoom();
  await renderPage(pages[current]);
  updateUI();
  // rAF ensures the browser has laid out the image before we position circles
  requestAnimationFrame(() => Regions.onPageChange(pages[current].name));
  // Kick off background pre-rendering of neighbouring pages
  PageCache.preloadAround(current);
}

function updateUI() {
  const label = `Page ${current + 1} / ${pages.length}`;
  pageInfos.forEach(el => el.textContent = label);
  document.getElementById('btn-prev').disabled = current === 0;
  document.getElementById('btn-next').disabled = current === pages.length - 1;
}

async function renderPage(page) {
  rendering = true;

  if (page.type === 'pdf') {
    // ── Try to draw from cache (instant, no flash) ──────────────────────────
    const cached = PageCache.get(page.index);
    if (cached) {
      // Derive display dimensions from the bitmap
      const cssWidth  = cached.width  / window.devicePixelRatio;
      const cssHeight = cached.height / window.devicePixelRatio;
      canvas.width  = cached.width;
      canvas.height = cached.height;
      canvas.style.width  = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.getContext('2d').drawImage(cached, 0, 0);
      canvas.classList.remove('hidden');
      imgEl.classList.add('hidden');
      rendering = false;
      return;
    }

    // ── Cache miss: render off-screen first, then swap (no white flash) ─────
    const bitmap = await PageCache.getOrRender(page.index);
    if (bitmap) {
      const cssWidth  = bitmap.width  / window.devicePixelRatio;
      const cssHeight = bitmap.height / window.devicePixelRatio;
      canvas.width  = bitmap.width;
      canvas.height = bitmap.height;
      canvas.style.width  = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
    }
    canvas.classList.remove('hidden');
    imgEl.classList.add('hidden');

  } else {
    imgEl.classList.remove('hidden');
    canvas.classList.add('hidden');

    // Apply zoom mode CSS before loading so layout is correct immediately
    const zoomMode = Config.zoomMode;
    if (zoomMode === 'fit-width') {
      imgEl.style.maxWidth  = '100%';
      imgEl.style.maxHeight = 'none';
      imgEl.style.width     = '100%';
      imgEl.style.height    = 'auto';
    } else if (zoomMode === 'actual-size') {
      imgEl.style.maxWidth  = 'none';
      imgEl.style.maxHeight = 'none';
      imgEl.style.width     = '';
      imgEl.style.height    = '';
    } else {
      // 'fit-page' — CSS defaults (max-width/max-height: 100%)
      imgEl.style.maxWidth  = '100%';
      imgEl.style.maxHeight = '100%';
      imgEl.style.width     = '';
      imgEl.style.height    = '';
    }

    // Wait for image to fully load so getBoundingClientRect() is accurate
    await new Promise(resolve => {
      imgEl.onload = resolve;
      imgEl.src = page.url;
    });
  }

  rendering = false;
}

// ── Navigation (direction-aware) ──────────────────────────────────────────────
function goPrev() { goTo(current - 1); }
function goNext() { goTo(current + 1); }
function zoneLeftClick()  { rtl ? goNext() : goPrev(); }
function zoneRightClick() { rtl ? goPrev() : goNext(); }

document.getElementById('btn-prev').addEventListener('click', goPrev);
document.getElementById('btn-next').addEventListener('click', goNext);

// ── Content-wrap scroll: keep regions in sync when zoomed in ─────────────────
document.getElementById('content-wrap').addEventListener('scroll', () => Regions.redraw());

// ── Content-wrap click: navigate pages when not in edit mode ──────────────────
// Split left/right halves to determine navigation direction.
document.getElementById('content-wrap').addEventListener('click', (e) => {
  if (editMode) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
  isLeftHalf ? zoneLeftClick() : zoneRightClick();
});

// ── Direction visuals (driven by Config) ──────────────────────────────────────
function applyDirectionVisuals() {
  document.getElementById('btn-prev').innerHTML = rtl ? '&#8594;' : '&#8592;';
  document.getElementById('btn-next').innerHTML = rtl ? '&#8592;' : '&#8594;';
}

// ── Config button ─────────────────────────────────────────────────────────────
document.getElementById('btn-config').addEventListener('click', () => {
  // Close the region edit sidebar if open
  editSidebar.classList.remove('open');
  Config.toggle();
});

// ── Funscript panel ───────────────────────────────────────────────────────────
const funscriptPanel  = document.getElementById('funscript-panel');
const btnFunscript    = document.getElementById('btn-funscript');
const btnFunscriptClose = document.getElementById('btn-funscript-close');

function openFunscriptPanel() {
  // Close any other open panels/sidebars
  editSidebar.classList.remove('open');
  Config.close();
  funscriptPanel.classList.remove('hidden');
  btnFunscript.classList.add('funscript-active');
}

function closeFunscriptPanel() {
  funscriptPanel.classList.add('hidden');
  btnFunscript.classList.remove('funscript-active');
}

btnFunscript.addEventListener('click', () => {
  if (funscriptPanel.classList.contains('hidden')) {
    openFunscriptPanel();
  } else {
    closeFunscriptPanel();
  }
});

btnFunscriptClose.addEventListener('click', closeFunscriptPanel);

// ── Edit mode toggle ──────────────────────────────────────────────────────────
const btnEdit = document.getElementById('btn-edit');

function setEditMode(on) {
  editMode = on;
  btnEdit.classList.toggle('edit-active', on);
  btnEdit.textContent = on ? '✏️ Editing' : '✏️ Edit';
  // Hide debug hover when entering edit mode
  if (on) debugHover.classList.add('hidden');
  Regions.setEditMode(on);
}

btnEdit.addEventListener('click', () => setEditMode(!editMode));

// ── Back button ───────────────────────────────────────────────────────────────
document.getElementById('btn-back').addEventListener('click', () => {
  setEditMode(false);
  editSidebar.classList.remove('open');
  Config.close();
  closeFunscriptPanel();
  viewer.classList.add('hidden');
  landing.classList.remove('hidden');
  pages.forEach(p => { if (p.type === 'img') URL.revokeObjectURL(p.url); });
  pages = [];
  pdfDoc = null;
  PageCache.clear(); // free cached bitmaps
});

// ── Fullscreen ────────────────────────────────────────────────────────────────
const btnFullscreen = document.getElementById('btn-fullscreen');
btnFullscreen.addEventListener('click', () =>
  document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
);
document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement;
  btnFullscreen.textContent = isFs ? '✕ Exit Fullscreen' : '⛶ Fullscreen';
  viewer.classList.toggle('fullscreen', isFs);
  // Redraw regions after bars have finished animating in/out (matches CSS transition)
  setTimeout(() => Regions.redraw(), 320);
});

// ── Zoom & Pan ────────────────────────────────────────────────────────────────
const contentWrap = document.getElementById('content-wrap');
const pageInner   = document.getElementById('page-inner');
const zoomLevelEl = document.getElementById('zoom-level');
let zoom = 1;
const ZOOM_STEP = 0.25, ZOOM_MIN = 0.25, ZOOM_MAX = 4;

function applyTransform() {
  pageInner.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
  zoomLevelEl.textContent = `${Math.round(zoom * 100)}%`;
  Regions.redraw();
}

function setZoom(z) {
  zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  applyTransform();
}

function resetZoom() { zoom = 1; applyTransform(); }

document.getElementById('btn-zoom-in').addEventListener('click',  () => setZoom(zoom + ZOOM_STEP));
document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(zoom - ZOOM_STEP));

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (viewer.classList.contains('hidden')) return;
  // Escape exits edit mode
  if (e.key === 'Escape' && editMode) { setEditMode(false); return; }
  // Fullscreen toggle
  if (e.key === 'f' || e.key === 'F') {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    return;
  }
  // Zoom shortcuts
  if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(zoom + ZOOM_STEP); return; }
  if (e.ctrlKey && e.key === '-') { e.preventDefault(); setZoom(zoom - ZOOM_STEP); return; }
  if (e.ctrlKey && e.key === '0') { e.preventDefault(); resetZoom(); return; }
  // No page navigation while editing
  if (editMode) return;
  if (e.key === 'ArrowDown')  { goNext(); return; }
  if (e.key === 'ArrowUp')    { goPrev(); return; }
  if (e.key === 'ArrowRight') { rtl ? goPrev() : goNext(); }
  if (e.key === 'ArrowLeft')  { rtl ? goNext() : goPrev(); }
});
