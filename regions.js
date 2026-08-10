// regions.js – Region drawing, selection, and persistence

const Regions = (() => {

  // ── State ───────────────────────────────────────────────────────────────────
  let regionMap     = {};     // { filename: [{cx, cy, rx, ry, name}, ...] }
  let currentFile   = null;
  let editMode      = false;
  let selectedIdx   = null;

  let svgEl         = null;
  let dirHandle     = null;   // FileSystemDirectoryHandle (folder mode)
  let pdfSaveHandle = null;   // FileSystemFileHandle (.haptic output for PDFs)
  let sourceType    = null;   // 'folder' | 'pdf'
  let pdfBaseName   = null;   // PDF filename without extension

  // Selection-change callback
  let onSelectionChange = null;

  // Debug hover callback
  let onHoverRegion = null;

  // Draw state (new ellipse)
  let drawing       = false;
  let drawStartFrac = null;   // {x, y} center in image fractions
  let previewEl     = null;   // live SVG <ellipse> while dragging

  // Resize state (redraw existing ellipse)
  let resizing      = false;
  let resizeIdx     = null;   // index of region being resized

  // Drag state (reposition existing ellipse)
  let dragging      = false;
  let dragIdx       = null;
  let dragOffsetFrac = null;  // {x, y} offset from ellipse center to cursor
  let dragStartClient = null; // {x, y} client coords at drag start (click detection)
  let hasDragged    = false;

  const MIN_RADIUS    = 0.02; // minimum rx or ry as fraction
  const CLICK_THRESH  = 5;    // px — move less than this → treat as click, not drag

  // ── DOM helpers ─────────────────────────────────────────────────────────────

  function getContentEl() {
    const img = document.getElementById('img-display');
    const cvs = document.getElementById('pdf-canvas');
    if (img && !img.classList.contains('hidden')) return img;
    if (cvs && !cvs.classList.contains('hidden')) return cvs;
    return null;
  }

  function getImageRect() {
    const el = getContentEl();
    return el ? el.getBoundingClientRect() : null;
  }

  function getSVGRect() {
    return svgEl ? svgEl.getBoundingClientRect() : null;
  }

  // ── Coordinate conversion ───────────────────────────────────────────────────

  /** Mouse client coords → image-space fractions (0..1) */
  function clientToFrac(clientX, clientY) {
    const r = getImageRect();
    if (!r) return null;
    return {
      x: (clientX - r.left) / r.width,
      y: (clientY - r.top)  / r.height,
    };
  }

  /** Image-space fraction → SVG pixel coords */
  function fracToSVG(fx, fy) {
    const ir = getImageRect();
    const sr = getSVGRect();
    if (!ir || !sr) return { x: 0, y: 0 };
    return {
      x: (ir.left - sr.left) + fx * ir.width,
      y: (ir.top  - sr.top)  + fy * ir.height,
    };
  }

  /** Horizontal radius fraction → SVG pixels (uses image width) */
  function fracRxToSVG(frx) {
    const ir = getImageRect();
    return ir ? frx * ir.width : 0;
  }

  /** Vertical radius fraction → SVG pixels (uses image height) */
  function fracRyToSVG(fry) {
    const ir = getImageRect();
    return ir ? fry * ir.height : 0;
  }

  // ── SVG rendering ───────────────────────────────────────────────────────────

  function makeSVGGroup(region, index) {
    const pos = fracToSVG(region.cx, region.cy);
    const rx  = fracRxToSVG(region.rx);
    const ry  = fracRyToSVG(region.ry);
    const sel = index === selectedIdx;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.idx = index;

    // ── Ellipse ──
    const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    ellipse.setAttribute('cx', pos.x);
    ellipse.setAttribute('cy', pos.y);
    ellipse.setAttribute('rx', rx);
    ellipse.setAttribute('ry', ry);
    ellipse.classList.add('region-ellipse');
    if (sel) ellipse.classList.add('selected');

    // Colour by priority using golden-angle hue spread
    const hue = ((region.priority ?? 1) - 1) * 137 % 360;
    ellipse.style.stroke = `hsl(${hue}, 70%, 60%)`;
    ellipse.style.fill   = `hsla(${hue}, 70%, 60%, ${sel ? 0.25 : 0.12})`;

    g.appendChild(ellipse);

    // ── Region name label ──
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', pos.x);
    label.setAttribute('y', pos.y);
    const fontSize = Math.max(Math.min(rx, ry) * 0.7, 12);
    label.setAttribute('font-size', fontSize);
    label.classList.add('region-label');
    label.textContent = region.name || String(index + 1);
    g.appendChild(label);

    // ── Mousedown: start drag (click vs drag resolved on mouseup) ──
    ellipse.addEventListener('mousedown', (e) => {
      if (!editMode) return;
      e.stopPropagation(); // don't start drawing

      const frac = clientToFrac(e.clientX, e.clientY);
      if (!frac) return;

      dragging        = true;
      dragIdx         = index;
      dragStartClient = { x: e.clientX, y: e.clientY };
      hasDragged      = false;

      const region = regionMap[currentFile][index];
      dragOffsetFrac = {
        x: frac.x - region.cx,
        y: frac.y - region.cy,
      };
    });

    return g;
  }

  function renderRegions() {
    if (!svgEl) return;
    svgEl.querySelectorAll('g[data-idx]').forEach(el => el.remove());
    if (!currentFile) return;

    const regions = regionMap[currentFile] || [];
    regions.forEach((region, i) => svgEl.appendChild(makeSVGGroup(region, i)));
  }

  function updateOverlay() {
    if (!svgEl) return;
    svgEl.style.opacity       = editMode ? '1' : '0';
    svgEl.style.pointerEvents = editMode ? 'all' : 'none';
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  function deleteRegion(index) {
    if (!currentFile) return;
    const regions = regionMap[currentFile];
    if (!regions) return;
    regions.splice(index, 1);
    selectedIdx = null;
    renderRegions();
    autoSave();
    if (onSelectionChange) onSelectionChange(null, null);
  }

  // ── Draw event handlers (new ellipse) ───────────────────────────────────────

  function onMousedown(e) {
    if (!editMode) return;
    // Only fire on bare SVG background
    if (e.target !== svgEl) return;

    e.preventDefault();
    const frac = clientToFrac(e.clientX, e.clientY);
    if (!frac) return;
    if (frac.x < 0 || frac.x > 1 || frac.y < 0 || frac.y > 1) return;

    if (!resizing) {
      selectedIdx = null;
      renderRegions();
      if (onSelectionChange) onSelectionChange(null, null);
    }

    drawing       = true;
    drawStartFrac = frac;

    // Live preview ellipse
    previewEl = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    previewEl.classList.add('region-ellipse', 'preview');
    const pos = fracToSVG(frac.x, frac.y);
    previewEl.setAttribute('cx', pos.x);
    previewEl.setAttribute('cy', pos.y);
    previewEl.setAttribute('rx', 0);
    previewEl.setAttribute('ry', 0);
    svgEl.appendChild(previewEl);
  }

  function onMousemove(e) {
    // ── Update draw preview ──
    if (drawing && previewEl) {
      const frac = clientToFrac(e.clientX, e.clientY);
      if (frac) {
        const cx = (drawStartFrac.x + frac.x) / 2;
        const cy = (drawStartFrac.y + frac.y) / 2;
        const frx = Math.abs(frac.x - drawStartFrac.x) / 2;
        const fry = Math.abs(frac.y - drawStartFrac.y) / 2;
        const pos = fracToSVG(cx, cy);
        previewEl.setAttribute('cx', pos.x);
        previewEl.setAttribute('cy', pos.y);
        previewEl.setAttribute('rx', fracRxToSVG(frx));
        previewEl.setAttribute('ry', fracRyToSVG(fry));
      }
    }

    // ── Update drag position ──
    if (dragging && dragIdx !== null) {
      const dx = e.clientX - dragStartClient.x;
      const dy = e.clientY - dragStartClient.y;
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESH) hasDragged = true;

      if (hasDragged) {
        const frac = clientToFrac(e.clientX, e.clientY);
        if (frac && currentFile && regionMap[currentFile]) {
          const region = regionMap[currentFile][dragIdx];
          region.cx = frac.x - dragOffsetFrac.x;
          region.cy = frac.y - dragOffsetFrac.y;
          renderRegions();
        }
      }
    }

    // ── Debug hover (non-edit mode) ──
    if (!editMode && onHoverRegion && currentFile) {
      const frac = clientToFrac(e.clientX, e.clientY);
      if (frac && frac.x >= 0 && frac.x <= 1 && frac.y >= 0 && frac.y <= 1) {
        const regions = regionMap[currentFile] || [];
        let hit = null;
        for (let i = 0; i < regions.length; i++) {
          const r = regions[i];
          const nx = (frac.x - r.cx) / r.rx;
          const ny = (frac.y - r.cy) / r.ry;
          if (nx * nx + ny * ny <= 1) {
            if (!hit || (r.priority ?? 1) >= (hit.priority ?? 1)) hit = r;
          }
        }
        onHoverRegion(hit ? (hit.name || String(regions.indexOf(hit) + 1)) : null, hit);
      } else {
        onHoverRegion(null, null);
      }
    }
  }

  function onMouseup(e) {
    // ── Finish drawing / resizing ──
    if (drawing) {
      drawing = false;
      if (previewEl) { previewEl.remove(); previewEl = null; }

      const frac = clientToFrac(e.clientX, e.clientY);
      if (frac) {
        const cx  = (drawStartFrac.x + frac.x) / 2;
        const cy  = (drawStartFrac.y + frac.y) / 2;
        const frx = Math.abs(frac.x - drawStartFrac.x) / 2;
        const fry = Math.abs(frac.y - drawStartFrac.y) / 2;
        if (Math.max(frx, fry) >= MIN_RADIUS) {
          if (resizing && resizeIdx !== null) {
            // Update the existing region in-place
            const regions = regionMap[currentFile];
            if (regions && regions[resizeIdx]) {
              regions[resizeIdx].cx = cx;
              regions[resizeIdx].cy = cy;
              regions[resizeIdx].rx = frx;
              regions[resizeIdx].ry = fry;
              selectedIdx = resizeIdx;
              renderRegions();
              autoSave();
              if (onSelectionChange) onSelectionChange(selectedIdx, regions[selectedIdx]);
            }
            resizing  = false;
            resizeIdx = null;
          } else {
            commitRegion(cx, cy, frx, fry);
          }
        } else if (resizing) {
          // Too small — cancel resize, reselect old region
          selectedIdx = resizeIdx;
          const regions = regionMap[currentFile];
          const region = regions ? regions[selectedIdx] : null;
          renderRegions();
          if (onSelectionChange) onSelectionChange(selectedIdx, region);
          resizing  = false;
          resizeIdx = null;
        }
      }
    }

    // ── Finish drag ──
    if (dragging) {
      const wasDrag = hasDragged;
      dragging   = false;
      hasDragged = false;

      if (wasDrag) {
        // Commit repositioned center
        autoSave();
      } else {
        // It was a click — toggle selection
        if (selectedIdx === dragIdx) {
          selectedIdx = null; // deselect on second click
          if (onSelectionChange) onSelectionChange(null, null);
        } else {
          selectedIdx = dragIdx;
          const region = regionMap[currentFile] ? regionMap[currentFile][selectedIdx] : null;
          if (onSelectionChange) onSelectionChange(selectedIdx, region);
        }
        renderRegions();
      }

      dragIdx         = null;
      dragOffsetFrac  = null;
      dragStartClient = null;
    }
  }

  // ── Region data ─────────────────────────────────────────────────────────────

  function commitRegion(cx, cy, rx, ry) {
    if (!currentFile) return;
    if (!regionMap[currentFile]) regionMap[currentFile] = [];
    const regions = regionMap[currentFile];
    const name = String(regions.length + 1);
    regions.push({ cx, cy, rx, ry, name, script: '', priority: 1 });
    // Select the newly created region
    selectedIdx = regions.length - 1;
    renderRegions();
    autoSave();
    const region = regions[selectedIdx];
    if (onSelectionChange) onSelectionChange(selectedIdx, region);
  }

  // ── Save / Load ─────────────────────────────────────────────────────────────

  function buildHapticData() {
    if (sourceType === 'folder') {
      return { version: 1, regions: regionMap };
    }
    return { version: 1, file: pdfBaseName, regions: regionMap };
  }

  async function autoSave() {
    if (!sourceType) return;
    const json = JSON.stringify(buildHapticData(), null, 2);

    if (sourceType === 'folder' && dirHandle) {
      try {
        const fh = await dirHandle.getFileHandle('config.haptic', { create: true });
        const w  = await fh.createWritable();
        await w.write(json);
        await w.close();
      } catch (err) {
        console.error('[Regions] folder save failed:', err);
      }

    } else if (sourceType === 'pdf') {
      if (!pdfSaveHandle) {
        try {
          pdfSaveHandle = await window.showSaveFilePicker({
            suggestedName: `${pdfBaseName}.haptic`,
            types: [{ description: 'Haptic config', accept: { 'application/json': ['.haptic'] } }],
          });
        } catch {
          return; // user cancelled
        }
      }
      try {
        const w = await pdfSaveHandle.createWritable();
        await w.write(json);
        await w.close();
      } catch (err) {
        console.error('[Regions] pdf save failed:', err);
      }
    }
  }

  async function loadFromFolder() {
    if (!dirHandle) return;
    try {
      const fh   = await dirHandle.getFileHandle('config.haptic');
      const file = await fh.getFile();
      const data = JSON.parse(await file.text());
      if (data && data.regions) regionMap = data.regions;
    } catch {
      // No config.haptic yet — that's fine
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  return {

    /** Call once on startup with the SVG element. */
    init(svg) {
      svgEl = svg;
      svgEl.addEventListener('mousedown', onMousedown);
      window.addEventListener('mousemove', onMousemove);
      window.addEventListener('mouseup',   onMouseup);
      updateOverlay();
    },

    /** Called when a new source (folder or PDF) is opened. */
    async setSource(handle, type, name) {
      regionMap     = {};
      currentFile   = null;
      selectedIdx   = null;
      pdfSaveHandle = null;
      sourceType    = type;
      dirHandle     = type === 'folder' ? handle : null;
      pdfBaseName   = type === 'pdf'    ? name   : null;

      if (type === 'folder') await loadFromFolder();
    },

    /** Called after every page navigation (once the image is rendered). */
    onPageChange(filename) {
      currentFile = filename;
      selectedIdx = null;
      dragging    = false;
      drawing     = false;
      renderRegions();
      if (onSelectionChange) onSelectionChange(null, null);
    },

    /** Toggle edit mode on/off. */
    setEditMode(on) {
      editMode = on;
      if (!on) {
        drawing   = false;
        dragging  = false;
        resizing  = false;
        resizeIdx = null;
        if (previewEl) { previewEl.remove(); previewEl = null; }
        selectedIdx = null;
        if (onSelectionChange) onSelectionChange(null, null);
        if (onHoverRegion) onHoverRegion(null, null);
      }
      updateOverlay();
      renderRegions();
    },

    /** Re-render ellipses (e.g. after window resize). */
    redraw() {
      renderRegions();
    },

    /** Register a callback fired whenever the selected region changes.
     *  callback(index, regionObj) — both null when nothing selected. */
    setOnSelectionChange(cb) {
      onSelectionChange = cb;
    },

    /** Register a callback fired on mousemove (non-edit mode) with hovered region name or null. */
    setOnHoverRegion(cb) {
      onHoverRegion = cb;
    },

    /** Update the name of the currently selected region. */
    renameSelected(newName) {
      if (selectedIdx === null || !currentFile) return;
      const regions = regionMap[currentFile];
      if (!regions || !regions[selectedIdx]) return;
      regions[selectedIdx].name = newName;
      renderRegions();
      autoSave();
    },

    /** Update the priority of the currently selected region. */
    setPrioritySelected(newPriority) {
      if (selectedIdx === null || !currentFile) return;
      const regions = regionMap[currentFile];
      if (!regions || !regions[selectedIdx]) return;
      regions[selectedIdx].priority = newPriority;
      renderRegions();
      autoSave();
    },

    /** Set the selected region's priority to max+1 (bring to top). */
    bringSelectedToTop() {
      if (selectedIdx === null || !currentFile) return;
      const regions = regionMap[currentFile];
      if (!regions || !regions[selectedIdx]) return;
      const maxP = regions.reduce((m, r) => Math.max(m, r.priority ?? 1), 0);
      regions[selectedIdx].priority = maxP + 1;
      renderRegions();
      autoSave();
      if (onSelectionChange) onSelectionChange(selectedIdx, regions[selectedIdx]);
    },

    /** Update the EDI script of the currently selected region. */
    renameSelectedScript(newScript) {
      if (selectedIdx === null || !currentFile) return;
      const regions = regionMap[currentFile];
      if (!regions || !regions[selectedIdx]) return;
      regions[selectedIdx].script = newScript;
      autoSave();
    },

    /** Delete the currently selected region. */
    deleteSelected() {
      if (selectedIdx !== null) deleteRegion(selectedIdx);
    },

    /** Enter resize mode for the currently selected region. */
    startResize() {
      if (selectedIdx === null || !currentFile) return;
      resizing  = true;
      resizeIdx = selectedIdx;
      drawing   = false;
      dragging  = false;
      if (previewEl) { previewEl.remove(); previewEl = null; }
    },

    /** Get the currently selected region index. */
    getSelectedIdx() {
      return selectedIdx;
    },
  };

})();
