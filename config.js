// config.js – Global configuration, persistence, and config sidebar

const Config = (() => {

  // ── State ───────────────────────────────────────────────────────────────────
  let settings = {
    rtl: false,
  };

  let dirHandle        = null;  // FileSystemDirectoryHandle for saving .config
  let onRTLChange      = null;  // callback(rtl: bool)
  let configSidebarEl  = null;
  let rtlToggleEl      = null;

  const FILE_NAME = 'hapticpdf.config';
  const LS_KEY    = 'hapticpdf_config';

  // ── Persistence ─────────────────────────────────────────────────────────────

  function serialize() {
    return JSON.stringify(settings, null, 2);
  }

  function applyParsed(data) {
    if (!data) return;
    if (typeof data.rtl === 'boolean') settings.rtl = data.rtl;
  }

  /** Load config from the open folder's hapticpdf.config, then fall back to localStorage. */
  async function load() {
    // Try folder file first
    if (dirHandle) {
      try {
        const fh   = await dirHandle.getFileHandle(FILE_NAME);
        const file = await fh.getFile();
        const data = JSON.parse(await file.text());
        applyParsed(data);
        syncUI();
        return;
      } catch {
        // File doesn't exist yet — fall through to localStorage
      }
    }
    // Fallback: localStorage
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) applyParsed(JSON.parse(raw));
    } catch { /* ignore */ }
    syncUI();
  }

  /** Save config to folder file and localStorage. */
  async function save() {
    const json = serialize();

    // localStorage (always)
    try { localStorage.setItem(LS_KEY, json); } catch { /* ignore */ }

    // Folder file
    if (dirHandle) {
      try {
        const fh = await dirHandle.getFileHandle(FILE_NAME, { create: true });
        const w  = await fh.createWritable();
        await w.write(json);
        await w.close();
      } catch (err) {
        console.error('[Config] save failed:', err);
      }
    }
  }

  // ── UI sync ─────────────────────────────────────────────────────────────────

  function syncUI() {
    if (!rtlToggleEl) return;
    rtlToggleEl.checked = settings.rtl;
    const labelEl = rtlToggleEl.closest('.config-toggle-row')?.querySelector('.config-toggle-label');
    if (labelEl) labelEl.textContent = settings.rtl ? 'RTL (Right → Left)' : 'LTR (Left → Right)';
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    configSidebarEl = document.getElementById('config-sidebar');
    rtlToggleEl     = document.getElementById('config-rtl-toggle');

    // Close button
    document.getElementById('config-sidebar-close').addEventListener('click', () => {
      configSidebarEl.classList.remove('open');
    });

    // RTL toggle
    rtlToggleEl.addEventListener('change', async () => {
      settings.rtl = rtlToggleEl.checked;
      syncUI();
      await save();
      if (onRTLChange) onRTLChange(settings.rtl);
    });

    // Load persisted settings on startup
    load();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  return {

    /** Call once on startup. */
    init,

    /** Open or close the config sidebar. */
    toggle() {
      if (!configSidebarEl) return;
      configSidebarEl.classList.toggle('open');
    },

    open() {
      if (configSidebarEl) configSidebarEl.classList.add('open');
    },

    close() {
      if (configSidebarEl) configSidebarEl.classList.remove('open');
    },

    /** Pass the directory handle whenever a folder/PDF is opened so config
     *  can be saved alongside it. Also re-loads config from that folder. */
    async setDirHandle(handle) {
      dirHandle = handle;
      await load();
      if (onRTLChange) onRTLChange(settings.rtl);
    },

    /** Register a callback fired whenever the RTL setting changes.
     *  callback(rtl: bool) */
    setOnRTLChange(cb) {
      onRTLChange = cb;
      // Fire immediately with current value so the caller can initialise
      if (cb) cb(settings.rtl);
    },

    /** Current reading direction. */
    get rtl() {
      return settings.rtl;
    },

  };

})();
