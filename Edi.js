// Edi.js – EDI REST API integration
// Fires POST requests to the EDI server when a region is hovered.

const Edi = (() => {

  let _currentScript = null; // track what's playing to avoid duplicate calls

  function _baseUrl() {
    const host = (Config && Config.ediHost) ? Config.ediHost : '127.0.0.1';
    const port = (Config && Config.ediPort) ? Config.ediPort : 5000;
    return `http://${host}:${port}`;
  }

  function _post(path) {
    fetch(_baseUrl() + path, { method: 'POST' }).catch(() => {
      // Silently ignore connection errors (EDI server may not be running)
    });
  }

  return {

    /**
     * Play a named script on the EDI server.
     * No-ops if the same script is already playing.
     */
    play(scriptName) {
      if (!scriptName) return;
      if (_currentScript === scriptName) return;
      _currentScript = scriptName;
      _post('/Edi/Play/' + encodeURIComponent(scriptName));
    },

    /**
     * Stop any currently playing script.
     */
    stop() {
      if (_currentScript === null) return;
      _currentScript = null;
      _post('/Edi/Stop');
    },

  };

})();
