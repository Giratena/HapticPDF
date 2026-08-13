const BrowserCompat = (() => {

  /** True if the browser supports the File System Access API (Chrome/Edge). */
  function hasFileSystemAccess() {
    return typeof window.showOpenFilePicker === 'function';
  }

  /**
   * Cross-browser file picker.
   * On Chrome/Edge this is never called directly — callers use showOpenFilePicker.
   * On Firefox (no FSA) this creates a hidden <input type="file"> and returns
   * a Promise that resolves to an array of File objects (empty if cancelled).
   *
   * @param {object} opts
   * @param {string}  [opts.accept]   - accept attribute string, e.g. '.pdf,.haptic'
   * @param {boolean} [opts.multiple] - allow multiple files
   * @returns {Promise<File[]>}
   */
  function pickOpenFile({ accept = '', multiple = false } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type     = 'file';
      input.accept   = accept;
      input.multiple = multiple;

      let settled = false;
      const settle = (files) => {
        if (settled) return;
        settled = true;
        resolve(files);
      };

      input.addEventListener('change', () => settle([...input.files]));

      // Detect cancel: when the window regains focus after the picker closes
      // and no change event fired, resolve with empty array.
      window.addEventListener('focus', function onFocus() {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => settle([]), 500);
      }, { once: true });

      input.click();
    });
  }

  /**
   * Trigger a browser download of text content as a named file.
   * Works in all browsers (Chrome, Firefox, Safari).
   *
   * @param {string} filename - Suggested file name
   * @param {string} text     - File contents
   */
  function downloadFile(filename, text) {
    const blob = new Blob([text], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function notifyUnsupported() {
    // Avoid stacking duplicate toasts
    if (document.getElementById('browser-compat-toast')) return;

    const toast = document.createElement('div');
    toast.id = 'browser-compat-toast';
    toast.textContent = 'This feature is not supported by your browser.';
    document.body.appendChild(toast);

    // Trigger fade-in
    requestAnimationFrame(() => toast.classList.add('visible'));

    // Fade out and remove after 3.5s
    setTimeout(() => {
      toast.classList.remove('visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 3500);
  }

  return { hasFileSystemAccess, pickOpenFile, downloadFile, notifyUnsupported };

})();
