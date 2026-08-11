/**
 * PageCache.js
 *
 * Handles pre-rendering and caching of PDF pages as ImageBitmaps so that
 * page navigation is instantaneous and flash-free.
 *
 * Usage:
 *   PageCache.init(pdfDoc, pages, getScaleFn)  — call when a PDF is opened
 *   PageCache.get(pageIndex)                   — returns ImageBitmap or null
 *   PageCache.preloadAround(currentIndex)      — background-render adjacent pages
 *   PageCache.clear()                          — drop all cached bitmaps
 */
const PageCache = (() => {
  // Map<pageIndex (1-based), Promise<ImageBitmap>>
  const _cache = new Map();
  const MAX_CACHED = 7;   // keep at most this many pages in memory
  // Track insertion order so we can evict the oldest entry
  const _order = [];

  let _pdfDoc   = null;
  let _pages    = [];
  let _getScale = null; // () => number  — called at render time so zoom changes are picked up

  // ── Public API ───────────────────────────────────────────────────────────────

  function init(pdfDoc, pages, getScaleFn) {
    clear();
    _pdfDoc   = pdfDoc;
    _pages    = pages;
    _getScale = getScaleFn;
  }

  /**
   * Returns a cached ImageBitmap for the given 1-based page index, or null if
   * the page hasn't been rendered yet.
   */
  function get(pageIndex) {
    const entry = _cache.get(pageIndex);
    if (!entry) return null;
    // If still a pending Promise return null (caller should render normally)
    if (entry instanceof ImageBitmap) return entry;
    return null;
  }

  /**
   * Returns a Promise<ImageBitmap> for the given page index, rendering it in
   * the background if not already cached.
   */
  function getOrRender(pageIndex) {
    if (_cache.has(pageIndex)) {
      const v = _cache.get(pageIndex);
      if (v instanceof Promise)      return v;
      if (v instanceof ImageBitmap)  return Promise.resolve(v);
    }

    const promise = _renderBitmap(pageIndex).then(bitmap => {
      // Replace the promise entry with the resolved bitmap
      _cache.set(pageIndex, bitmap);
      return bitmap;
    }).catch(() => {
      _cache.delete(pageIndex);
      return null;
    });

    _store(pageIndex, promise);
    return promise;
  }

  /**
   * Kicks off background renders for pages around the current index.
   * Preloads: current, next, next+1, prev, prev-1
   */
  function preloadAround(currentIndex) {
    if (!_pdfDoc || !_pages.length) return;

    const targets = [
      currentIndex,
      currentIndex + 1,
      currentIndex + 2,
      currentIndex - 1,
      currentIndex - 2,
    ];

    for (const idx of targets) {
      if (idx < 0 || idx >= _pages.length) continue;
      const page = _pages[idx];
      if (page.type !== 'pdf') continue;
      if (_cache.has(page.index)) continue;
      getOrRender(page.index); // fire-and-forget
    }
  }

  /** Drop all cached bitmaps and reset state. */
  function clear() {
    for (const v of _cache.values()) {
      if (v instanceof ImageBitmap) v.close();
    }
    _cache.clear();
    _order.length = 0;
    _pdfDoc   = null;
    _pages    = [];
    _getScale = null;
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  function _store(pageIndex, value) {
    if (!_cache.has(pageIndex)) {
      _order.push(pageIndex);
    }
    _cache.set(pageIndex, value);
    _evictIfNeeded();
  }

  function _evictIfNeeded() {
    while (_order.length > MAX_CACHED) {
      const oldest = _order.shift();
      const v = _cache.get(oldest);
      if (v instanceof ImageBitmap) v.close();
      _cache.delete(oldest);
    }
  }

  async function _renderBitmap(pageIndex) {
    if (!_pdfDoc || !_getScale) throw new Error('PageCache not initialised');

    const pdfPage  = await _pdfDoc.getPage(pageIndex);
    const nativeVP = pdfPage.getViewport({ scale: 1 });
    const scale    = _getScale(nativeVP);
    const viewport = pdfPage.getViewport({ scale });

    const offscreen = document.createElement('canvas');
    offscreen.width  = viewport.width;
    offscreen.height = viewport.height;

    await pdfPage.render({
      canvasContext: offscreen.getContext('2d'),
      viewport,
    }).promise;

    return await createImageBitmap(offscreen);
  }

  return { init, get, getOrRender, preloadAround, clear };
})();
