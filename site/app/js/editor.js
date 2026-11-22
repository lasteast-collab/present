// Lasteast Present — editor workspace: stage canvas, selection & handles, slide panel, views, commands, keyboard
import { el, $, $$, clamp, deepClone, uid, debounce, readAsDataURL, readAsText, pickFile, downloadBlob, escapeHtml } from './util.js';
import { E, CMD, on, emit, commit, undo, redo, slide, selObjs, sel1, select, setCur, savePrefs, canUndo, canRedo } from './state.js';
export { CMD };
import { renderSlide, renderToCanvas, onAssetLoad, hitObj, objAABB, objCorners, layoutText, textTop, fontStr, tableGeom, mergeAt, preloadDoc, assetSrc } from './renderer.js';
import { makeSlide, makeText, makeShape, makeImage, makeTable, makeChart, makeMedia, addAsset, cloneSlide, cloneObject, layoutObjects, resolveColor, resolveFont, LAYOUTS, newDoc } from './model.js';
import { t, isRTL, setLang, getLang, onLang } from './i18n.js';
import { buildRibbon } from './ribbon.js';
import { buildPanel, refreshPanel } from './panels.js';
import * as D from './dialogs.js';
import { saveLocal, addVersion, saveToFile } from './io.js';
import { ICONS } from './icons.js';
import { Player, startPresenter } from './slideshow.js';
import { buildTimeline, computeOverrides } from './animations.js';
import { prepareTransition, playSound } from './transitions.js';
import { camera } from './camera.js';

let stage, sctx, overlay, octx, handles, wrap, slidesPanel, notesEl, statusEl, center, textEditor = null, previewRun = null;
const dpr = () => Math.min(2, window.devicePixelRatio || 1);
export const run = (name, ...a) => { const f = CMD[name]; if (!f) { console.warn('No command', name); return; } try { return f(...a); } catch (e) { console.error(e); D.toast(t('Error') + ': ' + e.message); } };

// ---------------------------------------------------------------- layout
export function mountEditor(root) {
  root.innerHTML = '';
  root.append(
    el('div', { class: 'titlebar' },
      el('div', { class: 'tb-logo', html: ICONS.logo, title: 'Lasteast Present', onclick: () => run('home') }),
      el('div', { class: 'tb-quick' },
        qbtn('save', t('Save') + ' (Ctrl+S)', () => run('save')), qbtn('undo', t('Undo') + ' (Ctrl+Z)', () => run('undo'), 'undo-btn'), qbtn('redo', t('Redo') + ' (Ctrl+Y)', () => run('redo'), 'redo-btn'), qbtn('preview', t('Start from Beginning') + ' (F5)', () => run('showStart'))),
      el('input', { class: 'tb-title', value: E.doc.title, spellcheck: false, 'aria-label': t('Presentation title'), onchange: (e) => commit('Rename', () => E.doc.title = e.target.value || t('Untitled presentation')) }),
      el('span', { class: 'tb-saved' }),
      el('div', { class: 'tb-spacer' }),
      langSelect(),
      el('button', { class: 'tb-btn', title: t('Light / dark theme'), html: E.prefs.uiTheme === 'dark' ? ICONS.sun : ICONS.moon, onclick: () => run('toggleUiTheme') }),
      el('button', { class: 'tb-btn ai', title: t('AI Assistant'), onclick: () => run('panel', 'ai') }, el('span', { class: 'ic', html: ICONS.ai }), el('span', {}, t('AI'))),
      el('button', { class: 'tb-btn', title: t('Home'), html: ICONS.home, onclick: () => run('home') })),
    el('div', { class: 'ribbon', id: 'ribbon' }),
    el('div', { class: 'workspace' },
      slidesPanel = el('div', { class: 'slides-panel', tabindex: 0 }),
      center = el('div', { class: 'center' },
        wrap = el('div', { class: 'stage-wrap' },
          el('canvas', { class: 'ruler-h' }), el('canvas', { class: 'ruler-v' }),
          el('div', { class: 'stage', id: 'stage' }, stage = el('canvas', { class: 'stage-canvas' }), overlay = el('canvas', { class: 'stage-overlay' }), handles = el('div', { class: 'handles' }))),
        notesEl = el('div', { class: 'notes-pane' + (E.prefs.notes ? '' : ' hidden') }, el('div', { class: 'notes-resize' }), el('textarea', { placeholder: t('Click to add notes'), dir: 'auto', spellcheck: E.prefs.spell, oninput: (e) => commit('Notes', () => slide().notes = e.target.value, { merge: true }) }))),
      el('div', { class: 'side-panel', id: 'side' })),
    statusEl = el('div', { class: 'statusbar' }));
  sctx = stage.getContext('2d'); octx = overlay.getContext('2d');
  buildRibbon($('#ribbon')); buildPanel($('#side'));
  bindStage(); bindNotesResize();
  new ResizeObserver(() => layoutStage()).observe(wrap);
  refreshAll();
}
const qbtn = (ic, title, fn, cls = '') => el('button', { class: 'tb-btn ' + cls, title, html: ICONS[ic], onclick: fn });
function langSelect() {
  const s = el('select', { class: 'tb-lang', title: t('Interface language'), onchange: (e) => setLang(e.target.value) }, ...[['en', 'English'], ['he', 'עברית'], ['ar', 'العربية']].map(([v, n]) => el('option', { value: v, selected: getLang() === v }, n)));
  return s;
}
onLang(() => { if (E.doc && $('#app') && !$('#app').hidden) { mountEditor($('#app')); } });

export function refreshAll() { renderSlidesPanel(); layoutStage(); refreshPanel(); updateStatus(); updateQuick(); renderNotes(); applyView(); }
on('change', () => { drawStage(); updateThumb(E.cur); refreshPanel(); updateStatus(); updateQuick(); if (E._structural) { E._structural = false; renderSlidesPanel(); } });
on('select', () => { drawStage(); refreshPanel(); emit('ribbonState'); });
on('slide', () => { stopPreview(); finishTextEdit(); renderSlidesPanel(false); layoutStage(); refreshPanel(); updateStatus(); renderNotes(); applyView(); });
on('toast', (m) => D.toast(t(m)));
onAssetLoad(debounce(() => { if (E.doc) { drawStage(); renderSlidesPanel(); } }, 60));
export const structural = () => { E._structural = true; };

function updateQuick() { const u = $('.undo-btn'), r = $('.redo-btn'); if (u) u.disabled = !canUndo(); if (r) r.disabled = !canRedo(); const ti = $('.tb-title'); if (ti && document.activeElement !== ti) ti.value = E.doc.title; const sv = $('.tb-saved'); if (sv) sv.textContent = E.readOnly ? t('Read-Only') : E.dirty ? '' : t('Saved'); }
function renderNotes() { const ta = $('.notes-pane textarea'); if (ta && document.activeElement !== ta) ta.value = slide()?.notes || ''; }
function bindNotesResize() {
  const h = $('.notes-resize'); let y0, h0;
  h.addEventListener('pointerdown', (e) => { y0 = e.clientY; h0 = notesEl.offsetHeight; h.setPointerCapture(e.pointerId); });
  h.addEventListener('pointermove', (e) => { if (y0 == null) return; notesEl.style.height = clamp(h0 - (e.clientY - y0), 50, 500) + 'px'; });
  h.addEventListener('pointerup', () => { y0 = null; });
}

// ---------------------------------------------------------------- status bar
export function updateStatus() {
  if (!statusEl) return;
  const n = E.doc.slides.length, langName = { en: 'English', he: 'עברית', ar: 'العربية' }[E.doc.lang || 'en'];
  statusEl.innerHTML = '';
  statusEl.append(
    el('span', {}, t('Slide {a} of {b}', { a: E.cur + 1, b: n })),
    el('button', { class: 'sb-link', title: t('Content language'), onclick: () => run('contentLanguage') }, langName),
    el('button', { class: 'sb-link', onclick: () => run('accessibility') }, '♿ ' + t('Accessibility')),
    el('span', { class: 'sb-spacer' }),
    el('button', { class: 'sb-link' + (E.prefs.notes ? ' on' : ''), onclick: () => run('toggleNotes') }, t('Notes')),
    el('button', { class: 'sb-link', onclick: () => run('panel', 'comments') }, t('Comments') + (slide()?.comments?.filter(c => !c.resolved).length ? ` (${slide().comments.filter(c => !c.resolved).length})` : '')),
    ...[['normal', 'normal', 'Normal'], ['sorter', 'sorter', 'Slide Sorter'], ['reading', 'reading', 'Reading View']].map(([v, ic, lab]) => el('button', { class: 'sb-ic' + (E.view === v ? ' on' : ''), title: t(lab), html: ICONS[ic], onclick: () => run('view', v) })),
    el('button', { class: 'sb-ic', title: t('Slide Show'), html: ICONS.preview, onclick: () => run('showCurrent') }),
    el('button', { class: 'sb-ic', title: t('Zoom out'), onclick: () => run('zoom', E.zoom / 1.15) }, '−'),
    el('input', { type: 'range', min: 10, max: 400, value: Math.round(E.zoom * 100), class: 'zoom-range', oninput: (e) => run('zoom', e.target.value / 100) }),
    el('button', { class: 'sb-ic', title: t('Zoom in'), onclick: () => run('zoom', E.zoom * 1.15) }, '+'),
    el('span', { class: 'zoom-val' }, Math.round(E.zoom * 100) + '%'),
    el('button', { class: 'sb-ic', title: t('Fit to Window'), html: ICONS.fit, onclick: () => run('fit') }));
}

// ---------------------------------------------------------------- slides panel
const thumbCache = new Map();
function slideHash(s, i) { const str = JSON.stringify(s) + E.doc.theme.id + JSON.stringify(E.doc.master) + i + E.doc.theme.accent; let h = 0; for (let k = 0; k < str.length; k += 7) h = (h * 31 + str.charCodeAt(k)) | 0; return h + ':' + str.length; }
export function renderSlidesPanel(full = true) {
  if (!slidesPanel || !E.doc) return;
  const tw = 180, th = Math.round(tw * E.doc.size.h / E.doc.size.w);
  if (full || slidesPanel.children.length !== E.doc.slides.length) {
    slidesPanel.innerHTML = '';
    E.doc.slides.forEach((s, i) => {
      const c = el('canvas', { width: tw * 2, height: th * 2 });
      const item = el('div', { class: 'thumb' + (i === E.cur ? ' cur' : '') + (s.hidden ? ' hidden-slide' : '') + (E.slideSel?.has(i) ? ' multi' : ''), draggable: true, 'data-i': i, tabindex: -1 },
        el('div', { class: 'num' }, String(i + 1), s.transition?.type && s.transition.type !== 'none' ? el('span', { class: 'tr-mark', title: t('Has transition') }, '★') : null, s.objects.some(o => o.anims?.length) ? el('span', { class: 'tr-mark', title: t('Has animations') }, '✱') : null),
        el('div', { class: 'thumb-img' }, c, s.hidden ? el('div', { class: 'hid' }, '⊘') : null));
      item.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) { E.slideSel = E.slideSel || new Set([E.cur]); E.slideSel.has(i) ? E.slideSel.delete(i) : E.slideSel.add(i); renderSlidesPanel(); return; }
        if (e.shiftKey) { E.slideSel = new Set(); const a = Math.min(E.cur, i), b = Math.max(E.cur, i); for (let k = a; k <= b; k++) E.slideSel.add(k); renderSlidesPanel(); return; }
        E.slideSel = null; setCur(i);
      });
      item.addEventListener('contextmenu', (e) => { e.preventDefault(); if (i !== E.cur) setCur(i); D.contextMenu(e, slideMenu()); });
      item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/lp-slide', String(i)); item.classList.add('dragging'); });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/lp-slide')) { e.preventDefault(); item.classList.add('drop'); } });
      item.addEventListener('dragleave', () => item.classList.remove('drop'));
      item.addEventListener('drop', (e) => { e.preventDefault(); item.classList.remove('drop'); const from = +e.dataTransfer.getData('text/lp-slide'); if (isNaN(from) || from === i) return; run('moveSlides', E.slideSel && E.slideSel.size > 1 ? [...E.slideSel] : [from], i); });
      slidesPanel.append(item);
    });
    slidesPanel.append(el('button', { class: 'add-slide', onclick: () => run('newSlide') }, '+ ' + t('New Slide')));
  } else {
    $$('.thumb', slidesPanel).forEach((n, i) => { n.classList.toggle('cur', i === E.cur); n.classList.toggle('multi', !!E.slideSel?.has(i)); });
  }
  const curEl = $$('.thumb', slidesPanel)[E.cur]; if (curEl) curEl.scrollIntoView({ block: 'nearest' });
  const thumbs = $$('.thumb canvas', slidesPanel);
  let k = 0; const step = () => { const t0 = performance.now(); while (k < thumbs.length && performance.now() - t0 < 12) updateThumb(k++, thumbs); if (k < thumbs.length) requestAnimationFrame(step); }; step();
}
export function updateThumb(i, list) {
  const c = (list || $$('.thumb canvas', slidesPanel))[i]; const s = E.doc.slides[i]; if (!c || !s) return;
  const h = slideHash(s, i); if (c._h === h) return; c._h = h;
  renderSlide(c.getContext('2d'), E.doc, s, { scale: c.width / E.doc.size.w, index: i, present: true });
}
export const thumbDataURL = () => { const c = renderToCanvas(E.doc, E.doc.slides[0], 320, { present: true, index: 0 }); return c.toDataURL('image/jpeg', .7); };
function slideMenu() {
  return [
    [t('New Slide'), () => run('newSlide')], [t('Duplicate Slide'), () => run('duplicateSlide')], [t('Delete Slide'), () => run('deleteSlide')], '-',
    [slide().hidden ? t('Unhide Slide') : t('Hide Slide'), () => run('hideSlide')], [t('Reset Slide'), () => run('resetSlide')], '-',
    [t('Copy'), () => run('copySlides')], [t('Paste'), () => run('paste')], '-', [t('Slide Show') + ' ' + t('from this slide'), () => run('showCurrent')]];
}

// ---------------------------------------------------------------- stage
export function layoutStage() {
  if (!wrap || !E.doc || E.view !== 'normal') return;
  const pad = 40, r = wrap.getBoundingClientRect();
  if (E.fit) E.zoom = clamp(Math.min((r.width - pad * 2) / E.doc.size.w, (r.height - pad * 2) / E.doc.size.h), .05, 4);
  const w = Math.round(E.doc.size.w * E.zoom), h = Math.round(E.doc.size.h * E.doc.size.h / E.doc.size.h * E.zoom);
  const st = $('#stage'); st.style.width = w + 'px'; st.style.height = h + 'px';
  for (const c of [stage, overlay]) { c.width = Math.round(w * dpr()); c.height = Math.round(h * dpr()); c.style.width = w + 'px'; c.style.height = h + 'px'; }
  st.style.margin = `${Math.max(pad, (r.height - h) / 2)}px ${Math.max(pad, (r.width - w) / 2)}px`;
  stage.style.filter = E.prefs.colorMode === 'gray' ? 'grayscale(1)' : E.prefs.colorMode === 'bw' ? 'grayscale(1) contrast(4)' : 'none';
  drawStage(); drawRulers(); updateStatus();
}
let drawQueued = false;
export function drawStage() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; drawStageNow(); }); }
function drawStageNow() {
  if (!E.doc || !sctx || E.view !== 'normal' || previewRun) return;
  const s = slide(); if (!s) return;
  const ov = new Map(); if (textEditor) ov.set(textEditor.id, { hideText: true });
  if (E.dragGhost) for (const [id, g] of E.dragGhost) ov.set(id, { ...(ov.get(id) || {}), ...g });
  renderSlide(sctx, E.doc, s, { scale: E.zoom * dpr(), editor: true, index: E.cur, overrides: ov });
  drawOverlay(); placeHandles();
}
function drawOverlay(guides = E.guides, marquee = E.marquee) {
  const z = E.zoom * dpr(); octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, overlay.width, overlay.height); octx.setTransform(z, 0, 0, z, 0, 0);
  const { w, h } = E.doc.size;
  if (E.prefs.grid) { octx.strokeStyle = 'rgba(128,128,128,.28)'; octx.lineWidth = 1 / z; const g = E.prefs.gridSize; octx.beginPath(); for (let x = g; x < w; x += g) { octx.moveTo(x, 0); octx.lineTo(x, h); } for (let y = g; y < h; y += g) { octx.moveTo(0, y); octx.lineTo(w, y); } octx.stroke(); }
  if (E.prefs.staticGuides) { octx.strokeStyle = 'rgba(242,106,27,.55)'; octx.setLineDash([6 / z, 4 / z]); octx.beginPath(); octx.moveTo(w / 2, 0); octx.lineTo(w / 2, h); octx.moveTo(0, h / 2); octx.lineTo(w, h / 2); octx.stroke(); octx.setLineDash([]); }
  // selection outlines for multi-select & group
  octx.lineWidth = 1.5 / z;
  for (const o of selObjs()) { const c = objCorners(o); octx.strokeStyle = o.locked ? '#999' : '#f26a1b'; octx.beginPath(); c.forEach(([x, y], i) => i ? octx.lineTo(x, y) : octx.moveTo(x, y)); octx.closePath(); octx.stroke(); }
  if (E.hover && !E.sel.includes(E.hover)) { const o = slide().objects.find(x => x.id === E.hover); if (o) { const c = objCorners(o); octx.strokeStyle = 'rgba(242,106,27,.5)'; octx.beginPath(); c.forEach(([x, y], i) => i ? octx.lineTo(x, y) : octx.moveTo(x, y)); octx.closePath(); octx.stroke(); } }
  if (guides) { octx.strokeStyle = '#ff2b8a'; octx.lineWidth = 1 / z; for (const g of guides) { octx.beginPath(); if (g.x != null) { octx.moveTo(g.x, g.a); octx.lineTo(g.x, g.b); } else { octx.moveTo(g.a, g.y); octx.lineTo(g.b, g.y); } octx.stroke(); } }
  if (marquee) { octx.fillStyle = 'rgba(242,106,27,.08)'; octx.strokeStyle = '#f26a1b'; octx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h); octx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h); }
  if (E.motionPath) { const { o, a } = E.motionPath; octx.strokeStyle = '#2bb673'; octx.setLineDash([5 / z, 4 / z]); octx.lineWidth = 2 / z; octx.beginPath(); const cx = o.x + o.w / 2, cy = o.y + o.h / 2; (a.path || [[0, 0]]).forEach(([x, y], i) => i ? octx.lineTo(cx + x, cy + y) : octx.moveTo(cx + x, cy + y)); octx.stroke(); octx.setLineDash([]); (a.path || []).forEach(([x, y]) => { octx.fillStyle = '#2bb673'; octx.beginPath(); octx.arc(cx + x, cy + y, 4 / z, 0, 7); octx.fill(); }); }
  // animation badges
  if (E.prefs.panel === 'animations') { const tl = buildTimeline(slide()); let n = 0; const seen = new Map(); tl.items.forEach(it => { if (it.para > 0) return; const k = it.o.id; const lab = it.step + 1; const lst = seen.get(k) || []; lst.push(lab); seen.set(k, lst); }); for (const [id, labs] of seen) { const o = slide().objects.find(x => x.id === id); if (!o) continue; octx.font = `${11 / E.zoom}px sans-serif`; const txt = [...new Set(labs)].join(','); const tw = octx.measureText(txt).width + 8 / E.zoom; octx.fillStyle = '#f26a1b'; octx.fillRect(o.x - tw, o.y, tw, 16 / E.zoom); octx.fillStyle = '#fff'; octx.textBaseline = 'middle'; octx.fillText(txt, o.x - tw + 4 / E.zoom, o.y + 8 / E.zoom); n++; } }
}
function placeHandles() {
  handles.innerHTML = '';
  const os = selObjs().filter(o => !o.locked); if (!os.length || textEditor || E.readOnly) return;
  const z = E.zoom;
  if (os.length === 1) {
    const o = os[0]; const box = el('div', { class: 'hbox', style: { left: o.x * z + 'px', top: o.y * z + 'px', width: o.w * z + 'px', height: o.h * z + 'px', transform: `rotate(${o.rot || 0}deg)` } });
    for (const hd of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) box.append(el('div', { class: 'hd hd-' + hd, 'data-h': hd }));
    if (o.shape !== 'line' && o.shape !== 'arrowLine' || true) box.append(el('div', { class: 'hd-rot', 'data-h': 'rot', title: t('Rotate') }));
    handles.append(box);
  } else {
    const bb = groupBBox(os); const box = el('div', { class: 'hbox multi', style: { left: bb.x * z + 'px', top: bb.y * z + 'px', width: bb.w * z + 'px', height: bb.h * z + 'px' } });
    for (const hd of ['nw', 'ne', 'se', 'sw']) box.append(el('div', { class: 'hd hd-' + hd, 'data-h': hd }));
    handles.append(box);
  }
}
export function groupBBox(os) { const bs = os.map(objAABB); const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y)); return { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y }; }
function drawRulers() {
  const rh = $('.ruler-h'), rv = $('.ruler-v'); if (!rh) return;
  rh.hidden = rv.hidden = !E.prefs.ruler; if (!E.prefs.ruler) return;
  const st = $('#stage').getBoundingClientRect(), wr = wrap.getBoundingClientRect(), d = dpr();
  rh.width = wr.width * d; rh.height = 18 * d; rv.width = 18 * d; rv.height = wr.height * d; rh.style.width = wr.width + 'px'; rv.style.height = wr.height + 'px';
  const col = getComputedStyle(document.body).getPropertyValue('--muted') || '#888';
  for (const [c, horiz] of [[rh, true], [rv, false]]) {
    const x = c.getContext('2d'); x.scale(d, d); x.fillStyle = getComputedStyle(document.body).getPropertyValue('--panel'); x.fillRect(0, 0, c.width, c.height); x.fillStyle = col; x.strokeStyle = col; x.font = '9px sans-serif'; x.lineWidth = 1;
    const origin = horiz ? st.left - wr.left + wrap.scrollLeft * 0 : st.top - wr.top; const step = E.zoom > 1.2 ? 20 : E.zoom > .6 ? 50 : 100;
    for (let v = 0; v <= (horiz ? E.doc.size.w : E.doc.size.h); v += step / 2) { const p = origin + v * E.zoom; const big = v % step === 0; x.beginPath(); if (horiz) { x.moveTo(p, 18); x.lineTo(p, big ? 8 : 13); } else { x.moveTo(18, p); x.lineTo(big ? 8 : 13, p); } x.stroke(); if (big && v) { if (horiz) x.fillText(v, p + 2, 9); else { x.save(); x.translate(9, p - 2); x.rotate(-Math.PI / 2); x.fillText(v, 0, 0); x.restore(); } } }
  }
}

// ---------------------------------------------------------------- stage interaction
function toSlide(e) { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / E.zoom, y: (e.clientY - r.top) / E.zoom }; }
export function hitTest(x, y, includeLocked = false) { const objs = slide().objects; for (let i = objs.length - 1; i >= 0; i--) { const o = objs[i]; if (o.hiddenEdit) continue; if ((!o.locked || includeLocked) && hitObj(o, x, y, 3 / E.zoom)) return o; } return null; }
const groupMates = (o) => o.group ? slide().objects.filter(x => x.group === o.group).map(x => x.id) : [o.id];
function bindStage() {
  const st = $('#stage');
  let drag = null;
  st.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || previewRun) return; finishTextEdit(); wrap.focus?.();
    const p = toSlide(e); const hd = e.target.dataset?.h;
    if (E.motionPath && E.motionPath.recording) { const { o, a } = E.motionPath; commit('Motion path', () => { a.path = a.path || [[0, 0]]; a.path.push([p.x - (o.x + o.w / 2), p.y - (o.y + o.h / 2)]); }); drawOverlay(); return; }
    if (E.insertMode) { drag = { kind: 'insert', x0: p.x, y0: p.y, p }; st.setPointerCapture(e.pointerId); return; }
    if (hd) { const os = selObjs(); drag = { kind: hd === 'rot' ? 'rot' : 'resize', hd, p0: p, orig: os.map(o => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot || 0, size: o.size })), bb: groupBBox(os) }; st.setPointerCapture(e.pointerId); return; }
    const o = hitTest(p.x, p.y);
    if (E.painter && o) { run('applyPainter', o); return; }
    if (E.animPainter && o) { run('applyAnimPainter', o); return; }
    if (o) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) { if (E.sel.includes(o.id)) select(E.sel.filter(id => !groupMates(o).includes(id))); else select(groupMates(o), true); }
      else if (!E.sel.includes(o.id)) select(groupMates(o));
      drag = { kind: 'move', p0: p, orig: selObjs().filter(q => !q.locked).map(q => ({ id: q.id, x: q.x, y: q.y })), moved: false };
    } else { if (!e.shiftKey) select([]); drag = { kind: 'marquee', p0: p }; }
    st.setPointerCapture(e.pointerId);
  });
  st.addEventListener('pointermove', (e) => {
    const p = toSlide(e);
    if (!drag) { const o = hitTest(p.x, p.y); const id = o?.id || null; if (id !== E.hover) { E.hover = id; drawOverlay(); } st.style.cursor = E.insertMode ? 'crosshair' : o ? (o.locked ? 'default' : 'move') : 'default'; return; }
    if (drag.kind === 'insert') { E.marquee = rectFrom(drag.p0, p); drawOverlay(); return; }
    if (drag.kind === 'marquee') { E.marquee = rectFrom(drag.p0, p); drawOverlay(); return; }
    if (drag.kind === 'move') {
      let dx = p.x - drag.p0.x, dy = p.y - drag.p0.y; if (!drag.moved && Math.hypot(dx, dy) * E.zoom < 3) return;
      if (!drag.moved) { drag.moved = true; drag.snap = JSON.stringify(E.doc.slides[E.cur]); }
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const ids = new Set(drag.orig.map(q => q.id));
      const os = drag.orig.map(q => ({ ...slide().objects.find(x => x.id === q.id), x: q.x + dx, y: q.y + dy }));
      const bb = groupBBox(os); const sn = e.altKey ? { dx: 0, dy: 0, guides: [] } : snapBox(bb, ids);
      E.guides = sn.guides;
      for (const q of drag.orig) { const o = slide().objects.find(x => x.id === q.id); o.x = q.x + dx + sn.dx; o.y = q.y + dy + sn.dy; }
      drawStage(); return;
    }
    if (drag.kind === 'rot') {
      const o = slide().objects.find(x => x.id === drag.orig[0].id); const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90; if (e.shiftKey) a = Math.round(a / 15) * 15; else { for (const s of [0, 90, 180, 270, 360]) if (Math.abs(((a % 360) + 360) % 360 - s) < 3) a = s; }
      drag.changed = true; o.rot = ((a % 360) + 360) % 360; if (o.rot > 180) o.rot -= 360; drawStage(); return;
    }
    if (drag.kind === 'resize') { drag.changed = true; doResize(drag, p, e); drawStage(); }
  });
  st.addEventListener('pointerup', (e) => {
    const p = toSlide(e); const d = drag; drag = null; E.guides = null;
    if (!d) return;
    if (d.kind === 'insert') { const r = E.marquee || { x: p.x, y: p.y, w: 0, h: 0 }; E.marquee = null; const mode = E.insertMode; E.insertMode = null; run('insertAt', mode, r.w < 5 ? { x: r.x - 100, y: r.y - 60, w: 200, h: 120 } : r); return; }
    if (d.kind === 'marquee') { const m = E.marquee; E.marquee = null; if (m && m.w > 2) { const ids = slide().objects.filter(o => { const b = objAABB(o); return !o.locked && b.x >= m.x && b.y >= m.y && b.x + b.w <= m.x + m.w && b.y + b.h <= m.y + m.h; }).map(o => o.id); select(ids, e.shiftKey); } drawOverlay(); return; }
    if (d.kind === 'move' && d.moved) { const after = JSON.stringify(E.doc.slides[E.cur]); E.doc.slides[E.cur] = JSON.parse(d.snap); commit('Move', () => { E.doc.slides[E.cur] = JSON.parse(after); }); return; }
    if ((d.kind === 'resize' || d.kind === 'rot') && d.changed) { const vals = d.orig.map(q => { const o = slide().objects.find(x => x.id === q.id); return { id: q.id, x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot, size: o.size }; }); d.orig.forEach(q => Object.assign(slide().objects.find(x => x.id === q.id), q)); commit(d.kind === 'rot' ? 'Rotate' : 'Resize', () => vals.forEach(v => Object.assign(slide().objects.find(x => x.id === v.id), v))); return; }
    drawStage();
  });
  st.addEventListener('dblclick', (e) => {
    const p = toSlide(e); const o = hitTest(p.x, p.y); if (!o || E.readOnly) return;
    if (o.type === 'text' || o.type === 'shape') startTextEdit(o);
    else if (o.type === 'table') startCellEdit(o, p);
    else if (o.type === 'chart') D.chartData(o);
    else if (o.type === 'image') { run('panel', 'format'); }
  });
  st.addEventListener('contextmenu', (e) => { e.preventDefault(); const p = toSlide(e); const o = hitTest(p.x, p.y, true); if (o && !E.sel.includes(o.id)) select(groupMates(o)); D.contextMenu(e, objMenu(!!o)); });
  // drag & drop files
  wrap.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); wrap.classList.add('dropping'); } });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('dropping'));
  wrap.addEventListener('drop', async (e) => { e.preventDefault(); wrap.classList.remove('dropping'); const p = toSlide(e); for (const f of e.dataTransfer.files) await run('insertFile', f, p); });
  wrap.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); run('zoom', E.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });
}
const rectFrom = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
function snapBox(bb, ignore) {
  if (!E.prefs.snap && !E.prefs.guides) return { dx: 0, dy: 0, guides: [] };
  const th = 6 / E.zoom, { w, h } = E.doc.size;
  const xs = [[0, null], [w / 2, null], [w, null]], ys = [[0, null], [h / 2, null], [h, null]];
  if (E.prefs.guides) for (const o of slide().objects) { if (ignore.has(o.id)) continue; const b = objAABB(o); xs.push([b.x, b], [b.x + b.w / 2, b], [b.x + b.w], [b.x + b.w, b]); ys.push([b.y, b], [b.y + b.h / 2, b], [b.y + b.h, b]); }
  let best = { dx: 0, dy: 0, gx: null, gy: null }, bdx = th, bdy = th;
  for (const ax of [bb.x, bb.x + bb.w / 2, bb.x + bb.w]) for (const [x, b] of xs) { if (x == null) continue; const d = x - ax; if (Math.abs(d) < bdx) { bdx = Math.abs(d); best.dx = d; best.gx = { x, a: Math.min(bb.y, b ? b.y : 0), b: Math.max(bb.y + bb.h, b ? b.y + b.h : h) }; } }
  for (const ay of [bb.y, bb.y + bb.h / 2, bb.y + bb.h]) for (const [y, b] of ys) { const d = y - ay; if (Math.abs(d) < bdy) { bdy = Math.abs(d); best.dy = d; best.gy = { y, a: Math.min(bb.x, b ? b.x : 0), b: Math.max(bb.x + bb.w, b ? b.x + b.w : w) }; } }
  if (!best.gx && E.prefs.grid && E.prefs.snap) best.dx = Math.round(bb.x / E.prefs.gridSize) * E.prefs.gridSize - bb.x;
  if (!best.gy && E.prefs.grid && E.prefs.snap) best.dy = Math.round(bb.y / E.prefs.gridSize) * E.prefs.gridSize - bb.y;
  return { dx: best.dx, dy: best.dy, guides: [best.gx, best.gy].filter(Boolean) };
}
function doResize(d, p, e) {
  const hd = d.hd;
  if (d.orig.length > 1) {
    const bb = d.bb; let nx = bb.x, ny = bb.y, nw = bb.w, nh = bb.h;
    if (hd.includes('e')) nw = Math.max(10, p.x - bb.x); if (hd.includes('s')) nh = Math.max(10, p.y - bb.y);
    if (hd.includes('w')) { nw = Math.max(10, bb.x + bb.w - p.x); nx = bb.x + bb.w - nw; } if (hd.includes('n')) { nh = Math.max(10, bb.y + bb.h - p.y); ny = bb.y + bb.h - nh; }
    if (!e.shiftKey) { const k = Math.max(nw / bb.w, nh / bb.h); nw = bb.w * k; nh = bb.h * k; if (hd.includes('w')) nx = bb.x + bb.w - nw; if (hd.includes('n')) ny = bb.y + bb.h - nh; }
    const sx = nw / bb.w, sy = nh / bb.h;
    for (const q of d.orig) { const o = slide().objects.find(x => x.id === q.id); o.x = nx + (q.x - bb.x) * sx; o.y = ny + (q.y - bb.y) * sy; o.w = q.w * sx; o.h = q.h * sy; if (q.size && (o.type === 'text' || o.type === 'shape')) o.size = q.size * Math.min(sx, sy); }
    return;
  }
  const q = d.orig[0], o = slide().objects.find(x => x.id === q.id), a = (q.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  // local delta
  const dxs = p.x - d.p0.x, dys = p.y - d.p0.y; const lx = dxs * c + dys * s, ly = -dxs * s + dys * c;
  let w = q.w, h = q.h, ox = 0, oy = 0;
  if (hd.includes('e')) w = q.w + lx; if (hd.includes('w')) { w = q.w - lx; ox = lx; } if (hd.includes('s')) h = q.h + ly; if (hd.includes('n')) { h = q.h - ly; oy = ly; }
  const keep = (o.type === 'image' || o.type === 'video') ? !e.shiftKey : e.shiftKey;
  if (keep && hd.length === 2) { const k = Math.max(w / q.w, h / q.h); const nw = q.w * k, nh = q.h * k; if (hd.includes('w')) ox = q.w - nw; if (hd.includes('n')) oy = q.h - nh; w = nw; h = nh; }
  const minS = o.shape === 'line' || o.shape === 'arrowLine' ? 1 : 8; if (w < minS) { if (hd.includes('w')) ox -= minS - w; w = minS; } if (h < minS) { if (hd.includes('n')) oy -= minS - h; h = minS; }
  if (e.altKey) { ox = (q.w - w) / 2; oy = (q.h - h) / 2; }
  // keep opposite corner fixed in world space
  const cxl = ox + w / 2 - q.w / 2, cyl = oy + h / 2 - q.h / 2; const ncx = q.x + q.w / 2 + cxl * c - cyl * s, ncy = q.y + q.h / 2 + cxl * s + cyl * c;
  o.w = w; o.h = h; o.x = ncx - w / 2; o.y = ncy - h / 2;
  if (E.prefs.grid && E.prefs.snap && !q.rot && !e.altKey) { const g = E.prefs.gridSize; if (hd.includes('e')) o.w = Math.round((o.x + o.w) / g) * g - o.x; if (hd.includes('s')) o.h = Math.round((o.y + o.h) / g) * g - o.y; }
}
function objMenu(hasObj) {
  if (!hasObj) return [[t('Paste'), () => run('paste')], [t('Select All'), () => run('selectAll')], '-', [t('Format Background'), () => { select([]); run('panel', 'format'); }], [t('Layout'), () => D.layoutPicker()], [t('New Slide'), () => run('newSlide')]];
  const o = sel1();
  return [[t('Cut'), () => run('cut')], [t('Copy'), () => run('copy')], [t('Paste'), () => run('paste')], [t('Duplicate'), () => run('duplicate')], [t('Delete'), () => run('delete')], '-',
    [t('Edit Text'), () => o && (o.type === 'text' || o.type === 'shape') && startTextEdit(o)],
    [t('Group'), () => run('group')], [t('Ungroup'), () => run('ungroup')], '-',
    [t('Bring to Front'), () => run('order', 'front')], [t('Bring Forward'), () => run('order', 'forward')], [t('Send Backward'), () => run('order', 'backward')], [t('Send to Back'), () => run('order', 'back')], '-',
    [t('Hyperlink…'), () => D.hyperlink()], [o?.locked ? t('Unlock') : t('Lock'), () => run('lock')], [t('Edit Alt Text…'), () => D.altText()], [t('Save as Picture…'), () => run('saveAsPicture')], '-',
    [t('Format…'), () => run('panel', 'format')], [t('Animations…'), () => run('panel', 'animations')], [t('Morph matching…'), () => run('panel', 'transitions')]];
}

// ---------------------------------------------------------------- text editing
export function startTextEdit(o) {
  if (E.readOnly) return; finishTextEdit(); select([o.id]);
  const z = E.zoom, th = E.doc.theme;
  const ta = el('textarea', { class: 'text-editor', spellcheck: E.prefs.spell, dir: o.dir === 'auto' || !o.dir ? 'auto' : o.dir });
  ta.value = o.text || '';
  const lay = () => { const c = document.createElement('canvas').getContext('2d'); const L = layoutText(c, o, th, o.w, o.h, isRTL() ? 'rtl' : 'ltr'); return { top: textTop({ ...o, text: ta.value }, L, o.h), size: L.size }; };
  const style = () => { const L = lay(); Object.assign(ta.style, { left: o.x * z + 'px', top: o.y * z + 'px', width: o.w * z + 'px', height: o.h * z + 'px', transform: `rotate(${o.rot || 0}deg)`, font: fontStr(o, th, L.size * z), lineHeight: (o.lineHeight || 1.2), color: resolveColor(o.color || '@text', th), textAlign: o.align === 'start' ? 'start' : o.align, padding: `${Math.max(0, L.top * z)}px ${(o.pad ?? 10) * z}px 0 ${(o.pad ?? 10) * z + (o.bullets !== 'none' ? L.size * 1.15 * z : 0)}px`, letterSpacing: (o.letterSpacing || 0) * z + 'px', textDecoration: [o.underline ? 'underline' : '', o.strike ? 'line-through' : ''].join(' ') }); };
  style(); handles.innerHTML = ''; $('#stage').append(ta);
  textEditor = { id: o.id, ta, orig: o.text }; drawStageNow();
  ta.addEventListener('input', () => { o.text = ta.value; style(); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); finishTextEdit(); } e.stopPropagation(); if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); run('toggleFmt', { b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]); style(); } if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); finishTextEdit(); run('save'); } });
  ta.addEventListener('blur', () => setTimeout(() => { if (textEditor && textEditor.ta === ta && document.activeElement !== ta && !document.activeElement?.closest('.ribbon,.side-panel,.dialog')) finishTextEdit(); }, 120));
  setTimeout(() => { ta.focus(); ta.select(); }, 0);
  textEditor.restyle = style;
}
export function restyleEditor() { textEditor?.restyle?.(); }
export function finishTextEdit() {
  if (!textEditor) return; const { id, ta, orig, cell } = textEditor; textEditor = null; ta.remove();
  const o = slide()?.objects.find(x => x.id === id);
  if (o) { if (cell) { const v = ta.value; const [r, c] = cell; o.cells[r][c].text = textEditor?.orig ?? o.cells[r][c].text; o.cells[r][c].text = cell.orig; commit('Edit cell', () => { o.cells[r][c].text = v; }); } else { const v = o.text; o.text = orig; if (v !== orig) commit('Edit text', () => { o.text = v; }); } }
  drawStage();
}
export const editingText = () => textEditor;
function startCellEdit(o, p) {
  finishTextEdit(); select([o.id]);
  const g = tableGeom(o); let r = 0, c = 0; for (let i = 0; i < g.R; i++) if (p.y >= o.y + g.ys[i]) r = i; for (let j = 0; j < g.C; j++) if (p.x >= o.x + g.xs[j]) c = j;
  const m = mergeAt(o, r, c); if (m) { r = m.r; c = m.c; }
  const rs = m ? m.rs : 1, cs = m ? m.cs : 1, z = E.zoom;
  const ta = el('textarea', { class: 'text-editor cell', dir: 'auto', spellcheck: E.prefs.spell });
  ta.value = o.cells[r][c].text; const cell = [r, c]; cell.orig = ta.value;
  Object.assign(ta.style, { left: (o.x + g.xs[c]) * z + 'px', top: (o.y + g.ys[r]) * z + 'px', width: (g.xs[c + cs] - g.xs[c]) * z + 'px', height: (g.ys[r + rs] - g.ys[r]) * z + 'px', font: `${o.size * z}px ${resolveFont(o.font, E.doc.theme)}`, padding: 8 * z + 'px', color: resolveColor(o.header && r === 0 ? o.headColor : o.color, E.doc.theme), background: resolveColor(o.header && r === 0 ? o.headFill : '@bg', E.doc.theme) });
  $('#stage').append(ta); textEditor = { id: o.id, ta, cell };
  ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); finishTextEdit(); } if (e.key === 'Tab') { e.preventDefault(); finishTextEdit(); const nc = c + cs < g.C ? c + cs : 0, nr = c + cs < g.C ? r : r + 1; if (nr < g.R) startCellEdit(o, { x: o.x + g.xs[nc] + 2, y: o.y + g.ys[nr] + 2 }); } });
  ta.addEventListener('blur', () => setTimeout(() => { if (textEditor?.ta === ta) finishTextEdit(); }, 100));
  setTimeout(() => ta.focus(), 0);
}

// ---------------------------------------------------------------- views
export function applyView() {
  if (!center) return;
  $$('.view-alt', center).forEach(n => { if (n._player) n._player.end(); n.remove(); });
  const showStage = E.view === 'normal';
  wrap.hidden = !showStage; notesEl.hidden = !(showStage && E.prefs.notes);
  slidesPanel.hidden = E.view === 'sorter' || E.view === 'reading';
  if (E.view === 'sorter') center.append(D.sorterView());
  if (E.view === 'notes') center.append(D.notesPageView());
  if (E.view === 'reading') { const host = el('div', { class: 'view-alt reading' }); center.append(host); host._player = new Player(host, E.doc, { start: E.cur, onEnd: () => { E.view = 'normal'; applyView(); } }); }
  if (showStage) layoutStage();
}

// ---------------------------------------------------------------- previews on stage (transition & animations)
export function stopPreview() { if (previewRun) { cancelAnimationFrame(previewRun.raf); previewRun = null; drawStage(); } }
export async function previewTransition(i = E.cur, tr) {
  stopPreview(); finishTextEdit(); await preloadDoc(E.doc);
  const s = E.doc.slides[i]; tr = tr || s.transition; if (!tr || tr.type === 'none') return;
  const prevI = i > 0 ? i - 1 : null; const w = stage.width;
  const toC = renderToCanvas(E.doc, s, w, { present: true, index: i, overrides: computeOverrides(s, buildTimeline(s), buildTimeline(s).autoFirst ? 0 : -1, 0, E.doc.size) });
  const fromSlide = prevI != null ? E.doc.slides[prevI] : { ...s, objects: [], bg: { type: 'solid', color: '#000000' } };
  const fromC = prevI != null ? renderToCanvas(E.doc, fromSlide, w, { present: true, index: prevI }) : (() => { const c = document.createElement('canvas'); c.width = w; c.height = toC.height; c.getContext('2d').fillRect(0, 0, w, c.height); return c; })();
  const prep = prepareTransition({ doc: E.doc, from: { slide: fromSlide, canvas: fromC }, to: { slide: s, canvas: toC }, transition: tr, fromIndex: prevI ?? 0, toIndex: i, perf: E.prefs.perf });
  if (tr.sound) playSound(tr.sound, tr.duration);
  const t0 = performance.now() + (tr.delay || 0) * 1000, dur = (tr.duration || .8) * 1000 * (E.previewSpeed || 1);
  previewRun = { raf: 0 };
  const sc = w / E.doc.size.w;
  const frame = (now) => { if (!previewRun) return; const p = clamp((now - t0) / dur, 0, 1); sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.fillStyle = '#000'; sctx.fillRect(0, 0, stage.width, stage.height); prep.draw(sctx, p, sc, 0, 0); if (p < 1) previewRun.raf = requestAnimationFrame(frame); else { previewRun = null; setTimeout(() => previewAnimations(i, true), 60); } };
  previewRun.raf = requestAnimationFrame(frame);
}
export function previewAnimations(i = E.cur, quietIfNone = false) {
  const s = E.doc.slides[i]; const tl = buildTimeline(s); if (!tl.items.length) { drawStage(); return; }
  stopPreview(); previewRun = { raf: 0 };
  let step = 0, t0 = performance.now() / 1000;
  const frame = () => {
    if (!previewRun) return; const now = performance.now() / 1000; let tt = now - t0;
    if (tt > (tl.stepDur[step] || 0) + .25) { if (step < tl.steps - 1) { step++; t0 = now; tt = 0; } else { previewRun = null; drawStage(); return; } }
    renderSlide(sctx, E.doc, s, { scale: E.zoom * dpr(), present: true, index: i, overrides: computeOverrides(s, tl, step, tt, E.doc.size) });
    previewRun.raf = requestAnimationFrame(frame);
  };
  previewRun.raf = requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- commands
const objs = () => slide().objects;
const center0 = (w, h) => ({ x: (E.doc.size.w - w) / 2, y: (E.doc.size.h - h) / 2, w, h });
export function insertObjects(list, label = 'Insert') { structural(); commit(label, () => { objs().push(...list); }); select(list.map(o => o.id)); }

Object.assign(CMD, {
  undo: () => { finishTextEdit(); undo(); renderSlidesPanel(); }, redo: () => { finishTextEdit(); redo(); renderSlidesPanel(); },
  home: () => emit('goHome'),
  save: async () => { finishTextEdit(); const n = await saveToFile(E.doc, { password: E.doc._passwordValue }); if (n) { E.dirty = false; await saveLocal(E.doc, thumbDataURL()); await addVersion(E.doc, t('Saved')); D.toast(t('Saved') + ': ' + n); updateQuick(); } },
  saveAs: async () => { finishTextEdit(); const n = await saveToFile(E.doc, { saveAs: true, password: E.doc._passwordValue }); if (n) { E.dirty = false; await saveLocal(E.doc, thumbDataURL()); D.toast(t('Saved') + ': ' + n); } },
  toggleUiTheme: () => { E.prefs.uiTheme = E.prefs.uiTheme === 'dark' ? 'light' : 'dark'; savePrefs(); document.body.dataset.theme = E.prefs.uiTheme; mountEditor($('#app')); },
  panel: (name) => { E.prefs.panel = name; savePrefs(); $('#side')?.classList.remove('collapsed'); refreshPanel(true); drawOverlay(); },
  toggleNotes: () => { E.prefs.notes = !E.prefs.notes; savePrefs(); applyView(); updateStatus(); },
  view: (v) => { if (v === 'master') return D.slideMaster(); if (v === 'handout') return D.printDialog('handouts'); E.view = v; finishTextEdit(); applyView(); updateStatus(); emit('ribbonState'); },
  zoom: (z) => { E.fit = false; E.zoom = clamp(z, .1, 4); layoutStage(); }, fit: () => { E.fit = true; layoutStage(); },
  pref: (k, v) => { E.prefs[k] = v ?? !E.prefs[k]; savePrefs(); layoutStage(); emit('ribbonState'); },
  // slides
  newSlide: (layout) => { finishTextEdit(); const cl = (E.doc.customLayouts || []).find(c => c.id === layout); const s = cl ? { ...makeSlide(E.doc, 'blank', cl.objects.map(o => ({ ...cloneObject(o), text: o.ph ? '' : o.text }))), layout: cl.id } : makeSlide(E.doc, layout || (E.cur === 0 && slide()?.layout === 'title' ? 'titleContent' : slide()?.layout === 'title' ? 'titleContent' : slide()?.layout || 'titleContent')); structural(); commit('New slide', () => E.doc.slides.splice(E.cur + 1, 0, s)); setCur(E.cur + 1); renderSlidesPanel(); },
  duplicateSlide: () => { const idx = E.slideSel?.size ? [...E.slideSel].sort((a, b) => a - b) : [E.cur]; structural(); commit('Duplicate slide', () => { const copies = idx.map(i => cloneSlide(E.doc.slides[i])); E.doc.slides.splice(idx.at(-1) + 1, 0, ...copies); }); E.slideSel = null; setCur(idx.at(-1) + 1); renderSlidesPanel(); },
  deleteSlide: () => { const idx = E.slideSel?.size ? [...E.slideSel].sort((a, b) => b - a) : [E.cur]; if (E.doc.slides.length - idx.length < 1) { D.toast(t('A presentation needs at least one slide.')); return; } structural(); commit('Delete slide', () => idx.forEach(i => E.doc.slides.splice(i, 1))); E.slideSel = null; setCur(Math.min(E.cur, E.doc.slides.length - 1)); renderSlidesPanel(); },
  hideSlide: () => { const idx = E.slideSel?.size ? [...E.slideSel] : [E.cur]; const v = !E.doc.slides[idx[0]].hidden; structural(); commit('Hide slide', () => idx.forEach(i => E.doc.slides[i].hidden = v)); renderSlidesPanel(); },
  moveSlides: (from, to) => { from = from.sort((a, b) => a - b); structural(); commit('Move slides', () => { const moving = from.map(i => E.doc.slides[i]); const rest = E.doc.slides.filter((s, i) => !from.includes(i)); const ins = Math.min(rest.length, to - from.filter(i => i < to).length + (from[0] < to ? 1 : 0)); rest.splice(ins, 0, ...moving); E.doc.slides = rest; E.cur = ins; }); E.slideSel = null; renderSlidesPanel(); emit('slide'); },
  layout: (l) => { structural(); commit('Layout', () => { const s = slide(); const old = s.objects.filter(o => o.ph); const neu = (E.doc.customLayouts || []).find(c => c.id === l) ? E.doc.customLayouts.find(c => c.id === l).objects.map(cloneObject) : layoutObjects(l, E.doc); for (const n of neu) { const m = old.find(o => o.ph === n.ph) || (n.ph === 'body2' ? null : old.find(o => o.ph && o.ph.startsWith(n.ph.replace(/\d$/, '')))); if (m && m.text) n.text = m.text; n.mid = m?.mid || n.mid; } s.objects = [...s.objects.filter(o => !o.ph), ...neu]; s.layout = l; }); drawStage(); },
  resetSlide: () => { commit('Reset slide', () => { const s = slide(); const neu = layoutObjects(s.layout || 'titleContent', E.doc); for (const o of s.objects) if (o.ph) { const n = neu.find(q => q.ph === o.ph); if (n) Object.assign(o, { x: n.x, y: n.y, w: n.w, h: n.h, rot: 0, size: n.size, font: n.font, color: n.color, bold: n.bold, italic: false, underline: false, align: n.align, valign: n.valign, fill: n.fill, opacity: 1 }); } s.bg = null; }); },
  copySlides: () => { const idx = E.slideSel?.size ? [...E.slideSel] : [E.cur]; E.clipboard = { kind: 'slides', data: idx.map(i => deepClone(E.doc.slides[i])), assets: E.doc.assets }; D.toast(t('Copied')); },
  // objects
  selectAll: () => select(objs().filter(o => !o.locked).map(o => o.id)),
  delete: () => { if (!E.sel.length) return; structural(); commit('Delete', () => { slide().objects = objs().filter(o => !E.sel.includes(o.id) || o.locked); }); select([]); },
  copy: () => { const os = selObjs(); if (!os.length) return run('copySlides'); E.clipboard = { kind: 'objects', data: deepClone(os), assets: E.doc.assets }; try { navigator.clipboard.writeText(os.map(o => o.text || '').filter(Boolean).join('\n')); } catch (e) { } },
  cut: () => { run('copy'); run('delete'); },
  paste: () => {
    const c = E.clipboard; if (!c) return;
    for (const [k, v] of Object.entries(c.assets || {})) if (!E.doc.assets[k]) E.doc.assets[k] = v;
    if (c.kind === 'slides') { structural(); commit('Paste slides', () => E.doc.slides.splice(E.cur + 1, 0, ...c.data.map(cloneSlide))); setCur(E.cur + 1); renderSlidesPanel(); return; }
    const gm = {}; const list = c.data.map(o => { const n = cloneObject(o); n.x += 20; n.y += 20; if (n.group) n.group = gm[n.group] || (gm[n.group] = uid('g')); return n; });
    c.data = c.data.map(o => ({ ...o, x: o.x + 20, y: o.y + 20 }));
    insertObjects(list, 'Paste');
  },
  duplicate: () => { const os = selObjs(); if (!os.length) return run('duplicateSlide'); const gm = {}; insertObjects(os.map(o => { const n = cloneObject(o); n.x += 24; n.y += 24; if (n.group) n.group = gm[n.group] || (gm[n.group] = uid('g')); return n; }), 'Duplicate'); },
  nudge: (dx, dy) => { if (!E.sel.length) return; commit('Nudge', () => selObjs().forEach(o => { if (!o.locked) { o.x += dx; o.y += dy; } }), { merge: true }); },
  set: (props, label = 'Format') => { const os = selObjs(); if (!os.length) return; commit(label, () => os.forEach(o => Object.assign(o, typeof props === 'function' ? props(o) : props)), { merge: true }); restyleEditor(); },
  toggleFmt: (k) => { const os = selObjs().filter(o => 'text' in o); if (!os.length) return; const v = !os[0][k]; commit('Format', () => os.forEach(o => o[k] = v)); restyleEditor(); },
  fontSize: (d) => { commit('Font size', () => selObjs().forEach(o => { if (o.size) o.size = Math.max(4, Math.round(d === '+' ? o.size * 1.15 + 1 : d === '-' ? o.size / 1.15 - 1 : +d)); }), { merge: true }); restyleEditor(); },
  clearFormatting: () => run('set', { bold: false, italic: false, underline: false, strike: false, color: '@text', highlight: null, textOutline: null, textGradient: null, textShadow: null, letterSpacing: 0, font: '@body' }),
  order: (how) => { if (!E.sel.length) return; commit('Arrange', () => { const s = slide(); const sel = s.objects.filter(o => E.sel.includes(o.id)), rest = s.objects.filter(o => !E.sel.includes(o.id)); if (how === 'front') s.objects = [...rest, ...sel]; else if (how === 'back') s.objects = [...sel, ...rest]; else { const arr = s.objects; const idxs = sel.map(o => arr.indexOf(o)); if (how === 'forward') for (const i of idxs.sort((a, b) => b - a)) { if (i < arr.length - 1 && !E.sel.includes(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; } else for (const i of idxs.sort((a, b) => a - b)) { if (i > 0 && !E.sel.includes(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]; } } }); },
  align: (how) => { const os = selObjs(); if (!os.length) return; const bb = os.length > 1 ? groupBBox(os) : { x: 0, y: 0, w: E.doc.size.w, h: E.doc.size.h }; commit('Align', () => os.forEach(o => { const b = objAABB(o); if (how === 'left') o.x += bb.x - b.x; if (how === 'right') o.x += bb.x + bb.w - b.x - b.w; if (how === 'center') o.x += bb.x + bb.w / 2 - b.x - b.w / 2; if (how === 'top') o.y += bb.y - b.y; if (how === 'bottom') o.y += bb.y + bb.h - b.y - b.h; if (how === 'middle') o.y += bb.y + bb.h / 2 - b.y - b.h / 2; })); },
  distribute: (axis) => { const os = selObjs(); if (os.length < 3) { D.toast(t('Select at least three objects to distribute.')); return; } commit('Distribute', () => { const k = axis === 'h' ? 'x' : 'y', s = axis === 'h' ? 'w' : 'h'; const sorted = os.slice().sort((a, b) => a[k] - b[k]); const first = sorted[0], last = sorted.at(-1); const total = sorted.reduce((a, o) => a + o[s], 0); const gap = (last[k] + last[s] - first[k] - total) / (sorted.length - 1); let p = first[k]; for (const o of sorted) { o[k] = p; p += o[s] + gap; } }); },
  group: () => { if (E.sel.length < 2) return; const g = uid('g'); commit('Group', () => selObjs().forEach(o => o.group = g)); drawStage(); },
  ungroup: () => { commit('Ungroup', () => selObjs().forEach(o => o.group = null)); },
  lock: () => { const v = !sel1()?.locked; commit(v ? 'Lock' : 'Unlock', () => selObjs().forEach(o => o.locked = v)); },
  formatPainter: () => { const o = sel1(); if (!o) { D.toast(t('Select an object to copy its formatting.')); return; } const keys = ['fill', 'stroke', 'strokeW', 'dash', 'radius', 'font', 'size', 'color', 'bold', 'italic', 'underline', 'strike', 'align', 'valign', 'lineHeight', 'paraSpace', 'bullets', 'letterSpacing', 'shadow', 'glow', 'textOutline', 'textGradient', 'textShadow', 'highlight', 'opacity', 'filters', 'reflection']; E.painter = Object.fromEntries(keys.filter(k => k in o).map(k => [k, deepClone(o[k])])); D.toast(t('Click an object to apply the formatting.')); emit('ribbonState'); },
  applyPainter: (o) => { const p = E.painter; E.painter = null; commit('Format Painter', () => { for (const [k, v] of Object.entries(p)) if (k in o || k === 'shadow' || k === 'glow') o[k] = deepClone(v); }); select([o.id]); emit('ribbonState'); },
  animPainter: () => { const o = sel1(); if (!o?.anims?.length) { D.toast(t('Select an animated object first.')); return; } E.animPainter = deepClone(o.anims); D.toast(t('Click an object to apply the animations.')); },
  applyAnimPainter: (o) => { const a = E.animPainter; E.animPainter = null; commit('Animation Painter', () => { const mx = Math.max(0, ...slide().objects.flatMap(x => (x.anims || []).map(q => q.order || 0))); o.anims = a.map((q, i) => ({ ...q, id: uid('an'), order: mx + 1 + i })); }); select([o.id]); },
  insertMode: (mode) => { E.insertMode = mode; D.toast(t('Click and drag on the slide to draw.')); },
  insertAt: (mode, r) => {
    let o;
    if (mode === 'text') o = makeText({ ...r, h: Math.max(r.h, 50), text: '', placeholder: t('Type here') });
    else if (mode.startsWith('shape:')) { const sh = mode.slice(6); o = makeShape(sh, { ...r, text: '' }); if (sh === 'line' || sh === 'arrowLine') { o.h = Math.max(16, 0); o.y = r.y + r.h / 2 - 8; o.h = 16; o.w = Math.max(r.w, 40); o.stroke = '@text'; o.strokeW = 3; o.rot = r.h > 4 ? Math.atan2(r.h, r.w) * 180 / Math.PI : 0; if (o.rot) { const len = Math.hypot(r.w, r.h); o.x = r.x + r.w / 2 - len / 2; o.w = len; } } }
    if (o) { insertObjects([o]); if (mode === 'text') setTimeout(() => startTextEdit(o), 30); }
  },
  textBox: () => { const o = makeText({ ...center0(500, 80), text: t('Your text here') }); insertObjects([o]); setTimeout(() => startTextEdit(o), 30); },
  shape: (sh) => { const o = makeShape(sh, center0(sh === 'line' || sh === 'arrowLine' ? 300 : 240, sh === 'line' || sh === 'arrowLine' ? 16 : 180)); if (sh === 'line' || sh === 'arrowLine') { o.stroke = '@text'; o.strokeW = 3; } insertObjects([o]); },
  picture: async () => { const fs = await pickFile('image/*,.svg', true); if (fs) for (const f of fs) await run('insertFile', f); },
  insertImageData: async (data, name = '', p) => {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = data; });
    const sc = Math.min(1, E.doc.size.w * .6 / img.naturalWidth, E.doc.size.h * .6 / img.naturalHeight); const w = img.naturalWidth * sc || 400, h = img.naturalHeight * sc || 300;
    const ph = slide().objects.find(o => o.ph === 'picture');
    const o = ph ? makeImage(addAsset(E.doc, 'image', data, name), { x: ph.x, y: ph.y, w: ph.w, h: ph.h, name: name || 'Picture', crop: coverCrop(img, ph.w, ph.h) }) : makeImage(addAsset(E.doc, 'image', data, name), { ...(p ? { x: p.x - w / 2, y: p.y - h / 2, w, h } : center0(w, h)), name: name || 'Picture' });
    if (ph) { structural(); commit('Insert picture', () => { slide().objects.splice(slide().objects.indexOf(ph), 1, o); }); select([o.id]); } else insertObjects([o], 'Insert picture');
  },
  insertFile: async (f, p) => {
    const n = f.name.toLowerCase();
    if (f.type.startsWith('image/') || /\.(svg|webp|bmp)$/.test(n)) { if (f.size > 8e6) D.toast(t('Large image — consider Compress Pictures.')); return run('insertImageData', await readAsDataURL(f), f.name, p); }
    if (f.type.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/.test(n)) return run('insertMedia', 'video', f);
    if (f.type.startsWith('audio/') || /\.(mp3|wav|aac|m4a|ogg)$/.test(n)) return run('insertMedia', 'audio', f);
    if (/\.(pptx|lpres|pdf|odp|docx|txt|md|csv|xlsx)$/.test(n)) return emit('openFile', f);
    D.toast(t('Unsupported file type: ') + f.name);
  },
  insertMedia: async (kind, f) => {
    if (!f) { f = await pickFile(kind === 'video' ? 'video/*,.mp4,.mov,.webm,.avi' : 'audio/*,.mp3,.wav,.aac,.m4a,.ogg'); if (!f) return; }
    const probe = document.createElement(kind); const can = probe.canPlayType(f.type || (kind === 'video' ? 'video/mp4' : 'audio/mpeg'));
    if (!can) D.alertBox(t('Codec warning'), t('This file type ({type}) may not play on this system. Supported everywhere: MP4 (H.264), WebM, MP3, WAV, M4A. AVI and some MOV files need conversion.', { type: f.type || f.name.split('.').pop() }));
    if (f.size > 150e6) D.toast(t('Large media files make presentations heavy. Consider trimming or compressing.'));
    const data = await readAsDataURL(f); const o = makeMedia(kind, addAsset(E.doc, kind, data, f.name), { ...center0(kind === 'audio' ? 80 : 640, kind === 'audio' ? 80 : 360), name: f.name });
    if (kind === 'video') { const v = document.createElement('video'); v.src = data; v.muted = true; await new Promise(r => { v.onloadeddata = r; v.onerror = r; setTimeout(r, 4000); }); if (v.videoWidth) { const sc = Math.min(640 / v.videoWidth, 360 / v.videoHeight); Object.assign(o, center0(v.videoWidth * sc, v.videoHeight * sc)); try { v.currentTime = Math.min(1, (v.duration || 2) / 3); await new Promise(r => { v.onseeked = r; setTimeout(r, 1500); }); const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); o.poster = addAsset(E.doc, 'image', c.toDataURL('image/jpeg', .8)); } catch (e) { } } }
    insertObjects([o], 'Insert ' + kind);
  },
  table: (r = 3, c = 4) => insertObjects([makeTable(r, c, center0(Math.min(900, 160 * c), 54 * r))], 'Insert table'),
  chart: (type = 'column') => insertObjects([makeChart(type, center0(700, 420))], 'Insert chart'),
  wordart: (style) => { const o = makeText({ ...center0(800, 140), text: t('Your Text Here'), size: 84, bold: true, font: '@head', align: 'center', valign: 'middle', ...style }); insertObjects([o]); setTimeout(() => startTextEdit(o), 30); },
  saveAsPicture: () => { const o = sel1(); if (!o) return; const c = document.createElement('canvas'); const b = objAABB(o); c.width = b.w * 2; c.height = b.h * 2; const x = c.getContext('2d'); x.scale(2, 2); x.translate(-b.x, -b.y); renderSlide(x, E.doc, { ...slide(), objects: [o], bg: null }, { scale: 1, clear: false, noBg: true, noMaster: true, present: true }); c.toBlob(bl => downloadBlob(bl, (o.name || 'object') + '.png')); },
  showStart: () => startShow(0), showCurrent: () => startShow(E.cur),
  showPresenter: () => startShow(E.cur, { presenter: true }),
  rehearse: () => startShow(0, { rehearse: true }),
  recordShow: (from = 0) => D.selfieStudio({ recordFrom: from }),
});
function coverCrop(img, w, h) { const ir = img.naturalWidth / img.naturalHeight, r = w / h; if (ir > r) { const f = (1 - r / ir) / 2; return { l: f, r: f, t: 0, b: 0 }; } const f = (1 - ir / r) / 2; return { l: 0, r: 0, t: f, b: f }; }

// ---------------------------------------------------------------- slideshow launch
export async function startShow(from = 0, opts = {}) {
  finishTextEdit(); await preloadDoc(E.doc);
  const host = el('div', { class: 'show-host' }); document.body.append(host);
  const multi = opts.multi ?? E.prefs.multiDisplay;
  const common = { start: from, perf: E.prefs.perf, loop: E.doc.show.loop, customShow: opts.customShow, rehearse: opts.rehearse, includeHidden: false,
    onRecording: (blob, mime) => D.recordingReady(blob, mime),
    afterFrame: E.prefs.captions ? captionsFrame : null,
    onEnd: (pl) => { host.remove(); stopCaptions(); if (opts.rehearse && pl.timings.length) D.saveTimings(pl.timings); if (E.doc.show.kiosk) { } setCur(Math.min(pl.index, E.doc.slides.length - 1)); } };
  if (E.prefs.captions) startCaptions();
  if (opts.presenter || multi) { host.remove(); const p = startPresenter(E.doc, { ...common, multi }); if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => { }); return p; }
  const pl = new Player(host, E.doc, common);
  if (E.doc.show.kiosk) { pl.opts.loop = true; }
  host.requestFullscreen?.().catch(() => { });
  return pl;
}
// Live captions (Web Speech API) drawn into the show canvas so they are also recorded
let rec = null, capText = '', capT = 0;
function startCaptions() { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { D.toast(t('Live captions are not supported in this browser.')); return; } rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = { en: 'en-US', he: 'he-IL', ar: 'ar-SA' }[E.doc.lang || 'en']; rec.onresult = (e) => { let s = ''; for (let i = e.resultIndex; i < e.results.length; i++) s += e.results[i][0].transcript; capText = s.slice(-120); capT = performance.now(); }; rec.onend = () => { if (rec) try { rec.start(); } catch (e) { } }; try { rec.start(); } catch (e) { } }
function stopCaptions() { if (rec) { const r = rec; rec = null; try { r.stop(); } catch (e) { } } capText = ''; }
function captionsFrame(ctx, pl) { if (!capText || performance.now() - capT > 4000) return; const fs = Math.round(pl.ch * .035); ctx.save(); ctx.font = `600 ${fs}px Segoe UI, Arial`; ctx.textAlign = 'center'; ctx.direction = 'inherit'; const w = Math.min(pl.cw * .9, ctx.measureText(capText).width + fs * 1.4); ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect((pl.cw - w) / 2, pl.ch - fs * 2.8, w, fs * 1.8); ctx.fillStyle = '#fff'; ctx.fillText(capText, pl.cw / 2, pl.ch - fs * 1.55); ctx.restore(); }

// ---------------------------------------------------------------- keyboard
export const DEFAULT_KEYS = {
  newPres: 'Ctrl+N', open: 'Ctrl+O', save: 'Ctrl+S', saveAs: 'Ctrl+Shift+S', undo: 'Ctrl+Z', redo: 'Ctrl+Y', copy: 'Ctrl+C', paste: 'Ctrl+V', cut: 'Ctrl+X', duplicate: 'Ctrl+D', newSlide: 'Ctrl+M', hyperlink: 'Ctrl+K',
  showStart: 'F5', showCurrent: 'Shift+F5', delete: 'Delete', selectAll: 'Ctrl+A', group: 'Ctrl+G', ungroup: 'Ctrl+Shift+G', find: 'Ctrl+F', replace: 'Ctrl+H', bold: 'Ctrl+B', italic: 'Ctrl+I', underline: 'Ctrl+U',
  alignLeft: 'Ctrl+L', alignCenter: 'Ctrl+E', alignRight: 'Ctrl+R', alignJustify: 'Ctrl+J', fontBigger: 'Ctrl+]', fontSmaller: 'Ctrl+[', print: 'Ctrl+P', presenter: 'Alt+F5', zoomIn: 'Ctrl+=', zoomOut: 'Ctrl+-', fit: 'Ctrl+0', formatPainter: 'Ctrl+Shift+C',
};
export const KEY_ACTIONS = {
  newPres: () => emit('newPres'), open: () => emit('openDialog'), save: () => run('save'), saveAs: () => run('saveAs'), undo: () => run('undo'), redo: () => run('redo'), copy: () => run('copy'), paste: () => run('paste'), cut: () => run('cut'), duplicate: () => run('duplicate'), newSlide: () => run('newSlide'), hyperlink: () => D.hyperlink(),
  showStart: () => run('showStart'), showCurrent: () => run('showCurrent'), delete: () => run('delete'), selectAll: () => run('selectAll'), group: () => run('group'), ungroup: () => run('ungroup'), find: () => D.findReplace(false), replace: () => D.findReplace(true),
  bold: () => run('toggleFmt', 'bold'), italic: () => run('toggleFmt', 'italic'), underline: () => run('toggleFmt', 'underline'), alignLeft: () => run('set', { align: 'left' }), alignCenter: () => run('set', { align: 'center' }), alignRight: () => run('set', { align: 'right' }), alignJustify: () => run('set', { align: 'justify' }),
  fontBigger: () => run('fontSize', '+'), fontSmaller: () => run('fontSize', '-'), print: () => D.printDialog(), presenter: () => run('showPresenter'), zoomIn: () => run('zoom', E.zoom * 1.15), zoomOut: () => run('zoom', E.zoom / 1.15), fit: () => run('fit'), formatPainter: () => run('formatPainter'),
};
export const keyMap = () => ({ ...DEFAULT_KEYS, ...JSON.parse(localStorage.getItem('lp.keys') || '{}') });
export function comboOf(e) { const k = e.key.length === 1 ? e.key.toUpperCase() : e.key; return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey && k.length > 1 || e.shiftKey && /[A-Z]/.test(k) ? 'Shift' : '', k === '+' ? '=' : k].filter(Boolean).join('+'); }
export function onEditorKey(e) {
  if (!E.doc || $('#app').hidden || document.querySelector('.show-root,.presenter') || document.querySelector('.dialog-back')) return;
  const tag = e.target.tagName; const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
  const combo = comboOf(e); const km = keyMap();
  const act = Object.entries(km).find(([, v]) => v.toLowerCase() === combo.toLowerCase())?.[0];
  if (typing && !(act === 'save' || act === 'showStart' || act === 'print')) return;
  if (act && KEY_ACTIONS[act]) { e.preventDefault(); KEY_ACTIONS[act](); return; }
  if (e.key === 'Backspace' && E.sel.length) { e.preventDefault(); run('delete'); return; }
  if (e.key.startsWith('Arrow')) { const st = e.shiftKey ? 10 : 1; if (E.sel.length) { e.preventDefault(); run('nudge', e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0); } else if (document.activeElement?.closest('.slides-panel') || document.activeElement === document.body) { e.preventDefault(); setCur(E.cur + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) * (isRTL() && e.key.match(/Left|Right/) ? -1 : 1)); } return; }
  if (e.key === 'Escape') { E.insertMode = null; E.painter = null; E.animPainter = null; if (E.motionPath) { E.motionPath = null; drawOverlay(); } select([]); return; }
  if (e.key === 'Tab' && objs().length) { e.preventDefault(); const i = objs().findIndex(o => o.id === E.sel[0]); const n = objs()[(i + (e.shiftKey ? -1 : 1) + objs().length) % objs().length]; select([n.id]); return; }
  if ((e.key === 'Enter' || e.key === 'F2') && sel1() && (sel1().type === 'text' || sel1().type === 'shape')) { e.preventDefault(); startTextEdit(sel1()); return; }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && sel1() && (sel1().type === 'text' || sel1().type === 'shape') && E.sel.length === 1) { startTextEdit(sel1()); }
}
document.addEventListener('keydown', onEditorKey);
document.addEventListener('paste', async (e) => {
  if (!E.doc || $('#app').hidden || ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || document.querySelector('.dialog-back,.show-root')) return;
  const items = [...(e.clipboardData?.items || [])]; const img = items.find(i => i.type.startsWith('image/'));
  if (img) { e.preventDefault(); return run('insertImageData', await readAsDataURL(img.getAsFile()), 'Pasted image'); }
  const txt = e.clipboardData?.getData('text/plain');
  if (E.clipboard) { e.preventDefault(); return run('paste'); }
  if (txt) { e.preventDefault(); const o = makeText({ ...center0(700, 120), text: txt.slice(0, 5000) }); insertObjects([o], 'Paste text'); }
});
