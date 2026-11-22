// Lasteast Present — slideshow player, presenter view, annotations
import { el, clamp } from './util.js';
import { renderSlide, hitObj, assetSrc } from './renderer.js';
import { buildTimeline, computeOverrides } from './animations.js';
import { prepareTransition, playSound } from './transitions.js';
import { t } from './i18n.js';
import { camera, cameraLayout, drawCameraOverlay, smartCorner } from './camera.js';
import { Recorder } from './recorder.js';

export class Player {
  constructor(host, doc, opts = {}) {
    this.doc = doc; this.opts = opts; this.host = host;
    this.order = opts.customShow ? opts.customShow.map(id => doc.slides.findIndex(s => s.id === id)).filter(i => i >= 0) : doc.slides.map((s, i) => i).filter(i => !doc.slides[i].hidden || opts.includeHidden);
    if (!this.order.length) this.order = [0];
    this.pos = Math.max(0, this.order.indexOf(opts.start ?? this.order[0])); if (this.pos < 0) this.pos = 0;
    this.root = el('div', { class: 'show-root' + (opts.embedded ? ' embedded' : ''), tabindex: 0 });
    this.canvas = el('canvas', { class: 'show-canvas' }); this.root.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ann = {}; this.tool = 'none'; this.penColor = '#ff3b30'; this.blank = null; this.laser = null; this.media = {};
    this.started = performance.now(); this.slideStarted = performance.now(); this.timings = [];
    this.camState = { cur: null };
    this.buildUI(); host.append(this.root);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.root);
    this.bind();
    this.resize();
    this.enter(this.pos, false);
    this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
    if (!opts.embedded) setTimeout(() => this.root.focus(), 30);
  }
  get slide() { return this.doc.slides[this.order[this.pos]]; }
  get index() { return this.order[this.pos]; }
  camSettings() { const base = this.doc.show.camera; const s = this.slide.camera; return s && s.custom ? { ...base, ...s } : base; }

  buildUI() {
    if (this.opts.embedded || this.opts.audience) return;
    const btn = (icon, title, fn, cls = '') => el('button', { class: 'sb ' + cls, title, onclick: (e) => { e.stopPropagation(); fn(e); } }, el('span', { class: 'ic', html: icon }));
    const I = window.ICONS || {};
    this.bar = el('div', { class: 'show-bar' },
      btn(I.prev, t('Previous'), () => this.prev()), btn(I.next, t('Next'), () => this.next()),
      this.penBtn = btn(I.pen, t('Pen') + ' (Ctrl+P)', () => this.setTool('pen')),
      this.hlBtn = btn(I.highlighter, t('Highlighter') + ' (Ctrl+I)', () => this.setTool('highlighter')),
      this.lzBtn = btn(I.laser, t('Laser Pointer') + ' (Ctrl+L)', () => this.setTool('laser')),
      this.erBtn = btn(I.eraser, t('Eraser') + ' (E clears)', () => this.setTool('eraser')),
      el('input', { type: 'color', value: this.penColor, title: t('Ink color'), oninput: (e) => this.penColor = e.target.value, onclick: e => e.stopPropagation() }),
      btn(I.grid, t('See all slides') + ' (G)', () => this.toggleGrid()),
      btn(I.black, t('Black screen') + ' (B)', () => this.setBlank('black')),
      btn(I.white, t('White screen') + ' (W)', () => this.setBlank('white')),
      this.camBtn = btn(I.camera, t('Camera On/Off') + ' (C)', () => this.toggleCamera()),
      this.micBtn = btn(I.mic, t('Microphone On/Off'), () => { camera.toggleMic(); this.updateCamBtns(); }),
      btn(I.layout, t('Camera Layout'), () => this.cycleCamLayout()),
      this.recBtn = btn(I.record, t('Record'), () => this.toggleRecord(), 'rec'),
      btn(I.fullscreen, t('Full-Screen Toggle') + ' (F)', () => this.toggleFullscreen()),
      el('span', { class: 'show-count' }),
      btn(I.close, t('End Show') + ' (Esc)', () => this.end()));
    this.root.append(this.bar);
    this.status = el('div', { class: 'show-status' }); this.root.append(this.status);
    this.camLive = el('div', { class: 'cam-indicators' }); this.root.append(this.camLive);
    let hideT; const show = () => { this.bar.classList.add('vis'); clearTimeout(hideT); hideT = setTimeout(() => this.bar.classList.remove('vis'), 2600); };
    this.root.addEventListener('mousemove', show); show();
    this.updateCamBtns();
  }
  updateCamBtns() {
    if (!this.camBtn) return;
    this.camBtn.classList.toggle('on', camera.active && this.doc.show.camera.enabled);
    this.micBtn.classList.toggle('on', camera.micOn);
    this.camLive.innerHTML = '';
    if (camera.active) this.camLive.append(el('span', { class: 'ind cam' }, '● ' + t('Camera active')));
    if (camera.micOn) this.camLive.append(el('span', { class: 'ind mic' }, '● ' + t('Microphone active')));
    if (this.rec && this.rec.state === 'recording') this.camLive.append(el('span', { class: 'ind rec' }, '● REC'));
  }
  async toggleCamera() {
    const cs = this.doc.show.camera;
    if (camera.active && cs.enabled) { cs.enabled = false; }
    else { try { await camera.start(); cs.enabled = true; } catch (e) { this.flash(t('Camera permission was denied or no camera is available.')); } }
    this.updateCamBtns(); this.dirty = true;
  }
  cycleCamLayout() { const L = ['bubble', 'pip', 'card', 'side', 'full', 'floating']; const cs = this.doc.show.camera; cs.layout = L[(L.indexOf(cs.layout) + 1) % L.length]; this.flash(t('Camera Layout') + ': ' + t('cam_' + cs.layout)); this.resize(); }
  async toggleRecord() {
    if (this.rec && (this.rec.state === 'recording' || this.rec.state === 'paused')) { const blob = await this.rec.stop(); this.updateCamBtns(); this.opts.onRecording && this.opts.onRecording(blob, this.rec.mime); return; }
    this.rec = new Recorder(this.canvas, { audio: camera.micOn ? camera.micStream() : null, fps: 30 });
    try { this.rec.start(); this.flash(t('Recording started')); } catch (e) { this.flash(t('Recording is not supported in this browser.')); }
    this.updateCamBtns();
  }
  flash(msg) { if (!this.status) return; this.status.textContent = msg; this.status.classList.add('vis'); clearTimeout(this._ft); this._ft = setTimeout(() => this.status.classList.remove('vis'), 2200); }

  resize() {
    const r = this.root.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = Math.max(2, Math.round(r.width * dpr)); this.ch = Math.max(2, Math.round(r.height * dpr));
    if (this.opts.fixedSize) { this.cw = this.opts.fixedSize.w; this.ch = this.opts.fixedSize.h; }
    this.canvas.width = this.cw; this.canvas.height = this.ch; this.dpr = dpr;
    this.layout(); this.staticDirty = true; this.dirty = true;
  }
  layout() {
    const cs = this.doc.show.camera, { w, h } = this.doc.size;
    const lay = cameraLayout(cs.enabled && camera.active ? cs : { ...cs, enabled: false }, this.cw, this.ch, w / h);
    this.srect = lay.slideRect; this.scale = this.srect.w / w;
  }
  bind() {
    this.onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key, c = e.ctrlKey || e.metaKey;
      if (c && k.toLowerCase() === 'p') { e.preventDefault(); return this.setTool('pen'); }
      if (c && k.toLowerCase() === 'l') { e.preventDefault(); return this.setTool('laser'); }
      if (c && k.toLowerCase() === 'i') { e.preventDefault(); return this.setTool('highlighter'); }
      if (c && k.toLowerCase() === 'e') { e.preventDefault(); return this.setTool('eraser'); }
      if (c && k.toLowerCase() === 'a') { e.preventDefault(); return this.setTool('none'); }
      if (c) return;
      if (/^[0-9]$/.test(k)) { this.typed = (this.typed || '') + k; return; }
      switch (k) {
        case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': case 'n': case 'N': e.preventDefault(); return this.next();
        case 'Enter': e.preventDefault(); if (this.typed) { const n = +this.typed - 1; this.typed = ''; return this.goto(this.order.indexOf(n) >= 0 ? this.order.indexOf(n) : this.pos); } return this.next();
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': case 'p': case 'P': e.preventDefault(); return this.prev();
        case 'Home': return this.goto(0); case 'End': return this.goto(this.order.length - 1);
        case 'b': case 'B': case '.': return this.setBlank('black');
        case 'w': case 'W': case ',': return this.setBlank('white');
        case 'e': case 'E': this.ann[this.index] = []; this.dirty = true; return;
        case 'g': case 'G': case '-': return this.toggleGrid();
        case 'c': case 'C': return this.toggleCamera();
        case 'f': case 'F': return this.toggleFullscreen();
        case 'h': case 'H': return this.showHiddenNext();
        case 'Escape': e.preventDefault(); if (this.gridEl) return this.toggleGrid(); if (this.blank) return this.setBlank(null); if (this.tool !== 'none') return this.setTool('none'); return this.end();
      }
    };
    (this.opts.keyTarget || window).addEventListener('keydown', this.onKey);
    const pt = (e) => { const r = this.canvas.getBoundingClientRect(); const x = (e.clientX - r.left) * this.cw / r.width, y = (e.clientY - r.top) * this.ch / r.height; return { x, y, sx: (x - this.srect.x) / this.scale, sy: (y - this.srect.y) / this.scale }; };
    let drawing = null, sw = null, camDrag = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      const p = pt(e); this.canvas.setPointerCapture(e.pointerId);
      if (this.opts.audience) return;
      if (this.camRect && camera.active && this.doc.show.camera.enabled && ['floating', 'pip', 'bubble', 'card'].includes(this.doc.show.camera.layout) && !this.doc.show.camera.lock && inside(p, this.camRect)) { camDrag = { x: p.x, y: p.y, r: { ...this.camRect } }; return; }
      if (this.tool === 'pen' || this.tool === 'highlighter') { drawing = { tool: this.tool, color: this.tool === 'highlighter' ? '#ffe14d' : this.penColor, pts: [[p.sx, p.sy]] }; (this.ann[this.index] = this.ann[this.index] || []).push(drawing); return; }
      if (this.tool === 'eraser') { this.eraseAt(p.sx, p.sy); drawing = { erase: true }; return; }
      if (this.tool === 'laser') return;
      sw = { x: e.clientX, y: e.clientY, t: performance.now(), p };
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const p = pt(e);
      if (camDrag) { const cs = this.doc.show.camera; cs.x = clamp((camDrag.r.x + p.x - camDrag.x) / this.cw, 0, 1); cs.y = clamp((camDrag.r.y + p.y - camDrag.y) / this.ch, 0, 1); cs.corner = 'custom'; this.dirty = true; return; }
      if (this.tool === 'laser') { this.laser = { x: p.sx, y: p.sy, t: performance.now() }; this.dirty = true; this.opts.onLaser && this.opts.onLaser(this.laser); }
      if (drawing && drawing.pts) { drawing.pts.push([p.sx, p.sy]); this.dirty = true; this.opts.onAnnotate && this.opts.onAnnotate(this.index, this.ann[this.index]); }
      if (drawing && drawing.erase) this.eraseAt(p.sx, p.sy);
      const hov = this.hitLink(p.sx, p.sy); this.canvas.style.cursor = this.tool === 'pen' || this.tool === 'highlighter' ? 'crosshair' : this.tool === 'laser' ? 'none' : hov ? 'pointer' : 'default';
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (camDrag) { camDrag = null; return; }
      if (drawing) { drawing = null; return; }
      if (!sw) return; const dx = e.clientX - sw.x, dt = performance.now() - sw.t; const p = sw.p; sw = null;
      if (e.pointerType === 'touch' && Math.abs(dx) > 60 && dt < 600) return dx < 0 ? this.next() : this.prev();
      if (e.button === 2) return;
      if (this.handleClick(p.sx, p.sy)) return;
      if (this.slide.transition.onClick !== false || true) this.next();
    });
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!this.opts.audience) this.prev(); });
    this.canvas.addEventListener('wheel', (e) => { if (this.opts.audience) return; clearTimeout(this._wt); this._wt = setTimeout(() => e.deltaY > 0 ? this.next() : this.prev(), 40); }, { passive: true });
  }
  eraseAt(x, y) { const L = this.ann[this.index]; if (!L) return; this.ann[this.index] = L.filter(s => !s.pts.some(([a, b]) => Math.hypot(a - x, b - y) < 18)); this.dirty = true; }
  hitLink(x, y) { const objs = this.slide.objects; for (let i = objs.length - 1; i >= 0; i--) { const o = objs[i]; if ((o.link || o.type === 'video' || this.triggerFor(o.id)) && hitObj(o, x, y)) return o; } return null; }
  triggerFor(id) { return this.slide.objects.some(o => (o.anims || []).some(a => a.trigger === id)); }
  handleClick(x, y) {
    const o = this.hitLink(x, y); if (!o) return false;
    if (this.triggerFor(o.id)) { this.playTrigger(o.id); return true; }
    if (o.type === 'video' && this.media[o.id]) { const v = this.media[o.id]; v.paused ? v.play() : v.pause(); return true; }
    if (o.link) this.followLink(o.link);
    return true;
  }
  followLink(link) {
    if (link.type === 'url') { window.open(link.url, '_blank', 'noopener'); return; }
    const map = { next: this.pos + 1, prev: this.pos - 1, first: 0, last: this.order.length - 1 };
    if (link.type in map) return this.goto(clamp(map[link.type], 0, this.order.length - 1), true);
    if (link.type === 'slide') { const i = this.doc.slides.findIndex(s => s.id === link.slide); if (i >= 0) { let p = this.order.indexOf(i); if (p < 0) { this.order.splice(this.pos + 1, 0, i); p = this.pos + 1; } this.goto(p, true); } }
    if (link.type === 'end') this.end();
  }
  playTrigger(id) {
    this.triggers = this.triggers || [];
    for (const o of this.slide.objects) for (const a of (o.anims || [])) if (a.trigger === id) this.triggers.push({ a, o, t0s: performance.now() / 1000 + (a.delay || 0), dur: (a.dur || .5) * (a.repeat || 1), trigger: true, p: 0 });
    this.dirty = true;
  }
  setTool(tool) { this.tool = this.tool === tool ? 'none' : tool; if (this.tool !== 'laser') this.laser = null; [['pen', this.penBtn], ['highlighter', this.hlBtn], ['laser', this.lzBtn], ['eraser', this.erBtn]].forEach(([k, b]) => b && b.classList.toggle('on', this.tool === k)); this.dirty = true; }
  setBlank(b) { this.blank = this.blank === b ? null : b; this.dirty = true; this.opts.onCommand && this.opts.onCommand({ cmd: 'blank', v: this.blank }); }
  toggleFullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else this.root.requestFullscreen?.().catch(() => { }); }
  showHiddenNext() { const nextIdx = this.index + 1; if (nextIdx < this.doc.slides.length && this.doc.slides[nextIdx].hidden) { this.order.splice(this.pos + 1, 0, nextIdx); this.next(); } }

  // ---------- media ----------
  setupMedia() {
    for (const [id, m] of Object.entries(this.media)) { const keep = m._across && this.slide.objects.some(o => o.id === id) === false && m._across; if (!keep) { m.pause(); m.remove?.(); delete this.media[id]; } }
    for (const o of this.slide.objects) {
      if ((o.type !== 'video' && o.type !== 'audio') || this.media[o.id]) continue;
      const src = assetSrc(this.doc, o.asset); if (!src) continue;
      const m = document.createElement(o.type); m.src = src; m.loop = !!o.loop; m.volume = clamp(o.volume ?? 1, 0, 1); m.playsInline = true; m.muted = !!this.opts.embedded;
      m._across = o.acrossSlides; m.crossOrigin = 'anonymous';
      const tStart = o.trimStart || 0, tEnd = o.trimEnd || 0;
      m.addEventListener('loadedmetadata', () => { if (tStart) m.currentTime = tStart; });
      m.addEventListener('timeupdate', () => { if (tEnd && m.currentTime >= tEnd) { if (o.loop) m.currentTime = tStart; else m.pause(); }
        const dur = (tEnd || m.duration) - tStart, pos = m.currentTime - tStart; let v = clamp(o.volume ?? 1, 0, 1);
        if (o.fadeIn && pos < o.fadeIn) v *= pos / o.fadeIn; if (o.fadeOut && dur - pos < o.fadeOut) v *= Math.max(0, (dur - pos) / o.fadeOut); m.volume = clamp(v, 0, 1); });
      m.onerror = () => this.flash(t('This media format is not supported by your system codecs.'));
      if (o.autoplay && !this.opts.embedded && !this.opts.noMedia) m.play().catch(() => { });
      this.media[o.id] = m;
      if (o.type === 'video' && this.opts.recorderAudio) { /* captured via canvas */ }
    }
  }

  // ---------- navigation ----------
  enter(pos, withTransition, fromState) {
    const prevSlide = this.slide, prevIndex = this.index;
    this.pos = pos; this.tl = buildTimeline(this.slide); this.step = -1; this.stepT0 = performance.now() / 1000; this.triggers = [];
    if (this.opts.rehearse) { const now = performance.now(); if (this._lastSlideT != null) this.timings[prevIndex] = ((this.timings[prevIndex] || 0) + (now - this._lastSlideT) / 1000); this._lastSlideT = now; }
    this.slideStarted = performance.now();
    if (this.tl.autoFirst) { this.step = 0; this.stepT0 = performance.now() / 1000; }
    this.setupMedia(); this.staticDirty = true; this.dirty = true;
    this.updateCount();
    // camera per-slide movement
    if (withTransition && prevSlide) this.startTransition(fromState, prevIndex);
    this.scheduleAuto();
    this.opts.onSlide && this.opts.onSlide(this.index, this);
  }
  updateCount() { const c = this.root.querySelector('.show-count'); if (c) c.textContent = `${this.pos + 1} / ${this.order.length}`; }
  stepDone() { if (this.step < 0) return true; const d = this.tl.stepDur[this.step] || 0; return performance.now() / 1000 - this.stepT0 >= d; }
  allDone() { return this.step >= this.tl.steps - 1 && this.stepDone(); }
  scheduleAuto() {
    clearTimeout(this.autoT);
    const tr = this.slide.transition || {}, after = tr.after;
    if (after == null || after === '' || this.opts.embedded || this.opts.audience) return;
    const wait = () => { if (this.transitionRun) return this.autoT = setTimeout(wait, 100); if (!this.allDone()) { if (this.stepDone() && this.step < this.tl.steps - 1) { this.next(); } return this.autoT = setTimeout(wait, 200); } this.next(); };
    this.autoT = setTimeout(wait, Math.max(0, +after) * 1000);
  }
  next() {
    if (this.blank) { this.blank = null; this.dirty = true; return; }
    if (this.transitionRun) { this.transitionRun.finish = true; return; }
    this.opts.onCommand && this.opts.onCommand({ cmd: 'next' });
    if (!this.stepDone()) { this.stepT0 -= 1e3; this.dirty = true; return; }
    if (this.step < this.tl.steps - 1) { this.step++; this.stepT0 = performance.now() / 1000; this.dirty = true; this.opts.onStep && this.opts.onStep(this); this.scheduleAuto(); return; }
    if (this.pos < this.order.length - 1) return this.go(this.pos + 1, true);
    if (this.doc.show.loop || this.opts.loop) return this.go(0, true);
    if (!this.endScreen) { this.endScreen = true; this.dirty = true; return; }
    this.end();
  }
  prev() {
    if (this.transitionRun) { this.transitionRun.finish = true; }
    this.opts.onCommand && this.opts.onCommand({ cmd: 'prev' });
    if (this.endScreen) { this.endScreen = false; this.dirty = true; return; }
    const min = this.tl.autoFirst ? 0 : -1;
    if (this.step > min) { this.step--; this.stepT0 = -1e9; this.dirty = true; return; }
    if (this.pos > 0) { this.enter(this.pos - 1, false); this.step = this.tl.steps - 1; this.stepT0 = -1e9; this.dirty = true; }
  }
  goto(pos, withTr = false) { this.opts.onCommand && this.opts.onCommand({ cmd: 'goto', pos }); this.go(pos, withTr); }
  go(pos, withTr) {
    this.endScreen = false;
    const fromSnap = document.createElement('canvas'); fromSnap.width = Math.round(this.doc.size.w * this.scale); fromSnap.height = Math.round(this.doc.size.h * this.scale);
    this.drawSlideTo(fromSnap.getContext('2d'), this.scale, true);
    this.enter(pos, withTr && (this.slide !== this.doc.slides[this.order[pos]] || true), { canvas: fromSnap, slide: this.slide });
  }
  startTransition(from, fromIndex) {
    const tr = this.slide.transition || { type: 'none' };
    if (!tr.type || tr.type === 'none' || !from) return;
    const toC = document.createElement('canvas'); toC.width = from.canvas.width; toC.height = from.canvas.height;
    this.drawSlideTo(toC.getContext('2d'), this.scale, false, 0);
    const prep = prepareTransition({ doc: this.doc, from: { slide: from.slide, canvas: from.canvas }, to: { slide: this.slide, canvas: toC }, transition: tr, fromIndex, toIndex: this.index, perf: !!(this.opts.perf || window.LP_PERF) });
    if (tr.sound) playSound(tr.sound, tr.duration);
    this.transitionRun = { prep, t0: performance.now() + (tr.delay || 0) * 1000, dur: Math.max(.05, tr.duration || .8) * 1000 };
    this.stepT0 = performance.now() / 1000 + (tr.duration || .8) + (tr.delay || 0);
  }

  // ---------- rendering ----------
  overrides() {
    const now = performance.now() / 1000;
    const trig = (this.triggers || []).map(tr => ({ ...tr, p: clamp((now - tr.t0s) / tr.dur, 0, 1) * ((now >= tr.t0s) ? 1 : 0) - (now < tr.t0s ? 1 : 0) }));
    return computeOverrides(this.slide, this.tl, this.step, now - this.stepT0, this.doc.size, trig.length ? trig : null);
  }
  animating() { if (this.step >= 0 && !this.stepDone()) return true; const now = performance.now() / 1000; return (this.triggers || []).some(t => now < t.t0s + t.dur + .05); }
  drawSlideTo(ctx, scale, current = true, stepOverride) {
    let ov;
    if (current) ov = this.overrides();
    else { const tl = this.tl; ov = computeOverrides(this.slide, tl, tl.autoFirst ? 0 : -1, 0, this.doc.size); }
    const ann = this.ann[this.index];
    renderSlide(ctx, this.doc, this.slide, { scale, overrides: ov, present: true, index: this.index, media: this.media, after: (c) => ann && drawAnn(c, ann) });
  }
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const camOn = camera.active && this.doc.show.camera.enabled;
    const videoPlaying = Object.values(this.media).some(m => m.tagName === 'VIDEO' && !m.paused);
    const live = this.transitionRun || this.animating() || camOn || videoPlaying || (this.laser && now - this.laser.t < 2000) || (this.rec && this.rec.state === 'recording');
    if (!live && !this.dirty) return;
    this.dirty = false;
    const ctx = this.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (camOn) { const prevLayout = this._lastLayout; const cs = this.doc.show.camera; if (prevLayout !== cs.layout + cs.side + cs.split) { this._lastLayout = cs.layout + cs.side + cs.split; this.layout(); } }
    else if (this._lastLayout) { this._lastLayout = null; this.layout(); }
    ctx.fillStyle = this.opts.embedded ? '#111' : '#000'; ctx.fillRect(0, 0, this.cw, this.ch);
    const { x, y } = this.srect, s = this.scale;
    if (this.blank) { ctx.fillStyle = this.blank === 'white' ? '#fff' : '#000'; ctx.fillRect(0, 0, this.cw, this.ch); }
    else if (this.endScreen) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.cw, this.ch); ctx.fillStyle = '#aaa'; ctx.font = `${Math.round(this.ch * .025)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(t('End of slide show, click to exit.'), this.cw / 2, this.ch * .08); }
    else if (this.transitionRun) {
      const tr = this.transitionRun, p = tr.finish ? 1 : clamp((now - tr.t0) / tr.dur, 0, 1);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, this.doc.size.w * s, this.doc.size.h * s); ctx.clip();
      tr.prep.draw(ctx, p, s, x, y); ctx.restore();
      if (p >= 1) { this.transitionRun = null; this.stepT0 = this.step >= 0 ? performance.now() / 1000 : this.stepT0; this.dirty = true; }
    } else {
      ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, this.doc.size.w * s, this.doc.size.h * s); ctx.clip();
      this.drawSlideTo(ctx, 1, true); // drawn via scale below
      ctx.restore();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const ov = this.overrides(), ann = this.ann[this.index];
      renderSlide(ctx, this.doc, this.slide, { scale: s, ox: x, oy: y, overrides: ov, present: true, index: this.index, media: this.media, clear: false, after: (c) => { ann && drawAnn(c, ann); if (this.laser && now - this.laser.t < 2000) drawLaser(c, this.laser, now); } });
      ctx.restore();
    }
    if (camOn && !this.blank) this.drawCamera(ctx, now);
    if (this.opts.afterFrame) this.opts.afterFrame(ctx, this);
  }
  drawCamera(ctx, now) {
    const cs = this.camSettings();
    if (this.slide.camera && this.slide.camera.custom && this.slide.camera.enabled === false) return;
    let corner = cs.corner;
    if (cs.autoAvoid && cs.corner !== 'custom' && !(this.slide.camera && this.slide.camera.custom && this.slide.camera.corner)) corner = smartCorner(this.slide, this.doc.size, cs.size, corner);
    const target = cameraLayout({ ...cs, corner }, this.cw, this.ch, this.doc.size.w / this.doc.size.h).camRect;
    const st = this.camState; if (!st.cur) st.cur = { ...target, t: now };
    const k = 1 - Math.pow(.001, Math.min(.05, (now - (st.last || now)) / 1000) * 3); st.last = now;
    for (const key of ['x', 'y', 'w', 'h']) st.cur[key] += (target[key] - st.cur[key]) * k;
    this.camRect = st.cur;
    const enter = clamp((now - (camera.startedAt || 0)) / 600, 0, 1);
    drawCameraOverlay(ctx, camera, cs, st.cur, enter);
  }
  toggleGrid() {
    if (this.gridEl) { this.gridEl.remove(); this.gridEl = null; return; }
    this.gridEl = el('div', { class: 'show-grid' });
    this.order.forEach((si, p) => { const c = document.createElement('canvas'); c.width = 320; c.height = 320 * this.doc.size.h / this.doc.size.w; renderSlide(c.getContext('2d'), this.doc, this.doc.slides[si], { scale: 320 / this.doc.size.w, present: true, index: si }); const b = el('button', { class: p === this.pos ? 'cur' : '', onclick: () => { this.toggleGrid(); this.goto(p, false); } }, c, el('span', {}, String(si + 1))); this.gridEl.append(b); });
    this.root.append(this.gridEl);
  }
  end() {
    if (this.ended) return; this.ended = true;
    if (this.opts.rehearse) { const now = performance.now(); if (this._lastSlideT != null) this.timings[this.index] = (this.timings[this.index] || 0) + (now - this._lastSlideT) / 1000; }
    cancelAnimationFrame(this.raf); clearTimeout(this.autoT); this.ro.disconnect();
    (this.opts.keyTarget || window).removeEventListener('keydown', this.onKey);
    for (const m of Object.values(this.media)) m.pause();
    if (this.rec && this.rec.state !== 'inactive') this.toggleRecord();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    this.root.remove();
    this.opts.onEnd && this.opts.onEnd(this);
  }
}
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export function drawAnn(ctx, list) {
  for (const s of list) {
    if (!s.pts || s.pts.length < 1) continue;
    ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = s.color;
    if (s.tool === 'highlighter') { ctx.globalAlpha = .35; ctx.lineWidth = 22; ctx.globalCompositeOperation = 'multiply'; } else ctx.lineWidth = 4;
    ctx.beginPath(); s.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + .1, s.pts[0][1]); ctx.stroke(); ctx.restore();
  }
}
function drawLaser(ctx, l, now) { const a = clamp(1 - (now - l.t) / 2000, 0, 1); ctx.save(); ctx.globalAlpha = a; const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 22); g.addColorStop(0, 'rgba(255,40,40,1)'); g.addColorStop(.3, 'rgba(255,40,40,.7)'); g.addColorStop(1, 'rgba(255,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.x, l.y, 22, 0, 7); ctx.fill(); ctx.restore(); }

// ---------------- Presenter view ----------------
export function startPresenter(doc, opts) {
  const chan = new BroadcastChannel('lasteast-show-' + doc.id);
  const wrap = el('div', { class: 'presenter' });
  const left = el('div', { class: 'pv-main' }), right = el('div', { class: 'pv-side' });
  const nextC = el('canvas', { class: 'pv-next' });
  const notes = el('div', { class: 'pv-notes' });
  const clock = el('div', { class: 'pv-clock' }), timer = el('div', { class: 'pv-timer' }), stimer = el('div', { class: 'pv-stimer' });
  let paused = false, t0 = performance.now(), pausedAt = 0;
  const zoomNotes = (d) => { const s = parseFloat(getComputedStyle(notes).fontSize) + d; notes.style.fontSize = clamp(s, 12, 48) + 'px'; };
  const audBtn = el('button', { class: 'btn', onclick: () => openAudience() }, t('Open audience window'));
  right.append(el('div', { class: 'pv-head' }, el('span', {}, t('Next slide'))), nextC,
    el('div', { class: 'pv-head' }, el('span', {}, t('Notes')), el('span', {}, el('button', { class: 'mini', onclick: () => zoomNotes(-2) }, 'A-'), el('button', { class: 'mini', onclick: () => zoomNotes(2) }, 'A+'))), notes,
    el('div', { class: 'pv-timers' }, el('div', {}, el('small', {}, t('Presentation Timer')), timer), el('div', {}, el('small', {}, t('Current Slide Timer')), stimer), el('div', {}, el('small', {}, t('Clock')), clock)),
    el('div', { class: 'pv-ctrl' }, el('button', { class: 'btn', onclick: () => { paused = !paused; if (paused) pausedAt = performance.now(); else t0 += performance.now() - pausedAt; } }, t('Pause/Resume timer')), el('button', { class: 'btn', onclick: () => { t0 = performance.now(); } }, t('Reset timer')), audBtn, el('button', { class: 'btn danger', onclick: () => player.end() }, t('End Show'))));
  wrap.append(left, right); document.body.append(wrap);
  let audWin = null;
  const send = (m) => { try { chan.postMessage(JSON.parse(JSON.stringify(m))); } catch (e) { } };
  const player = new Player(left, doc, {
    ...opts, embedded: false,
    onCommand: (c) => send(c),
    onAnnotate: (i, a) => send({ cmd: 'ann', i, a }), onLaser: (l) => send({ cmd: 'laser', l }),
    onSlide: (i, pl) => { send({ cmd: 'sync', pos: pl.pos }); updateSide(pl); opts.onSlide && opts.onSlide(i); },
    onEnd: (pl) => { send({ cmd: 'end' }); clearInterval(iv); wrap.remove(); chan.close(); try { audWin && audWin.close(); } catch (e) { } opts.onEnd && opts.onEnd(pl); },
  });
  function updateSide(pl) {
    const ni = pl.order[pl.pos + 1]; nextC.width = 480; nextC.height = 480 * doc.size.h / doc.size.w;
    const nx = nextC.getContext('2d'); if (ni != null) renderSlide(nx, doc, doc.slides[ni], { scale: 480 / doc.size.w, present: true, index: ni }); else { nx.fillStyle = '#111'; nx.fillRect(0, 0, 480, 270); nx.fillStyle = '#888'; nx.font = '20px sans-serif'; nx.textAlign = 'center'; nx.fillText(t('End of slide show'), 240, 140); }
    notes.textContent = pl.slide.notes || t('No notes for this slide.'); notes.dir = 'auto';
  }
  const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const iv = setInterval(() => { const now = performance.now(); timer.textContent = fmt((paused ? pausedAt : now) - t0); stimer.textContent = fmt(now - player.slideStarted); clock.textContent = new Date().toLocaleTimeString(); }, 250);
  async function openAudience() {
    let features = 'popup,width=1280,height=720';
    try { if ('getScreenDetails' in window) { const sd = await window.getScreenDetails(); const other = sd.screens.find(s => s !== sd.currentScreen); if (other) features = `popup,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`; } } catch (e) { }
    audWin = window.open(location.pathname + '?audience=' + encodeURIComponent(doc.id), 'lasteast-audience', features);
    if (!audWin) { player.flash(t('Pop-up blocked. Allow pop-ups to use a second display.')); return; }
    const onReq = (e) => { if (e.data && e.data.cmd === 'hello') send({ cmd: 'doc', doc, pos: player.pos, step: player.step }); };
    chan.addEventListener('message', onReq);
  }
  if (opts.multi) openAudience();
  return player;
}

// Audience window: follows presenter commands
export function startAudience(docId) {
  const chan = new BroadcastChannel('lasteast-show-' + docId);
  let player = null;
  const wait = el('div', { class: 'aud-wait' }, t('Waiting for presenter…'), el('small', {}, t('Press F for full screen.')));
  document.body.append(wait);
  chan.onmessage = (e) => {
    const m = e.data; if (!m) return;
    if (m.cmd === 'doc') { wait.remove(); player = new Player(document.body, m.doc, { audience: true, start: m.doc.slides.length ? undefined : 0 }); player.go(m.pos, false); if (m.step >= 0) { player.step = m.step; player.stepT0 = -1e9; } return; }
    if (!player) return;
    if (m.cmd === 'next') player.next(); else if (m.cmd === 'prev') player.prev(); else if (m.cmd === 'goto') player.go(m.pos, true);
    else if (m.cmd === 'sync' && player.pos !== m.pos) player.go(m.pos, false);
    else if (m.cmd === 'blank') { player.blank = m.v; player.dirty = true; }
    else if (m.cmd === 'ann') { player.ann[m.i] = m.a; player.dirty = true; }
    else if (m.cmd === 'laser') { player.laser = { ...m.l, t: performance.now() }; player.dirty = true; }
    else if (m.cmd === 'end') window.close();
  };
  chan.postMessage({ cmd: 'hello' });
  window.addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') document.documentElement.requestFullscreen?.(); });
}
