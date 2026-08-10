pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const landing   = document.getElementById('landing');
const viewer    = document.getElementById('viewer');
const canvas    = document.getElementById('pdf-canvas');
const imgEl     = document.getElementById('img-display');
const pageInfos = [document.getElementById('page-info'), document.getElementById('page-info-bottom')];

let pages     = [];
let current   = 0;
let pdfDoc    = null;
let rendering = false;
let rtl       = false; // false = LTR (English), true = RTL (Japanese)

document.getElementById('input-pdf').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const buffer = await file.arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
  pages = Array.from({ length: pdfDoc.numPages }, (_, i) => ({ type: 'pdf', index: i + 1 }));
  openViewer(0);
});

document.getElementById('input-folder').addEventListener('change', (e) => {
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  const files = Array.from(e.target.files)
    .filter(f => IMAGE_TYPES.includes(f.type))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (!files.length) return;

  pages = files.map(f => ({ type: 'img', url: URL.createObjectURL(f) }));
  pdfDoc = null;
  openViewer(0);
});

function openViewer(index) {
  landing.classList.add('hidden');
  viewer.classList.remove('hidden');
  goTo(index);
}

function goTo(index) {
  if (rendering) return;
  if (index < 0 || index >= pages.length) return;
  current = index;
  renderPage(pages[current]);
  updateUI();
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
    imgEl.src = page.url;
  }

  rendering = false;
}

// --- Navigation helpers (direction-aware) ---
function goPrev() { goTo(current - 1); }
function goNext() { goTo(current + 1); }

// Left side of screen → "back" in current reading direction
function zoneLeftClick()  { rtl ? goNext() : goPrev(); }
// Right side of screen → "forward" in current reading direction
function zoneRightClick() { rtl ? goPrev() : goNext(); }

document.getElementById('btn-prev').addEventListener('click',  goPrev);
document.getElementById('btn-next').addEventListener('click',  goNext);
document.getElementById('zone-prev').addEventListener('click', zoneLeftClick);
document.getElementById('zone-next').addEventListener('click', zoneRightClick);

// --- Direction toggle ---
const btnDirection = document.getElementById('btn-direction');

function applyDirection() {
  btnDirection.textContent = rtl ? '📖 RTL' : '📖 LTR';
  btnDirection.title = rtl
    ? 'Reading: Right → Left (Japanese). Click to switch.'
    : 'Reading: Left → Right (English). Click to switch.';
  btnDirection.classList.toggle('rtl-active', rtl);
  // Visual hint: flip the gradient on the click zones
  document.getElementById('zone-prev').style.background = rtl
    ? 'linear-gradient(to right, rgba(255,200,100,0.08), transparent)'
    : 'linear-gradient(to right, rgba(255,255,255,0.06), transparent)';
  document.getElementById('zone-next').style.background = rtl
    ? 'linear-gradient(to left, rgba(255,200,100,0.08), transparent)'
    : 'linear-gradient(to left, rgba(255,255,255,0.06), transparent)';
}

btnDirection.addEventListener('click', () => {
  rtl = !rtl;
  applyDirection();
});

// --- Back button ---
document.getElementById('btn-back').addEventListener('click', () => {
  viewer.classList.add('hidden');
  landing.classList.remove('hidden');
  pages.forEach(p => { if (p.type === 'img') URL.revokeObjectURL(p.url); });
  pages = [];
  pdfDoc = null;
});

// --- Keyboard navigation (direction-aware) ---
document.addEventListener('keydown', (e) => {
  if (viewer.classList.contains('hidden')) return;
  if (e.key === 'ArrowDown')  { goNext(); return; }
  if (e.key === 'ArrowUp')    { goPrev(); return; }
  // Left/Right respect reading direction
  if (e.key === 'ArrowRight') { rtl ? goPrev() : goNext(); }
  if (e.key === 'ArrowLeft')  { rtl ? goNext() : goPrev(); }
});
