document.getElementById('btn-open-zip').addEventListener('click', async () => {
  const result = await ZipLoader.open();
  if (!result) return;

  State.pages  = result.pages;
  State.pdfDoc = null;
  await Regions.setSource(null, 'zip', result.baseName);

  // Optionally load an existing .haptic config for this ZIP
  if (BrowserCompat.hasFileSystemAccess()) {
    try {
      const [hapticHandle] = await window.showOpenFilePicker({
        types: [{ description: 'Haptic config', accept: { 'application/json': ['.haptic'] } }],
      });
      await Regions.loadHapticFile(hapticHandle);
    } catch (err) {
      if (err.name !== 'AbortError') BrowserCompat.notifyUnsupported();
    }
  } else {
    const files = await BrowserCompat.pickOpenFile({ accept: '.haptic' });
    if (files.length) await Regions.loadHapticFileObject(files[0]);
  }

  openViewer(0);
});

document.getElementById('btn-open-folder').addEventListener('click', async () => {
  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    if (err.name !== 'AbortError') BrowserCompat.notifyUnsupported();
    return;
  }

  const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];
  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file') continue;
    const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
    if (IMAGE_EXTS.includes(ext)) entries.push({ name, handle });
  }
  if (!entries.length) return;
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  State.pages = await Promise.all(entries.map(async ({ name, handle }) => {
    const file = await handle.getFile();
    return { type: 'img', name, url: URL.createObjectURL(file) };
  }));

  State.pdfDoc = null;
  await Regions.setSource(dirHandle, 'folder', null);
  openViewer(0);
});

document.getElementById('btn-open-pdf').addEventListener('click', async () => {
  let file;

  if (BrowserCompat.hasFileSystemAccess()) {
    let fileHandles;
    try {
      fileHandles = await window.showOpenFilePicker({
        types: [{ description: 'PDF files', accept: { 'application/pdf': ['.pdf'] } }],
      });
    } catch (err) {
      if (err.name !== 'AbortError') BrowserCompat.notifyUnsupported();
      return;
    }
    file = await fileHandles[0].getFile();
  } else {
    const files = await BrowserCompat.pickOpenFile({ accept: '.pdf' });
    if (!files.length) return;
    file = files[0];
  }

  const buffer = await file.arrayBuffer();

  State.pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
  State.pages  = Array.from({ length: State.pdfDoc.numPages }, (_, i) => ({
    type:  'pdf',
    index: i + 1,
    name:  `page_${i + 1}`,
  }));

  PageCache.init(State.pdfDoc, State.pages, getPageScaleFn());

  const pdfBaseName = file.name.replace(/\.pdf$/i, '');
  await Regions.setSource(null, 'pdf', pdfBaseName);

  // Optionally load an existing .haptic config for this PDF
  if (BrowserCompat.hasFileSystemAccess()) {
    try {
      const [hapticHandle] = await window.showOpenFilePicker({
        types: [{ description: 'Haptic config', accept: { 'application/json': ['.haptic'] } }],
      });
      await Regions.loadHapticFile(hapticHandle);
    } catch (err) {
      if (err.name !== 'AbortError') BrowserCompat.notifyUnsupported();
    }
  } else {
    const files = await BrowserCompat.pickOpenFile({ accept: '.haptic' });
    if (files.length) await Regions.loadHapticFileObject(files[0]);
  }

  openViewer(0);
});

