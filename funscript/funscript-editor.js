/**
 * funscript-editor.js  –  <funscript-editor> Web Component entry point.
 *
 * Registers the custom element. All heavy logic is delegated to modules/.
 * This file is responsible for:
 *   - Shadow DOM setup and CSS injection
 *   - HTML template
 *   - Wiring modules together
 *   - Public API (importScript / exportScript / events)
 *
 * Usage (any HTML project):
 *   <script type="module" src="funscript/funscript-editor.js"></script>
 *   <funscript-editor filename="output.funscript"></funscript-editor>
 *
 * Attributes:
 *   filename  – default filename used when exporting
 *
 * Methods:
 *   editor.importScript(jsonObject)   load a parsed funscript
 *   editor.exportScript()             returns the current merged funscript object
 *
 * Events (bubbles + composed – cross shadow-DOM):
 *   funscript-change   fires on every edit  (event.detail = funscript object)
 *   funscript-export   fires on Export click (event.detail = funscript object)
 */

import { createState, selectedChapter, selectedDuration, clampSelection, PALETTE } from './modules/state.js';
import { loadJSON, buildExportObject, downloadJSON, msToTimeStr }                   from './modules/export.js';
import { renderSidebar }                                                             from './modules/sidebar.js';
import { Modal }                                                                     from './modules/modal.js';
import { drawTimeline, hitTest as tlHitTest, xToMs as tlXToMs }                     from './modules/timeline.js';
import { drawKeyframes, hitTest as kfHitTest, xToMs as kfXToMs, yToPos }            from './modules/keyframes.js';
import { Playback, interpolatePos }                                                  from './modules/playback.js';

// ── HTML template ─────────────────────────────────────────────────────────────
const TEMPLATE = `
  <div id="root-wrap">

    <div id="toolbar">
      <span id="toolbar-title">🎮 Funscript Editor</span>
      <label class="file-btn" title="Import .funscript file">
        📂 Import
        <input type="file" id="import-input" accept=".funscript,.json" />
      </label>
      <button class="tb-btn" id="btn-new" title="Start fresh">📄 New</button>
      <div class="spacer"></div>
      <select id="speed-select" title="Playback speed">
        <option value="0.5">0.5×</option>
        <option value="1"   selected>1×</option>
        <option value="2">2×</option>
      </select>
      <button class="tb-btn" id="btn-play"   title="Play / Pause">▶ Play</button>
      <button class="tb-btn" id="btn-stop"   title="Stop">⏹ Stop</button>
      <button class="tb-btn primary" id="btn-export" title="Download merged .funscript">💾 Export</button>
    </div>

    <div id="main">

      <div id="sidebar">
        <div id="sidebar-header">
          CHAPTERS
          <button id="btn-add-chapter" title="Add chapter">+</button>
        </div>
        <div id="chapter-list"></div>
      </div>

      <div id="right-panel">

        <div id="timeline-wrap">
          <canvas id="timeline-canvas"></canvas>
        </div>

        <div id="kf-wrap">
          <canvas id="kf-canvas"></canvas>
          <div id="kf-tooltip" class="hidden"></div>
        </div>

        <div id="preview-bar">
          <span id="preview-chapter">—</span>
          <span id="preview-time">00:00:00.000</span>
          <div id="gauge-wrap">
            <span id="gauge-label">pos</span>
            <div id="gauge-bar-bg">
              <div id="gauge-bar"></div>
            </div>
            <span id="gauge-val">0</span>
          </div>
        </div>

      </div>
    </div>

    <div id="modal-overlay" class="hidden">
      <div id="modal-box">
        <h3 id="modal-title">Add Chapter</h3>
        <div class="modal-field">
          <label>Chapter Name</label>
          <input type="text" id="modal-name" placeholder="e.g. stance, hypno_lv1" />
        </div>
        <div class="modal-row">
          <div class="modal-field">
            <label>Start (ms)</label>
            <input type="number" id="modal-start" min="0" step="1" placeholder="0" />
          </div>
          <div class="modal-field">
            <label>End (ms)</label>
            <input type="number" id="modal-end" min="1" step="1" placeholder="5000" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn cancel" id="modal-cancel">Cancel</button>
          <button class="modal-btn ok"     id="modal-ok">OK</button>
        </div>
      </div>
    </div>

  </div>
`;

// ── Web Component ─────────────────────────────────────────────────────────────
class FunscriptEditor extends HTMLElement {

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = TEMPLATE; // fast: no extra wrapper element

    this._state    = createState();
    this._filename = this.getAttribute('filename') || 'output.funscript';

    // Interaction state
    this._dragPt   = null;   // { chIdx, ptIdx } – kf canvas drag
    this._isDragging = false;
    this._tlDrag   = null;   // { chIdx, edge } – timeline resize drag
    this._hoverPt  = null;   // { chIdx, ptIdx } – tooltip hover

    // Playback
    this._playback = new Playback((ms) => this._onTick(ms));
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  connectedCallback() {
    this._injectCSS();
    this._cacheDOM();
    this._bindEvents();
    this._resizeCanvases();
    this._redraw(0);

    this._ro = new ResizeObserver(() => {
      this._resizeCanvases();
      this._redraw(this._playback.currentMs);
    });
    this._ro.observe(this._shadow.host);
  }

  disconnectedCallback() {
    if (this._ro) this._ro.disconnect();
    this._playback.stop();
  }

  static get observedAttributes() { return ['filename']; }

  attributeChangedCallback(name, _old, val) {
    if (name === 'filename') this._filename = val || 'output.funscript';
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Load a parsed funscript JSON object into the editor. */
  importScript(json) {
    this._playback.stop();
    loadJSON(json, this._state);
    this._refreshAll(0);
  }

  /** Returns the current merged funscript object (does not trigger download). */
  exportScript() {
    return buildExportObject(this._state);
  }

  // ── CSS injection ────────────────────────────────────────────────────────────

  _injectCSS() {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = new URL('./editor.css', import.meta.url).href;
    this._shadow.prepend(link);
  }

  // ── DOM cache ────────────────────────────────────────────────────────────────

  _cacheDOM() {
    const $ = (id) => this._shadow.getElementById(id);

    this._tlCanvas   = $('timeline-canvas');
    this._kfCanvas   = $('kf-canvas');
    this._kfTooltip  = $('kf-tooltip');
    this._chList     = $('chapter-list');
    this._previewCh  = $('preview-chapter');
    this._previewT   = $('preview-time');
    this._gaugeBar   = $('gauge-bar');
    this._gaugeVal   = $('gauge-val');
    this._btnPlay    = $('btn-play');

    this._tlCtx = this._tlCanvas.getContext('2d');
    this._kfCtx = this._kfCanvas.getContext('2d');

    // Modal element references passed to Modal.open()
    this._modalEls = {
      overlay:   $('modal-overlay'),
      title:     $('modal-title'),
      name:      $('modal-name'),
      start:     $('modal-start'),
      end:       $('modal-end'),
      btnOk:     $('modal-ok'),
      btnCancel: $('modal-cancel'),
    };
  }

  // ── Event wiring ─────────────────────────────────────────────────────────────

  _bindEvents() {
    const $ = (id) => this._shadow.getElementById(id);

    // ── Toolbar ──────────────────────────────────────────────────────────────
    $('import-input').addEventListener('change', (e) => this._onImportFile(e));
    $('btn-new').addEventListener('click',    () => this._onNew());
    $('btn-play').addEventListener('click',   () => this._onPlayPause());
    $('btn-stop').addEventListener('click',   () => this._onStop());
    $('btn-export').addEventListener('click', () => this._onExport());
    $('speed-select').addEventListener('change', (e) => {
      this._playback.speed = parseFloat(e.target.value);
    });

    // ── Sidebar ───────────────────────────────────────────────────────────────
    $('btn-add-chapter').addEventListener('click', () => this._openModal(null));

    // ── Timeline canvas ───────────────────────────────────────────────────────
    this._tlCanvas.addEventListener('mousedown',  (e) => this._tlDown(e));
    this._tlCanvas.addEventListener('mousemove',  (e) => this._tlMove(e));
    this._tlCanvas.addEventListener('mouseup',    ()  => this._tlUp());
    this._tlCanvas.addEventListener('mouseleave', ()  => { this._tlDrag = null; });

    // ── Keyframe canvas ───────────────────────────────────────────────────────
    this._kfCanvas.addEventListener('mousedown',   (e) => this._kfDown(e));
    this._kfCanvas.addEventListener('mousemove',   (e) => this._kfMove(e));
    this._kfCanvas.addEventListener('mouseup',     ()  => this._kfUp());
    this._kfCanvas.addEventListener('mouseleave',  ()  => this._kfLeave());
    this._kfCanvas.addEventListener('contextmenu', (e) => this._kfRightClick(e));
  }

  // ── Canvas resize ─────────────────────────────────────────────────────────

  _resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;

    for (const [canvas, ctx] of [[this._tlCanvas, this._tlCtx], [this._kfCanvas, this._kfCtx]]) {
      const w = canvas.parentElement.clientWidth;
      const h = canvas.parentElement.clientHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  _tlW() { return this._tlCanvas.clientWidth; }
  _tlH() { return this._tlCanvas.clientHeight; }
  _kfW() { return this._kfCanvas.clientWidth; }
  _kfH() { return this._kfCanvas.clientHeight; }

  // ── Rendering ────────────────────────────────────────────────────────────────

  _redraw(playMs) {
    drawTimeline(this._tlCtx, this._tlW(), this._tlH(), this._state, playMs);
    drawKeyframes(this._kfCtx, this._kfW(), this._kfH(), this._state, playMs, this._hoverPt, this._dragPt);
  }

  _refreshAll(playMs) {
    renderSidebar(this._state, this._chList, {
      onSelect: (i) => { this._state.selectedIdx = i; this._refreshAll(this._playback.currentMs); },
      onEdit:   (i) => this._openModal(i),
      onDelete: (i) => this._deleteChapter(i),
    });
    this._redraw(playMs);
    this._updatePreview(playMs);
  }

  // ── Toolbar handlers ──────────────────────────────────────────────────────

  _onImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        this.importScript(JSON.parse(ev.target.result));
      } catch {
        alert('Could not parse file – is it a valid .funscript JSON?');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  _onNew() {
    if (this._state.chapters.length > 0 && !confirm('Discard current script and start fresh?')) return;
    this._playback.stop();
    this._state = createState();
    this._refreshAll(0);
  }

  _onPlayPause() {
    if (this._playback.isPlaying) {
      this._playback.pause();
      this._btnPlay.textContent = '▶ Play';
      this._btnPlay.classList.remove('active');
    } else {
      this._playback.start(this._state.totalDuration);
      this._btnPlay.textContent = '⏸ Pause';
      this._btnPlay.classList.add('active');
    }
  }

  _onStop() {
    this._playback.stop();
    this._btnPlay.textContent = '▶ Play';
    this._btnPlay.classList.remove('active');
    this._refreshAll(0);
  }

  _onExport() {
    const obj = buildExportObject(this._state);
    downloadJSON(obj, this._filename);
    this.dispatchEvent(new CustomEvent('funscript-export', {
      detail: obj, bubbles: true, composed: true,
    }));
  }

  // ── Chapter modal ─────────────────────────────────────────────────────────

  async _openModal(editIdx) {
    const result = await Modal.open(this._modalEls, editIdx, this._state);
    if (!result) return;

    const { name, startMs, endMs } = result;
    if (endMs > this._state.totalDuration) this._state.totalDuration = endMs;

    if (editIdx !== null) {
      Object.assign(this._state.chapters[editIdx], { name, startMs, endMs });
    } else {
      this._state.chapters.push({
        name, startMs, endMs,
        actions: [],
        color: PALETTE[this._state.chapters.length % PALETTE.length],
      });
      this._state.selectedIdx = this._state.chapters.length - 1;
    }

    this._refreshAll(this._playback.currentMs);
    this._fireChange();
  }

  _deleteChapter(idx) {
    if (!confirm(`Delete chapter "${this._state.chapters[idx].name}"?`)) return;
    this._state.chapters.splice(idx, 1);
    clampSelection(this._state);
    this._refreshAll(this._playback.currentMs);
    this._fireChange();
  }

  // ── Timeline mouse ────────────────────────────────────────────────────────

  _tlEvtX(e) { return e.clientX - this._tlCanvas.getBoundingClientRect().left; }

  _tlDown(e) {
    const x   = this._tlEvtX(e);
    const hit = tlHitTest(x, this._state, this._tlW());
    if (!hit) return;

    if (hit.edge === 'body') {
      this._state.selectedIdx = hit.chIdx;
      this._refreshAll(this._playback.currentMs);
    } else {
      this._tlDrag = { chIdx: hit.chIdx, edge: hit.edge };
    }
  }

  _tlMove(e) {
    const x = this._tlEvtX(e);

    if (this._tlDrag) {
      const ch    = this._state.chapters[this._tlDrag.chIdx];
      const newMs = Math.round(tlXToMs(x, this._state.totalDuration, this._tlW()));

      if (this._tlDrag.edge === 'start') {
        ch.startMs = Math.max(0, Math.min(newMs, ch.endMs - 100));
      } else {
        ch.endMs = Math.max(ch.startMs + 100, Math.min(newMs, this._state.totalDuration));
      }

      this._redraw(this._playback.currentMs);
      this._fireChange();
    } else {
      const hit = tlHitTest(x, this._state, this._tlW());
      this._tlCanvas.style.cursor = hit
        ? (hit.edge === 'body' ? 'pointer' : 'ew-resize')
        : 'default';
    }
  }

  _tlUp() {
    if (this._tlDrag) {
      this._tlDrag = null;
      this._refreshAll(this._playback.currentMs);
    }
  }

  // ── Keyframe mouse ────────────────────────────────────────────────────────

  _kfEvt(e) {
    const r = this._kfCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _kfDown(e) {
    const { x, y } = this._kfEvt(e);
    const hit = kfHitTest(x, y, this._state, this._kfW(), this._kfH());

    if (hit !== null) {
      this._dragPt     = { chIdx: this._state.selectedIdx, ptIdx: hit };
      this._isDragging = true;
      this._kfCanvas.classList.add('dragging');
      this._kfCanvas.classList.remove('hovering');
    } else {
      this._addKeyframe(x, y);
    }
  }

  _kfMove(e) {
    const { x, y } = this._kfEvt(e);

    if (this._isDragging && this._dragPt) {
      this._moveDragPoint(x, y);
    } else {
      this._updateHover(x, y);
    }
  }

  _kfUp() {
    this._isDragging = false;
    this._dragPt     = null;
    this._kfCanvas.classList.remove('dragging');
    this._redraw(this._playback.currentMs);
  }

  _kfLeave() {
    this._isDragging = false;
    this._hoverPt    = null;
    this._kfTooltip.classList.add('hidden');
    this._kfCanvas.classList.remove('dragging', 'hovering');
    this._redraw(this._playback.currentMs);
  }

  _kfRightClick(e) {
    e.preventDefault();
    const { x, y } = this._kfEvt(e);
    const hit = kfHitTest(x, y, this._state, this._kfW(), this._kfH());
    if (hit === null) return;

    const ch = selectedChapter(this._state);
    if (!ch) return;
    ch.actions.splice(hit, 1);
    this._hoverPt = null;
    this._kfTooltip.classList.add('hidden');
    this._redraw(this._playback.currentMs);
    this._fireChange();
  }

  _addKeyframe(x, y) {
    const ch = selectedChapter(this._state);
    if (!ch) return;

    const dur = selectedDuration(this._state);
    const ms  = Math.max(0, Math.min(kfXToMs(x, dur, this._kfW()), dur));
    const pos = Math.max(0, Math.min(yToPos(y, this._kfH()), 100));

    ch.actions.push({ at: ms, pos });
    ch.actions.sort((a, b) => a.at - b.at);

    this._redraw(this._playback.currentMs);
    this._fireChange();
  }

  _moveDragPoint(x, y) {
    const ch  = this._state.chapters[this._dragPt.chIdx];
    const dur = ch.endMs - ch.startMs;
    const a   = ch.actions[this._dragPt.ptIdx];

    a.at  = Math.max(0, Math.min(kfXToMs(x, dur, this._kfW()), dur));
    a.pos = Math.max(0, Math.min(yToPos(y, this._kfH()), 100));
    ch.actions.sort((a, b) => a.at - b.at);

    // Keep drag index in sync after sort
    this._dragPt.ptIdx = ch.actions.indexOf(a);

    this._redraw(this._playback.currentMs);
    this._fireChange();
  }

  _updateHover(x, y) {
    const hit = kfHitTest(x, y, this._state, this._kfW(), this._kfH());
    if (hit !== null) {
      const ch = selectedChapter(this._state);
      const a  = ch.actions[hit];
      this._hoverPt = { chIdx: this._state.selectedIdx, ptIdx: hit };
      this._kfTooltip.textContent = `at: ${a.at} ms   pos: ${a.pos}`;
      this._kfTooltip.style.left  = (x + 12) + 'px';
      this._kfTooltip.style.top   = (y - 24) + 'px';
      this._kfTooltip.classList.remove('hidden');
      this._kfCanvas.classList.add('hovering');
    } else {
      this._hoverPt = null;
      this._kfTooltip.classList.add('hidden');
      this._kfCanvas.classList.remove('hovering');
    }
    this._redraw(this._playback.currentMs);
  }

  // ── Playback tick ─────────────────────────────────────────────────────────

  _onTick(playMs) {
    if (!this._playback.isPlaying && playMs === 0) {
      // Stopped – reset button state
      this._btnPlay.textContent = '▶ Play';
      this._btnPlay.classList.remove('active');
    }
    this._redraw(playMs);
    this._updatePreview(playMs);
  }

  // ── Preview bar ───────────────────────────────────────────────────────────

  _updatePreview(playMs) {
    let chName = '—';
    let pos    = 0;

    for (const ch of this._state.chapters) {
      if (playMs >= ch.startMs && playMs <= ch.endMs) {
        chName = ch.name || '(empty)';
        pos    = interpolatePos(ch.actions, playMs - ch.startMs);
        break;
      }
    }

    this._previewCh.textContent  = `▶ ${chName}`;
    this._previewT.textContent   = msToTimeStr(playMs);
    this._gaugeBar.style.width   = pos + '%';
    this._gaugeVal.textContent   = Math.round(pos);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _fireChange() {
    this.dispatchEvent(new CustomEvent('funscript-change', {
      detail:   buildExportObject(this._state),
      bubbles:  true,
      composed: true,
    }));
  }
}

if (!customElements.get('funscript-editor')) {
  customElements.define('funscript-editor', FunscriptEditor);
}
