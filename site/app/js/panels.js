// Lasteast Present — task panes: Format, Animation Pane, Transition Studio, Camera, Comments, Selection (Layers), AI
import { el, $, $$, uid, deepClone, readAsDataURL, pickFile, downloadBlob, readAsText, clamp, toHex } from './util.js';
import { E, on, emit, commit, slide, selObjs, sel1, select, savePrefs, saveFavs } from './state.js';
import { t, getLang } from './i18n.js';
import { ICONS } from './icons.js';
import { CMD, run, drawStage, previewTransition, previewAnimations, startTextEdit, renderSlidesPanel, structural } from './editor.js';
import * as D from './dialogs.js';
import { resolveColor, addAsset, THEMES, themeById, SIZES, cloneObject, makeChart } from './model.js';
import { SHAPES, CHART_TYPES, TEXTURES, renderToCanvas, renderSlide, objFilterCss, assetSrc } from './renderer.js';
import { ANIMS, ANIM_CAT, DIR_ANIMS, newAnim, buildTimeline } from './animations.js';
import { TRANSITIONS, CATEGORIES, SIGNATURE, getT, defaultParams, PRESETS, applyPreset, prepareTransition, SOUNDS, suggestMatches, matchObjects } from './transitions.js';
import { EASE_NAMES } from './util.js';
import { FONTS } from './ribbon.js';
import { CAM_SHAPES, CAM_PRESETS } from './camera.js';
import * as AI from './ai.js';

let side, tabsEl, bodyEl;
const PANES = [['format', 'Format'], ['animations', 'Animations'], ['transitions', 'Transitions'], ['camera', 'Camera'], ['comments', 'Comments'], ['layers', 'Selection'], ['ai', 'AI']];
export function buildPanel(root) {
  side = root; side.innerHTML = '';
  tabsEl = el('div', { class: 'p-tabs' }); bodyEl = el('div', { class: 'p-body' });
  side.append(tabsEl, bodyEl, el('button', { class: 'p-collapse', title: t('Hide pane'), onclick: () => side.classList.toggle('collapsed') }, '›'));
  refreshPanel(true);
}
let lastKey = '';
export function refreshPanel(force = false) {
  if (!bodyEl || !E.doc) return;
  const p = E.prefs.panel || 'format';
  tabsEl.innerHTML = ''; for (const [k, l] of PANES) tabsEl.append(el('button', { class: 'p-tab' + (k === p ? ' on' : ''), onclick: () => run('panel', k) }, t(l)));
  // avoid rebuilding while user types in a pane field
  const key = p + '|' + E.cur + '|' + E.sel.join(',') + '|' + (E.doc.slides.length);
  if (!force && key === lastKey && bodyEl.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const st = bodyEl.scrollTop; lastKey = key; [...thumbLoops, ...libLoops].forEach(f => f()); bodyEl.innerHTML = '';
  ({ format: formatPane, animations: animPane, transitions: transPane, camera: cameraPane, comments: commentsPane, layers: layersPane, ai: aiPane })[p]?.(bodyEl);
  bodyEl.scrollTop = st;
}
on('selectNone', () => { select([]); refreshPanel(true); });

// ---------- form helpers ----------
const sec = (title, ...kids) => { const d = el('details', { class: 'p-sec', open: !secClosed.has(title) }, el('summary', {}, t(title)), el('div', { class: 'p-sec-body' }, ...kids.flat())); d.addEventListener('toggle', () => d.open ? secClosed.delete(title) : secClosed.add(title)); return d; };
const secClosed = new Set(['Effects', 'Advanced', 'Layout', 'Image Corrections']);
const F = (label, input) => el('label', { class: 'p-f' }, el('span', {}, t(label)), input);
const numIn = (v, set, o = {}) => el('input', { type: 'number', value: v != null ? +(+v).toFixed(o.dec ?? 1) : '', step: o.step || 1, min: o.min, max: o.max, onchange: (e) => set(+e.target.value) });
const rangeIn = (v, set, o = {}) => { const out = el('output', {}, fmt(v, o)); const r = el('input', { type: 'range', value: v ?? o.min ?? 0, step: o.step || 1, min: o.min ?? 0, max: o.max ?? 100, oninput: (e) => { out.textContent = fmt(+e.target.value, o); set(+e.target.value, true); }, onchange: (e) => set(+e.target.value, false) }); return el('span', { class: 'p-range' }, r, out); };
const fmt = (v, o) => (o.pct ? Math.round(v * 100) + '%' : (+v).toFixed(o.step < 1 ? (o.step < .05 ? 3 : 2) : 0)) + (o.unit || '');
const selIn = (opts, v, set) => el('select', { onchange: (e) => set(e.target.value) }, ...opts.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return el('option', { value: val, selected: String(val) === String(v) }, t(String(lab))); }));
const chkIn = (v, set, label) => el('label', { class: 'p-chk' }, el('input', { type: 'checkbox', checked: !!v, onchange: (e) => set(e.target.checked) }), ' ', t(label));
const textIn = (v, set, o = {}) => el(o.area ? 'textarea' : 'input', { value: v ?? '', placeholder: t(o.ph || ''), dir: 'auto', rows: o.rows || 3, onchange: (e) => set(e.target.value) });
function colorIn(v, set, o = {}) {
  const th = E.doc.theme; const val = v && v !== 'none' ? resolveColor(v, th) : '#ffffff';
  const wrap = el('span', { class: 'p-color' });
  const inp = el('input', { type: 'color', value: toHex(val), oninput: (e) => set(e.target.value, true), onchange: (e) => set(e.target.value) });
  wrap.append(inp);
  for (const k of ['accent', 'accent2', 'accent3', 'text', 'bg', 'muted']) wrap.append(el('button', { class: 'tok' + (v === '@' + k ? ' on' : ''), title: t('Theme') + ': ' + k, style: `background:${th[k]}`, onclick: (e) => { e.preventDefault(); set('@' + k); } }));
  if (o.none !== false) wrap.append(el('button', { class: 'tok none' + (!v || v === 'none' ? ' on' : ''), title: t('No color'), onclick: (e) => { e.preventDefault(); set('none'); } }, '⊘'));
  return wrap;
}
const S = (props, label) => run('set', props, label);
const setK = (k, label) => (v, live) => run('set', { [k]: v }, label || k);

// ---------- FORMAT ----------
function formatPane(b) {
  const os = selObjs(); const o = os[0];
  if (!o) return slidePane(b);
  if (os.length > 1) b.append(el('div', { class: 'p-note' }, t('{n} objects selected', { n: os.length })), sec('Arrange', alignButtons()));
  b.append(sec('Position & Size',
    el('div', { class: 'p-grid2' }, F('X', numIn(o.x, v => S({ x: v }, 'Move'))), F('Y', numIn(o.y, v => S({ y: v }, 'Move'))), F('Width', numIn(o.w, v => S(q => ({ w: v, h: (o.type === 'image' && E.lockAspect !== false) ? q.h * v / q.w : q.h }), 'Resize'))), F('Height', numIn(o.h, v => S({ h: v }, 'Resize'))), F('Rotation', numIn(o.rot || 0, v => S({ rot: v }, 'Rotate'), { step: 1 })), F('Transparency', rangeIn(Math.round((1 - (o.opacity ?? 1)) * 100), (v) => S({ opacity: 1 - v / 100 }, 'Transparency'), { unit: '%' }))),
    el('div', { class: 'p-row' }, chkIn(o.locked, v => S({ locked: v }, 'Lock'), 'Lock'), el('button', { class: 'btn sm', onclick: () => S(q => ({ flipH: !q.flipH }), 'Flip') }, t('Flip H')), el('button', { class: 'btn sm', onclick: () => S(q => ({ flipV: !q.flipV }), 'Flip') }, t('Flip V'))),
    F('Name', textIn(o.name, v => S({ name: v }, 'Rename'), { ph: 'Use !!name to force Morph matching' }))));
  if (o.type === 'shape' || o.type === 'text') { b.append(fillSec(o), textSec(o)); }
  if (o.type === 'image') b.append(imageSec(o));
  if (o.type === 'table') b.append(tableSec(o));
  if (o.type === 'chart') b.append(chartSec(o));
  if (o.type === 'video' || o.type === 'audio') b.append(mediaSec(o));
  b.append(effectsSec(o));
  b.append(sec('Link & Accessibility', el('div', { class: 'p-row' }, el('button', { class: 'btn sm', onclick: () => D.hyperlink() }, o.link ? t('Edit link…') : t('Add link…')), o.link ? el('button', { class: 'btn sm', onclick: () => S({ link: null }, 'Remove link') }, t('Remove link')) : null), F('Alt text', textIn(o.alt, v => S({ alt: v }, 'Alt text'), { area: true, rows: 2, ph: 'Describe this object for screen readers' }))));
}
function alignButtons() { return el('div', { class: 'p-btnrow' }, ...[['left', '▐░'], ['center', '│'], ['right', '░▌'], ['top', '▔'], ['middle', '─'], ['bottom', '▁']].map(([a, g]) => el('button', { class: 'btn sm', title: t('Align ' + a), onclick: () => run('align', a) }, t(a[0].toUpperCase() + a.slice(1)))), el('button', { class: 'btn sm', onclick: () => run('distribute', 'h') }, t('Distribute H')), el('button', { class: 'btn sm', onclick: () => run('distribute', 'v') }, t('Distribute V')), el('button', { class: 'btn sm', onclick: () => run('group') }, t('Group')), el('button', { class: 'btn sm', onclick: () => run('ungroup') }, t('Ungroup'))); }
function fillEditor(f, set, allowImage = false) {
  const type = !f || f === 'none' ? 'none' : typeof f === 'string' ? 'solid' : f.type;
  const box = el('div', { class: 'p-fill' });
  box.append(F('Fill', selIn([['none', 'No fill'], ['solid', 'Solid fill'], ['linear', 'Gradient fill'], ['radial', 'Radial gradient'], ['texture', 'Texture fill'], ...(allowImage ? [['image', 'Picture fill']] : [])], type, async (v) => {
    if (v === 'none') set('none'); else if (v === 'solid') set(typeof f === 'string' && f !== 'none' ? f : '@accent');
    else if (v === 'linear' || v === 'radial') set({ type: v, c1: typeof f === 'string' && f !== 'none' ? f : f?.c1 || '@accent', c2: f?.c2 || '@accent2', angle: f?.angle ?? 90 });
    else if (v === 'texture') set({ type: 'texture', texture: 'linen', c1: '@muted' });
    else if (v === 'image') { const file = await pickFile('image/*'); if (file) set({ type: 'image', asset: addAsset(E.doc, 'image', await readAsDataURL(file), file.name) }); }
  })));
  if (type === 'solid') box.append(F('Color', colorIn(f, (c) => set(c))));
  if (type === 'linear' || type === 'radial') { box.append(F('Color 1', colorIn(f.c1, (c) => set({ ...f, c1: c }), { none: false })), F('Color 2', colorIn(f.c2, (c) => set({ ...f, c2: c }), { none: false }))); if (type === 'linear') box.append(F('Angle', rangeIn(f.angle ?? 90, (v) => set({ ...f, angle: v }), { max: 360, unit: '°' }))); }
  if (type === 'texture') box.append(F('Texture', selIn(TEXTURES, f.texture, (v) => set({ ...f, texture: v }))), F('Color', colorIn(f.c1, (c) => set({ ...f, c1: c }), { none: false })));
  return box;
}
function fillSec(o) {
  return sec('Shape',
    o.type === 'shape' ? F('Shape', selIn(SHAPES.map(s => [s, s]), o.shape, (v) => S({ shape: v }, 'Change shape'))) : el('div', { class: 'p-row' }, el('button', { class: 'btn sm', onclick: () => commit('Convert', () => { o.type = 'shape'; if (o.fill === 'none') o.fill = '@accent'; }) }, t('Convert to shape'))),
    fillEditor(o.fill, (v) => S({ fill: v }, 'Fill')),
    F('Outline', colorIn(o.stroke, (c) => S({ stroke: c, strokeW: c === 'none' ? 0 : Math.max(o.strokeW || 0, 2) }, 'Outline'))),
    el('div', { class: 'p-grid2' }, F('Width', numIn(o.strokeW, v => S({ strokeW: v }, 'Outline width'), { min: 0, max: 60 })), F('Dash', selIn([['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted']], o.dash || 'solid', v => S({ dash: v }, 'Dash'))), o.shape === 'roundRect' ? F('Corner radius', numIn(o.radius, v => S({ radius: v }, 'Radius'), { min: 0 })) : null));
}
function textSec(o) {
  return sec('Text',
    F('Font', selIn([['@head', t('Theme heading')], ['@body', t('Theme body')], ...FONTS.map(f => [f + ', Segoe UI, Arial', f])], o.font, v => S({ font: v }, 'Font'))),
    el('div', { class: 'p-grid2' }, F('Size (px)', numIn(o.size, v => S({ size: v }, 'Font size'), { min: 4, max: 600 })), F('Color', colorIn(o.color, c => S({ color: c }, 'Font color'), { none: false }))),
    el('div', { class: 'p-btnrow' }, ...[['bold', 'B'], ['italic', 'I'], ['underline', 'U'], ['strike', 'S']].map(([k, g]) => el('button', { class: 'btn sm' + (o[k] ? ' on' : ''), style: k === 'bold' ? 'font-weight:700' : k === 'italic' ? 'font-style:italic' : k === 'underline' ? 'text-decoration:underline' : 'text-decoration:line-through', onclick: () => run('toggleFmt', k) }, g))),
    el('div', { class: 'p-grid2' }, F('Align', selIn([['start', 'Start (auto)'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']], o.align, v => S({ align: v }, 'Align'))), F('Vertical', selIn([['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], o.valign, v => S({ valign: v }, 'Align'))),
      F('Direction', selIn([['auto', 'Automatic'], ['ltr', 'Left-to-right'], ['rtl', 'Right-to-left']], o.dir || 'auto', v => S({ dir: v }, 'Direction'))), F('Bullets', selIn([['none', 'None'], ['bullet', 'Bullets'], ['number', 'Numbering']], o.bullets, v => S({ bullets: v }, 'Bullets'))),
      F('Line spacing', numIn(o.lineHeight, v => S({ lineHeight: v }, 'Line spacing'), { step: .05, min: .5, max: 4, dec: 2 })), F('Paragraph space', numIn(o.paraSpace, v => S({ paraSpace: v }, 'Paragraph spacing'), { min: 0 })),
      F('Character spacing', numIn(o.letterSpacing, v => S({ letterSpacing: v }, 'Spacing'), { step: .5, min: -10, max: 50 })), F('Columns', numIn(o.columns || 1, v => S({ columns: clamp(Math.round(v), 1, 4) }, 'Columns'), { min: 1, max: 4 })), F('Inner margin', numIn(o.pad ?? 10, v => S({ pad: v }, 'Margin'), { min: 0 }))),
    el('div', { class: 'p-row' }, chkIn(o.autofit, v => S({ autofit: v }, 'Autofit'), 'Shrink text on overflow'), chkIn(o.vertical, v => S({ vertical: v }, 'Vertical'), 'Vertical text')),
    sec('WordArt & text effects',
      F('Highlight', colorIn(o.highlight, c => S({ highlight: c === 'none' ? null : c }, 'Highlight'))),
      F('Text outline', colorIn(o.textOutline?.color, c => S({ textOutline: c === 'none' ? null : { color: c, width: o.textOutline?.width || 2 } }, 'Outline'))),
      o.textOutline ? F('Outline width', numIn(o.textOutline.width, v => S({ textOutline: { ...o.textOutline, width: v } }), { min: 0, max: 20, step: .5 })) : null,
      F('Gradient fill', chkIn(!!o.textGradient, v => S({ textGradient: v ? { c1: '@accent', c2: '@accent2' } : null }, 'Text gradient'), 'Gradient text')),
      o.textGradient ? el('div', { class: 'p-grid2' }, F('From', colorIn(o.textGradient.c1, c => S({ textGradient: { ...o.textGradient, c1: c } }), { none: false })), F('To', colorIn(o.textGradient.c2, c => S({ textGradient: { ...o.textGradient, c2: c } }), { none: false }))) : null,
      F('Text shadow', chkIn(!!o.textShadow, v => S({ textShadow: v ? { color: 'rgba(0,0,0,.4)', blur: 8, x: 3, y: 3 } : null }, 'Text shadow'), 'Shadow'))),
    el('div', { class: 'p-row' }, el('button', { class: 'btn sm', onclick: () => startTextEdit(o) }, t('Edit text')), el('button', { class: 'btn sm', onclick: () => { E.prefs.panel = 'ai'; refreshPanel(true); } }, '✨ ' + t('Improve with AI'))));
}
function effectsSec(o) {
  return sec('Effects',
    chkIn(!!o.shadow, v => S({ shadow: v ? { color: 'rgba(0,0,0,.35)', blur: 18, x: 6, y: 8 } : null }, 'Shadow'), 'Shadow'),
    o.shadow ? el('div', { class: 'p-grid2' }, F('Blur', numIn(o.shadow.blur, v => S({ shadow: { ...o.shadow, blur: v } }), { min: 0, max: 120 })), F('Distance X', numIn(o.shadow.x, v => S({ shadow: { ...o.shadow, x: v } }), { min: -100, max: 100 })), F('Distance Y', numIn(o.shadow.y, v => S({ shadow: { ...o.shadow, y: v } }), { min: -100, max: 100 })), F('Color', colorIn(o.shadow.color, c => S({ shadow: { ...o.shadow, color: c } }), { none: false }))) : null,
    chkIn(!!o.glow, v => S({ glow: v ? { color: '@accent', size: 24 } : null }, 'Glow'), 'Glow'),
    o.glow ? el('div', { class: 'p-grid2' }, F('Size', numIn(o.glow.size, v => S({ glow: { ...o.glow, size: v } }), { min: 0, max: 120 })), F('Color', colorIn(o.glow.color, c => S({ glow: { ...o.glow, color: c } }), { none: false }))) : null,
    chkIn(!!o.reflection, v => S({ reflection: v }, 'Reflection'), 'Reflection'),
    el('div', { class: 'p-note' }, t('3D rotation is available through Morph Perspective and 3D transitions.')));
}
function imageSec(o) {
  const f = o.filters || {}; const setF = (k) => (v) => S(q => ({ filters: { ...(q.filters || {}), [k]: v } }), 'Picture correction');
  const presets = { none: {}, grayscale: { grayscale: 100 }, sepia: { sepia: 80 }, vivid: { saturate: 160, contrast: 110 }, washout: { brightness: 130, contrast: 70 }, noir: { grayscale: 100, contrast: 140 }, invert: { invert: 100 }, soft: { blur: 2, brightness: 108 }, cool: { hue: 190, saturate: 80 }, warm: { sepia: 30, saturate: 130 } };
  return sec('Picture',
    F('Crop (%)', el('div', { class: 'p-grid4' }, ...['l', 't', 'r', 'b'].map(k => el('label', {}, t({ l: 'Left', t: 'Top', r: 'Right', b: 'Bottom' }[k]), numIn(Math.round((o.crop?.[k] || 0) * 100), v => S(q => ({ crop: { ...(q.crop || { l: 0, t: 0, r: 0, b: 0 }), [k]: clamp(v / 100, 0, .95) } }), 'Crop'), { min: 0, max: 95 }))))),
    F('Shape mask', selIn([['rect', 'Rectangle'], ...SHAPES.filter(s => !['line', 'arrowLine', 'rect'].includes(s)).map(s => [s, s])], o.mask || 'rect', v => S({ mask: v }, 'Crop to shape'))),
    F('Corner radius', numIn(o.radius || 0, v => S({ radius: v }, 'Radius'), { min: 0 })),
    F('Border', colorIn(o.stroke, c => S({ stroke: c, strokeW: c === 'none' ? 0 : Math.max(o.strokeW || 0, 3) }, 'Border'))),
    sec('Image Corrections',
      F('Brightness', rangeIn(f.brightness ?? 100, setF('brightness'), { min: 0, max: 200, unit: '%' })), F('Contrast', rangeIn(f.contrast ?? 100, setF('contrast'), { min: 0, max: 200, unit: '%' })), F('Saturation', rangeIn(f.saturate ?? 100, setF('saturate'), { min: 0, max: 300, unit: '%' })),
      F('Hue', rangeIn(f.hue ?? 0, setF('hue'), { min: 0, max: 360, unit: '°' })), F('Blur', rangeIn(f.blur ?? 0, setF('blur'), { min: 0, max: 30, unit: 'px' })), F('Transparency', rangeIn(f.transparency ?? 0, setF('transparency'), { min: 0, max: 100, unit: '%' })),
      F('Artistic filter', el('div', { class: 'p-btnrow wrap' }, ...Object.entries(presets).map(([k, v]) => el('button', { class: 'btn sm', onclick: () => S({ filters: { ...v, transparency: f.transparency } }, 'Artistic effect') }, t(k)))))),
    el('div', { class: 'p-btnrow wrap' },
      el('button', { class: 'btn sm', onclick: () => run('removeBg', o) }, t('Remove Background')),
      el('button', { class: 'btn sm', onclick: () => run('compressImage', o) }, t('Compress Picture')),
      el('button', { class: 'btn sm', onclick: async () => { const fl = await pickFile('image/*'); if (fl) { const d = await readAsDataURL(fl); commit('Change picture', () => { o.asset = addAsset(E.doc, 'image', d, fl.name); }); } } }, t('Change Picture')),
      el('button', { class: 'btn sm', onclick: () => S({ crop: { l: 0, t: 0, r: 0, b: 0 }, filters: {}, mask: 'rect', radius: 0 }, 'Reset picture') }, t('Reset Picture'))));
}
function tableSec(o) {
  const R = o.cells.length, C = o.cells[0].length;
  const mut = (label, fn) => commit(label, () => { fn(); o.colW = null; o.rowH = null; o.h = Math.max(o.h, 40 * o.cells.length); });
  return sec('Table',
    el('div', { class: 'p-btnrow wrap' },
      el('button', { class: 'btn sm', onclick: () => mut('Insert row', () => o.cells.push(Array.from({ length: C }, () => ({ text: '' })))) }, t('Insert Row Below')),
      el('button', { class: 'btn sm', onclick: () => mut('Insert column', () => o.cells.forEach((r, i) => r.push({ text: i === 0 && o.header ? 'Header' : '' }))) }, t('Insert Column Right')),
      el('button', { class: 'btn sm', onclick: () => R > 1 && mut('Delete row', () => { o.cells.pop(); o.merges = (o.merges || []).filter(m => m.r + m.rs <= o.cells.length); }) }, t('Delete Row')),
      el('button', { class: 'btn sm', onclick: () => C > 1 && mut('Delete column', () => { o.cells.forEach(r => r.pop()); o.merges = (o.merges || []).filter(m => m.c + m.cs <= o.cells[0].length); }) }, t('Delete Column'))),
    el('div', { class: 'p-row' }, chkIn(o.header, v => S({ header: v }, 'Header row'), 'Header Row'), chkIn(o.band, v => S({ band: v }, 'Banded rows'), 'Banded Rows')),
    el('div', { class: 'p-grid2' }, F('Font size', numIn(o.size, v => S({ size: v }), { min: 6 })), F('Header fill', colorIn(o.headFill, c => S({ headFill: c }), { none: false })), F('Header text', colorIn(o.headColor, c => S({ headColor: c }), { none: false })), F('Text color', colorIn(o.color, c => S({ color: c }), { none: false })), F('Borders', colorIn(o.border, c => S({ border: c }))), F('Border width', numIn(o.borderW, v => S({ borderW: v }), { min: 0, max: 10 }))),
    F('Merge cells (row, col, rows, cols)', mergeEditor(o)),
    F('Cell shading (row, col)', cellShade(o)),
    F('Column widths (%)', textIn((o.colW || Array(C).fill(1 / C)).map(f => Math.round(f * 100)).join(', '), v => { const a = v.split(/[,\s]+/).map(Number).filter(x => x > 0); if (a.length === C) { const s = a.reduce((x, y) => x + y, 0); S({ colW: a.map(x => x / s) }, 'Column widths'); } })),
    F('Row heights (%)', textIn((o.rowH || Array(R).fill(1 / R)).map(f => Math.round(f * 100)).join(', '), v => { const a = v.split(/[,\s]+/).map(Number).filter(x => x > 0); if (a.length === R) { const s = a.reduce((x, y) => x + y, 0); S({ rowH: a.map(x => x / s) }, 'Row heights'); } })),
    el('div', { class: 'p-note' }, t('Double-click a cell on the slide to edit it. Tab moves to the next cell.')));
}
function mergeEditor(o) { const r = el('input', { type: 'number', min: 1, value: 1, style: 'width:48px' }), c = el('input', { type: 'number', min: 1, value: 1, style: 'width:48px' }), rs = el('input', { type: 'number', min: 1, value: 1, style: 'width:48px' }), cs = el('input', { type: 'number', min: 1, value: 2, style: 'width:48px' }); return el('div', { class: 'p-row' }, r, c, rs, cs, el('button', { class: 'btn sm', onclick: () => commit('Merge cells', () => { const m = { r: +r.value - 1, c: +c.value - 1, rs: +rs.value, cs: +cs.value }; if (m.r + m.rs > o.cells.length || m.c + m.cs > o.cells[0].length) return; o.merges = (o.merges || []).filter(x => !(x.r < m.r + m.rs && x.r + x.rs > m.r && x.c < m.c + m.cs && x.c + x.cs > m.c)); if (m.rs > 1 || m.cs > 1) o.merges.push(m); }) }, t('Merge')), el('button', { class: 'btn sm', onclick: () => commit('Split cells', () => { o.merges = (o.merges || []).filter(x => !(x.r === +r.value - 1 && x.c === +c.value - 1)); }) }, t('Split'))); }
function cellShade(o) { const r = el('input', { type: 'number', min: 1, value: 1, style: 'width:48px' }), c = el('input', { type: 'number', min: 1, value: 1, style: 'width:48px' }); const col = el('input', { type: 'color', value: '#ffe0cc' }); return el('div', { class: 'p-row' }, r, c, col, el('button', { class: 'btn sm', onclick: () => commit('Cell shading', () => { const cell = o.cells[+r.value - 1]?.[+c.value - 1]; if (cell) cell.fill = col.value; }) }, t('Apply')), el('button', { class: 'btn sm', onclick: () => commit('Cell shading', () => { const cell = o.cells[+r.value - 1]?.[+c.value - 1]; if (cell) cell.fill = null; }) }, t('Clear'))); }
function chartSec(o) {
  return sec('Chart',
    F('Chart type', selIn(CHART_TYPES.map(c => [c, c]), o.chartType, v => S({ chartType: v }, 'Chart type'))),
    F('Title', textIn(o.title, v => S({ title: v }, 'Chart title'))),
    el('div', { class: 'p-row' }, chkIn(o.showLegend, v => S({ showLegend: v }), 'Legend'), chkIn(o.showLabels, v => S({ showLabels: v }), 'Data labels')),
    F('Text color', colorIn(o.color, c => S({ color: c }), { none: false })),
    F('Series colors', el('div', { class: 'p-row' }, ...(o.palette || []).map((c, i) => el('input', { type: 'color', value: toHex(resolveColor(c, E.doc.theme)), onchange: (e) => S(q => { const p = [...(q.palette || [])]; p[i] = e.target.value; return { palette: p }; }, 'Chart colors') })))),
    F('Chart style', el('div', { class: 'p-btnrow' }, ...[['Theme', ['@accent', '@accent2', '@accent3', '@muted']], ['Mono', ['@accent', '@accent', '@accent', '@accent']], ['Ocean', ['#0f8bbf', '#13b39a', '#7fc8f8', '#1b4965']], ['Sunset', ['#ff5e62', '#ff9966', '#ffc371', '#6a3093']], ['Gray', ['#333', '#777', '#aaa', '#ccc']]].map(([n, p]) => el('button', { class: 'btn sm', onclick: () => S({ palette: p }, 'Chart style') }, t(n))))),
    el('div', { class: 'p-btnrow' }, el('button', { class: 'btn', onclick: () => D.chartData(o) }, t('Edit Data…')), el('button', { class: 'btn sm', onclick: () => D.importChartData(o) }, t('Import CSV / Excel…'))));
}
function mediaSec(o) {
  return sec(o.type === 'video' ? 'Video' : 'Audio',
    el('div', { class: 'p-row' }, chkIn(o.autoplay, v => S({ autoplay: v }), 'Start automatically'), chkIn(o.loop, v => S({ loop: v }), 'Loop until stopped')),
    el('div', { class: 'p-row' }, chkIn(o.acrossSlides, v => S({ acrossSlides: v }), 'Play across slides'), o.type === 'audio' ? chkIn(o.hideIcon, v => S({ hideIcon: v }), 'Hide during show') : null),
    F('Volume', rangeIn(Math.round((o.volume ?? 1) * 100), v => S({ volume: v / 100 }), { unit: '%' })),
    el('div', { class: 'p-grid2' }, F('Trim start (s)', numIn(o.trimStart, v => S({ trimStart: v }), { min: 0, step: .1 })), F('Trim end (s)', numIn(o.trimEnd, v => S({ trimEnd: v }), { min: 0, step: .1 })), F('Fade in (s)', numIn(o.fadeIn, v => S({ fadeIn: v }), { min: 0, step: .1 })), F('Fade out (s)', numIn(o.fadeOut, v => S({ fadeOut: v }), { min: 0, step: .1 }))),
    el('div', { class: 'p-btnrow' }, el('button', { class: 'btn', onclick: () => D.mediaTrim(o) }, t('Trim & Preview…')), o.type === 'video' ? el('button', { class: 'btn sm', onclick: () => D.mediaTrim(o, true) }, t('Poster Frame…')) : null, o.type === 'audio' ? el('button', { class: 'btn sm', onclick: () => D.mediaTrim(o) }, t('Bookmarks…')) : null),
    o.type === 'video' ? F('Video effect', selIn([['none', 'None'], ['rounded', 'Rounded corners'], ['shadow', 'Drop shadow'], ['circle', 'Circle']], o.radius ? 'rounded' : o.shadow ? 'shadow' : 'none', v => S(v === 'rounded' ? { radius: 24, shadow: null } : v === 'shadow' ? { shadow: { color: 'rgba(0,0,0,.4)', blur: 24, x: 0, y: 10 } } : { radius: 0, shadow: null }))) : null,
    F('Subtitles (WebVTT/SRT)', el('button', { class: 'btn sm', onclick: async () => { const f = await pickFile('.vtt,.srt'); if (f) { const txt = await readAsText(f); commit('Subtitles', () => o.subtitles = txt); D.toast(t('Subtitles attached.')); } } }, o.subtitles ? t('Replace subtitles…') : t('Attach subtitles…'))));
}
function slidePane(b) {
  const s = slide(); const bg = s.bg || { type: 'theme' };
  const setBg = (v) => commit('Background', () => slide().bg = v, { merge: true });
  b.append(sec('Format Background',
    F('Background', selIn([['theme', 'Theme background'], ['solid', 'Solid fill'], ['linear', 'Gradient fill'], ['radial', 'Radial gradient'], ['image', 'Picture fill'], ['texture', 'Texture fill']], bg.type, async (v) => {
      if (v === 'theme') setBg(null); else if (v === 'solid') setBg({ type: 'solid', color: '@bg2' }); else if (v === 'linear' || v === 'radial') setBg({ type: v, c1: '@bg', c2: '@bg2', angle: 135 }); else if (v === 'texture') setBg({ type: 'texture', texture: 'paper', c1: '@muted' });
      else { const f = await pickFile('image/*'); if (f) setBg({ type: 'image', asset: addAsset(E.doc, 'image', await readAsDataURL(f), f.name) }); }
    })),
    bg.type === 'solid' ? F('Color', colorIn(bg.color, c => setBg({ ...bg, color: c }), { none: false })) : null,
    bg.type === 'linear' || bg.type === 'radial' ? [F('Color 1', colorIn(bg.c1, c => setBg({ ...bg, c1: c }), { none: false })), F('Color 2', colorIn(bg.c2, c => setBg({ ...bg, c2: c }), { none: false })), bg.type === 'linear' ? F('Angle', rangeIn(bg.angle ?? 90, v => setBg({ ...bg, angle: v }), { max: 360, unit: '°' })) : null] : null,
    bg.type === 'texture' ? [F('Texture', selIn(TEXTURES, bg.texture, v => setBg({ ...bg, texture: v }))), F('Color', colorIn(bg.c1, c => setBg({ ...bg, c1: c }), { none: false }))] : null,
    bg.type !== 'theme' ? F('Transparency', rangeIn(bg.transparency || 0, v => setBg({ ...bg, transparency: v }), { unit: '%' })) : null,
    el('div', { class: 'p-btnrow' }, el('button', { class: 'btn sm', onclick: () => commit('Background to all', () => E.doc.slides.forEach(x => x.bg = s.bg ? deepClone(s.bg) : null)) }, t('Apply to All')), el('button', { class: 'btn sm', onclick: () => setBg(null) }, t('Reset Background'))),
    chkIn(s.hideMaster, v => commit('Hide master graphics', () => s.hideMaster = v), 'Hide background graphics (footer, logo)')));
  b.append(sec('Slide', F('Layout', el('button', { class: 'btn sm', onclick: () => D.layoutPicker() }, t('layout_' + (s.layout || 'blank')) + ' ▾')), chkIn(s.hidden, () => run('hideSlide'), 'Hide slide in slide show'),
    el('div', { class: 'p-note' }, t('Select an object on the slide to format it. Double-click text to edit.'))));
  b.append(sec('Presentation', F('Slide size', el('span', {}, `${E.doc.size.w} × ${E.doc.size.h}`)), F('Content language', selIn([['en', 'English'], ['he', 'עברית'], ['ar', 'العربية']], E.doc.lang || 'en', v => commit('Language', () => E.doc.lang = v)))));
}

// ---------- ANIMATION PANE ----------
function animPane(b) {
  const s = slide(); const o = sel1();
  b.append(el('div', { class: 'p-btnrow' }, el('button', { class: 'btn primary', onclick: () => previewAnimations() }, '▶ ' + t('Play All')), el('button', { class: 'btn', disabled: !o, onclick: (e) => D.dropdown(e.currentTarget, Object.entries(ANIMS).flatMap(([c, list]) => [[el('b', {}, t(c))], ...list.map(ty => [t(ty), () => run('addAnim', ty)])])) }, '+ ' + t('Add Animation')), el('button', { class: 'btn', onclick: () => D.motionStudio() }, t('Motion Studio'))));
  const tl = buildTimeline(s);
  const all = s.objects.flatMap(ob => (ob.anims || []).map(a => ({ a, o: ob }))).sort((x, y) => (x.a.order ?? 0) - (y.a.order ?? 0));
  if (!all.length) b.append(el('div', { class: 'p-empty' }, t('No animations on this slide. Select an object and choose an effect from the Animations tab.')));
  const list = el('div', { class: 'anim-list' });
  for (const { a, o: ob } of all) {
    const it = tl.items.find(x => x.a.id === a.id); const stepN = it ? it.step + 1 : '⚡';
    const row = el('div', { class: 'anim-item ' + a.cat + (E.selAnim === a.id ? ' on' : ''), onclick: () => { E.selAnim = a.id; select([ob.id]); refreshPanel(true); } },
      el('span', { class: 'an-step' }, a.trigger ? '⚡' : a.start === 'click' ? String(stepN) : ''), el('span', { class: 'an-ic' }, a.start === 'with' ? '≡' : a.start === 'after' ? '⏲' : '\u{1F5B1}'),
      el('span', { class: 'an-name' }, `${t(a.type)} — ${ob.name || (ob.text || ob.type).slice(0, 24)}`), el('span', { class: 'an-bar', style: `margin-inline-start:${Math.min(60, (it?.t0 || 0) * 12)}px;width:${Math.max(8, Math.min(120, (a.dur || .5) * (a.repeat || 1) * 24))}px` }),
      el('button', { class: 'mini', title: t('Move Earlier'), onclick: (e) => { e.stopPropagation(); E.selAnim = a.id; run('animMove', -1); } }, '▲'), el('button', { class: 'mini', title: t('Move Later'), onclick: (e) => { e.stopPropagation(); E.selAnim = a.id; run('animMove', 1); } }, '▼'),
      el('button', { class: 'mini', title: t('Remove'), onclick: (e) => { e.stopPropagation(); commit('Remove animation', () => ob.anims = ob.anims.filter(x => x.id !== a.id)); } }, '✕'));
    list.append(row);
  }
  b.append(list);
  const cur = all.find(x => x.a.id === E.selAnim) || (o && o.anims?.length ? { a: o.anims.at(-1), o } : null);
  if (cur) {
    const a = cur.a, P = (k) => (v) => commit('Animation', () => a[k] = v, { merge: true });
    b.append(sec('Effect Options',
      F('Effect', selIn(Object.values(ANIMS).flat().map(x => [x, t(x)]), a.type, v => commit('Animation', () => { a.type = v; a.cat = ANIM_CAT[v]; }))),
      el('div', { class: 'p-grid2' }, F('Start', selIn([['click', 'On Click'], ['with', 'With Previous'], ['after', 'After Previous']], a.start, P('start'))), F('Duration (s)', numIn(a.dur, P('dur'), { step: .05, min: .05, dec: 2 })), F('Delay (s)', numIn(a.delay, P('delay'), { step: .05, min: 0, dec: 2 })), F('Repeat', numIn(a.repeat || 1, v => P('repeat')(Math.max(1, Math.round(v))), { min: 1 })),
        DIR_ANIMS.has(a.type) ? F('Direction', selIn(['left', 'right', 'top', 'bottom', 'tl', 'tr', 'bl', 'br'].map(d => [d, d]), a.dir, P('dir'))) : null, a.cat === 'motion' && a.type !== 'pathCustom' ? F('Distance', numIn(a.dist || 300, P('dist'), { min: 10 })) : null, F('Easing', selIn([['auto', 'Automatic'], ...EASE_NAMES.map(n => [n, n])], a.ease || 'auto', P('ease')))),
      F('Trigger', selIn([['', 'On click sequence'], ...s.objects.filter(x => x.id !== cur.o.id).map(x => [x.id, t('On Click of') + ' ' + (x.name || (x.text || x.type).slice(0, 20))])], a.trigger || '', v => P('trigger')(v || null))),
      ('text' in cur.o && a.cat === 'entrance') ? chkIn(a.byPara, P('byPara'), 'Animate text by paragraph') : null,
      a.type === 'pathCustom' ? el('div', { class: 'p-btnrow' }, el('button', { class: 'btn sm', onclick: () => { E.motionPath = { o: cur.o, a, recording: true }; a.path = a.path && a.path.length ? a.path : [[0, 0]]; drawStage(); D.toast(t('Click on the slide to add path points. Press Esc to finish.')); } }, t('Draw Custom Path')), el('button', { class: 'btn sm', onclick: () => commit('Clear path', () => a.path = [[0, 0]]) }, t('Clear Path'))) : null,
      el('div', { class: 'p-btnrow' }, el('button', { class: 'btn sm', onclick: () => previewAnimations() }, '▶ ' + t('Preview')), el('button', { class: 'btn sm', onclick: () => run('animPainter') }, t('Animation Painter')))));
  }
}
Object.assign(CMD, {
  setAnim: (ty) => { const os = selObjs(); if (!os.length) { D.toast(t('Select an object to animate.')); return; } commit('Animation', () => { let mx = Math.max(0, ...slide().objects.flatMap(x => (x.anims || []).map(q => q.order || 0))); os.forEach((o, i) => { const a = newAnim(ty, i ? 'with' : 'click'); a.order = ++mx; o.anims = (o.anims || []).filter(x => x.cat !== a.cat); o.anims.push(a); E.selAnim = a.id; }); }); setTimeout(() => previewAnimations(), 50); },
  addAnim: (ty) => { const os = selObjs(); if (!os.length) { D.toast(t('Select an object to animate.')); return; } commit('Add animation', () => { let mx = Math.max(0, ...slide().objects.flatMap(x => (x.anims || []).map(q => q.order || 0))); os.forEach((o, i) => { const a = newAnim(ty, i ? 'with' : 'click'); a.order = ++mx; (o.anims = o.anims || []).push(a); E.selAnim = a.id; }); }); },
  animProp: (props) => { const os = selObjs(); commit('Animation', () => os.forEach(o => { const a = (o.anims || []).find(x => x.id === E.selAnim) || o.anims?.at(-1); if (a) Object.assign(a, props); }), { merge: true }); },
  animMove: (d) => { const s = slide(); const all = s.objects.flatMap(o => (o.anims || [])).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); const id = E.selAnim || sel1()?.anims?.at(-1)?.id; const i = all.findIndex(a => a.id === id); const j = i + d; if (i < 0 || j < 0 || j >= all.length) return; commit('Reorder animation', () => { [all[i], all[j]] = [all[j], all[i]]; all.forEach((a, k) => a.order = k + 1); }); },
});

// ---------- TRANSITION STUDIO ----------
const thumbSrc = (() => { let c = null; return () => { if (c) return c; const mk = (bg, fg, txt, acc) => { const x = document.createElement('canvas'); x.width = 192; x.height = 108; const g = x.getContext('2d'); const gr = g.createLinearGradient(0, 0, 192, 108); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]); g.fillStyle = gr; g.fillRect(0, 0, 192, 108); g.fillStyle = acc; g.beginPath(); g.arc(150, 30, 22, 0, 7); g.fill(); g.fillRect(16, 78, 70, 6); g.fillStyle = fg; g.font = '700 26px Segoe UI, Arial'; g.fillText(txt, 16, 60); return x; }; c = { a: mk(['#1b1f3b', '#0f1222'], '#fff', 'Ideas', '#6c8cff'), b: mk(['#fff3ea', '#ffd9bd'], '#1d1f24', 'Present', '#f26a1b') }; return c; }; })();
const miniDoc = { size: { w: 192, h: 108 }, theme: themeById('lasteast'), master: {}, assets: {}, lang: 'en' };
function miniSlides() {
  const mk = (bg, objs) => ({ id: 's', bg: { type: 'solid', color: bg }, objects: objs, transition: {} });
  const o1 = { id: 'a', mid: 'm1', name: '!!orb', type: 'shape', shape: 'ellipse', x: 128, y: 8, w: 44, h: 44, rot: 0, opacity: 1, fill: '#6c8cff', stroke: 'none', text: '' }, t1 = { id: 'b', mid: 'm2', name: '!!t', type: 'text', shape: 'rect', fill: 'none', stroke: 'none', x: 12, y: 36, w: 120, h: 34, rot: 0, opacity: 1, text: 'Ideas', size: 24, bold: true, color: '#ffffff', font: 'Segoe UI', align: 'left', valign: 'middle', pad: 4, autofit: false, lineHeight: 1.2, paraSpace: 0, bullets: 'none', dir: 'ltr' };
  const o2 = { ...o1, id: 'c', x: 18, y: 54, w: 36, h: 36, fill: '#f26a1b' }, t2 = { ...t1, id: 'd', x: 64, y: 22, text: 'Present', color: '#1d1f24', size: 26 }, bar = { id: 'e', mid: 'm3', type: 'shape', shape: 'roundRect', radius: 3, x: 64, y: 70, w: 90, h: 7, rot: 0, opacity: 1, fill: '#d6361f', stroke: 'none', text: '' };
  return [mk('#141833', [o1, t1]), mk('#fff3ea', [o2, t2, bar])];
}
const thumbLoops = new Set(), libLoops = new Set();
function animThumb(c, id, auto) {
  const g = c.getContext('2d'); let prep = null, raf = 0, t0 = 0, active = false;
  const draw0 = () => { g.drawImage(thumbSrc().a, 0, 0, c.width, c.height); };
  const make = () => { if (prep) return prep; const [sa, sb] = miniSlides(); const A = thumbSrc().a, B = thumbSrc().b; const ca = document.createElement('canvas'); ca.width = 192; ca.height = 108; renderSlide(ca.getContext('2d'), miniDoc, sa, { scale: 1, present: true }); const cb = document.createElement('canvas'); cb.width = 192; cb.height = 108; renderSlide(cb.getContext('2d'), miniDoc, sb, { scale: 1, present: true }); const useObj = ['morph', 'magnetic', 'gravity'].includes(getT(id).kind); prep = prepareTransition({ doc: miniDoc, from: { slide: sa, canvas: useObj ? ca : A }, to: { slide: sb, canvas: useObj ? cb : B }, transition: { type: id, params: defaultParams(id), easing: 'easeInOut' }, perf: true }); return prep; };
  const loop = (now) => { if (!active) return; const p = ((now - t0) / 1600) % 1.4; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); try { make().draw(g, Math.min(1, p), c.width / 192, 0, 0); } catch (e) { draw0(); } raf = requestAnimationFrame(loop); };
  const set = auto ? thumbLoops : libLoops;
  const start = () => { if (active) return; active = true; t0 = performance.now(); raf = requestAnimationFrame(loop); set.add(stop); };
  const stop = () => { active = false; cancelAnimationFrame(raf); draw0(); set.delete(stop); };
  draw0();
  if (auto) start(); else { c.addEventListener('mouseenter', start); c.addEventListener('mouseleave', stop); }
  return { start, stop };
}
function transPane(b) {
  [...thumbLoops, ...libLoops].forEach(f => f());
  const s = slide(), tr = s.transition || { type: 'none' }, T = getT(tr.type);
  const apply = (props) => run('setTransition', props);
  // Signature section
  const sig = el('div', { class: 'sig-grid' });
  for (const id of SIGNATURE) {
    const d = getT(id), c = el('canvas', { width: 192, height: 108 });
    sig.append(el('div', { class: 'sig-card' + (tr.type === id ? ' on' : ''), onclick: () => apply({ type: id, params: defaultParams(id) }) }, c, el('div', { class: 'sig-badge' }, '✦ ' + t('Signature')), el('div', { class: 'sig-meta' }, el('b', {}, t(d.name)), el('small', {}, t(d.use || ''))), el('button', { class: 'fav', title: t('Favorite'), html: E.favorites.has(id) ? ICONS.heartFill : ICONS.heart, onclick: (e) => { e.stopPropagation(); toggleFav(id); } })));
    animThumb(c, id, true);
  }
  b.append(el('div', { class: 'sig-head' }, el('span', { html: ICONS.logo, class: 'sig-logo' }), el('b', {}, t('Lasteast Signature')), el('button', { class: 'btn sm', onclick: () => run('showcase') }, t('Signature Showcase'))), sig);
  // Library
  const q = el('input', { type: 'search', placeholder: t('Search transitions'), value: E.trSearch || '', oninput: (e) => { E.trSearch = e.target.value; renderLib(); } });
  const chips = el('div', { class: 'chips' }); const cats = ['all', 'favorites', 'recent', ...CATEGORIES.filter(c => c !== 'signature')];
  for (const c of cats) chips.append(el('button', { class: 'chip' + ((E.trCat || 'all') === c ? ' on' : ''), onclick: () => { E.trCat = c; refreshPanel(true); } }, t(c === 'exclusive' ? 'Lasteast Exclusive' : c === '3d' ? '3D' : c[0].toUpperCase() + c.slice(1))));
  const lib = el('div', { class: 'tr-lib' });
  const renderLib = () => {
    libLoops.forEach(f => f()); lib.innerHTML = ''; const qq = (E.trSearch || '').toLowerCase(), cat = E.trCat || 'all';
    let list = TRANSITIONS.filter(x => !qq || x.name.toLowerCase().includes(qq) || t(x.name).toLowerCase().includes(qq) || x.cat.includes(qq));
    if (cat === 'favorites') list = list.filter(x => E.favorites.has(x.id)); else if (cat === 'recent') list = E.recentT.map(getT).filter(x => list.includes(x)); else if (cat !== 'all') list = list.filter(x => x.cat === cat || (cat === 'morph' && x.kind === 'morph'));
    for (const x of list) { const c = el('canvas', { width: 128, height: 72 }); lib.append(el('div', { class: 'tr-card' + (tr.type === x.id ? ' on' : '') + (x.excl ? ' excl' : ''), title: t(x.name) + (x.desc ? ' — ' + t(x.desc) : ''), onclick: () => apply({ type: x.id, params: defaultParams(x.id) }) }, c, x.excl ? el('span', { class: 'excl-badge' }, 'L') : null, el('small', {}, t(x.name)), el('button', { class: 'fav', html: E.favorites.has(x.id) ? ICONS.heartFill : ICONS.heart, onclick: (e) => { e.stopPropagation(); toggleFav(x.id); renderLib(); } }))); animThumb(c, x.id, false); }
    if (!list.length) lib.append(el('div', { class: 'p-empty' }, t('No transitions found.')));
  };
  renderLib();
  b.append(sec('Transition Library', q, chips, lib));
  // Settings
  if (tr.type && tr.type !== 'none') {
    const params = { ...defaultParams(tr.type), ...(tr.params || {}) };
    const pset = (k) => (v) => apply({ params: { ...params, [k]: v } });
    const ctrls = T.params.map(p => p.type === 'range' ? F(p.label, rangeIn(params[p.key], pset(p.key), { min: p.min, max: p.max, step: p.step })) : p.type === 'sel' ? F(p.label, selIn(p.options.map((o, i) => [i, o]), params[p.key], v => pset(p.key)(+v))) : p.type === 'col' ? F(p.label, el('input', { type: 'color', value: toHex(params[p.key]), onchange: (e) => pset(p.key)(e.target.value) })) : null);
    b.append(sec('Settings — ' + t(T.name),
      T.desc ? el('div', { class: 'p-note' }, t(T.desc)) : null,
      el('div', { class: 'preset-row' }, ...Object.keys(PRESETS).map(n => el('button', { class: 'chip' + (tr.preset === n ? ' on' : ''), onclick: () => apply(applyPreset(tr, n)) }, t(n[0].toUpperCase() + n.slice(1))))),
      el('div', { class: 'p-grid2' }, F('Duration (s)', numIn(tr.duration, v => apply({ duration: v }), { step: .05, min: .05, dec: 2 })), F('Delay (s)', numIn(tr.delay || 0, v => apply({ delay: v }), { step: .05, min: 0, dec: 2 })), F('Easing', selIn(EASE_NAMES, tr.easing || 'easeInOut', v => apply({ easing: v }))), F('Sound', selIn(SOUNDS, tr.sound || 'none', v => apply({ sound: v })))),
      ...ctrls,
      el('div', { class: 'p-btnrow wrap' }, el('button', { class: 'btn primary', onclick: () => previewTransition() }, '▶ ' + t('Preview')), ...[.5, 1, 2].map(sp => el('button', { class: 'btn sm' + ((E.previewSpeed || 1) === 1 / sp ? ' on' : ''), onclick: () => { E.previewSpeed = 1 / sp; previewTransition(); } }, sp + '×')), el('button', { class: 'btn sm', onclick: () => D.transitionFullPreview() }, t('Full screen')), el('button', { class: 'btn sm', onclick: () => D.compareTransitions() }, t('Compare…')))));
    if (T.kind === 'morph') b.append(morphMatchSec(s));
  }
  b.append(sec('Timing',
    el('div', { class: 'p-row' }, chkIn(tr.onClick !== false, v => apply({ onClick: v }), 'On Mouse Click')),
    el('div', { class: 'p-row' }, chkIn(tr.after != null && tr.after !== '', v => apply({ after: v ? 5 : null }), 'Automatically After'), numIn(tr.after, v => apply({ after: v }), { min: 0, step: .5 })),
    el('div', { class: 'p-btnrow wrap' }, el('button', { class: 'btn', onclick: () => run('transitionToAll') }, t('Apply to All Slides')), el('button', { class: 'btn sm', onclick: () => { E.slideSel = E.slideSel || new Set([E.cur]); D.toast(t('Ctrl+click slides in the slide panel, then change the transition to apply it to all selected slides.')); } }, t('Apply to Selected Slides')), el('button', { class: 'btn sm', onclick: () => run('rehearse') }, t('Rehearse Timings')))));
  b.append(sec('Custom Presets',
    el('div', { class: 'p-btnrow wrap' }, ...customPresets().map((p, i) => el('span', { class: 'chip' }, el('button', { class: 'link', onclick: () => apply({ ...p.tr }) }, p.name), el('button', { class: 'link', title: t('Delete'), onclick: () => { const l = customPresets(); l.splice(i, 1); localStorage.setItem('lp.trPresets', JSON.stringify(l)); refreshPanel(true); } }, '✕')))),
    el('div', { class: 'p-btnrow' }, el('button', { class: 'btn sm', disabled: tr.type === 'none', onclick: async () => { const n = await D.prompt(t('Preset name'), t(T.name) + ' ' + (customPresets().length + 1)); if (!n) return; const l = customPresets(); l.push({ name: n, tr: deepClone(tr) }); localStorage.setItem('lp.trPresets', JSON.stringify(l)); refreshPanel(true); } }, t('Save Current as Preset')), el('button', { class: 'btn sm', onclick: () => downloadBlob(new Blob([JSON.stringify(customPresets(), null, 2)], { type: 'application/json' }), 'lasteast-transition-presets.json') }, t('Export')), el('button', { class: 'btn sm', onclick: async () => { const f = await pickFile('.json'); if (!f) return; try { const l = JSON.parse(await readAsText(f)); localStorage.setItem('lp.trPresets', JSON.stringify([...customPresets(), ...l.filter(x => x.tr && x.name)])); refreshPanel(true); } catch (e) { D.toast(t('Invalid preset file.')); } } }, t('Import'))),
    el('div', { class: 'p-note' }, t('Combinations: set a transition on a slide and add entrance animations to its objects; both are synchronized (animations start when the transition ends).'))));
}
const customPresets = () => JSON.parse(localStorage.getItem('lp.trPresets') || '[]');
function toggleFav(id) { E.favorites.has(id) ? E.favorites.delete(id) : E.favorites.add(id); saveFavs(); refreshPanel(true); }
function morphMatchSec(s) {
  const i = E.doc.slides.indexOf(s); if (i < 1) return sec('Morph Object Matching', el('div', { class: 'p-note' }, t('Morph animates from the previous slide. Add it to the second slide or later.')));
  const prev = E.doc.slides[i - 1], map = s.transition.morphMap || {};
  const m = matchObjects(prev, s, E.doc, +(s.transition.params?.matching || 0), map);
  const label = (o) => (o.name || (o.text || '').split('\n')[0] || o.shape || o.type).slice(0, 26);
  const rows = prev.objects.filter(o => o.type !== 'video' && o.type !== 'audio').map(a => {
    const pr = m.pairs.find(p => p.a.id === a.id);
    return el('div', { class: 'mm-row' }, el('span', { class: 'mm-a' }, label(a)), el('span', {}, '→'),
      selIn([['', pr && !map[a.id] ? '(' + t('auto') + ': ' + label(pr.b) + ')' : t('No match (fade out)')], ...s.objects.map(b => [b.id, label(b)])], map[a.id] || '', (v) => commit('Morph matching', () => { s.transition.morphMap = { ...(s.transition.morphMap || {}) }; if (v) s.transition.morphMap[a.id] = v; else delete s.transition.morphMap[a.id]; })),
      pr ? el('small', { class: 'mm-why' }, t(pr.why)) : null);
  });
  return sec('Morph Object Matching', el('div', { class: 'p-note' }, t('Match this object with an object on the next slide. Objects with the same name starting with !! always match.')), ...rows,
    el('div', { class: 'p-btnrow' }, el('button', { class: 'btn sm', onclick: () => commit('Morph matching', () => { const sug = suggestMatches(prev, s, E.doc); s.transition.morphMap = Object.fromEntries(sug.map(p => [p.a.id, p.b.id])); }) }, t('Accept suggestions')), el('button', { class: 'btn sm', onclick: () => commit('Morph matching', () => s.transition.morphMap = {}) }, t('Reset matching'))));
}
Object.assign(CMD, {
  setTransition: (props) => {
    const idx = E.slideSel?.size ? [...E.slideSel] : [E.cur];
    commit('Transition', () => idx.forEach(i => { const s = E.doc.slides[i]; s.transition = { ...(s.transition || {}), ...props }; if (props.type) { s.transition.preset = null; if (props.type !== 'none' && (s.transition.duration == null || props.params)) s.transition.duration = getT(props.type).sig ? 1.4 : getT(props.type).cat === '3d' || getT(props.type).cat === 'cinematic' || getT(props.type).excl ? 1.2 : .8; } }), { merge: !props.type });
    if (props.type && props.type !== 'none') { E.recentT = [props.type, ...E.recentT.filter(x => x !== props.type)].slice(0, 12); saveFavs(); }
    structural(); renderSlidesPanel(); refreshPanel(true);
    if (props.type && props.type !== 'none') previewTransition();
  },
  transitionToAll: () => { const tr = deepClone(slide().transition); commit('Apply transition to all', () => E.doc.slides.forEach((s, i) => s.transition = { ...deepClone(tr), morphMap: s.transition?.morphMap })); structural(); renderSlidesPanel(); D.toast(t('Applied to all slides.')); },
});

// ---------- CAMERA (per-slide) ----------
function cameraPane(b) {
  const s = slide(), base = E.doc.show.camera, cs = s.camera?.custom ? { ...base, ...s.camera } : base;
  const setS = (props) => commit('Camera for slide', () => { s.camera = { ...(s.camera || {}), custom: true, ...props }; }, { merge: true });
  b.append(el('div', { class: 'p-note' }, t('Selfie Presenter Mode shows your webcam during the slide show and in recordings. The camera is never turned on automatically.')),
    el('div', { class: 'p-btnrow' }, el('button', { class: 'btn primary', onclick: () => D.selfieStudio() }, t('Open Selfie Presenter Studio'))),
    sec('This slide',
      el('div', { class: 'p-row' }, chkIn(!!s.camera?.custom, v => commit('Camera for slide', () => { s.camera = v ? { custom: true } : null; }), 'Customize camera for current slide')),
      s.camera?.custom ? [
        chkIn(s.camera.enabled !== false, v => setS({ enabled: v }), 'Camera visible on this slide'),
        F('Position', selIn([['tl', 'Top Left'], ['tr', 'Top Right'], ['bl', 'Bottom Left'], ['br', 'Bottom Right']], cs.corner, v => setS({ corner: v }))),
        F('Size', rangeIn(cs.size, v => setS({ size: v }), { min: .08, max: .6, step: .01, pct: true })),
        F('Shape', selIn(CAM_SHAPES.map(x => [x, x]), cs.shape, v => setS({ shape: v }))),
        F('Layout', selIn([['bubble', 'Presenter Bubble'], ['pip', 'Picture-in-Picture'], ['card', 'Presenter Card'], ['side', 'Side-by-Side'], ['full', 'Full Presenter'], ['floating', 'Floating']], cs.layout, v => setS({ layout: v }))),
        F('Border', el('input', { type: 'color', value: toHex(cs.border || '#f26a1b'), onchange: (e) => setS({ border: e.target.value }) })),
        F('Background', selIn([['none', 'None'], ['blurLight', 'Light Blur'], ['blur', 'Medium Blur'], ['blurStrong', 'Strong Blur'], ['office', 'Office'], ['classroom', 'Classroom'], ['studio', 'Studio'], ['interior', 'Modern Interior'], ['library', 'Library'], ['neutral', 'Neutral'], ['remove', 'Remove background']], cs.bgEffect, v => setS({ bgEffect: v }))),
        F('Presenter name', textIn(cs.name, v => setS({ name: v }))), F('Presenter title', textIn(cs.title, v => setS({ title: v }))),
      ] : null,
      el('div', { class: 'p-btnrow wrap' }, el('button', { class: 'btn sm', onclick: () => commit('Camera reset', () => s.camera = null) }, t('Reset Camera Settings')), el('button', { class: 'btn sm', onclick: () => commit('Camera to all', () => E.doc.slides.forEach(x => x.camera = null)) }, t('Use Same Camera Settings for All Slides')), el('button', { class: 'btn sm', disabled: !E.slideSel?.size, onclick: () => commit('Camera to selected', () => [...E.slideSel].forEach(i => E.doc.slides[i].camera = deepClone(s.camera))) }, t('Apply Settings to Selected Slides')))));
}

// ---------- COMMENTS ----------
function commentsPane(b) {
  const s = slide(); const user = localStorage.getItem('lp.user') || t('You');
  const add = el('textarea', { placeholder: t('Start a conversation…'), dir: 'auto', rows: 3 });
  b.append(el('div', { class: 'cm-new' }, add, el('div', { class: 'p-btnrow' }, el('button', { class: 'btn primary', onclick: () => { if (!add.value.trim()) return; commit('Comment', () => s.comments.push({ id: uid('c'), author: user, text: add.value.trim(), t: Date.now(), replies: [], resolved: false, obj: E.sel[0] || null })); } }, t('Post')), el('button', { class: 'btn sm', onclick: async () => { const n = await D.prompt(t('Your name for comments'), user); if (n) { localStorage.setItem('lp.user', n); refreshPanel(true); } } }, t('Name: ') + user))));
  if (!s.comments.length) b.append(el('div', { class: 'p-empty' }, t('No comments on this slide.')));
  for (const c of s.comments) {
    const rep = el('input', { placeholder: t('Reply…'), dir: 'auto', onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) commit('Reply', () => c.replies.push({ author: user, text: e.target.value.trim(), t: Date.now() })); } });
    b.append(el('div', { class: 'cm' + (c.resolved ? ' resolved' : '') },
      el('div', { class: 'cm-h' }, el('b', {}, c.author), el('small', {}, new Date(c.t).toLocaleString(getLang())), c.obj ? el('button', { class: 'link', onclick: () => select([c.obj]) }, t('Show object')) : null),
      el('div', { class: 'cm-t', dir: 'auto' }, c.text), ...c.replies.map(r => el('div', { class: 'cm-r', dir: 'auto' }, el('b', {}, r.author + ': '), r.text)),
      c.resolved ? null : rep,
      el('div', { class: 'p-btnrow' }, el('button', { class: 'btn sm', onclick: () => commit('Resolve', () => c.resolved = !c.resolved) }, c.resolved ? t('Reopen') : t('Resolve')), el('button', { class: 'btn sm', onclick: () => commit('Delete comment', () => s.comments = s.comments.filter(x => x !== c)) }, t('Delete')))));
  }
}
on('newComment', () => setTimeout(() => $('.cm-new textarea')?.focus(), 50));
Object.assign(CMD, { commentNav: (d) => { const n = E.doc.slides.length; for (let k = 1; k <= n; k++) { const i = (E.cur + d * k + n * 2) % n; if (E.doc.slides[i].comments?.some(c => !c.resolved)) { CMD.panel('comments'); import('./state.js').then(m => m.setCur(i)); return; } } D.toast(t('No more comments.')); } });

// ---------- SELECTION PANE (layers) ----------
function layersPane(b) {
  const s = slide();
  b.append(el('div', { class: 'p-btnrow' }, el('button', { class: 'btn sm', onclick: () => commit('Show all', () => s.objects.forEach(o => o.hidden = false)) }, t('Show All')), el('button', { class: 'btn sm', onclick: () => commit('Hide all', () => s.objects.forEach(o => o.hidden = true)) }, t('Hide All'))));
  const list = el('div', { class: 'layer-list' });
  [...s.objects].reverse().forEach((o) => {
    const name = el('input', { value: o.name || (o.text || '').split('\n')[0].slice(0, 30) || `${o.type} ${o.shape || ''}`, dir: 'auto', onchange: (e) => commit('Rename', () => o.name = e.target.value), onfocus: () => select([o.id]) });
    list.append(el('div', { class: 'layer' + (E.sel.includes(o.id) ? ' on' : ''), onclick: (e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') select([o.id], e.ctrlKey || e.shiftKey); } },
      el('span', { class: 'lt' }, { text: 'T', shape: '■', image: '▣', table: '▦', chart: '▁▃▅', video: '▶', audio: '♪' }[o.type] || '?'), name,
      o.group ? el('small', { class: 'grp' }, 'G') : null,
      el('button', { class: 'mini', title: t('Show/Hide in slide show'), onclick: () => commit('Visibility', () => o.hidden = !o.hidden) }, o.hidden ? '◌' : '◉'),
      el('button', { class: 'mini', title: t('Lock'), html: o.locked ? ICONS.lock : ICONS.unlock, onclick: () => commit('Lock', () => o.locked = !o.locked) }),
      el('button', { class: 'mini', title: t('Bring Forward'), onclick: () => { select([o.id]); run('order', 'forward'); } }, '▲'), el('button', { class: 'mini', title: t('Send Backward'), onclick: () => { select([o.id]); run('order', 'backward'); } }, '▼')));
  });
  b.append(list, el('div', { class: 'p-note' }, t('Hidden objects are not shown in the slide show. Locked objects cannot be moved on the canvas.')));
}

// ---------- AI ----------
function aiPane(b) {
  const ready = AI.aiReady();
  b.append(el('div', { class: 'ai-head' }, el('span', { html: ICONS.ai }), el('b', {}, t('AI Presentation Assistant'))));
  if (!ready) { b.append(el('div', { class: 'p-note warn' }, t('No AI provider is connected. AI features stay disabled until you add a provider and API key — nothing is simulated.')), el('button', { class: 'btn primary', onclick: () => D.aiSettings() }, t('Connect an AI provider…'))); }
  const act = (label, fn, needSel) => el('button', { class: 'btn ai-act', disabled: !ready || (needSel && !sel1()?.text), onclick: fn }, t(label));
  b.append(sec('Create', act('Generate presentation from a topic', () => D.aiGenerate()), act('Generate from PDF, DOCX or TXT', () => D.aiGenerate({ fromFile: true })), act('Generate outline only', () => D.aiGenerate({ outlineOnly: true })), act('Create quiz', () => D.quizBuilder({ ai: true })), act('Create educational presentation', () => D.aiGenerate({ tone: 'educational' }))));
  b.append(sec('Selected text', act('Rewrite professionally', () => run('aiText', 'rewrite'), true), act('Summarize', () => run('aiText', 'summarize'), true), act('Correct spelling & grammar', () => run('aiText', 'grammar'), true), act('Suggest slide titles', () => run('aiText', 'titles')), act('Suggest images', () => run('aiText', 'images'))));
  b.append(sec('This presentation', act('Generate speaker notes (this slide)', () => run('aiNotes')), act('Generate speaker notes (all slides)', () => run('aiNotes', true)), act('Translate presentation', () => D.translateDialog()), act('Improve visual consistency & suggest layouts, animations, transitions', () => D.aiDesignStudio()), act('Generate diagram from text', () => D.diagramDialog({ ai: true })), act('Generate design theme', () => D.aiTheme())));
  const cfg = AI.aiConfig(); b.append(el('div', { class: 'p-note' }, t('Usage') + `: ${cfg.usage?.requests || 0} ${t('requests')}, ${cfg.usage?.inTok || 0}/${cfg.usage?.outTok || 0} ${t('tokens in/out')}`), el('button', { class: 'btn sm', onclick: () => D.aiSettings() }, t('AI Settings…')));
}
Object.assign(CMD, {
  aiText: async (kind) => {
    const o = sel1(); const src = o?.text || slide().objects.filter(x => x.text).map(x => x.text).join('\n');
    if (!src) { D.toast(t('Select a text box first.')); return; }
    const job = D.busy(t('AI is working…'));
    try {
      if (kind === 'titles' || kind === 'images') { const r = await (kind === 'titles' ? AI.suggestTitles(src) : AI.suggestImages(src)); job.done(); const lines = r.split('\n').map(x => x.trim()).filter(Boolean); D.pickList(t(kind === 'titles' ? 'Suggested titles' : 'Suggested images'), lines, (line) => { if (kind === 'titles') { const ti = slide().objects.find(x => x.ph === 'title'); if (ti) commit('Title', () => ti.text = line); } else D.onlineImage(line.split('—')[0].trim()); }); return; }
      const out = await ({ rewrite: () => AI.rewrite(o.text, 'professional', E.doc.lang), summarize: () => AI.summarize(o.text), grammar: () => AI.grammar(o.text) })[kind]();
      job.done(); D.compareText(o.text, out, () => commit('AI ' + kind, () => o.text = out));
    } catch (e) { job.done(); D.aiError(e); }
  },
  aiNotes: async (all) => {
    const idx = all ? E.doc.slides.map((s, i) => i) : [E.cur]; const job = D.busy(t('Writing speaker notes…'));
    try { const res = []; for (const i of idx) { const s = E.doc.slides[i]; const txt = s.objects.filter(o => o.text).map(o => o.text).join('\n'); if (!txt.trim()) continue; res.push([i, await AI.speakerNotes(txt, E.doc.title)]); job.update(`${res.length}/${idx.length}`); } job.done(); commit('AI notes', () => res.forEach(([i, n]) => E.doc.slides[i].notes = n)); D.toast(t('Speaker notes added.')); }
    catch (e) { job.done(); D.aiError(e); }
  },
});
