const ZipLoader = (() => {

  const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

  function isImage(name) {
    const dot = name.lastIndexOf('.');
    return dot !== -1 && IMAGE_EXTS.has(name.slice(dot).toLowerCase());
  }

  return {
    async open() {
      let handles;
      try {
        handles = await window.showOpenFilePicker({
          types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
        });
      } catch (err) {
        if (err.name !== 'AbortError') BrowserCompat.notifyUnsupported();
        return null;
      }

      const fileHandle = handles[0];
      const file       = await fileHandle.getFile();
      const buffer     = await file.arrayBuffer();

      let zip;
      try {
        zip = await JSZip.loadAsync(buffer);
      } catch (err) {
        console.error('[ZipLoader] Failed to parse ZIP:', err);
        return null;
      }

      const entries = Object.values(zip.files).filter(f => !f.dir && isImage(f.name));
      if (!entries.length) return null;

      entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      const pages = await Promise.all(entries.map(async entry => {
        const blob = await entry.async('blob');
        return { type: 'img', name: entry.name, url: URL.createObjectURL(blob) };
      }));

      const baseName = file.name.replace(/\.zip$/i, '');
      return { pages, fileHandle, baseName };
    },
  };

})();
