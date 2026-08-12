const regionNameInput     = document.getElementById('region-name-input');
const regionScriptInput   = document.getElementById('region-script-input');
const regionScriptSelect  = document.getElementById('region-script-select');
const regionPriorityInput = document.getElementById('region-priority-input');
const sidebarClose        = document.getElementById('sidebar-close');
const sidebarDelete       = document.getElementById('sidebar-delete');
const sidebarBringTop     = document.getElementById('sidebar-bring-top');
const sidebarSendBottom   = document.getElementById('sidebar-send-bottom');
const sidebarResize       = document.getElementById('sidebar-resize');
const btnEdit             = document.getElementById('btn-edit');

function setEditMode(on) {
  State.editMode = on;
  btnEdit.classList.toggle('edit-active', on);
  btnEdit.textContent = on ? '✏️ Editing' : '✏️ Edit';
  if (on) {
    debugHover.classList.add('hidden');
    editSidebar.classList.add('open');
  }
  Regions.setEditMode(on);
}

Regions.setOnSelectionChange((idx, region) => {
  if (idx === null || region === null) {
    if (!State.editMode) editSidebar.classList.remove('open');
  } else {
    regionNameInput.value     = region.name     || '';
    regionScriptInput.value   = region.script   || '';
    regionScriptSelect.value  = region.script   || '';
    regionPriorityInput.value = region.priority ?? 1;
    editSidebar.classList.add('open');
  }
});

regionNameInput.addEventListener('input',   () => Regions.renameSelected(regionNameInput.value));
regionNameInput.addEventListener('keydown', (e) => e.stopPropagation());

regionScriptInput.addEventListener('input',   () => Regions.renameSelectedScript(regionScriptInput.value));
regionScriptInput.addEventListener('keydown', (e) => e.stopPropagation());

regionScriptSelect.addEventListener('change', () => {
  if (!regionScriptSelect.value) return;
  regionScriptInput.value = regionScriptSelect.value;
  Regions.renameSelectedScript(regionScriptSelect.value);
});

regionPriorityInput.addEventListener('input', () => {
  const val = parseInt(regionPriorityInput.value, 10);
  if (!isNaN(val) && val >= 1) Regions.setPrioritySelected(val);
});
regionPriorityInput.addEventListener('keydown', (e) => e.stopPropagation());

sidebarBringTop.addEventListener('click',   () => Regions.bringSelectedToTop());
sidebarSendBottom.addEventListener('click', () => Regions.sendSelectedToBottom());
sidebarResize.addEventListener('click', () => {
  Regions.startResize();
  editSidebar.classList.remove('open');
});
sidebarClose.addEventListener('click',  () => editSidebar.classList.remove('open'));
sidebarDelete.addEventListener('click', () => Regions.deleteSelected());

btnEdit.addEventListener('click', () => setEditMode(!State.editMode));

document.querySelectorAll('#shape-picker .shape-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#shape-picker .shape-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Regions.setDrawShape(btn.dataset.shape);
  });
});
