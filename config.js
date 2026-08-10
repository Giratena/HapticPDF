// config.js – Global configuration, persistence, and config sidebar

const Config = (() => {

  // ── State ───────────────────────────────────────────────────────────────────
  let settings = {
    rtl:          false,
    fillerScript: '',
    ediHost:      '127.0.0.1',
    ediPort:      5000,
  };

  let onRTLChange      = null;  // callback(rtl: bool)
  let configSidebarEl  = null;
  let rtlToggleEl      = null;

  const LS_KEY    = 'hapticpdf_config';

  // ── Persistence ─────────────────────────────────────────────────────────────

  function serialize() {
    return JSON.stringify(settings, null, 2);
  }

  function applyParsed(data) {
    if (!data) return;
    if (typeof data.rtl          === 'boolean') settings.rtl          = data.rtl;
    if (typeof data.fillerScript === 'string')  settings.fillerScript = data.fillerScript;
    if (typeof data.ediHost      === 'string')  settings.ediHost      = data.ediHost;
    if (typeof data.ediPort      === 'number')  settings.ediPort      = data.ediPort;
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) applyParsed(JSON.parse(raw));
    } catch { /* ignore */ }
    syncUI();
    if (onRTLChange) onRTLChange(settings.rtl);
  }

  function save() {
    try { localStorage.setItem(LS_KEY, serialize()); } catch { /* ignore */ }
  }

  // ── UI sync ─────────────────────────────────────────────────────────────────

  function syncUI() {
    if (!rtlToggleEl) return;
    rtlToggleEl.checked = settings.rtl;
    const labelEl = rtlToggleEl.closest('.config-toggle-row')?.querySelector('.config-toggle-label');
    if (labelEl) labelEl.textContent = settings.rtl ? 'RTL (Right → Left)' : 'LTR (Left → Right)';

    const fillerEl = document.getElementById('config-filler-script');
    if (fillerEl) fillerEl.value = settings.fillerScript;

    const hostEl = document.getElementById('config-edi-host');
    if (hostEl) hostEl.value = settings.ediHost;

    const portEl = document.getElementById('config-edi-port');
    if (portEl) portEl.value = settings.ediPort;
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
    rtlToggleEl.addEventListener('change', () => {
      settings.rtl = rtlToggleEl.checked;
      syncUI();
      save();
      if (onRTLChange) onRTLChange(settings.rtl);
    });

    // Filler script input
    const fillerEl = document.getElementById('config-filler-script');
    if (fillerEl) {
      fillerEl.addEventListener('input', () => {
        settings.fillerScript = fillerEl.value;
        save();
      });
      fillerEl.addEventListener('keydown', (e) => e.stopPropagation());
    }

    // EDI host input
    const hostEl = document.getElementById('config-edi-host');
    if (hostEl) {
      hostEl.addEventListener('input', () => {
        settings.ediHost = hostEl.value;
        save();
      });
      hostEl.addEventListener('keydown', (e) => e.stopPropagation());
    }

    // EDI port input
    const portEl = document.getElementById('config-edi-port');
    if (portEl) {
      portEl.addEventListener('input', () => {
        const val = parseInt(portEl.value, 10);
        if (!isNaN(val)) { settings.ediPort = val; save(); }
      });
      portEl.addEventListener('keydown', (e) => e.stopPropagation());
    }

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

    /** EDI filler script (played when no region is hovered; empty = stop). */
    get fillerScript() {
      return settings.fillerScript;
    },

    /** EDI server host. */
    get ediHost() {
      return settings.ediHost;
    },

    /** EDI server port. */
    get ediPort() {
      return settings.ediPort;
    },

  };

})();
