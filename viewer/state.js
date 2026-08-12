// Shared mutable app state
const State = {
  pages:     [],
  current:   0,
  pdfDoc:    null,
  rendering: false,
  editMode:  false,
  rtl:       false,
};

// Shared DOM refs used across multiple viewer modules
const landing     = document.getElementById('landing');
const viewer      = document.getElementById('viewer');
const editSidebar = document.getElementById('edit-sidebar');
const debugHover  = document.getElementById('debug-hover');
const pageFillerInput  = document.getElementById('page-filler-input');
const pageFillerSelect = document.getElementById('page-filler-select');
