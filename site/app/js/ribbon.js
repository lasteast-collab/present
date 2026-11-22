// Lasteast Present — ribbon interface
import { el, $, $$ } from './util.js';
import { E, on, emit, sel1, selObjs, slide, commit, savePrefs } from './state.js';
import { t } from './i18n.js';
import { ICONS, CONTENT_ICONS } from './icons.js';
import { run, previewTransition, previewAnimations, startShow } from './editor.js';
import * as D from './dialogs.js';
import { LAYOUTS, THEMES, SIZES, newDoc, resolveColor } from './model.js';
import { SHAPES, CHART_TYPES } from './renderer.js';
import { ANIMS, newAnim } from './animations.js';
import { TRANSITIONS, SIGNATURE, getT, defaultParams, SOUNDS } from './transitions.js';

const TABS = ['File', 'Home', 'Insert', 'Design', 'Transitions', 'Animations', 'Slide Show', 'Record', 'Review', 'View', 'AI'];
let cur = localStorage.getItem('lp.tab') || 'Home', body, stateFns = [];
export const FONTS = ['Segoe UI', 'Arial', 'Calibri', 'Aptos', 'Inter', 'Poppins', 'Helvetica Neue', 'Times New Roman', 'Georgia', 'Garamond', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Consolas', 'Courier New', 'Impact', 'Comic Sans MS', 'David', 'FrankRuehl', 'Miriam', 'Narkisim', 'Noto Sans Hebrew', 'Rubik', 'Assistant', 'Heebo', 'Noto Sans Arabic', 'Noto Naskh Arabic', 'Amiri', 'Cairo', 'Tajawal', 'Arial Unicode MS'];
export const SIZES_PT = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 96, 120, 144, 180];

let rootEl = null, ctxShown = null;
const ctxTab = () => { const os = selObjs(); if (!os.length) return null; return os.every(o => o.type === 'image') ? 'Picture Format' : os.every(o => o.type === 'table') ? 'Table Design' : os.every(o => o.type === 'chart') ? 'Chart Design' : 'Shape Format'; };
export function buildRibbon(root) {
  rootEl = root; stateFns = [];
  const ctx = ctxTab(); ctxShown = ctx;
  if (!ctx && /Format|Design$/.test(cur) && !TABS.includes(cur)) cur = 'Home';
  if (ctx && /Format$|Table Design|Chart Design/.test(cur) && cur !== ctx) cur = ctx;
  const tabs = el('div', { class: 'r-tabs', role: 'tablist' });
  for (const tb of [...TABS, ...(ctx ? [ctx] : [])]) tabs.append(el('button', { class: 'r-tab' + (tb === cur ? ' on' : '') + (tb === 'File' ? ' file' : '') + (tb === 'AI' ? ' ai' : '') + (tb === ctx ? ' ctx' : ''), role: 'tab', 'data-tab': tb, onclick: () => { if (tb === 'File') return D.backstage(); cur = tb; localStorage.setItem('lp.tab', tb); buildRibbon(root); } }, t(tb)));
  tabs.append(el('button', { class: 'r-collapse', title: t('Collapse ribbon'), onclick: () => root.classList.toggle('collapsed') }, '˄'));
  body = el('div', { class: 'r-body' });
  root.innerHTML = ''; root.append(tabs, body);
  const sl = el('button', { class: 'r-scroll l', 'aria-label': 'scroll', onclick: () => body.scrollBy({ left: -300 }) }, '\u2039'), sr = el('button', { class: 'r-scroll r', 'aria-label': 'scroll', onclick: () => body.scrollBy({ left: 300 }) }, '\u203A');
  root.append(sl, sr);
  const upd = () => { const max = body.scrollWidth - body.clientWidth, x = Math.abs(body.scrollLeft), rtl = getComputedStyle(body).direction === 'rtl'; const a = max > 4 && x > 4, b = max > 4 && x < max - 4; root.classList.toggle('ovl', rtl ? b : a); root.classList.toggle('ovr', rtl ? a : b); };
  body.addEventListener('scroll', upd); new ResizeObserver(upd).observe(body); setTimeout(upd, 50);
  body.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && body.scrollWidth > body.clientWidth) { e.preventDefault(); body.scrollBy({ left: e.deltaY }); } }, { passive: false });
  (BUILD[cur] || (/Format$|Table Design|Chart Design/.test(cur) ? BUILD.Format : BUILD.Home))();
  updateState();
}
on('ribbonState', () => updateState()); on('select', () => { if (rootEl && ctxTab() !== ctxShown) buildRibbon(rootEl); else updateState(); }); on('change', () => updateState()); on('slide', () => updateState());
function updateState() { for (const f of stateFns) try { f(); } catch (e) { } }

// ---- builders ----
const grp = (label, ...items) => { const g = el('div', { class: 'r-group' }, el('div', { class: 'r-items' }, ...items.flat()), el('div', { class: 'r-label' }, t(label))); body.append(g); return g; };
const col = (...items) => el('div', { class: 'r-col' }, ...items);
const row = (...items) => el('div', { class: 'r-row' }, ...items);
function big(ic, label, fn, opts = {}) {
  const b = el('button', { class: 'r-big' + (opts.menu ? ' has-menu' : ''), title: t(opts.tip || label), onclick: (e) => opts.menu && !fn ? D.dropdown(e.currentTarget, opts.menu()) : fn(e) }, el('span', { class: 'ic', html: ICONS[ic] || ic }), el('span', { class: 'lb' }, t(label)));
  if (opts.menu && fn) { const arrow = el('span', { class: 'arrow', onclick: (e) => { e.stopPropagation(); D.dropdown(b, opts.menu()); } }, '▾'); b.append(arrow); }
  else if (opts.menu) b.append(el('span', { class: 'arrow' }, '▾'));
  if (opts.active) stateFns.push(() => b.classList.toggle('on', !!opts.active()));
  if (opts.enabled) stateFns.push(() => b.disabled = !opts.enabled());
  return b;
}
function sm(ic, label, fn, opts = {}) {
  const b = el('button', { class: 'r-sm' + (opts.iconOnly ? ' icon-only' : ''), title: t(opts.tip || label), 'aria-label': t(label), onclick: (e) => opts.menu ? D.dropdown(e.currentTarget, opts.menu()) : fn(e) }, el('span', { class: 'ic', html: ICONS[ic] || ic }), opts.iconOnly ? null : el('span', { class: 'lb' }, t(label)), opts.menu ? el('span', { class: 'arrow' }, '▾') : null);
  if (opts.active) stateFns.push(() => b.classList.toggle('on', !!opts.active()));
  if (opts.enabled) stateFns.push(() => b.disabled = !opts.enabled());
  if (opts.swatch) stateFns.push(() => { const sw = b.querySelector('.swatch'); if (sw) sw.setAttribute('stroke', opts.swatch() || 'currentColor'); });
  return b;
}
const ico = (ic, label, fn, opts = {}) => sm(ic, label, fn, { ...opts, iconOnly: true });
function select(options, get, set, opts = {}) {
  const s = el('select', { class: 'r-select ' + (opts.cls || ''), title: t(opts.tip || ''), style: opts.width ? `width:${opts.width}px` : '', onchange: (e) => set(e.target.value) }, ...options.map(o => Array.isArray(o) ? el('option', { value: o[0] }, o[1]) : el('option', { value: o }, o)));
  stateFns.push(() => { const v = get(); if (v != null && document.activeElement !== s) { if (![...s.options].some(o => o.value == v)) s.append(el('option', { value: v }, String(v).split(',')[0])); s.value = v; } s.disabled = opts.enabled ? !opts.enabled() : false; });
  return s;
}
function colorBtn(ic, label, get, set) {
  const inp = el('input', { type: 'color', class: 'hidden-color', oninput: (e) => set(e.target.value) });
  const b = sm(ic, label, () => D.colorMenu(b, set, inp), { iconOnly: true, swatch: () => { const v = get(); return v ? resolveColor(v, E.doc.theme) : null; } });
  return el('span', { class: 'color-wrap' }, b, inp);
}
function colorBtnL(ic, label, get, set) { const inp = el('input', { type: 'color', class: 'hidden-color', oninput: (e) => set(e.target.value) }); const b = sm(ic, label, () => D.colorMenu(b, set, inp), { swatch: () => { const v = get(); return v ? resolveColor(v, E.doc.theme) : null; } }); return el('span', { class: 'color-wrap' }, b, inp); }
const num = (get, set, opts = {}) => { const i = el('input', { type: 'number', class: 'r-num', step: opts.step || .1, min: opts.min ?? 0, max: opts.max ?? 999, title: t(opts.tip || ''), onchange: (e) => set(+e.target.value) }); stateFns.push(() => { if (document.activeElement !== i) { const v = get(); i.value = v ?? ''; } }); return i; };
const chk = (label, get, set) => { const i = el('input', { type: 'checkbox', onchange: (e) => set(e.target.checked) }); stateFns.push(() => i.checked = !!get()); return el('label', { class: 'r-chk' }, i, ' ', t(label)); };

const textSel = () => selObjs().filter(o => 'text' in o || o.type === 'table');
const hasText = () => textSel().length > 0;
const tv = (k) => textSel()[0]?.[k];
const S = (props, label) => run('set', props, label);
const forTr = () => (E.slideSel?.size ? [...E.slideSel] : [E.cur]);

export const shapeMenu = (fn) => SHAPES.map(s => [el('span', { class: 'shape-ic', html: shapeSvg(s) }), () => fn(s), s]);
export function shapeSvg(s) { const pts = (function () { try { return window.__shapePts(s); } catch (e) { return null; } })(); return pts ? `<svg viewBox="-2 -2 28 28"><polygon points="${pts}" fill="currentColor" opacity=".85"/></svg>` : `<svg viewBox="0 0 24 24"><path d="M2 12h20" stroke="currentColor" stroke-width="2.5" ${s === 'arrowLine' ? 'marker-end="url(#)"' : ''}/>${s === 'arrowLine' ? '<path d="M16 7l6 5-6 5" fill="none" stroke="currentColor" stroke-width="2.5"/>' : ''}</svg>`; }

const effMenu = () => [[t('Shadow'), () => S(o => ({ shadow: o.shadow ? null : { color: 'rgba(0,0,0,.35)', blur: 18, x: 6, y: 8 } }))], [t('Glow'), () => S(o => ({ glow: o.glow ? null : { color: '@accent', size: 24 } }))], [t('Reflection'), () => S(o => ({ reflection: !o.reflection }))], [t('Soft shadow (subtle)'), () => S({ shadow: { color: 'rgba(0,0,0,.18)', blur: 30, x: 0, y: 10 } })], [t('No effects'), () => S({ shadow: null, glow: null, reflection: false })]];
const BUILD = {
  Format() {
    const o = () => selObjs()[0]; const types = new Set(selObjs().map(x => x.type));
    if (types.has('shape') || types.has('text')) {
      grp('Insert Shapes', big('shapes', 'Shapes', null, { menu: () => shapeMenu(sh => run('insertMode', 'shape:' + sh)) }), col(sm('shapes', 'Change Shape', null, { menu: () => shapeMenu(sh => S({ shape: sh, type: 'shape' }, 'Change shape')) }), sm('textbox', 'Text Box', () => run('insertMode', 'text'))));
      grp('Shape Styles', el('div', { class: 'r-gallery qs-gal' }, ...quickStyles().map(([lab, fn]) => el('button', { class: 'qs-tile', onclick: fn }, lab))), col(colorBtnL('fill', 'Shape Fill', () => typeof o()?.fill === 'string' ? o().fill : null, (c) => S({ fill: c })), colorBtnL('outline', 'Shape Outline', () => o()?.stroke, (c) => S({ stroke: c, strokeW: Math.max(2, o()?.strokeW || 0) })), sm('wand', 'Shape Effects', null, { menu: effMenu })));
      grp('WordArt Styles', big('wordart', 'Quick Styles', null, { menu: wordartMenu2 }), col(colorBtnL('fontColor', 'Text Fill', () => o()?.color, (c) => S({ color: c })), colorBtnL('outline', 'Text Outline', () => o()?.textOutline?.color, (c) => S({ textOutline: c === 'none' ? null : { color: c, width: 2 } })), sm('wand', 'Text Effects', null, { menu: () => [[t('Shadow'), () => S(q => ({ textShadow: q.textShadow ? null : { color: 'rgba(0,0,0,.4)', blur: 8, x: 3, y: 3 } }))], [t('Glow'), () => S(q => ({ glow: q.glow ? null : { color: '@accent', size: 20 } }))], [t('Gradient text'), () => S(q => ({ textGradient: q.textGradient ? null : { c1: '@accent', c2: '@accent2' } }))], [t('Reflection'), () => S(q => ({ reflection: !q.reflection }))]] })));
    }
    if (types.has('image')) {
      grp('Adjust', big('sun', 'Corrections', null, { menu: () => [[t('Brighter'), () => S(q => ({ filters: { ...q.filters, brightness: (q.filters?.brightness ?? 100) + 15 } }))], [t('Darker'), () => S(q => ({ filters: { ...q.filters, brightness: (q.filters?.brightness ?? 100) - 15 } }))], [t('More contrast'), () => S(q => ({ filters: { ...q.filters, contrast: (q.filters?.contrast ?? 100) + 15 } }))], [t('Less contrast'), () => S(q => ({ filters: { ...q.filters, contrast: (q.filters?.contrast ?? 100) - 15 } }))], '-', [t('Reset Picture'), () => S({ filters: {} })]] }), big('colors', 'Color', null, { menu: () => [['Original', {}], ['Grayscale', { grayscale: 100 }], ['Sepia', { sepia: 80 }], ['Vivid', { saturate: 160, contrast: 110 }], ['Washout', { brightness: 130, contrast: 70 }], ['Cool', { hue: 190, saturate: 80 }], ['Warm', { sepia: 30, saturate: 130 }]].map(([l, f]) => [t(l), () => S({ filters: f }, 'Picture color')]) }), col(sm('wipe', 'Remove Background', () => run('removeBg', o())), sm('picture', 'Compress Pictures', () => run('compressImage', o())), sm('reset', 'Reset Picture', () => S({ crop: { l: 0, t: 0, r: 0, b: 0 }, filters: {}, mask: 'rect', radius: 0 }))));
      grp('Picture Styles', el('div', { class: 'r-gallery qs-gal' }, ...[['Simple frame', { stroke: '#ffffff', strokeW: 8, shadow: { color: 'rgba(0,0,0,.3)', blur: 16, x: 0, y: 6 }, mask: 'rect', radius: 0 }], ['Rounded', { radius: 28, mask: 'rect', stroke: 'none', strokeW: 0, shadow: { color: 'rgba(0,0,0,.25)', blur: 20, x: 0, y: 8 } }], ['Circle', { mask: 'ellipse', stroke: 'none', strokeW: 0 }], ['Soft edge', { radius: 12, shadow: { color: 'rgba(0,0,0,.18)', blur: 30, x: 0, y: 10 } }], ['Accent border', { stroke: '@accent', strokeW: 6, radius: 0, mask: 'rect' }], ['Reflected', { reflection: true, radius: 10 }]].map(([l, st]) => el('button', { class: 'qs-tile', onclick: () => S(st, 'Picture style') }, t(l)))), col(colorBtnL('outline', 'Picture Border', () => o()?.stroke, (c) => S({ stroke: c, strokeW: Math.max(4, o()?.strokeW || 0) })), sm('wand', 'Picture Effects', null, { menu: effMenu }), sm('crop', 'Crop to Shape', null, { menu: () => shapeMenu(sh => S({ mask: sh === 'rect' ? 'rect' : sh })) })));
    }
    if (types.has('table')) grp('Table', big('table', 'Table Options', () => run('panel', 'format')), col(sm('plus', 'Insert Row Below', () => { const q = o(); commit('Insert row', () => { q.cells.push(q.cells[0].map(() => ({ text: '' }))); q.rowH = null; q.h += 40; }); }), sm('plus', 'Insert Column Right', () => { const q = o(); commit('Insert column', () => { q.cells.forEach(r => r.push({ text: '' })); q.colW = null; }); })), col(chk('Header Row', () => o()?.header, (v) => S({ header: v })), chk('Banded Rows', () => o()?.band, (v) => S({ band: v }))));
    if (types.has('chart')) grp('Chart', big('chart', 'Edit Data', () => D.chartData(o())), big('chart', 'Change Chart Type', null, { menu: () => CHART_TYPES.map(c => [t(c), () => S({ chartType: c })]) }), col(chk('Legend', () => o()?.showLegend, (v) => S({ showLegend: v })), chk('Data labels', () => o()?.showLabels, (v) => S({ showLabels: v }))));
    grp('Arrange', col(sm('front', 'Bring Forward', () => run('order', 'forward')), sm('back', 'Send Backward', () => run('order', 'backward')), sm('pane', 'Selection Pane', () => run('panel', 'layers'))), col(sm('alignObj', 'Align', null, { menu: () => arrangeMenu().slice(5, 13) }), sm('group', 'Group', null, { menu: () => [[t('Group'), () => run('group')], [t('Ungroup'), () => run('ungroup')]] }), sm('reset', 'Rotate', null, { menu: () => arrangeMenu().slice(-4) })));
    grp('Size', col(row(el('span', { class: 'r-lab' }, t('Height') + ':'), num(() => o() && Math.round(o().h), (v) => S(q => ({ h: v, w: (q.type === 'image' ? q.w * v / q.h : q.w) }), 'Resize'), { min: 1, max: 9999, step: 1 })), row(el('span', { class: 'r-lab' }, t('Width') + ':'), num(() => o() && Math.round(o().w), (v) => S(q => ({ w: v, h: (q.type === 'image' ? q.h * v / q.w : q.h) }), 'Resize'), { min: 1, max: 9999, step: 1 }))), big('pane', 'Format Pane', () => run('panel', 'format')));
  },
  Home() {
    grp('Clipboard', big('paste', 'Paste', () => run('paste'), { tip: 'Paste (Ctrl+V)' }), col(sm('cut', 'Cut', () => run('cut')), sm('copy', 'Copy', () => run('copy')), sm('painter', 'Format Painter', () => run('formatPainter'), { active: () => E.painter })));
    grp('Slides', big('newslide', 'New Slide', () => run('newSlide'), { menu: layoutMenu }), col(sm('layoutSlide', 'Layout', null, { menu: () => layoutItems('layout') }), sm('reset', 'Reset', () => run('resetSlide')), sm('duplicate', 'Duplicate Slide', () => run('duplicateSlide'))), col(sm('trash', 'Delete Slide', () => run('deleteSlide')), sm('hide', 'Hide Slide', () => run('hideSlide'), { active: () => slide()?.hidden })));
    grp('Font',
      row(select(FONTS.map(f => [f + ', Segoe UI, Arial', f]).concat([['@head', t('Theme heading')], ['@body', t('Theme body')]]), () => tv('font') || '@body', (v) => S({ font: v }), { width: 150, tip: 'Font Family', enabled: hasText }),
        select(SIZES_PT.map(s => [Math.round(s * 4 / 3), String(s)]), () => tv('size') != null ? Math.round(tv('size')) : null, (v) => run('fontSize', +v), { width: 60, tip: 'Font Size (pt)', enabled: hasText }),
        ico('grow', 'Increase Font Size', () => run('fontSize', '+')), ico('shrink', 'Decrease Font Size', () => run('fontSize', '-')), ico('clearFmt', 'Clear Formatting', () => run('clearFormatting'))),
      row(ico('bold', 'Bold (Ctrl+B)', () => run('toggleFmt', 'bold'), { active: () => tv('bold') }), ico('italic', 'Italic (Ctrl+I)', () => run('toggleFmt', 'italic'), { active: () => tv('italic') }), ico('underline', 'Underline (Ctrl+U)', () => run('toggleFmt', 'underline'), { active: () => tv('underline') }), ico('strike', 'Strikethrough', () => run('toggleFmt', 'strike'), { active: () => tv('strike') }),
        colorBtn('fontColor', 'Font Color', () => tv('color'), (c) => S({ color: c })), colorBtn('highlight', 'Text Highlight Color', () => tv('highlight'), (c) => S({ highlight: c === 'none' ? null : c })),
        el('button', { class: 'r-sm icon-only', title: t('Character Spacing'), onclick: (e) => D.dropdown(e.currentTarget, [['Very tight', -2], ['Tight', -1], ['Normal', 0], ['Loose', 2], ['Very loose', 5]].map(([l, v]) => [t(l), () => S({ letterSpacing: v })])) }, 'AV')));
    grp('Paragraph',
      row(ico('bullets', 'Bullets', () => S({ bullets: tv('bullets') === 'bullet' ? 'none' : 'bullet' }), { active: () => tv('bullets') === 'bullet' }), ico('numbering', 'Numbering', () => S({ bullets: tv('bullets') === 'number' ? 'none' : 'number' }), { active: () => tv('bullets') === 'number' }),
        ico('lineSpacing', 'Line Spacing', null, { menu: () => [1, 1.15, 1.2, 1.5, 2, 2.5, 3].map(v => [String(v), () => S({ lineHeight: v })]) }),
        el('button', { class: 'r-sm icon-only', title: t('Paragraph Spacing'), onclick: (e) => D.dropdown(e.currentTarget, [0, 6, 12, 18, 24, 36].map(v => [v + ' px', () => S({ paraSpace: v })])) }, '¶'),
        ico('columns', 'Text Columns', null, { menu: () => [1, 2, 3].map(v => [String(v), () => S({ columns: v })]) })),
      row(ico('alignL', 'Align Left', () => S({ align: 'left' }), { active: () => tv('align') === 'left' }), ico('alignC', 'Center', () => S({ align: 'center' }), { active: () => tv('align') === 'center' }), ico('alignR', 'Align Right', () => S({ align: 'right' }), { active: () => tv('align') === 'right' }), ico('alignJ', 'Justify', () => S({ align: 'start' }), { active: () => tv('align') === 'start' }),
        ico('ltr', 'Left-to-right', () => S({ dir: 'ltr' }), { active: () => tv('dir') === 'ltr' }), ico('rtl', 'Right-to-left', () => S({ dir: 'rtl' }), { active: () => tv('dir') === 'rtl' }),
        ico('valign', 'Align Text', null, { menu: () => [['Top', 'top'], ['Middle', 'middle'], ['Bottom', 'bottom']].map(([l, v]) => [t(l), () => S({ valign: v })]) }), ico('vertText', 'Text Direction', null, { menu: () => [[t('Horizontal'), () => S({ vertical: false })], [t('Rotate all text 90°'), () => S({ vertical: true })], [t('Automatic (by content)'), () => S({ dir: 'auto' })]] })));
    grp('Drawing', big('shapes', 'Shapes', null, { menu: () => shapeMenu(s => run('shape', s)) }), col(colorBtn('fill', 'Shape Fill', () => typeof sel1()?.fill === 'string' ? sel1().fill : null, (c) => S({ fill: c })), colorBtn('outline', 'Shape Outline', () => sel1()?.stroke, (c) => S({ stroke: c, strokeW: Math.max(2, sel1()?.strokeW || 0) })), sm('wand', 'Quick Styles', null, { menu: quickStyles })), big('arrange', 'Arrange', null, { menu: arrangeMenu }));
    grp('Editing', col(sm('find', 'Find', () => D.findReplace(false)), sm('replace', 'Replace', () => D.findReplace(true)), sm('selectAll', 'Select All', () => run('selectAll'))));
  },
  Insert() {
    grp('Slides', big('newslide', 'New Slide', () => run('newSlide'), { menu: layoutMenu }));
    grp('Tables', big('table', 'Table', null, { menu: () => [[D.tableGrid((r, c) => run('table', r, c))], '-', [t('Insert Table…'), () => D.tableDialog()]] }));
    grp('Images', big('picture', 'Pictures', () => run('picture')), col(sm('online', 'Online Images', () => D.onlineImage()), sm('icons', 'Icons', () => D.iconPicker()), sm('svg', 'SVG File', () => run('picture'))), big('screen', 'Screenshot', () => D.screenshot()));
    grp('Illustrations', big('shapes', 'Shapes', null, { menu: () => shapeMenu(s => run('insertMode', 'shape:' + s)) }), big('smartart', 'SmartArt', () => D.diagramDialog()), big('chart', 'Chart', () => D.chartPicker()));
    grp('Links', col(sm('link', 'Link', () => D.hyperlink()), sm('action', 'Action Button', null, { menu: () => [['Back', 'prev', '◀'], ['Next', 'next', '▶'], ['Home', 'first', '⌂'], ['End', 'last', '⏭'], ['End Show', 'end', '■']].map(([l, ty, g]) => [t(l), () => D.actionButton(ty, g)]) })));
    grp('Text', big('textbox', 'Text Box', () => run('insertMode', 'text')), col(sm('header', 'Header & Footer', () => D.headerFooter()), sm('wordart', 'WordArt', null, { menu: wordartMenu })), col(sm('date', 'Date & Time', () => D.dateTime()), sm('number', 'Slide Number', () => commit('Slide number', () => E.doc.master.showNumber = !E.doc.master.showNumber), { active: () => E.doc.master.showNumber })));
    grp('Symbols', col(sm('equation', 'Equation', () => D.equation()), sm('symbol', 'Symbol', () => D.symbols())));
    grp('Media', big('video', 'Video', () => run('insertMedia', 'video')), big('audio', 'Audio', null, { menu: () => [[t('Audio on my PC…'), () => run('insertMedia', 'audio')], [t('Record Audio…'), () => D.recordNarration()]] }), big('screen', 'Screen Recording', () => D.screenRecording()));
    grp('Interactive', big('quiz', 'Quiz', () => D.quizBuilder()), big('setup', 'Embedded Object', () => D.embedObject()));
  },
  Design() {
    const g = el('div', { class: 'r-gallery' });
    for (const th of THEMES) g.append(el('button', { class: 'theme-tile' + (E.doc.theme.id === th.id ? ' on' : ''), title: th.name, onclick: () => run('applyTheme', th.id), style: `background:linear-gradient(135deg,${th.bg} 60%,${th.bg2});color:${th.text};font-family:${th.head}` }, el('b', {}, 'Aa'), el('span', { style: `background:${th.accent}` }), el('span', { style: `background:${th.accent2}` }), el('span', { style: `background:${th.accent3}` }), el('small', {}, th.name)));
    grp('Themes', g);
    grp('Variants', col(sm('colors', 'Colors', () => D.themeColors()), sm('fonts', 'Fonts', null, { menu: () => [['Poppins / Inter', 'Poppins, Segoe UI', 'Inter, Segoe UI'], ['Georgia / Georgia', 'Georgia, serif', 'Georgia, serif'], ['Segoe UI', 'Segoe UI, Arial', 'Segoe UI, Arial'], ['Aptos', 'Aptos, Segoe UI', 'Aptos, Segoe UI'], ['Calibri Light / Calibri', 'Calibri Light, Calibri', 'Calibri, Arial'], ['Times New Roman / Arial', 'Times New Roman', 'Arial'], ['David (עברית)', 'David, Arial', 'David, Arial'], ['FrankRuehl (עברית)', 'FrankRuehl, David', 'David, Arial'], ['Rubik / Assistant', 'Rubik, Arial', 'Assistant, Arial'], ['Noto Naskh / Noto Sans Arabic', 'Noto Naskh Arabic, Amiri', 'Noto Sans Arabic, Tahoma'], ['Cairo / Tajawal', 'Cairo, Tahoma', 'Tajawal, Tahoma']].map(([l, h, b]) => [l, () => commit('Theme fonts', () => { E.doc.theme.head = h; E.doc.theme.body = b; })]) }), sm('themes', 'Variant', null, { menu: () => [[t('Swap accent colors'), () => commit('Variant', () => { const th = E.doc.theme; [th.accent, th.accent2, th.accent3] = [th.accent2, th.accent3, th.accent]; })], [t('Dark variant'), () => commit('Variant', () => { const th = E.doc.theme; if (th._dark) return; th._dark = { bg: th.bg, bg2: th.bg2, surface: th.surface, text: th.text, muted: th.muted }; Object.assign(th, { bg: '#121418', bg2: '#1d2128', surface: '#1b1f26', text: '#f3f4f6', muted: '#9aa1ad' }); })], [t('Light variant'), () => commit('Variant', () => { const th = E.doc.theme; if (th._dark) { Object.assign(th, th._dark); delete th._dark; } })]] })));
    grp('Customize', big('size', 'Slide Size', null, { menu: () => [...Object.keys(SIZES).map(k => [k === '16:9' ? t('Widescreen (16:9)') : k === '4:3' ? t('Standard (4:3)') : k, () => run('slideSize', SIZES[k])]), '-', [t('Custom Slide Size…'), () => D.customSize()]] }), big('background', 'Format Background', () => { run('panel', 'format'); emit('selectNone'); }), big('applyAll', 'Apply Background to All', () => commit('Background to all', () => { const bg = slide().bg; E.doc.slides.forEach(s => s.bg = bg ? JSON.parse(JSON.stringify(bg)) : null); })));
    grp('Designer', big('ideas', 'Design Ideas', () => D.designIdeas()), big('master', 'Slide Master', () => D.slideMaster()), big('ai', 'AI Design Studio', () => D.aiDesignStudio()));
  },
  Transitions() {
    const g = el('div', { class: 'r-gallery tr' });
    const pick = ['none', ...SIGNATURE, 'fade', 'pushLeft', 'wipeLeft', 'splitV', 'cover', 'flash', 'cubeLeft', 'flipH', 'circleOut', 'pageFlip', 'lightSweep', 'portal', 'aurora'];
    for (const id of [...new Set(pick)]) { const T = getT(id); const b = el('button', { class: 'tr-tile' + (T.sig ? ' sig' : ''), title: t(T.name), onclick: () => run('setTransition', { type: id, params: defaultParams(id) }) }, el('span', { class: 'tr-ic' }, T.sig ? '✦' : T.kind === 'none' ? '∅' : '◨'), el('small', {}, t(T.name))); stateFns.push(() => b.classList.toggle('on', slide()?.transition?.type === id)); g.append(b); }
    grp('Preview', big('preview', 'Preview', () => previewTransition()));
    grp('Transition to This Slide', g, big('transition', 'Transition Studio', () => run('panel', 'transitions')));
    grp('Timing', col(row(el('span', { class: 'r-lab' }, t('Sound') + ':'), select(SOUNDS.map(s => [s, t(s)]), () => slide()?.transition?.sound || 'none', (v) => run('setTransition', { sound: v }), { width: 100 })), row(el('span', { class: 'r-lab' }, t('Duration') + ':'), num(() => slide()?.transition?.duration, (v) => run('setTransition', { duration: v }), { min: .05, max: 20 })), sm('applyAll', 'Apply To All', () => run('transitionToAll'))),
      col(chk('On Mouse Click', () => slide()?.transition?.onClick !== false, (v) => run('setTransition', { onClick: v })), row(chk('After', () => slide()?.transition?.after != null && slide()?.transition?.after !== '', (v) => run('setTransition', { after: v ? 5 : null })), num(() => slide()?.transition?.after, (v) => run('setTransition', { after: v }), { min: 0, max: 3600, step: .5 }))));
  },
  Animations() {
    const g = el('div', { class: 'r-gallery an' });
    const pick = [['entrance', 'fadeIn'], ['entrance', 'flyIn'], ['entrance', 'zoomIn'], ['entrance', 'wipeIn'], ['entrance', 'popIn'], ['entrance', 'riseUp'], ['entrance', 'bounceIn'], ['emphasis', 'pulse'], ['emphasis', 'spin'], ['emphasis', 'teeter'], ['exit', 'fadeOut'], ['exit', 'flyOut'], ['exit', 'zoomOut'], ['motion', 'pathLine'], ['motion', 'pathArc'], ['motion', 'pathCustom']];
    for (const [c, ty] of pick) g.append(el('button', { class: 'an-tile ' + c, title: t(ty), onclick: () => run('setAnim', ty) }, el('span', { class: 'star' }, '★'), el('small', {}, t(ty))));
    g.append(el('button', { class: 'an-tile more', onclick: (e) => D.dropdown(e.currentTarget, animMenu((ty) => run('setAnim', ty))) }, el('small', {}, t('More effects…'))));
    grp('Preview', big('preview', 'Preview', () => previewAnimations()));
    grp('Animation', g, big('setup', 'Effect Options', null, { menu: () => ['left', 'right', 'top', 'bottom'].map(d => [t('From ' + d), () => run('animProp', { dir: d })]).concat(['-', [t('By paragraph'), () => run('animProp', { byPara: true })], [t('As one object'), () => run('animProp', { byPara: false })]]) }));
    grp('Advanced Animation', big('plus', 'Add Animation', null, { menu: () => animMenu((ty) => run('addAnim', ty)) }), col(sm('pane', 'Animation Pane', () => run('panel', 'animations')), sm('action', 'Trigger', null, { menu: () => [[t('On Sequence'), () => run('animProp', { trigger: null })], ...slide().objects.filter(o => !E.sel.includes(o.id)).map(o => [t('On Click of') + ' ' + (o.name || o.text?.slice(0, 20) || o.type), () => run('animProp', { trigger: o.id })])] }), sm('painter', 'Animation Painter', () => run('animPainter'))), big('motion', 'Motion Studio', () => D.motionStudio()));
    const an = () => sel1()?.anims?.at(-1);
    grp('Timing', col(row(el('span', { class: 'r-lab' }, t('Start') + ':'), select([['click', t('On Click')], ['with', t('With Previous')], ['after', t('After Previous')]], () => an()?.start, (v) => run('animProp', { start: v }), { width: 120, enabled: () => !!an() })), row(el('span', { class: 'r-lab' }, t('Duration') + ':'), num(() => an()?.dur, (v) => run('animProp', { dur: v }), { min: .05, max: 60 })), row(el('span', { class: 'r-lab' }, t('Delay') + ':'), num(() => an()?.delay, (v) => run('animProp', { delay: v }), { min: 0, max: 60 }))),
      col(row(el('span', { class: 'r-lab' }, t('Repeat') + ':'), num(() => an()?.repeat, (v) => run('animProp', { repeat: Math.max(1, Math.round(v)) }), { min: 1, max: 99, step: 1 })), sm('up', 'Move Earlier', () => run('animMove', -1)), sm('down', 'Move Later', () => run('animMove', 1))));
  },
  'Slide Show'() {
    grp('Start Slide Show', big('preview', 'From Beginning', () => run('showStart'), { tip: 'From Beginning (F5)' }), big('play', 'From Current Slide', () => run('showCurrent'), { tip: 'From Current Slide (Shift+F5)' }), big('custom', 'Custom Slide Show', null, { menu: () => [...(E.doc.show.customShows || []).map(cs => [cs.name, () => startShow(0, { customShow: cs.slides })]), '-', [t('Custom Shows…'), () => D.customShows()]] }));
    grp('Set Up', big('setup', 'Set Up Slide Show', () => D.setupShow()), col(sm('hide', 'Hide Slide', () => run('hideSlide'), { active: () => slide()?.hidden }), sm('rehearse', 'Rehearse Timings', () => run('rehearse')), sm('record', 'Record Slide Show', () => run('recordShow', 0))), col(chk('Play Narrations', () => E.prefs.playNarr !== false, (v) => { E.prefs.playNarr = v; savePrefs(); }), chk('Use Timings', () => E.prefs.useTimings !== false, (v) => { E.prefs.useTimings = v; savePrefs(); }), chk('Show Media Controls', () => E.prefs.mediaCtl !== false, (v) => { E.prefs.mediaCtl = v; savePrefs(); })));
    grp('Monitors', big('presenter', 'Presenter View', () => run('showPresenter'), { tip: 'Presenter View (Alt+F5)' }), col(chk('Use Multiple Displays', () => E.prefs.multiDisplay, (v) => run('pref', 'multiDisplay', v)), chk('Performance Mode', () => E.prefs.perf, (v) => run('pref', 'perf', v))));
    grp('Captions & Subtitles', big('captions', 'Live Captions', () => run('pref', 'captions'), { active: () => E.prefs.captions, tip: 'Show live speech captions during the slide show (uses the browser speech recognition)' }));
    grp('Selfie Presenter', big('selfie', 'Selfie Presenter Studio', () => D.selfieStudio()), col(sm('camera', 'Camera in Show', () => commit('Camera', () => E.doc.show.camera.enabled = !E.doc.show.camera.enabled), { active: () => E.doc.show.camera.enabled }), sm('layout', 'Camera for This Slide', () => run('panel', 'camera'))));
  },
  Record() {
    grp('Record', big('record', 'From Beginning', () => run('recordShow', 0)), big('play', 'From Current Slide', () => run('recordShow', E.cur)), big('selfie', 'Selfie Presenter Studio', () => D.selfieStudio()));
    grp('Capture', big('mic', 'Record Narration', () => D.recordNarration()), big('camera', 'Record Webcam', () => D.recordWebcam()), big('screen', 'Record Screen', () => D.screenRecording()));
    grp('Export', big('export', 'Export to Video', () => D.exportVideoDialog()), big('file', 'Export GIF', () => D.exportGifDialog()), big('folder', 'Recordings', () => D.recordingsList()));
  },
  Review() {
    grp('Proofing', big('spell', 'Spelling', () => D.spelling()), big('book', 'Thesaurus', () => D.thesaurus()));
    grp('Language', big('translate', 'Translate', () => D.translateDialog()), big('language', 'Language', () => run('contentLanguage')));
    grp('Accessibility', big('access', 'Check Accessibility', () => run('accessibility')));
    grp('Comments', big('comment', 'New Comment', () => { run('panel', 'comments'); emit('newComment'); }), col(sm('prev', 'Previous', () => run('commentNav', -1)), sm('next', 'Next', () => run('commentNav', 1)), sm('comment', 'Show Comments', () => run('panel', 'comments'))));
    grp('Compare', big('compare', 'Compare', () => D.compare()));
    grp('Protect', big('inspect', 'Inspect Document', () => D.inspector()), big('lock', 'Read-Only', () => { E.readOnly = !E.readOnly; emit('change', {}); }, { active: () => E.readOnly }), big('lock', 'Password…', () => D.passwordDialog()));
  },
  View() {
    grp('Presentation Views', ...[['normal', 'Normal'], ['sorter', 'Slide Sorter'], ['notes', 'Notes Page'], ['reading', 'Reading View']].map(([v, l]) => big(v === 'notes' ? 'notes' : v, l, () => run('view', v), { active: () => E.view === v })));
    grp('Master Views', big('master', 'Slide Master', () => D.slideMaster()), big('print', 'Handout Master', () => D.printDialog('handouts')), big('notes', 'Notes Master', () => D.printDialog('notes')));
    grp('Show', col(chk('Ruler', () => E.prefs.ruler, (v) => run('pref', 'ruler', v)), chk('Gridlines', () => E.prefs.grid, (v) => run('pref', 'grid', v)), chk('Guides', () => E.prefs.staticGuides, (v) => run('pref', 'staticGuides', v))), col(chk('Smart Guides', () => E.prefs.guides, (v) => run('pref', 'guides', v)), chk('Snap to Grid', () => E.prefs.snap, (v) => run('pref', 'snap', v)), chk('Notes', () => E.prefs.notes, () => run('toggleNotes'))));
    grp('Zoom', big('zoom', 'Zoom', null, { menu: () => [25, 50, 75, 100, 150, 200, 300].map(z => [z + '%', () => run('zoom', z / 100)]) }), big('fit', 'Fit to Window', () => run('fit')));
    grp('Color/Grayscale', col(...[['color', 'Color'], ['gray', 'Grayscale'], ['bw', 'Black and White']].map(([v, l]) => sm(v === 'color' ? 'colors' : 'gray', l, () => run('pref', 'colorMode', v), { active: () => E.prefs.colorMode === v }))));
    grp('Window', big('window', 'New Window', () => run('newWindow')), big('moon', 'Dark Mode', () => run('toggleUiTheme'), { active: () => E.prefs.uiTheme === 'dark' }), big('keyboard', 'Keyboard Shortcuts', () => D.shortcuts()));
  },
  AI() {
    grp('Create', big('ai', 'Create from Topic', () => D.aiGenerate()), big('file', 'Create from Document', () => D.aiGenerate({ fromFile: true })), big('quiz', 'Create Quiz', () => D.quizBuilder({ ai: true })));
    grp('Write', col(sm('wand', 'Rewrite Professionally', () => run('aiText', 'rewrite')), sm('alignJ', 'Summarize', () => run('aiText', 'summarize')), sm('spell', 'Fix Spelling & Grammar', () => run('aiText', 'grammar'))), col(sm('notes', 'Speaker Notes', () => run('aiNotes')), sm('textbox', 'Suggest Titles', () => run('aiText', 'titles')), sm('picture', 'Suggest Images', () => run('aiText', 'images'))));
    grp('Design', big('ideas', 'AI Design Studio', () => D.aiDesignStudio()), big('smartart', 'Generate Diagram', () => D.diagramDialog({ ai: true })), big('translate', 'Translate Deck', () => D.translateDialog()));
    grp('Settings', big('settings', 'AI Settings', () => D.aiSettings()));
  },
};
function layoutItems(cmd) { const items = LAYOUTS.map(l => [t('layout_' + l), () => run(cmd, l)]); const cl = (E.doc.customLayouts || []).map(c => [c.name, () => run(cmd, c.id)]); return cl.length ? [...items, '-', ...cl] : items; }
const layoutMenu = () => [...layoutItems('newSlide'), '-', [t('Duplicate Selected Slides'), () => run('duplicateSlide')], [t('Slides from Outline…'), () => D.outlineImport()], [t('Reuse Slides…'), () => D.reuseSlides()]];
const animMenu = (fn) => Object.entries(ANIMS).flatMap(([c, list]) => [[el('b', {}, t(c[0].toUpperCase() + c.slice(1)))], ...list.map(ty => [t(ty), () => fn(ty)])]);
const arrangeMenu = () => [[t('Bring to Front'), () => run('order', 'front')], [t('Bring Forward'), () => run('order', 'forward')], [t('Send Backward'), () => run('order', 'backward')], [t('Send to Back'), () => run('order', 'back')], '-',
  [t('Align Left'), () => run('align', 'left')], [t('Align Center'), () => run('align', 'center')], [t('Align Right'), () => run('align', 'right')], [t('Align Top'), () => run('align', 'top')], [t('Align Middle'), () => run('align', 'middle')], [t('Align Bottom'), () => run('align', 'bottom')], [t('Distribute Horizontally'), () => run('distribute', 'h')], [t('Distribute Vertically'), () => run('distribute', 'v')], '-',
  [t('Group'), () => run('group')], [t('Ungroup'), () => run('ungroup')], [t('Merge Shapes…'), () => D.mergeShapes()], [t('Lock / Unlock'), () => run('lock')], [t('Selection Pane'), () => run('panel', 'layers')], '-', [t('Rotate Right 90°'), () => run('set', o => ({ rot: ((o.rot || 0) + 90) % 360 }))], [t('Rotate Left 90°'), () => run('set', o => ({ rot: ((o.rot || 0) - 90) % 360 }))], [t('Flip Horizontal'), () => run('set', o => ({ flipH: !o.flipH }))], [t('Flip Vertical'), () => run('set', o => ({ flipV: !o.flipV }))]];
const quickStyles = () => [['@accent', '#ffffff', 'none'], ['@accent2', '#ffffff', 'none'], ['@accent3', '#ffffff', 'none'], ['none', '@accent', '@accent'], ['@surface', '@text', '@accent'], ['@text', '@bg', 'none']].map(([f, c, s], i) => [el('span', { class: 'qs', style: `background:${f === 'none' ? 'transparent' : resolveColor(f, E.doc.theme)};color:${resolveColor(c, E.doc.theme)};border:2px solid ${s === 'none' ? 'transparent' : resolveColor(s, E.doc.theme)}` }, 'Abc'), () => S({ fill: f, color: c, stroke: s, strokeW: s === 'none' ? 0 : 3, shadow: i < 3 ? { color: 'rgba(0,0,0,.25)', blur: 14, x: 0, y: 6 } : null })]);
const wordartMenu = () => [
  ['Fill: Accent, Shadow', { color: '@accent', textShadow: { color: 'rgba(0,0,0,.35)', blur: 10, x: 4, y: 4 } }],
  ['Gradient Fill: Sunset', { textGradient: { c1: '#ffb04a', c2: '#d6361f' } }],
  ['Outline: Accent', { color: 'rgba(0,0,0,0)', textOutline: { color: '@accent', width: 3 } }],
  ['Glow: Neon', { color: '#18f0c8', glow: { color: '#18f0c8', size: 24 } }],
  ['Reflection', { color: '@text', reflection: true }],
  ['Bold Contrast', { color: '@bg', textOutline: { color: '@text', width: 6 }, textShadow: { color: '@accent', blur: 0, x: 6, y: 6 } }],
].map(([l, st]) => (wordartStyles[t(l)] = st, [el('span', { class: 'wa', style: `color:${st.textGradient ? '#e65a1e' : resolveColor(st.color || '@text', E.doc.theme)};${st.textOutline ? `-webkit-text-stroke:1px ${resolveColor(st.textOutline.color, E.doc.theme)};` : ''}${st.glow ? `text-shadow:0 0 8px ${st.glow.color}` : ''}` }, 'A'), () => run('wordart', st), t(l)]));
const wordartMenu2 = () => wordartMenu().map(([lab, fn, l]) => [lab, () => { const st = wordartStyles[l]; if (st && selObjs().length) S(st, 'WordArt style'); else fn(); }, l]);
const wordartStyles = {};
export { animMenu };
