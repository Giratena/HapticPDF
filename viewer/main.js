pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

Regions.init(document.getElementById('region-overlay'));
Config.init();
ScriptDefinitions.init();

window.addEventListener('resize', () => Regions.redraw());

Config.setOnRTLChange((isRTL) => {
  State.rtl = isRTL;
  applyDirectionVisuals();
});

Config.setOnZoomModeChange(() => {
  PageCache.clear();
  if (State.pdfDoc && State.pages.length) {
    PageCache.init(State.pdfDoc, State.pages, getPageScaleFn());
  }
  if (State.pages.length && !State.rendering) {
    renderPage(State.pages[State.current]).then(() => {
      requestAnimationFrame(() => Regions.redraw());
    });
  }
});

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

  pageFillerSelect.classList.toggle('hidden', !hasNames);
  pageFillerSelect.innerHTML = opts;
  if (hasNames) pageFillerSelect.value = pageFillerInput.value;
});

fillerScriptSelect.addEventListener('change', () => {
  if (!fillerScriptSelect.value) return;
  fillerScriptInput.value = fillerScriptSelect.value;
  fillerScriptInput.dispatchEvent(new Event('input'));
});

pageFillerInput.addEventListener('input', () => {
  if (State.pages[State.current]) {
    Regions.setPageFiller(State.pages[State.current].name, pageFillerInput.value);
  }
});
pageFillerInput.addEventListener('keydown', (e) => e.stopPropagation());

pageFillerSelect.addEventListener('change', () => {
  if (!pageFillerSelect.value) return;
  pageFillerInput.value = pageFillerSelect.value;
  pageFillerInput.dispatchEvent(new Event('input'));
});

Regions.setOnHoverRegion((name, region, onImage) => {
  if (name !== null) {
    debugHover.textContent = `Region: ${name}`;
    if (Config.showRegionFeedback) debugHover.classList.remove('hidden');
    if (region && region.script) Edi.play(region.script);
  } else {
    const filler = Regions.getPageFiller(State.pages[State.current]?.name) || Config.fillerScript;
    if (filler && onImage) {
      debugHover.textContent = `Filler: ${filler}`;
      if (Config.showRegionFeedback) debugHover.classList.remove('hidden');
      Edi.play(filler);
    } else {
      debugHover.classList.add('hidden');
      Edi.stop();
    }
  }
});

document.getElementById('btn-config').addEventListener('click', () => {
  editSidebar.classList.remove('open');
  Config.toggle();
});

document.getElementById('btn-back').addEventListener('click', () => {
  setEditMode(false);
  editSidebar.classList.remove('open');
  Config.close();
  closeFunscriptPanel();
  viewer.classList.add('hidden');
  landing.classList.remove('hidden');
  State.pages.forEach(p => { if (p.type === 'img') URL.revokeObjectURL(p.url); });
  State.pages  = [];
  State.pdfDoc = null;
  PageCache.clear();
});

const btnFullscreen = document.getElementById('btn-fullscreen');
btnFullscreen.addEventListener('click', () =>
  document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
);
document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement;
  btnFullscreen.textContent = isFs ? '✕ Exit Fullscreen' : '⛶ Fullscreen';
  viewer.classList.toggle('fullscreen', isFs);
  setTimeout(() => Regions.redraw(), 320);
});
