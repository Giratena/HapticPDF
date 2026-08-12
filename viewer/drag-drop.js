const IMAGE_EXTS_DD = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function ddFileExt(name) {
  const dot = name.lastIndexOf('.');
  return dot !== -1 ? name.slice(dot).toLowerCase() : '';
}

function ddResetSession() {
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
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const items = [...(e.dataTransfer?.items ?? [])];
  if (!items.length) return;

  let fileHandle;
  try {
    fileHandle = await items[0].getAsFileSystemHandle();
  } catch (err) {
    if (err.name !== 'AbortError') BrowserCompat.notifyUnsupported();
    return;
  }
  if (!fileHandle || fileHandle.kind !== 'file') return;

  const droppedFile = await fileHandle.getFile();
  const ext = ddFileExt(droppedFile.name);

  if (ext === '.zip') {
    const buffer = await droppedFile.arrayBuffer();
    let zip;
    try { zip = await JSZip.loadAsync(buffer); }
    catch (err) { console.error('[DragDrop] Failed to parse ZIP:', err); return; }

    const entries = Object.values(zip.files).filter(f => !f.dir && IMAGE_EXTS_DD.has(ddFileExt(f.name)));
    if (!entries.length) return;
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    ddResetSession();

    State.pages = await Promise.all(entries.map(async entry => {
      const blob = await entry.async('blob');
      return { type: 'img', name: entry.name, url: URL.createObjectURL(blob) };
    }));

    State.pdfDoc = null;
    await Regions.setSource(fileHandle, 'zip', droppedFile.name.replace(/\.zip$/i, ''));
    openViewer(0);
    return;
  }

  if (!IMAGE_EXTS_DD.has(ext)) return;

  const droppedName = droppedFile.name;
  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    if (err.name !== 'AbortError') BrowserCompat.notifyUnsupported();
    return;
  }

  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file') continue;
    if (!IMAGE_EXTS_DD.has(ddFileExt(name))) continue;
    entries.push({ name, handle });
  }
  if (!entries.length) return;
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  ddResetSession();

  State.pages = await Promise.all(entries.map(async ({ name, handle }) => {
    const file = await handle.getFile();
    return { type: 'img', name, url: URL.createObjectURL(file) };
  }));

  State.pdfDoc = null;
  await Regions.setSource(dirHandle, 'folder', null);

  const targetIndex = Math.max(0, State.pages.findIndex(p => p.name === droppedName));
  openViewer(targetIndex);
}

[landing, viewer].forEach(el => {
  el.addEventListener('dragover',  (e) => { e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); });
});

landing.addEventListener('drop', handleDrop);
viewer.addEventListener('drop',  handleDrop);
