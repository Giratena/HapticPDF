pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const landing   = document.getElementById('landing');
const viewer    = document.getElementById('viewer');
const canvas    = document.getElementById('pdf-canvas');
const imgEl     = document.getElementById('img-display');
const pageInfos = [document.getElementById('page-info'), document.getElementById('page-info-bottom')];

// ── Sidebar refs ──────────────────────────────────────────────────────────────
const editSidebar       = document.getElementById('edit-sidebar');
const regionNameInput   = document.getElementById('region-name-input');
const regionScriptInput = document.getElementById('region-script-input');
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

// ── Regions & Config init ─────────────────────────────────────────────────────
Regions.init(document.getElementById('region-overlay'));
Config.init();
window.addEventListener('resize', () => Regions.redraw());

// ── RTL state (owned by Config) ───────────────────────────────────────────────
let rtl = false;
Config.setOnRTLChange((isRTL) => {
  rtl = isRTL;
  applyDirectionVisuals();
});

// ── Sidebar: selection change ─────────────────────────────────────────────────
Regions.setOnSelectionChange((idx, region) => {
  if (idx === null || region === null) {
    editSidebar.classList.remove('open');
  } else {
    regionNameInput.value     = region.name     || '';
    regionScriptInput.value   = region.script   || '';
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
    debugHover.classList.remove('hidden');
    // Fire EDI play if this region has a script assigned
    if (region && region.script) {
      Edi.play(region.script);
    }
  } else {
    debugHover.classList.add('hidden');
    // No region hovered — play filler or stop
    const filler = Config.fillerScript;
    if (filler) {
      Edi.play(filler);
    } else {
      Edi.stop();
    }
  }
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

  const pdfBaseName = file.name.replace(/\.pdf$/i, '');
  await Regions.setSource(fileHandle, 'pdf', pdfBaseName);
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
  await renderPage(pages[current]);
  updateUI();
  // rAF ensures the browser has laid out the image before we position circles
  requestAnimationFrame(() => Regions.onPageChange(pages[current].name));
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
    canvas.classList.remove('hidden');
    imgEl.classList.add('hidden');

    const pdfPage = await pdfDoc.getPage(page.index);
    const wrap    = document.getElementById('content-wrap');
    const scale   = Math.min(
      wrap.clientWidth  / pdfPage.getViewport({ scale: 1 }).width,
      wrap.clientHeight / pdfPage.getViewport({ scale: 1 }).height
    ) * window.devicePixelRatio;

    const viewport = pdfPage.getViewport({ scale });
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    canvas.style.width  = `${viewport.width  / window.devicePixelRatio}px`;
    canvas.style.height = `${viewport.height / window.devicePixelRatio}px`;

    await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  } else {
    imgEl.classList.remove('hidden');
    canvas.classList.add('hidden');
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

document.getElementById('btn-prev').addEventListener('click',  goPrev);
document.getElementById('btn-next').addEventListener('click',  goNext);
document.getElementById('zone-prev').addEventListener('click', zoneLeftClick);
document.getElementById('zone-next').addEventListener('click', zoneRightClick);

// ── Content-wrap click: navigate pages when not in edit mode ──────────────────
// The canvas/img elements sit above the click zones in the hit-test order,
// so we also listen directly on the content area and split left/right halves.
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

// ── Edit mode toggle ──────────────────────────────────────────────────────────
const btnEdit = document.getElementById('btn-edit');

function setEditMode(on) {
  editMode = on;
  btnEdit.classList.toggle('edit-active', on);
  btnEdit.textContent = on ? '✏️ Editing' : '✏️ Edit';
  // Disable click-zone navigation while editing (lets user draw near screen edges)
  document.getElementById('zone-prev').style.pointerEvents = on ? 'none' : '';
  document.getElementById('zone-next').style.pointerEvents = on ? 'none' : '';
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
  viewer.classList.add('hidden');
  landing.classList.remove('hidden');
  pages.forEach(p => { if (p.type === 'img') URL.revokeObjectURL(p.url); });
  pages = [];
  pdfDoc = null;
});

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (viewer.classList.contains('hidden')) return;
  // Escape exits edit mode
  if (e.key === 'Escape' && editMode) { setEditMode(false); return; }
  // No page navigation while editing
  if (editMode) return;
  if (e.key === 'ArrowDown')  { goNext(); return; }
  if (e.key === 'ArrowUp')    { goPrev(); return; }
  if (e.key === 'ArrowRight') { rtl ? goPrev() : goNext(); }
  if (e.key === 'ArrowLeft')  { rtl ? goNext() : goPrev(); }
});
