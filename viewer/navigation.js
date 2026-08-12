const pageInfoTop    = document.getElementById('page-info');
const pageInfoBottom = document.getElementById('page-info-bottom');
const pageGotoInput  = document.getElementById('page-goto-input');

function openViewer(index) {
  landing.classList.add('hidden');
  viewer.classList.remove('hidden');
  goTo(index);
}

async function goTo(index) {
  if (State.rendering) return;
  if (index < 0 || index >= State.pages.length) return;
  State.current = index;
  resetZoom();
  await renderPage(State.pages[State.current]);
  updateUI();
  requestAnimationFrame(() => {
    Regions.onPageChange(State.pages[State.current].name);
    const pf = Regions.getPageFiller(State.pages[State.current].name);
    pageFillerInput.value  = pf;
    pageFillerSelect.value = pf;
  });
  PageCache.preloadAround(State.current);
}

function updateUI() {
  const total = State.pages.length;
  pageInfoTop.textContent    = `Page ${State.current + 1} / ${total}`;
  pageInfoBottom.textContent = String(total);
  pageGotoInput.value = State.current + 1;
  pageGotoInput.max   = total;
  document.getElementById('btn-prev').disabled = State.current === 0;
  document.getElementById('btn-next').disabled = State.current === total - 1;
}

function goPrev() { goTo(State.current - 1); }
function goNext() { goTo(State.current + 1); }
function zoneLeftClick()  { State.rtl ? goNext() : goPrev(); }
function zoneRightClick() { State.rtl ? goPrev() : goNext(); }

function applyDirectionVisuals() {
  document.getElementById('btn-prev').innerHTML = State.rtl ? '&#8594;' : '&#8592;';
  document.getElementById('btn-next').innerHTML = State.rtl ? '&#8592;' : '&#8594;';
}

document.getElementById('btn-prev').addEventListener('click', goPrev);
document.getElementById('btn-next').addEventListener('click', goNext);

document.getElementById('content-wrap').addEventListener('scroll', () => Regions.redraw());
document.getElementById('content-wrap').addEventListener('click', (e) => {
  if (State.editMode) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
  isLeftHalf ? zoneLeftClick() : zoneRightClick();
});

pageGotoInput.addEventListener('change', () => {
  const val = parseInt(pageGotoInput.value, 10);
  if (!isNaN(val)) goTo(Math.min(Math.max(val, 1), State.pages.length) - 1);
});
pageGotoInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') pageGotoInput.blur();
});
