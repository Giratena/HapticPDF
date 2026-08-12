const funscriptPanel    = document.getElementById('funscript-panel');
const btnFunscript      = document.getElementById('btn-funscript');
const btnFunscriptClose = document.getElementById('btn-funscript-close');

function openFunscriptPanel() {
  editSidebar.classList.remove('open');
  Config.close();
  funscriptPanel.classList.remove('hidden');
  btnFunscript.classList.add('funscript-active');
}

function closeFunscriptPanel() {
  funscriptPanel.classList.add('hidden');
  btnFunscript.classList.remove('funscript-active');
}

btnFunscript.addEventListener('click', () => {
  funscriptPanel.classList.contains('hidden') ? openFunscriptPanel() : closeFunscriptPanel();
});

btnFunscriptClose.addEventListener('click', closeFunscriptPanel);
