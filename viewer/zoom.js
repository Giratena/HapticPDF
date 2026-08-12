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

function resetZoom() {
  zoom = 1;
  applyTransform();
}

// Returns a scale function for PageCache.init based on current zoom mode
function getPageScaleFn() {
  return (nativeVP) => {
    const wrap = document.getElementById('content-wrap');
    const mode = Config.zoomMode;
    if (mode === 'fit-width')   return (wrap.clientWidth / nativeVP.width) * window.devicePixelRatio;
    if (mode === 'actual-size') return window.devicePixelRatio;
    return Math.min(wrap.clientWidth / nativeVP.width, wrap.clientHeight / nativeVP.height) * window.devicePixelRatio;
  };
}

document.getElementById('btn-zoom-in').addEventListener('click',  () => setZoom(zoom + ZOOM_STEP));
document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
