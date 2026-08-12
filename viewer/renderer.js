const canvas = document.getElementById('pdf-canvas');
const imgEl  = document.getElementById('img-display');

async function renderPage(page) {
  State.rendering = true;

  if (page.type === 'pdf') {
    const cached = PageCache.get(page.index);
    if (cached) {
      const cssW = cached.width  / window.devicePixelRatio;
      const cssH = cached.height / window.devicePixelRatio;
      canvas.width  = cached.width;
      canvas.height = cached.height;
      canvas.style.width  = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.getContext('2d').drawImage(cached, 0, 0);
      canvas.classList.remove('hidden');
      imgEl.classList.add('hidden');
      State.rendering = false;
      return;
    }

    const bitmap = await PageCache.getOrRender(page.index);
    if (bitmap) {
      const cssW = bitmap.width  / window.devicePixelRatio;
      const cssH = bitmap.height / window.devicePixelRatio;
      canvas.width  = bitmap.width;
      canvas.height = bitmap.height;
      canvas.style.width  = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
    }
    canvas.classList.remove('hidden');
    imgEl.classList.add('hidden');

  } else {
    imgEl.classList.remove('hidden');
    canvas.classList.add('hidden');

    const wrap     = document.getElementById('content-wrap');
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
      imgEl.style.maxWidth  = `${wrap.clientWidth}px`;
      imgEl.style.maxHeight = `${wrap.clientHeight}px`;
      imgEl.style.width     = '';
      imgEl.style.height    = '';
    }

    imgEl.src = page.url;
    if (!imgEl.complete) {
      await new Promise(resolve => { imgEl.onload = resolve; });
    }
  }

  State.rendering = false;
}
