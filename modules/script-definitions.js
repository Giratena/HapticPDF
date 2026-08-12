// ScriptDefinitions.js – CSV import of script name definitions

const ScriptDefinitions = (() => {

  const LS_KEY = 'hapticpdf_script_definitions';
  let names = [];
  let onChange = null; // callback(names: string[])

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) names = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(names)); } catch { /* ignore */ }
  }

  function syncStatus() {
    const el = document.getElementById('config-csv-status');
    if (el) el.textContent = names.length ? `${names.length} script(s) loaded` : 'No definitions loaded';
  }

  function setNames(newNames) {
    names = newNames;
    save();
    syncStatus();
    if (onChange) onChange(names);
  }

  function init() {
    load();
    syncStatus();

    const importBtn = document.getElementById('config-import-csv');
    if (importBtn) {
      importBtn.addEventListener('click', async () => {
        let handles;
        try {
          handles = await window.showOpenFilePicker({
            types: [{ description: 'CSV files', accept: { 'text/csv': ['.csv'] } }],
          });
        } catch (err) {
          if (err.name !== 'AbortError') BrowserCompat.notifyUnsupported();
          return;
        }
        const text = await (await handles[0].getFile()).text();
        const parsed = text.split('\n').slice(1) // skip header row
          .map(row => row.split(',')[0].trim())
          .filter(n => n.length);
        setNames(parsed);
      });
    }

    const clearBtn = document.getElementById('config-clear-csv');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => setNames([]));
    }
  }

  return {
    init,

    /** string[] of script names from the last imported CSV. */
    get names() { return names; },

    /** Register a callback fired whenever definitions change.
     *  callback(names: string[]) — fires immediately with current value. */
    setOnChange(cb) {
      onChange = cb;
      if (cb) cb(names);
    },
  };

})();
