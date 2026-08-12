const BrowserCompat = (() => {

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

  return { notifyUnsupported };

})();
