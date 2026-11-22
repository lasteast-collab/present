// Lasteast Present — dialogs & studios
import { el, $, $$, uid, clamp, deepClone, readAsDataURL, readAsText, pickFile, downloadBlob, escapeHtml, toHex, contrast, sleep } from './util.js';
import { E, on, emit, commit, slide, selObjs, sel1, select, setCur, savePrefs } from './state.js';
import { t, getLang, isRTL } from './i18n.js';
import { ICONS, CONTENT_ICONS, iconSVG } from './icons.js';
import { CMD, run, drawStage, insertObjects, renderSlidesPanel, structural, startShow, keyMap, DEFAULT_KEYS, comboOf, thumbDataURL, refreshAll, previewTransition, groupBBox } from './editor.js';
import { refreshPanel } from './panels.js';
import { makeSlide, makeText, makeShape, makeImage, makeTable, makeChart, makeMedia, addAsset, THEMES, themeById, SIZES, LAYOUTS, layoutObjects, resolveColor, cloneObject, cloneSlide, signatureShowcase, gcAssets } from './model.js';
import { renderToCanvas, renderSlide, preloadDoc, shapePoints, objAABB, CHART_TYPES, assetSrc, getImage } from './renderer.js';
import { buildTimeline, computeOverrides, ANIMS, newAnim } from './animations.js';
import { TRANSITIONS, getT, defaultParams, prepareTransition, SIGNATURE } from './transitions.js';
import { camera, cameraLayout, drawCameraOverlay, CAM_SHAPES, CAM_PRESETS, VIRTUAL_BGS } from './camera.js';
import { Recorder, pickMime } from './recorder.js';
import * as IO from './io.js';
import * as AI from './ai.js';

// ---------------------------------------------------------------- primitives
export function toast(msg, ms = 2600) { let h = $('.toasts'); if (!h) { h = el('div', { class: 'toasts' }); document.body.append(h); } const n = el('div', { class: 'toast' }, msg); h.append(n); setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 400); }, ms); }
export function dialog({ title, body, buttons = [], wide = false, cls = '', onClose }) {
  const back = el('div', { class: 'dialog-back' });
  const close = () => { back.remove(); onClose && onClose(); document.removeEventListener('keydown', esc, true); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const btns = el('div', { class: 'd-btns' }, ...buttons.map(b => el('button', { class: 'btn ' + (b.primary ? 'primary' : '') + (b.danger ? ' danger' : ''), onclick: async () => { const r = b.onClick ? await b.onClick(close) : true; if (r !== false) close(); } }, b.label)));
  const box = el('div', { class: 'dialog ' + cls + (wide ? ' wide' : ''), role: 'dialog', 'aria-label': title }, el('div', { class: 'd-head' }, el('b', {}, title), el('button', { class: 'd-x', 'aria-label': t('Close'), onclick: close }, '✕')), el('div', { class: 'd-body' }, body), buttons.length ? btns : null);
  back.append(box); document.body.append(back); document.addEventListener('keydown', esc, true);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  setTimeout(() => box.querySelector('input,textarea,select,button.primary')?.focus(), 30);
  return { close, box };
}
export const alertBox = (title, msg) => dialog({ title, body: el('div', { class: 'd-msg' }, msg), buttons: [{ label: t('OK'), primary: true }] });
export function prompt(title, value = '', opts = {}) { return new Promise(res => { const i = el(opts.area ? 'textarea' : 'input', { value, type: opts.type || 'text', dir: 'auto', rows: 5, placeholder: opts.ph || '' }); let done = false; dialog({ title, body: el('div', { class: 'd-form' }, opts.label ? el('p', {}, opts.label) : null, i), buttons: [{ label: t('Cancel'), onClick: () => { done = true; res(null); } }, { label: t('OK'), primary: true, onClick: () => { done = true; res(i.value); } }], onClose: () => { if (!done) res(null); } }); i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !opts.area) { e.preventDefault(); done = true; res(i.value); $('.dialog-back')?.remove(); } }); }); }
export function confirmBox(title, msg) { return new Promise(res => { let d = false; dialog({ title, body: el('div', { class: 'd-msg' }, msg), buttons: [{ label: t('Cancel'), onClick: () => { d = true; res(false); } }, { label: t('OK'), primary: true, onClick: () => { d = true; res(true); } }], onClose: () => !d && res(false) }); }); }
export function busy(msg) { const n = el('div', { class: 'busy' }, el('div', { class: 'spin' }), el('span', {}, msg)); document.body.append(n); return { done: () => n.remove(), update: (s) => n.querySelector('span').textContent = msg + ' ' + s }; }
export function contextMenu(e, items) { const r = { left: e.clientX, top: e.clientY, bottom: e.clientY, right: e.clientX }; showMenu(r, items); }
export function dropdown(anchor, items) { showMenu(anchor.getBoundingClientRect(), items); }
function showMenu(r, items) {
  $$('.menu').forEach(m => m.remove());
  const m = el('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (it === '-') { m.append(el('div', { class: 'sep' })); continue; }
    const [label, fn, extra] = it;
    if (!fn) { m.append(el('div', { class: 'm-head' }, label)); continue; }
    const b = el('button', { class: 'm-item', role: 'menuitem', onclick: () => { m.remove(); fn(); } }); if (typeof label === 'string') b.append(label); else b.append(label); if (extra && typeof label !== 'string') b.append(el('span', { class: 'm-sub' }, extra));
    m.append(b);
  }
  document.body.append(m);
  const mw = m.offsetWidth, mh = m.offsetHeight; let x = isRTL() ? r.right - mw : r.left, y = r.bottom + 2;
  if (x + mw > innerWidth) x = innerWidth - mw - 6; if (x < 4) x = 4; if (y + mh > innerHeight) y = Math.max(4, r.top - mh - 2); if (y + mh > innerHeight) { y = 4; m.style.maxHeight = innerHeight - 8 + 'px'; }
  m.style.left = x + 'px'; m.style.top = y + 'px';
  setTimeout(() => { const off = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } }; document.addEventListener('mousedown', off, true); }, 0);
}
export function colorMenu(anchor, set, inp) {
  const th = E.doc.theme, wrap = el('div', { class: 'cm-grid' });
  const pal = ['#000000', '#404040', '#7f7f7f', '#bfbfbf', '#ffffff', '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0', '#f26a1b', '#d6361f', '#2a9d8f', '#e9c46a', '#264653'];
  const items = [[el('div', { class: 'cm-theme' }, ...['accent', 'accent2', 'accent3', 'text', 'muted', 'bg', 'bg2'].map(k => el('button', { class: 'sw', title: k, style: `background:${th[k]}`, onclick: () => { set('@' + k); $$('.menu').forEach(m => m.remove()); } })))], [el('div', { class: 'cm-std' }, ...pal.map(c => el('button', { class: 'sw', style: `background:${c}`, onclick: () => { set(c); $$('.menu').forEach(m => m.remove()); } })))], '-', [t('No Color'), () => set('none')], [t('More Colors…'), () => inp.click()]];
  dropdown(anchor, items); void wrap;
}
export function pickList(title, lines, onPick) { const d = dialog({ title, body: el('div', { class: 'pick-list' }, ...lines.map(l => el('button', { class: 'm-item', dir: 'auto', onclick: () => { onPick(l); d.close(); } }, l))), buttons: [{ label: t('Close') }] }); }
export function compareText(a, b, apply) { dialog({ title: t('AI suggestion'), wide: true, body: el('div', { class: 'cmp2' }, el('div', {}, el('small', {}, t('Original')), el('pre', { dir: 'auto' }, a)), el('div', {}, el('small', {}, t('Suggestion')), el('pre', { dir: 'auto' }, b))), buttons: [{ label: t('Discard') }, { label: t('Replace'), primary: true, onClick: () => apply() }] }); }
export function aiError(e) { if (e.code === 'noai') { dialog({ title: t('AI provider not configured'), body: el('div', { class: 'd-msg' }, t('Connect an AI provider in AI Settings to use this feature. Lasteast Present never simulates AI results.')), buttons: [{ label: t('Cancel') }, { label: t('AI Settings…'), primary: true, onClick: () => { setTimeout(aiSettings, 10); } }] }); return; } alertBox(t('AI error'), String(e.message || e)); }
const F = (label, input) => el('label', { class: 'd-f' }, el('span', {}, t(label)), input);
const sel = (opts, v) => el('select', {}, ...opts.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return el('option', { value: val, selected: String(val) === String(v) }, t(String(lab))); }));
const center0 = (w, h) => ({ x: (E.doc.size.w - w) / 2, y: (E.doc.size.h - h) / 2, w, h });

// ---------------------------------------------------------------- backstage (File)
export function backstage(page = 'info') {
  const back = el('div', { class: 'backstage' });
  const close = () => back.remove();
  const nav = el('nav', {}, el('button', { class: 'bs-back', onclick: close }, isRTL() ? '→' : '←'));
  const main = el('div', { class: 'bs-main' });
  const pages = {
    info: () => [el('h1', {}, t('Info')), el('div', { class: 'bs-info' }, el('canvas', { width: 320, height: 180, class: 'bs-thumb' }), el('div', {}, el('h2', { dir: 'auto' }, E.doc.title), el('p', {}, t('Slides') + ': ' + E.doc.slides.length), el('p', {}, t('Created') + ': ' + new Date(E.doc.created).toLocaleString(getLang())), el('p', {}, t('Modified') + ': ' + new Date(E.doc.modified).toLocaleString(getLang())), el('p', {}, t('Size') + ': ' + (JSON.stringify(E.doc).length / 1048576).toFixed(2) + ' MB'), el('p', {}, t('Protection') + ': ' + (E.doc._passwordValue ? t('Password protected') : t('None')) + (E.readOnly ? ' · ' + t('Read-Only') : '')))),
      el('div', { class: 'bs-cards' }, card('lock', 'Protect Presentation', 'Encrypt with a password or mark as read-only.', () => { close(); passwordDialog(); }), card('inspect', 'Inspect Presentation', 'Check for hidden properties, notes, comments and accessibility issues.', () => { close(); inspector(); }), card('history', 'Version History', 'Restore an earlier AutoSave version.', () => { close(); versionHistory(); }), card('info', 'Properties', 'Title, author, subject, keywords.', () => { close(); properties(); }))],
    new: () => [el('h1', {}, t('New')), el('div', { class: 'bs-cards' }, card('newslide', 'Blank Presentation', '', () => { close(); emit('newPres'); }), card('star', 'Lasteast Signature Showcase', 'A sample deck that demonstrates the six signature transitions.', () => { close(); emit('openDoc', signatureShowcase()); }), card('ai', 'Create from AI', '', () => { close(); aiGenerate(); }), card('themes', 'Browse Templates', '', () => { close(); emit('goHome', 'templates'); }))],
    open: () => [el('h1', {}, t('Open')), el('div', { class: 'bs-cards' }, card('folder', 'Browse…', '.lpres, .pptx, .ppt*, .pdf, .odp', () => { close(); emit('openDialog'); }), card('history', 'Recent Presentations', '', () => { close(); emit('goHome'); }), card('reset', 'Recover Unsaved Presentations', 'Presentations kept by AutoSave in this browser.', () => { close(); emit('goHome', 'recover'); }))],
    save: () => { close(); run('save'); return []; }, saveAs: () => { close(); run('saveAs'); return []; },
    import: () => [el('h1', {}, t('Import')), el('div', { class: 'bs-cards' }, ...[['PowerPoint (.pptx)', '.pptx'], ['PowerPoint 97-2003 (.ppt)', '.ppt'], ['PDF', '.pdf'], ['OpenDocument (.odp)', '.odp'], ['Images', 'image/*'], ['Word (.docx)', '.docx'], ['Text / Markdown', '.txt,.md'], ['Excel (.xlsx)', '.xlsx'], ['CSV', '.csv']].map(([l, acc]) => card('import', l, '', async () => { const f = await pickFile(acc, acc === 'image/*'); if (!f) return; close(); if (Array.isArray(f)) { const ss = await IO.importImagesAsSlides(E.doc, f); structural(); commit('Import images', () => E.doc.slides.push(...ss)); renderSlidesPanel(); } else emit('importInto', f); })))],
    export: () => [el('h1', {}, t('Export')), el('div', { class: 'bs-cards' }, ...exportCards(close))],
    print: () => { close(); printDialog(); return []; },
    options: () => [el('h1', {}, t('Options')), optionsPane()],
    about: () => [el('h1', {}, t('About')), about()],
  };
  const items = [['info', 'Info'], ['new', 'New'], ['open', 'Open'], ['save', 'Save'], ['saveAs', 'Save As'], ['import', 'Import'], ['export', 'Export'], ['print', 'Print'], ['options', 'Options'], ['about', 'About']];
  const go = (p) => { $$('.bs-item', nav).forEach(b => b.classList.toggle('on', b.dataset.p === p)); main.innerHTML = ''; main.append(...pages[p]()); const th = $('.bs-thumb', main); if (th) renderSlide(th.getContext('2d'), E.doc, E.doc.slides[0], { scale: 320 / E.doc.size.w, present: true }); };
  for (const [k, l] of items) nav.append(el('button', { class: 'bs-item', 'data-p': k, onclick: () => go(k) }, t(l)));
  nav.append(el('div', { class: 'bs-spacer' }), el('button', { class: 'bs-item', onclick: () => { close(); emit('goHome'); } }, t('Close')));
  back.append(nav, main); document.body.append(back); go(page);
  back.addEventListener('keydown', (e) => e.key === 'Escape' && close()); back.tabIndex = 0; back.focus();
}
const card = (ic, title, desc, fn) => el('button', { class: 'bs-card', onclick: fn }, el('span', { class: 'ic', html: ICONS[ic] }), el('b', {}, t(title)), desc ? el('small', {}, t(desc)) : null);
function exportCards(close) {
  const name = (ext) => (E.doc.title || 'Presentation').replace(/[\\/:*?"<>|]+/g, '_') + '.' + ext;
  const job = async (label, fn) => { close(); const b = busy(t(label)); try { await preloadDoc(E.doc); await fn(); } catch (e) { console.error(e); alertBox(t('Export failed'), String(e.message || e)); } b.done(); };
  return [
    card('file', 'PowerPoint Presentation (.pptx)', 'Compatible with PowerPoint, Keynote, Google Slides. A compatibility report is shown.', () => job('Exporting PPTX…', async () => { const rep = []; const blob = await IO.exportPPTX(E.doc, rep); downloadBlob(blob, name('pptx')); compatReport(rep, 'PPTX'); })),
    card('file', 'PowerPoint 97-2003 (.ppt)', '', () => alertBox(t('PPT (legacy) export'), t('The legacy binary .ppt format cannot be written reliably in this version. Export to .pptx instead — every PowerPoint since 2007 opens it, and it preserves far more of your presentation.'))),
    card('print', 'PDF Document', 'One page per slide. Links are kept.', () => job('Exporting PDF…', async () => downloadBlob(await IO.exportPDF(E.doc), name('pdf')))),
    card('notes', 'PDF with Notes Pages', '', () => job('Exporting PDF…', async () => downloadBlob(await IO.exportPDF(E.doc, { mode: 'notes' }), name('notes.pdf')))),
    card('file', 'OpenDocument (.odp)', '', () => job('Exporting ODP…', async () => { const blob = await exportODP(); downloadBlob(blob, name('odp')); compatReport(['ODP export embeds each slide as a high-resolution picture with notes; text is not editable in the ODP file.'], 'ODP'); })),
    card('video', 'Video (MP4 / WebM)', 'Records the slide show with transitions and animations.', () => { close(); exportVideoDialog(); }),
    card('picture', 'Animated GIF', '', () => { close(); exportGifDialog(); }),
    card('picture', 'All slides as PNG (zip)', '', () => job('Exporting images…', async () => downloadBlob(await IO.exportImagesZip(E.doc, 'png'), name('png.zip')))),
    card('picture', 'All slides as JPG (zip)', '', () => job('Exporting images…', async () => downloadBlob(await IO.exportImagesZip(E.doc, 'jpg'), name('jpg.zip')))),
    card('picture', 'Current slide as PNG', '', () => job('Exporting…', async () => { const c = renderToCanvas(E.doc, slide(), 1920, { present: true, index: E.cur }); c.toBlob(b => downloadBlob(b, name(`slide${E.cur + 1}.png`))); })),
    card('svg', 'Current slide as SVG', 'Shapes and text stay vector.', () => job('Exporting SVG…', async () => downloadBlob(await IO.exportSVG(E.doc, E.cur), name(`slide${E.cur + 1}.svg`)))),
    card('online', 'HTML Presentation', 'A single self-contained web page.', () => job('Exporting HTML…', async () => { downloadBlob(await IO.exportHTML(E.doc), name('html')); compatReport(['HTML export uses pre-rendered slides; signature and 3D transitions play as smooth fades/slides. Use .lpres or video export to keep them exactly.'], 'HTML'); })),
    card('save', 'Lasteast Presentation (.lpres)', 'Native format — keeps everything.', () => { close(); run('saveAs'); }),
  ];
}
async function exportODP() {
  const z = new window.JSZip(); const imgs = await IO.slideImages(E.doc, { width: 1600, type: 'image/jpeg' }); const W = (E.doc.size.w / 96 * 2.54).toFixed(2), H = (E.doc.size.h / 96 * 2.54).toFixed(2);
  z.file('mimetype', 'application/vnd.oasis.opendocument.presentation', { compression: 'STORE' });
  z.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.presentation"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>${imgs.map(({ i }) => `<manifest:file-entry manifest:full-path="Pictures/s${i}.jpg" manifest:media-type="image/jpeg"/>`).join('')}</manifest:manifest>`);
  z.file('styles.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" office:version="1.2"><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="${W}cm" fo:page-height="${H}cm" style:print-orientation="landscape"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>`);
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  z.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:presentation>${imgs.map(({ i }) => `<draw:page draw:name="Slide ${i + 1}" draw:master-page-name="Default"><draw:frame svg:x="0cm" svg:y="0cm" svg:width="${W}cm" svg:height="${H}cm"><draw:image xlink:href="Pictures/s${i}.jpg" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame><presentation:notes><draw:frame svg:x="2cm" svg:y="14cm" svg:width="17cm" svg:height="10cm"><draw:text-box>${(E.doc.slides[i].notes || '').split('\n').map(l => `<text:p>${esc(l)}</text:p>`).join('')}</draw:text-box></draw:frame></presentation:notes></draw:page>`).join('')}</office:presentation></office:body></office:document-content>`);
  imgs.forEach(({ i, blob }) => z.file(`Pictures/s${i}.jpg`, blob));
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.presentation' });
}
export function compatReport(lines, fmt) { if (!lines.length) { toast(t('Exported with full fidelity.')); return; } dialog({ title: t('Compatibility Report') + ' — ' + fmt, body: el('div', {}, el('p', {}, t('These features could not be reproduced exactly. They are preserved in your .lpres file:')), el('ul', { class: 'compat' }, ...lines.map(l => el('li', {}, t(l))))), buttons: [{ label: t('OK'), primary: true }] }); }
function optionsPane() {
  const km = keyMap();
  return el('div', { class: 'd-form' },
    el('h3', {}, t('General')),
    F('Interface theme', (() => { const s = sel([['light', 'Light'], ['dark', 'Dark']], E.prefs.uiTheme); s.onchange = () => { E.prefs.uiTheme = s.value; savePrefs(); document.body.dataset.theme = s.value; }; return s; })()),
    (() => { const c = el('input', { type: 'checkbox', checked: E.prefs.autosave }); c.onchange = () => { E.prefs.autosave = c.checked; savePrefs(); }; return el('label', { class: 'p-chk' }, c, ' ', t('AutoSave to this device')); })(),
    (() => { const c = el('input', { type: 'checkbox', checked: E.prefs.perf }); c.onchange = () => { E.prefs.perf = c.checked; savePrefs(); }; return el('label', { class: 'p-chk' }, c, ' ', t('Performance Mode (reduce effects on slower computers)')); })(),
    (() => { const c = el('input', { type: 'checkbox', checked: E.prefs.spell }); c.onchange = () => { E.prefs.spell = c.checked; savePrefs(); }; return el('label', { class: 'p-chk' }, c, ' ', t('Check spelling as you type')); })(),
    el('div', { class: 'p-btnrow' }, el('button', { class: 'btn', onclick: () => shortcuts() }, t('Customize Keyboard Shortcuts…')), el('button', { class: 'btn', onclick: () => aiSettings() }, t('AI Settings…')), el('button', { class: 'btn', onclick: async () => { if (await confirmBox(t('Reset settings'), t('Reset all preferences to defaults?'))) { localStorage.removeItem('lp.prefs'); localStorage.removeItem('lp.keys'); location.reload(); } } }, t('Reset Settings'))),
    el('p', { class: 'p-note' }, t('Shortcuts in use') + ': ' + Object.entries(km).slice(0, 8).map(([k, v]) => `${v}`).join(' · ') + ' …'));
}
export function about() {
  const v = window.LP_VERSION || '1.0.0';
  return el('div', { class: 'about' }, el('div', { class: 'about-logo', html: ICONS.logo }), el('h2', {}, 'Lasteast Present'), el('div', { class: 'about-ed' }, 'Professional 2027'), el('p', { class: 'slogan' }, 'Ideas. Design. Present.'),
    el('p', {}, t('Version') + ' ' + v + (window.lpDesktop ? ' · ' + t('Desktop') + ' (' + window.lpDesktop.platform + ')' : ' · ' + t('Web')) + ' · ' + navigator.userAgent.match(/(Chrome|Firefox|Safari|Edg)\/[\d.]+/)?.[0]),
    el('p', {}, t('Rendering') + ': ' + (document.createElement('canvas').getContext('webgl') ? 'WebGL ✓' : 'Canvas 2D (no WebGL)') + ' · ' + t('Recording') + ': ' + (pickMime() !== null ? (pickMime() || 'webm') : '—')),
    el('p', { class: 'p-note' }, t('Third-party components: PptxGenJS (MIT), jsPDF (MIT), JSZip (MIT/GPLv3). Optional online components: MediaPipe Tasks Vision (Apache-2.0) for camera background effects, PDF.js (Apache-2.0) for PDF import.')),
    window.lpDesktop ? el('button', { class: 'btn', onclick: () => window.lpDesktop.checkUpdates() }, t('Check for Updates')) : el('a', { class: 'btn', href: '../#download', target: '_blank' }, t('Download desktop app')));
}
export function properties() {
  const p = E.doc.props || (E.doc.props = {});
  const f = { title: el('input', { value: E.doc.title, dir: 'auto' }), author: el('input', { value: p.author || '', dir: 'auto' }), subject: el('input', { value: p.subject || '', dir: 'auto' }), keywords: el('input', { value: p.keywords || '', dir: 'auto' }), company: el('input', { value: p.company || '', dir: 'auto' }) };
  dialog({ title: t('Properties'), body: el('div', { class: 'd-form' }, ...Object.entries(f).map(([k, i]) => F(k[0].toUpperCase() + k.slice(1), i))), buttons: [{ label: t('Cancel') }, { label: t('OK'), primary: true, onClick: () => commit('Properties', () => { E.doc.title = f.title.value; E.doc.props = { author: f.author.value, subject: f.subject.value, keywords: f.keywords.value, company: f.company.value }; }) }] });
}
export async function versionHistory() {
  const list = await IO.versions(E.doc.id);
  dialog({ title: t('Version History'), body: list.length ? el('div', { class: 'pick-list' }, ...list.map(v => el('div', { class: 'ver' }, el('span', {}, new Date(v.t).toLocaleString(getLang()) + ' — ' + t(v.label)), el('button', { class: 'btn sm', onclick: async () => { if (!(await confirmBox(t('Restore version'), t('Replace the current presentation with this version? (You can undo.)')))) return; const d = JSON.parse(v.data); structural(); commit('Restore version', () => { Object.assign(E.doc, d); }); refreshAll(); $('.dialog-back')?.remove(); } }, t('Restore'))))) : el('p', {}, t('No versions yet. Versions are created when you save and every few minutes while editing.')), buttons: [{ label: t('Close') }] });
}
export function passwordDialog() {
  const p1 = el('input', { type: 'password', autocomplete: 'new-password' }), p2 = el('input', { type: 'password', autocomplete: 'new-password' }), ro = el('input', { type: 'checkbox', checked: E.readOnly });
  dialog({ title: t('Protect Presentation'), body: el('div', { class: 'd-form' }, el('p', { class: 'p-note' }, t('Files saved with a password are encrypted with AES-256-GCM (PBKDF2, 210,000 iterations). If you forget the password the file cannot be recovered.')), F('Password', p1), F('Confirm password', p2), el('label', { class: 'p-chk' }, ro, ' ', t('Open in read-only mode (this session)')), E.doc._passwordValue ? el('button', { class: 'btn sm', onclick: () => { E.doc._passwordValue = null; toast(t('Password removed. Save to apply.')); $('.dialog-back')?.remove(); } }, t('Remove password')) : null), buttons: [{ label: t('Cancel') }, { label: t('OK'), primary: true, onClick: () => { if (p1.value || p2.value) { if (p1.value !== p2.value) { toast(t('Passwords do not match.')); return false; } E.doc._passwordValue = p1.value; toast(t('Password set. It will be applied when you save.')); } E.readOnly = ro.checked; emit('change', {}); } }] });
}

// ---------------------------------------------------------------- insert dialogs
export function tableGrid(cb) {
  const g = el('div', { class: 'tgrid' }); const lab = el('div', { class: 'tg-lab' }, t('Insert Table'));
  for (let r = 0; r < 8; r++) for (let c = 0; c < 10; c++) { const cell = el('div', { 'data-r': r, 'data-c': c }); cell.addEventListener('mouseenter', () => { $$('div', g).forEach(x => x.classList.toggle('on', +x.dataset.r <= r && +x.dataset.c <= c)); lab.textContent = `${c + 1} × ${r + 1}`; }); cell.addEventListener('click', () => { $$('.menu').forEach(m => m.remove()); cb(r + 1, c + 1); }); g.append(cell); }
  return el('div', {}, lab, g);
}
export function tableDialog() { const r = el('input', { type: 'number', value: 4, min: 1, max: 50 }), c = el('input', { type: 'number', value: 4, min: 1, max: 30 }); dialog({ title: t('Insert Table'), body: el('div', { class: 'd-form' }, F('Number of columns', c), F('Number of rows', r)), buttons: [{ label: t('Cancel') }, { label: t('OK'), primary: true, onClick: () => run('table', +r.value, +c.value) }] }); }
export async function onlineImage(query = '') {
  const url = el('input', { type: 'url', placeholder: 'https://…/image.jpg', dir: 'ltr' });
  const body = el('div', { class: 'd-form' }, el('p', { class: 'p-note' }, t('Paste the address of an image you have the right to use. Many websites block embedding; if loading fails, download the image and use Pictures instead.')), F('Image URL', url),
    query ? el('p', {}, t('Search the web for') + ': ', el('a', { href: 'https://commons.wikimedia.org/w/index.php?search=' + encodeURIComponent(query), target: '_blank', rel: 'noopener' }, 'Wikimedia Commons'), ' · ', el('a', { href: 'https://unsplash.com/s/photos/' + encodeURIComponent(query), target: '_blank', rel: 'noopener' }, 'Unsplash'), ' · ', el('a', { href: 'https://www.pexels.com/search/' + encodeURIComponent(query), target: '_blank', rel: 'noopener' }, 'Pexels')) : null);
  dialog({ title: t('Online Images'), body, buttons: [{ label: t('Cancel') }, { label: t('Insert'), primary: true, onClick: async () => { try { const r = await fetch(url.value); if (!r.ok) throw new Error(r.status); const b = await r.blob(); if (!b.type.startsWith('image/')) throw new Error(t('Not an image')); await run('insertImageData', await readAsDataURL(b), url.value.split('/').pop()); } catch (e) { alertBox(t('Could not load image'), t('The image could not be downloaded (the site may block it).') + ' ' + e.message); } } }] });
}
export function iconPicker() {
  const color = el('input', { type: 'color', value: toHex(resolveColor('@accent', E.doc.theme)) }); const q = el('input', { type: 'search', placeholder: t('Search icons') });
  const grid = el('div', { class: 'icon-grid' }); const chosen = new Set();
  const render = () => { grid.innerHTML = ''; for (const n of Object.keys(CONTENT_ICONS).filter(n => n.includes(q.value.toLowerCase()))) grid.append(el('button', { class: chosen.has(n) ? 'on' : '', title: n, html: iconSVG(n, color.value), onclick: () => { chosen.has(n) ? chosen.delete(n) : chosen.add(n); render(); } })); };
  q.oninput = render; color.oninput = render; render();
  dialog({ title: t('Icons'), wide: true, body: el('div', {}, el('div', { class: 'p-row' }, q, F('Color', color)), grid), buttons: [{ label: t('Cancel') }, { label: t('Insert'), primary: true, onClick: () => { const list = [...chosen].map((n, i) => makeImage(addAsset(E.doc, 'image', 'data:image/svg+xml;base64,' + btoa(iconSVG(n, color.value)), n), { x: E.doc.size.w / 2 - 60 + i * 140 - (chosen.size - 1) * 70, y: E.doc.size.h / 2 - 60, w: 120, h: 120, name: 'Icon ' + n, alt: n })); if (list.length) insertObjects(list, 'Insert icons'); } }] });
}
export async function screenshot() {
  try { const s = await navigator.mediaDevices.getDisplayMedia({ video: true }); const v = el('video', { muted: true }); v.srcObject = s; await v.play(); await sleep(400); const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); s.getTracks().forEach(t2 => t2.stop()); run('insertImageData', c.toDataURL('image/png'), 'Screenshot'); }
  catch (e) { toast(t('Screenshot cancelled or not supported.')); }
}
export function chartPicker() {
  const g = el('div', { class: 'chart-pick' });
  const d = dialog({ title: t('Insert Chart'), wide: true, body: g, buttons: [{ label: t('Cancel') }] });
  for (const ty of CHART_TYPES) { const c = document.createElement('canvas'); c.width = 200; c.height = 130; const o = makeChart(ty, { x: 0, y: 0, w: 200, h: 130, title: '' }); if (ty === 'pie' || ty === 'doughnut') o.data = { labels: ['A', 'B', 'C', 'D'], series: [{ name: 'S', values: [40, 25, 20, 15] }] }; renderSlide(c.getContext('2d'), E.doc, { objects: [o], bg: { type: 'solid', color: '@bg' } }, { scale: 1, noMaster: true }); g.append(el('button', { onclick: () => { d.close(); run('chart', ty); } }, c, el('span', {}, t(ty)))); }
}
export function chartData(o) {
  const rows = [['', ...o.data.series.map(s => s.name)], ...o.data.labels.map((l, i) => [l, ...o.data.series.map(s => s.values[i] ?? '')])];
  const tbl = el('table', { class: 'data-grid' });
  const render = () => { tbl.innerHTML = ''; rows.forEach((r, ri) => tbl.append(el('tr', {}, ...r.map((v, ci) => el('td', {}, el('input', { value: v, dir: 'auto', class: ri === 0 || ci === 0 ? 'head' : '', oninput: (e) => { rows[ri][ci] = e.target.value; live(); } })))))); };
  const live = () => { o.data = toData(); drawStage(); };
  const toData = () => ({ labels: rows.slice(1).map(r => r[0]), series: rows[0].slice(1).map((n, j) => ({ name: n, values: rows.slice(1).map(r => parseFloat(r[j + 1]) || 0) })) });
  const orig = deepClone(o.data); render();
  dialog({ title: t('Edit Chart Data'), wide: true, body: el('div', {}, el('div', { class: 'p-btnrow' }, el('button', { class: 'btn sm', onclick: () => { rows.push([t('New'), ...rows[0].slice(1).map(() => 0)]); render(); live(); } }, '+ ' + t('Row')), el('button', { class: 'btn sm', onclick: () => { rows.forEach((r, i) => r.push(i ? 0 : t('Series') + ' ' + r.length)); render(); live(); } }, '+ ' + t('Series')), el('button', { class: 'btn sm', onclick: () => { if (rows.length > 2) { rows.pop(); render(); live(); } } }, '− ' + t('Row')), el('button', { class: 'btn sm', onclick: () => { if (rows[0].length > 2) { rows.forEach(r => r.pop()); render(); live(); } } }, '− ' + t('Series')), el('button', { class: 'btn sm', onclick: () => importChartData(o, (d) => { rows.length = 0; rows.push(['', ...d.series.map(s => s.name)], ...d.labels.map((l, i) => [l, ...d.series.map(s => s.values[i])])); render(); live(); }) }, t('Import CSV / Excel…'))), tbl, el('p', { class: 'p-note' }, t('Changes update the chart live.'))),
    buttons: [{ label: t('Cancel'), onClick: () => { o.data = orig; drawStage(); } }, { label: t('OK'), primary: true, onClick: () => { const d2 = toData(); o.data = orig; commit('Chart data', () => o.data = d2); } }] });
}
export async function importChartData(o, cb) {
  const f = await pickFile('.csv,.xlsx,.tsv,.txt'); if (!f) return;
  try { const rows = /\.xlsx$/i.test(f.name) ? await IO.xlsxRows(f) : IO.parseCSV(await readAsText(f)); const d = IO.rowsToChartData(rows); if (cb) cb(d); else commit('Import chart data', () => o.data = d); toast(t('Imported') + ': ' + d.labels.length + ' × ' + d.series.length); }
  catch (e) { alertBox(t('Import failed'), String(e.message)); }
}
export function hyperlink() {
  const o = sel1(); if (!o) { toast(t('Select an object or text box to link.')); return; }
  const l = o.link || { type: 'url', url: 'https://' };
  const type = sel([['url', 'Web address'], ['slide', 'Place in this presentation'], ['next', 'Next slide'], ['prev', 'Previous slide'], ['first', 'First slide'], ['last', 'Last slide'], ['end', 'End show']], l.type);
  const url = el('input', { type: 'url', value: l.url || 'https://', dir: 'ltr' }); const sl = sel(E.doc.slides.map((s, i) => [s.id, `${i + 1}. ${(s.objects.find(x => x.ph === 'title')?.text || '').slice(0, 40)}`]), l.slide);
  const sync = () => { url.parentElement.hidden = type.value !== 'url'; sl.parentElement.hidden = type.value !== 'slide'; };
  const body = el('div', { class: 'd-form' }, F('Link to', type), F('Address', url), F('Slide', sl)); type.onchange = sync;
  dialog({ title: t('Insert Hyperlink'), body, buttons: [{ label: t('Remove Link'), onClick: () => commit('Remove link', () => selObjs().forEach(x => x.link = null)) }, { label: t('Cancel') }, { label: t('OK'), primary: true, onClick: () => commit('Hyperlink', () => selObjs().forEach(x => x.link = type.value === 'url' ? { type: 'url', url: url.value } : type.value === 'slide' ? { type: 'slide', slide: sl.value } : { type: type.value })) }] }); sync();
}
export function actionButton(type, glyph) { const o = makeShape('roundRect', { x: E.doc.size.w - 150, y: E.doc.size.h - 100, w: 110, h: 64, text: glyph, size: 28, fill: '@accent', radius: 14, link: { type }, name: 'Action button ' + type }); insertObjects([o], 'Action button'); }
export function altText() { const o = sel1(); if (!o) return; prompt(t('Alt Text'), o.alt || '', { area: true, label: t('Describe this object for people who use screen readers.') }).then(v => v != null && commit('Alt text', () => o.alt = v)); }
export function headerFooter() {
  const m = E.doc.master; const f = el('input', { value: m.footer || '', dir: 'auto' }), n = el('input', { type: 'checkbox', checked: m.showNumber }), d = el('input', { type: 'checkbox', checked: m.showDate }), notTitle = el('input', { type: 'checkbox', checked: !!m.notOnTitle });
  dialog({ title: t('Header & Footer'), body: el('div', { class: 'd-form' }, el('label', { class: 'p-chk' }, d, ' ', t('Date and time')), el('label', { class: 'p-chk' }, n, ' ', t('Slide number')), F('Footer', f), el('label', { class: 'p-chk' }, notTitle, ' ', t("Don't show on title slide"))), buttons: [{ label: t('Cancel') }, { label: t('Apply to All'), primary: true, onClick: () => { commit('Header & Footer', () => { Object.assign(m, { footer: f.value, showNumber: n.checked, showDate: d.checked, notOnTitle: notTitle.checked }); if (notTitle.checked && E.doc.slides[0]) E.doc.slides[0].hideMaster = true; }); renderSlidesPanel(); } }] });
}
export function dateTime() { const fmts = [{ dateStyle: 'full' }, { dateStyle: 'long' }, { dateStyle: 'short' }, { dateStyle: 'medium', timeStyle: 'short' }, { timeStyle: 'short' }]; pickList(t('Date & Time'), fmts.map(f => new Intl.DateTimeFormat(E.doc.lang || getLang(), f).format(new Date())), (s) => insertObjects([makeText({ ...center0(500, 60), text: s, size: 24 })], 'Date')); }
export function equation() {
  const map = { '^2': '²', '^3': '³', '^n': 'ⁿ', '^x': 'ˣ', '^-1': '⁻¹', '_0': '₀', '_1': '₁', '_2': '₂', '_n': 'ₙ', '_i': 'ᵢ', 'sqrt': '√', 'sum': '∑', 'int': '∫', 'pi': 'π', 'inf': '∞', '<=': '≤', '>=': '≥', '!=': '≠', '+-': '±', '*': '×', '/': '÷', '->': '→', 'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'Δ', 'theta': 'θ', 'lambda': 'λ', 'mu': 'μ', 'sigma': 'σ', 'omega': 'Ω', 'approx': '≈', 'deg': '°', 'in': '∈', 'forall': '∀', 'exists': '∃', 'partial': '∂', 'nabla': '∇' };
  const syms = ['²', '³', 'ⁿ', '₁', '₂', '√', '∛', '∑', '∏', '∫', '∮', 'π', '∞', '≤', '≥', '≠', '≈', '±', '×', '÷', '→', '⇒', '⇔', '∈', '∉', '⊂', '∪', '∩', '∀', '∃', '∂', '∇', 'α', 'β', 'γ', 'Δ', 'θ', 'λ', 'μ', 'σ', 'Ω', '°', '‰', 'ℝ', 'ℕ', 'ℤ'];
  const ta = el('textarea', { rows: 3, dir: 'ltr', value: 'E = mc^2' }); const prev = el('div', { class: 'eq-prev' });
  const conv = (s) => { let o = s; for (const k of Object.keys(map).sort((a, b) => b.length - a.length)) o = o.split(k).join(map[k]); o = o.replace(/\^\(([^)]+)\)/g, (_, x) => x.split('').map(ch => '⁰¹²³⁴⁵⁶⁷⁸⁹'['0123456789'.indexOf(ch)] || ch).join('')).replace(/_\(([^)]+)\)/g, (_, x) => x.split('').map(ch => '₀₁₂₃₄₅₆₇₈₉'['0123456789'.indexOf(ch)] || ch).join('')); return o; };
  const upd = () => prev.textContent = conv(ta.value); ta.oninput = upd; upd();
  dialog({ title: t('Equation'), body: el('div', { class: 'd-form' }, el('p', { class: 'p-note' }, t('Type in linear format: x^2, a_1, sqrt, sum, int, pi, <=, alpha … Use ^(10) for multi-digit exponents.')), ta, el('div', { class: 'sym-grid' }, ...syms.map(s => el('button', { onclick: () => { ta.value += s; upd(); } }, s))), prev), buttons: [{ label: t('Cancel') }, { label: t('Insert'), primary: true, onClick: () => insertObjects([makeText({ ...center0(700, 100), text: conv(ta.value), font: 'Cambria Math, STIX Two Math, Times New Roman', size: 44, align: 'center', valign: 'middle', italic: false, dir: 'ltr', name: 'Equation' })], 'Equation') }] });
}
export function symbols() {
  const groups = { Common: '©®™§¶•…–—‘’“”«»‹›€£¥¢₪﷼$%‰°±×÷≈≠≤≥∞√∑π', Arrows: '←↑→↓↔↕⇐⇒⇔↩↪⟵⟶➜➤', Shapes: '■□▢▲△▼▽◆◇○●◎★☆♥♦♣♠✓✔✗✘', Hebrew: 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ₪', Arabic: 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي٠١٢٣٤٥٦٧٨٩،؛؟', Greek: 'αβγδεζηθικλμνξοπρστυφχψωΓΔΘΛΞΠΣΦΨΩ', Emoji: '😀😃😊😍🤔👍👏🙌💡🎯🚀📈📊📌✅⭐🔥🎉📝🌍' };
  const out = el('input', { dir: 'auto' }); const body = el('div', {});
  for (const [g, s] of Object.entries(groups)) body.append(el('h4', {}, t(g)), el('div', { class: 'sym-grid' }, ...[...s].map(ch => el('button', { onclick: () => out.value += ch }, ch))));
  dialog({ title: t('Symbol'), wide: true, body: el('div', {}, body, F('Selected', out)), buttons: [{ label: t('Cancel') }, { label: t('Insert'), primary: true, onClick: () => { const o = sel1(); if (o && 'text' in o) commit('Symbol', () => o.text = (o.text || '') + out.value); else insertObjects([makeText({ ...center0(300, 80), text: out.value, size: 40 })], 'Symbol'); } }] });
}
export function embedObject() {
  const url = el('input', { type: 'url', placeholder: 'https://www.youtube.com/watch?v=…', dir: 'ltr' });
  dialog({ title: t('Embedded Object'), body: el('div', { class: 'd-form' }, el('p', { class: 'p-note' }, t('Add a link card to web content (video, map, document). In the slide show, clicking it opens the content. Files (PDF, documents) are embedded as preview pictures through Import.')), F('Address', url)), buttons: [{ label: t('Cancel') }, { label: t('Insert'), primary: true, onClick: () => { let host = ''; try { host = new URL(url.value).hostname; } catch (e) { toast(t('Invalid address')); return false; } insertObjects([makeShape('roundRect', { ...center0(560, 140), fill: '@surface', stroke: '@accent', strokeW: 3, color: '@text', text: '\u{1F517} ' + host + '\n' + url.value.slice(0, 60), size: 22, link: { type: 'url', url: url.value }, name: 'Embedded link' })], 'Embed'); } }] });
}

// ---------------------------------------------------------------- SmartArt-style diagrams
export function diagramDialog(opts = {}) {
  const kinds = [['process', 'Process'], ['cycle', 'Cycle'], ['hierarchy', 'Hierarchy / Organization Chart'], ['timeline', 'Timeline'], ['venn', 'Venn'], ['pyramid', 'Pyramid'], ['relationship', 'Relationship (hub & spoke)'], ['mindmap', 'Mind Map'], ['flowchart', 'Flowchart'], ['network', 'Network'], ['list', 'List (cards)']];
  const k = sel(kinds, 'process'); const ta = el('textarea', { rows: 8, dir: 'auto', value: 'Research\nPlan\nDesign\nBuild\nLaunch' });
  const prev = el('canvas', { width: 480, height: 270, class: 'diag-prev' });
  const upd = () => { const items = parseItems(ta.value); const objs = buildDiagram(k.value, items); renderSlide(prev.getContext('2d'), E.doc, { objects: objs, bg: null }, { scale: 480 / E.doc.size.w, noMaster: true }); };
  k.onchange = () => { if (k.value === 'hierarchy' || k.value === 'mindmap') ta.value = 'CEO\n  Operations\n    Logistics\n  Product\n    Design\n    Engineering\n  Sales'; else if (k.value === 'venn') ta.value = 'Desirable\nViable\nFeasible'; else if (k.value === 'flowchart') ta.value = 'Start\nCollect data\n? Data valid\nProcess\nEnd'; upd(); }; ta.oninput = upd;
  const aiBtn = el('button', { class: 'btn sm', onclick: async () => { const src = await prompt(t('Describe the diagram or paste text'), sel1()?.text || '', { area: true }); if (!src) return; const b = busy(t('AI is working…')); try { const r = await AI.diagram(src, k.value); ta.value = (r.items || []).join('\n'); upd(); } catch (e) { aiError(e); } b.done(); } }, '✨ ' + t('Generate with AI'));
  dialog({ title: t('SmartArt Diagram'), wide: true, body: el('div', { class: 'diag' }, el('div', { class: 'd-form' }, F('Type', k), F('Items (one per line, indent with spaces for levels)', ta), aiBtn), prev), buttons: [{ label: t('Cancel') }, { label: t('Insert'), primary: true, onClick: () => { const g = uid('g'); const objs = buildDiagram(k.value, parseItems(ta.value)); objs.forEach(o => o.group = g); insertObjects(objs, 'Insert diagram'); } }] });
  setTimeout(upd, 30);
  if (opts.ai) setTimeout(() => aiBtn.click(), 60);
}
function parseItems(s) { return s.split('\n').filter(l => l.trim()).map(l => ({ text: l.trim(), level: Math.floor((l.match(/^\s*/)[0].replace(/\t/g, '  ').length) / 2) })); }
export function buildDiagram(kind, items) {
  const W = E.doc.size.w, H = E.doc.size.h, out = [], m = 80, cols = ['@accent', '@accent2', '@accent3'];
  const box = (text, x, y, w, h, i = 0, shape = 'roundRect', o = {}) => { const s = makeShape(shape, { x, y, w, h, text, fill: cols[i % 3], radius: 14, size: Math.max(14, Math.min(26, h * .28)), color: '#ffffff', name: 'Diagram: ' + text, ...o }); out.push(s); return s; };
  const line = (x1, y1, x2, y2, arrow = true) => { const len = Math.hypot(x2 - x1, y2 - y1); out.push(makeShape(arrow ? 'arrowLine' : 'line', { x: (x1 + x2) / 2 - len / 2, y: (y1 + y2) / 2 - 8, w: len, h: 16, rot: Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI, stroke: '@muted', strokeW: 3, fill: 'none', name: 'Connector' })); };
  const n = items.length || 1;
  if (kind === 'process') { const w = (W - 2 * m - (n - 1) * 50) / n, h = 140, y = H / 2 - h / 2; items.forEach((it, i) => { box(it.text, m + i * (w + 50), y, w, h, i, 'chevron'); }); }
  else if (kind === 'list') { const w = (W - 2 * m - (n - 1) * 24) / n; items.forEach((it, i) => { box(String(i + 1).padStart(2, '0') + '\n' + it.text, m + i * (w + 24), H * .3, w, H * .45, i, 'roundRect', { valign: 'top', align: 'start', size: 22 }); }); }
  else if (kind === 'cycle') { const R = Math.min(W, H) * .32, cx = W / 2, cy = H / 2, bw = 210, bh = 90; items.forEach((it, i) => { const a = -Math.PI / 2 + i / n * Math.PI * 2, a2 = -Math.PI / 2 + (i + .5) / n * Math.PI * 2; box(it.text, cx + Math.cos(a) * R - bw / 2, cy + Math.sin(a) * R - bh / 2, bw, bh, i, 'ellipse'); const r2 = R * .98; line(cx + Math.cos(a2 - .25) * r2, cy + Math.sin(a2 - .25) * r2, cx + Math.cos(a2 + .25) * r2, cy + Math.sin(a2 + .25) * r2); }); }
  else if (kind === 'timeline') { const y = H / 2; out.push(makeShape('rect', { x: m, y: y - 3, w: W - 2 * m, h: 6, fill: '@muted', radius: 0, text: '', name: 'Timeline' })); items.forEach((it, i) => { const x = m + (i + .5) * (W - 2 * m) / n; out.push(makeShape('ellipse', { x: x - 14, y: y - 14, w: 28, h: 28, fill: cols[i % 3], text: '', name: 'Milestone' })); out.push(makeText({ x: x - 110, y: i % 2 ? y + 30 : y - 110, w: 220, h: 80, text: it.text, align: 'center', valign: i % 2 ? 'top' : 'bottom', size: 22, bold: true })); }); }
  else if (kind === 'venn') { const R = Math.min(W, H) * .26, cx = W / 2, cy = H / 2 + 10; items.slice(0, 4).forEach((it, i) => { const a = -Math.PI / 2 + i / Math.min(n, 4) * Math.PI * 2; box(it.text, cx + Math.cos(a) * R * .55 - R, cy + Math.sin(a) * R * .55 - R, 2 * R, 2 * R, i, 'ellipse', { opacity: .62, valign: i === 0 ? 'top' : 'bottom', size: 24, pad: R * .35 }); }); }
  else if (kind === 'pyramid') { const h = (H - 2 * m) / n; items.forEach((it, i) => { const w = (W * .55) * (i + 1) / n; box(it.text, W / 2 - w / 2, m + i * h, w, h - 6, i, i === 0 ? 'triangle' : 'trapezoid', { radius: 0, valign: i === 0 ? 'bottom' : 'middle' }); }); }
  else if (kind === 'relationship') { const cx = W / 2, cy = H / 2, R = Math.min(W, H) * .34; box(items[0]?.text || '', cx - 120, cy - 70, 240, 140, 0, 'ellipse'); items.slice(1).forEach((it, i) => { const a = -Math.PI / 2 + i / (n - 1) * Math.PI * 2, x = cx + Math.cos(a) * R * 1.25, y = cy + Math.sin(a) * R; line(cx + Math.cos(a) * 120, cy + Math.sin(a) * 70, x - Math.cos(a) * 95, y - Math.sin(a) * 45, false); box(it.text, x - 95, y - 45, 190, 90, i + 1); }); }
  else if (kind === 'hierarchy' || kind === 'mindmap' || kind === 'network') {
    // build tree
    const root = { ...items[0], kids: [] }, stack = [root];
    for (const it of items.slice(1)) { const nd = { ...it, kids: [] }; while (stack.length > 1 && stack.at(-1).level >= it.level) stack.pop(); stack.at(-1).kids.push(nd); stack.push(nd); }
    if (kind === 'hierarchy') {
      const levels = []; const walk = (nd, d) => { (levels[d] = levels[d] || []).push(nd); nd.kids.forEach(k2 => walk(k2, d + 1)); }; walk(root, 0);
      const leaves = (nd) => nd.kids.length ? nd.kids.reduce((s, k2) => s + leaves(k2), 0) : 1; const tot = leaves(root); const lh = (H - 2 * m) / levels.length; const bw = Math.min(220, (W - 2 * m) / tot - 16), bh = Math.min(90, lh - 40);
      const place = (nd, x0, x1, d) => { nd.x = (x0 + x1) / 2; nd.y = m + d * lh; let x = x0; for (const k2 of nd.kids) { const span = (x1 - x0) * leaves(k2) / leaves(nd); place(k2, x, x + span, d + 1); x += span; } }; place(root, m, W - m, 0);
      const draw = (nd, d) => { box(nd.text, nd.x - bw / 2, nd.y, bw, bh, d); for (const k2 of nd.kids) { line(nd.x, nd.y + bh, k2.x, k2.y, false); draw(k2, d + 1); } }; draw(root, 0);
    } else {
      const cx = W / 2, cy = H / 2; box(root.text, cx - 130, cy - 55, 260, 110, 0, kind === 'network' ? 'hexagon' : 'ellipse');
      const k1 = root.kids.length || 1; root.kids.forEach((ch, i) => { const a = i / k1 * Math.PI * 2 - Math.PI / 2, R = Math.min(W, H) * .3, x = cx + Math.cos(a) * R * 1.35, y = cy + Math.sin(a) * R; line(cx, cy, x, y, false); ch.kids.forEach((g2, j) => { const a2 = a + (j - (ch.kids.length - 1) / 2) * .45, x2 = cx + Math.cos(a2) * R * 2.05, y2 = cy + Math.sin(a2) * R * 1.55; line(x, y, x2, y2, false); box(g2.text, x2 - 80, y2 - 26, 160, 52, 2, 'roundRect', { size: 16 }); }); box(ch.text, x - 95, y - 38, 190, 76, 1, kind === 'network' ? 'hexagon' : 'roundRect'); });
      if (kind === 'network') { root.kids.forEach((a, i) => { const b = root.kids[(i + 1) % k1]; if (k1 > 2) { const R = Math.min(W, H) * .3, a1 = i / k1 * Math.PI * 2 - Math.PI / 2, a2 = (i + 1) / k1 * Math.PI * 2 - Math.PI / 2; line(cx + Math.cos(a1) * R * 1.35, cy + Math.sin(a1) * R, cx + Math.cos(a2) * R * 1.35, cy + Math.sin(a2) * R, false); } void b; }); }
    }
  } else if (kind === 'flowchart') {
    const h = Math.min(90, (H - 2 * m) / n - 30), w = 320; items.forEach((it, i) => { const dec = it.text.startsWith('?'); const sh = i === 0 || i === n - 1 ? 'roundRect' : dec ? 'diamond' : 'rect'; const y = m + i * (h + 30); box(dec ? it.text.slice(1).trim() + '?' : it.text, W / 2 - w / 2, y, w, h, dec ? 1 : i === 0 || i === n - 1 ? 2 : 0, sh, { radius: sh === 'roundRect' ? h / 2 : 0 }); if (i < n - 1) line(W / 2, y + h, W / 2, y + h + 30); if (dec) { out.push(makeText({ x: W / 2 + w / 2 + 10, y: y + h / 2 - 20, w: 80, h: 40, text: t('No'), size: 18 })); out.push(makeText({ x: W / 2 + 10, y: y + h, w: 80, h: 30, text: t('Yes'), size: 16 })); } }); }
  return out;
}

// ---------------------------------------------------------------- design
CMD.applyTheme = (id) => { const th = themeById(id); commit('Theme', () => { E.doc.theme = deepClone(th); }); renderSlidesPanel(); emit('ribbonState'); $$('.theme-tile').forEach(b => b.classList.toggle('on', b.title === th.name)); };
CMD.slideSize = (sz, mode = 'scale') => { const ow = E.doc.size.w, oh = E.doc.size.h; const k = Math.min(sz.w / ow, sz.h / oh), dx = (sz.w - ow * k) / 2, dy = (sz.h - oh * k) / 2; commit('Slide size', () => { E.doc.size = { w: sz.w, h: sz.h }; for (const s of E.doc.slides) for (const o of s.objects) { o.x = o.x * k + dx; o.y = o.y * k + dy; o.w *= k; o.h *= k; if (o.size) o.size *= k; } }); refreshAll(); };
export function customSize() { const w = el('input', { type: 'number', value: E.doc.size.w, min: 200, max: 8000 }), h = el('input', { type: 'number', value: E.doc.size.h, min: 200, max: 8000 }); dialog({ title: t('Custom Slide Size'), body: el('div', { class: 'd-form' }, F('Width (px)', w), F('Height (px)', h), el('p', { class: 'p-note' }, '96 px = 1 inch. ' + t('Content is scaled to fit.'))), buttons: [{ label: t('Cancel') }, { label: t('OK'), primary: true, onClick: () => run('slideSize', { w: +w.value, h: +h.value }) }] }); }
export function themeColors() {
  const th = E.doc.theme; const keys = ['bg', 'bg2', 'surface', 'text', 'muted', 'accent', 'accent2', 'accent3']; const inputs = {};
  const body = el('div', { class: 'd-form grid2' }, ...keys.map(k => F({ bg: 'Background', bg2: 'Background 2', surface: 'Surface', text: 'Text', muted: 'Muted text', accent: 'Accent 1', accent2: 'Accent 2', accent3: 'Accent 3' }[k], inputs[k] = el('input', { type: 'color', value: toHex(th[k]) }))), F('Heading font', inputs.head = el('input', { value: th.head })), F('Body font', inputs.body = el('input', { value: th.body })));
  dialog({ title: t('Customize Theme Colors'), body, buttons: [{ label: t('Cancel') }, { label: t('Save'), primary: true, onClick: () => { commit('Theme colors', () => { for (const k of keys) th[k] = inputs[k].value; th.head = inputs.head.value; th.body = inputs.body.value; th.id = 'custom'; th.name = 'Custom'; }); const ct = JSON.parse(localStorage.getItem('lp.customThemes') || '[]'); ct.push(deepClone(th)); localStorage.setItem('lp.customThemes', JSON.stringify(ct.slice(-12))); renderSlidesPanel(); } }] });
}
export function layoutPicker() {
  const g = el('div', { class: 'layout-pick' }); const d = dialog({ title: t('Slide Layout'), wide: true, body: g, buttons: [{ label: t('Cancel') }] });
  const items = [...LAYOUTS.map(l => [l, t('layout_' + l), layoutObjects(l, E.doc)]), ...(E.doc.customLayouts || []).map(c => [c.id, c.name, c.objects])];
  for (const [id, name, objs] of items) { const c = document.createElement('canvas'); c.width = 240; c.height = 240 * E.doc.size.h / E.doc.size.w; renderSlide(c.getContext('2d'), E.doc, { objects: objs, bg: null }, { scale: 240 / E.doc.size.w, editor: true, noMaster: true }); g.append(el('button', { class: slide().layout === id ? 'on' : '', onclick: () => { d.close(); run('layout', id); } }, c, el('span', {}, name))); }
}
export function designIdeas() {
  const s = slide(); const title = s.objects.find(o => o.ph === 'title')?.text || s.objects.find(o => o.text)?.text?.split('\n')[0] || t('Title');
  const body = s.objects.filter(o => o.type === 'text' && o.ph !== 'title' && o.text).map(o => o.text).join('\n'); const img = s.objects.find(o => o.type === 'image');
  const W = E.doc.size.w, H = E.doc.size.h, lines = body.split('\n').filter(Boolean);
  const T = (o) => makeText({ name: '!!title', ...o }), B = (o) => makeText({ name: 'Body', bullets: 'bullet', ...o });
  const ideas = [
    () => [makeShape('rect', { x: 0, y: 0, w: W * .38, h: H, fill: '@accent', radius: 0, text: '', name: 'Decoration' }), T({ text: title, x: 50, y: 60, w: W * .38 - 100, h: H - 120, font: '@head', size: 48, bold: true, color: '#ffffff', valign: 'middle' }), B({ text: body, x: W * .43, y: 80, w: W * .52, h: H - 160, size: 26, valign: 'middle' })],
    () => [T({ text: title, x: 80, y: 50, w: W - 160, h: 110, font: '@head', size: 46, bold: true, align: 'center' }), ...lines.slice(0, 4).map((l, i, a) => makeShape('roundRect', { x: 80 + i * (W - 160 + 24) / a.length, y: 200, w: (W - 160 + 24) / a.length - 24, h: H - 280, fill: '@surface', stroke: ['@accent', '@accent2', '@accent3', '@muted'][i], strokeW: 3, color: '@text', text: l, size: 24, valign: 'middle', radius: 20, name: 'Card ' + (i + 1) }))],
    () => [img ? { ...cloneObject(img), x: 0, y: 0, w: W, h: H, crop: { l: 0, t: 0, r: 0, b: 0 }, filters: { brightness: 70 } } : makeShape('rect', { x: 0, y: 0, w: W, h: H, fill: { type: 'linear', c1: '@accent', c2: '@accent2', angle: 135 }, radius: 0, text: '', name: 'Decoration' }), T({ text: title, x: 80, y: H * .32, w: W - 160, h: 140, font: '@head', size: 64, bold: true, color: '#ffffff', align: 'center', valign: 'middle', textShadow: { color: 'rgba(0,0,0,.4)', blur: 12, x: 0, y: 4 } }), B({ text: lines.slice(0, 2).join('\n'), x: 120, y: H * .56, w: W - 240, h: 120, size: 26, color: '#ffffff', align: 'center', bullets: 'none' })],
    () => [T({ text: title, x: 80, y: 60, w: W * .45, h: H * .4, font: '@head', size: 54, bold: true, valign: 'bottom' }), makeShape('rect', { x: 80, y: H * .48, w: 120, h: 8, fill: '@accent', radius: 4, text: '', name: 'Decoration' }), B({ text: body, x: 80, y: H * .54, w: W * .45, h: H * .38, size: 22, color: '@muted', bullets: 'none' }), img ? { ...cloneObject(img), x: W * .55, y: 60, w: W * .4, h: H - 120, mask: 'roundRect', radius: 30 } : makeShape('ellipse', { x: W * .6, y: H * .15, w: W * .32, h: W * .32, fill: { type: 'radial', c1: '@accent', c2: '@accent2' }, text: '', name: 'Decoration' })],
    () => [makeShape('rect', { x: 0, y: 0, w: W, h: H * .32, fill: '@accent3', radius: 0, text: '', name: 'Decoration' }), T({ text: title, x: 80, y: 40, w: W - 160, h: H * .32 - 80, font: '@head', size: 48, bold: true, color: '#ffffff', valign: 'middle' }), ...lines.slice(0, 6).map((l, i) => makeText({ x: 80 + (i % 2) * (W - 160) / 2, y: H * .38 + Math.floor(i / 2) * 110, w: (W - 200) / 2, h: 100, text: '✔  ' + l, size: 24, name: 'Point ' + (i + 1) }))],
    () => [makeShape('ellipse', { x: -W * .1, y: -H * .3, w: W * .5, h: W * .5, fill: '@accent', opacity: .15, text: '', name: 'Decoration' }), T({ text: title, x: 120, y: H * .25, w: W - 240, h: 120, font: '@head', size: 56, bold: true, align: 'center' }), B({ text: lines.join('  ·  '), x: 120, y: H * .48, w: W - 240, h: 160, size: 26, align: 'center', bullets: 'none', color: '@muted' })],
  ];
  const g = el('div', { class: 'layout-pick' }); const d = dialog({ title: t('Design Ideas'), wide: true, body: el('div', {}, el('p', { class: 'p-note' }, t('Alternative designs generated from the content of this slide. Click one to apply (you can undo).')), g), buttons: [{ label: t('Close') }] });
  ideas.forEach(f => { const objs = f(); const c = document.createElement('canvas'); c.width = 300; c.height = 300 * H / W; renderSlide(c.getContext('2d'), E.doc, { ...s, objects: objs }, { scale: 300 / W, present: true }); g.append(el('button', { onclick: () => { d.close(); structural(); commit('Design idea', () => { s.objects = [...s.objects.filter(o => o.type === 'chart' || o.type === 'table' || o.type === 'video'), ...f()]; }); } }, c)); });
}
export function slideMaster() {
  const m = E.doc.master, th = E.doc.theme;
  const prev = el('canvas', { width: 560, height: 560 * E.doc.size.h / E.doc.size.w, class: 'master-prev' });
  const draft = deepClone({ m, th }); const upd = () => renderSlide(prev.getContext('2d'), { ...E.doc, master: draft.m, theme: draft.th }, { objects: layoutObjects('titleContent', E.doc), bg: draft.m.bg }, { scale: 560 / E.doc.size.w, editor: true, index: 0 });
  const inp = (k, obj, type = 'text') => { const i = el('input', { type, value: type === 'color' ? toHex(obj[k]) : obj[k] ?? '', dir: 'auto', oninput: () => { obj[k] = i.value; upd(); } }); return i; };
  const logoBtn = el('button', { class: 'btn sm', onclick: async () => { const f = await pickFile('image/*'); if (f) { draft.m.logo = addAsset(E.doc, 'image', await readAsDataURL(f), f.name); upd(); } } }, t('Choose logo…'));
  const lp = sel([['br', 'Bottom right'], ['bl', 'Bottom left'], ['tr', 'Top right'], ['tl', 'Top left']], draft.m.logoPos); lp.onchange = () => { draft.m.logoPos = lp.value; upd(); };
  const bgSel = sel([['', 'Theme background'], ['solid', 'Solid'], ['linear', 'Gradient'], ['image', 'Picture']], draft.m.bg?.type || ''); bgSel.onchange = async () => { const v = bgSel.value; if (!v) draft.m.bg = null; else if (v === 'solid') draft.m.bg = { type: 'solid', color: draft.th.bg2 }; else if (v === 'linear') draft.m.bg = { type: 'linear', c1: draft.th.bg, c2: draft.th.bg2, angle: 135 }; else { const f = await pickFile('image/*'); if (f) draft.m.bg = { type: 'image', asset: addAsset(E.doc, 'image', await readAsDataURL(f), f.name) }; } upd(); };
  const num = el('input', { type: 'checkbox', checked: draft.m.showNumber, onchange: (e) => { draft.m.showNumber = e.target.checked; upd(); } }), date = el('input', { type: 'checkbox', checked: draft.m.showDate, onchange: (e) => { draft.m.showDate = e.target.checked; upd(); } });
  const layName = el('input', { placeholder: t('Layout name'), dir: 'auto' });
  dialog({ title: t('Slide Master'), wide: true, cls: 'master', body: el('div', { class: 'master-wrap' }, el('div', { class: 'd-form' },
    el('h4', {}, t('Master')), F('Background', bgSel), F('Footer text', inp('footer', draft.m)), el('label', { class: 'p-chk' }, num, ' ', t('Slide numbers')), el('label', { class: 'p-chk' }, date, ' ', t('Date')), F('Logo', el('div', { class: 'p-row' }, logoBtn, lp, el('button', { class: 'btn sm', onclick: () => { draft.m.logo = null; upd(); } }, t('Remove')))),
    el('h4', {}, t('Global fonts & colors')), F('Heading font', inp('head', draft.th)), F('Body font', inp('body', draft.th)), el('div', { class: 'grid2' }, ...['text', 'bg', 'accent', 'accent2', 'accent3', 'muted'].map(k => F(k, inp(k, draft.th, 'color')))),
    el('h4', {}, t('Custom layouts')), el('p', { class: 'p-note' }, t('Save the current slide (its placeholders and graphics) as a reusable layout.')), el('div', { class: 'p-row' }, layName, el('button', { class: 'btn sm', onclick: () => { if (!layName.value) return; commit('Custom layout', () => { (E.doc.customLayouts = E.doc.customLayouts || []).push({ id: uid('L'), name: layName.value, objects: deepClone(slide().objects) }); }); toast(t('Layout saved. Find it under New Slide.')); } }, t('Save current slide as layout'))),
    el('div', {}, ...(E.doc.customLayouts || []).map(c => el('span', { class: 'chip' }, c.name, el('button', { class: 'link', onclick: (e) => { commit('Delete layout', () => E.doc.customLayouts = E.doc.customLayouts.filter(x => x !== c)); e.target.parentElement.remove(); } }, '✕')))),
    el('h4', {}, t('Reusable themes')), el('button', { class: 'btn sm', onclick: () => { const ct = JSON.parse(localStorage.getItem('lp.customThemes') || '[]'); ct.push({ ...deepClone(draft.th), id: 'custom-' + Date.now(), name: E.doc.title + ' theme' }); localStorage.setItem('lp.customThemes', JSON.stringify(ct.slice(-12))); toast(t('Theme saved.')); } }, t('Save theme for reuse'))), prev),
    buttons: [{ label: t('Cancel') }, { label: t('Apply to all slides'), primary: true, onClick: () => { commit('Slide master', () => { E.doc.master = draft.m; E.doc.theme = draft.th; }); renderSlidesPanel(); } }] });
  upd();
}
export function mergeShapes() {
  const os = selObjs().filter(o => o.type === 'shape' || o.type === 'text' && o.fill !== 'none'); if (os.length < 2) { toast(t('Select two or more shapes.')); return; }
  const run2 = (op) => {
    const bb = groupBBox(os), sc = 2, c = document.createElement('canvas'); c.width = Math.ceil(bb.w * sc); c.height = Math.ceil(bb.h * sc); const x = c.getContext('2d'); x.scale(sc, sc); x.translate(-bb.x, -bb.y);
    const draw = (o, color) => renderSlide(x, E.doc, { objects: [{ ...o, fill: color, stroke: 'none', text: '', shadow: null, glow: null, opacity: 1 }], bg: null }, { scale: sc, ox: -bb.x * sc, oy: -bb.y * sc, clear: false, noBg: true, noMaster: true, present: true });
    const fill = resolveColor(typeof os[0].fill === 'string' ? os[0].fill : '@accent', E.doc.theme);
    if (op === 'union' || op === 'combine') { os.forEach((o, i) => { x.globalCompositeOperation = op === 'combine' && i ? 'xor' : 'source-over'; draw(o, fill); }); }
    else if (op === 'intersect') { draw(os[0], fill); for (const o of os.slice(1)) { x.globalCompositeOperation = 'destination-in'; draw(o, '#000'); } }
    else if (op === 'subtract') { draw(os[0], fill); for (const o of os.slice(1)) { x.globalCompositeOperation = 'destination-out'; draw(o, '#000'); } }
    else if (op === 'fragment') { const parts = []; os.forEach((o, i) => { const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; const xx = cc.getContext('2d'); renderSlide(xx, E.doc, { objects: [{ ...o, stroke: 'none', text: '', shadow: null }], bg: null }, { scale: sc, ox: -bb.x * sc, oy: -bb.y * sc, noBg: true, noMaster: true, present: true }); xx.globalCompositeOperation = 'destination-out'; os.forEach((p2, j) => { if (j !== i) renderSlide(xx, E.doc, { objects: [{ ...p2, fill: '#000', stroke: 'none', text: '' }], bg: null }, { scale: sc, ox: -bb.x * sc, oy: -bb.y * sc, clear: false, noBg: true, noMaster: true, present: true }); }); parts.push(cc); }); const inter = document.createElement('canvas'); inter.width = c.width; inter.height = c.height; const ix = inter.getContext('2d'); renderSlide(ix, E.doc, { objects: [{ ...os[0], fill: lerpc(), stroke: 'none', text: '' }], bg: null }, { scale: sc, ox: -bb.x * sc, oy: -bb.y * sc, noBg: true, noMaster: true, present: true }); ix.globalCompositeOperation = 'destination-in'; os.slice(1).forEach(o => renderSlide(ix, E.doc, { objects: [{ ...o, fill: '#000', stroke: 'none', text: '' }], bg: null }, { scale: sc, ox: -bb.x * sc, oy: -bb.y * sc, clear: false, noBg: true, noMaster: true, present: true })); parts.push(inter);
      const ids = new Set(os.map(o => o.id)); const g = uid('g'); const imgs = parts.map((p, i) => makeImage(addAsset(E.doc, 'image', p.toDataURL('image/png')), { ...bb, name: 'Fragment ' + (i + 1), group: g })); structural(); commit('Fragment', () => { slide().objects = [...slide().objects.filter(o => !ids.has(o.id)), ...imgs]; }); select(imgs.map(i => i.id)); return; }
    const ids = new Set(os.map(o => o.id)); const img = makeImage(addAsset(E.doc, 'image', c.toDataURL('image/png')), { ...bb, name: 'Merged shape (' + op + ')' });
    structural(); commit('Merge shapes', () => { slide().objects = [...slide().objects.filter(o => !ids.has(o.id)), img]; }); select([img.id]);
    function lerpc() { return resolveColor('@accent2', E.doc.theme); }
  };
  void lerpc0; function lerpc0() { }
  dialog({ title: t('Merge Shapes'), body: el('div', {}, el('p', { class: 'p-note' }, t('The merged result is created as a high-resolution picture with transparency. The first selected shape provides the color.')), el('div', { class: 'p-btnrow wrap' }, ...[['union', 'Union'], ['combine', 'Combine'], ['fragment', 'Fragment'], ['intersect', 'Intersect'], ['subtract', 'Subtract']].map(([k, l]) => el('button', { class: 'btn', onclick: () => { $('.dialog-back')?.remove(); run2(k); } }, t(l))))), buttons: [{ label: t('Cancel') }] });
}

// ---------------------------------------------------------------- views
export function sorterView() {
  const v = el('div', { class: 'view-alt sorter' }); const sz = +(localStorage.getItem('lp.sorterSize') || 240);
  const zoom = el('input', { type: 'range', min: 140, max: 420, value: sz, oninput: (e) => { localStorage.setItem('lp.sorterSize', e.target.value); v.replaceWith(sorterView()); } });
  v.append(el('div', { class: 'sorter-bar' }, t('Thumbnail size'), zoom, el('span', { class: 'p-note' }, t('Drag to reorder. Ctrl+click to select several. Double-click to edit.'))));
  const grid = el('div', { class: 'sorter-grid' });
  E.doc.slides.forEach((s, i) => {
    const c = el('canvas', { width: sz * 2, height: sz * 2 * E.doc.size.h / E.doc.size.w, style: `width:${sz}px` }); renderSlide(c.getContext('2d'), E.doc, s, { scale: sz * 2 / E.doc.size.w, present: true, index: i });
    const it = el('div', { class: 'srt' + (i === E.cur ? ' cur' : '') + (E.slideSel?.has(i) ? ' multi' : '') + (s.hidden ? ' hidden-slide' : ''), draggable: true }, c, el('div', { class: 'srt-meta' }, el('b', {}, String(i + 1)), s.transition?.type !== 'none' ? el('span', {}, '★ ' + t(getT(s.transition.type).name)) : null, s.transition?.after != null ? el('span', {}, '⏱ ' + s.transition.after + 's') : null));
    it.onclick = (e) => { if (e.ctrlKey || e.metaKey) { E.slideSel = E.slideSel || new Set(); E.slideSel.has(i) ? E.slideSel.delete(i) : E.slideSel.add(i); it.classList.toggle('multi'); } else { E.slideSel = null; E.cur = i; $$('.srt', grid).forEach((n, k) => n.classList.toggle('cur', k === i)); } };
    it.ondblclick = () => { E.view = 'normal'; setCur(i); };
    it.addEventListener('contextmenu', (e) => { e.preventDefault(); E.cur = i; contextMenu(e, [[t('Duplicate Slide'), () => { run('duplicateSlide'); v.replaceWith(sorterView()); }], [t('Delete Slide'), () => { run('deleteSlide'); v.replaceWith(sorterView()); }], [s.hidden ? t('Unhide Slide') : t('Hide Slide'), () => { run('hideSlide'); v.replaceWith(sorterView()); }]]); });
    it.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/lp-slide', i)); it.addEventListener('dragover', (e) => e.preventDefault());
    it.addEventListener('drop', (e) => { e.preventDefault(); const from = +e.dataTransfer.getData('text/lp-slide'); if (from === i) return; run('moveSlides', E.slideSel?.size > 1 ? [...E.slideSel] : [from], i); E.view = 'sorter'; setTimeout(() => { $('.sorter')?.replaceWith(sorterView()); }, 0); });
    grid.append(it);
  });
  v.append(grid); return v;
}
export function notesPageView() {
  const s = slide(); const c = el('canvas', { width: 1280, height: 1280 * E.doc.size.h / E.doc.size.w }); renderSlide(c.getContext('2d'), E.doc, s, { scale: 1280 / E.doc.size.w, present: true, index: E.cur });
  const ta = el('textarea', { dir: 'auto', placeholder: t('Click to add notes'), oninput: (e) => commit('Notes', () => s.notes = e.target.value, { merge: true }) }); ta.value = s.notes || '';
  const fs = el('select', { onchange: (e) => commit('Notes format', () => s.notesSize = +e.target.value) }, ...[14, 16, 18, 20, 24, 28].map(n => el('option', { value: n, selected: (s.notesSize || 18) === n }, n + ' px'))); ta.style.fontSize = (s.notesSize || 18) + 'px';
  return el('div', { class: 'view-alt notes-page' }, el('div', { class: 'np-paper' }, c, el('div', { class: 'np-tools' }, t('Font size'), fs, el('button', { class: 'btn sm', onclick: () => run('aiNotes') }, '✨ ' + t('Generate with AI')), el('button', { class: 'btn sm', onclick: () => printDialog('notes') }, t('Print Notes Pages'))), ta, el('div', { class: 'np-nav' }, el('button', { class: 'btn sm', onclick: () => setCur(E.cur - 1) }, '←'), el('span', {}, `${E.cur + 1} / ${E.doc.slides.length}`), el('button', { class: 'btn sm', onclick: () => setCur(E.cur + 1) }, '→'))));
}

// ---------------------------------------------------------------- find / replace / spelling / review
export function findReplace(replace) {
  const f = el('input', { dir: 'auto', value: sel1()?.text?.slice(0, 40) || '' }), r = el('input', { dir: 'auto' }), mc = el('input', { type: 'checkbox' }), ww = el('input', { type: 'checkbox' }), info = el('p', { class: 'p-note' });
  let hits = [], pos = -1;
  const search = () => { hits = []; const flags = mc.checked ? 'g' : 'gi'; if (!f.value) return; const rx = new RegExp((ww.checked ? '\\b' : '') + f.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (ww.checked ? '\\b' : ''), flags); E.doc.slides.forEach((s, si) => { for (const o of s.objects) { if (o.text && rx.test(o.text)) hits.push({ si, id: o.id }); rx.lastIndex = 0; if (o.type === 'table' && o.cells.some(row => row.some(c => rx.test(c.text)))) hits.push({ si, id: o.id }); } if (s.notes && rx.test(s.notes)) hits.push({ si, notes: true }); }); info.textContent = t('{n} matches', { n: hits.length }); return rx; };
  const next = () => { search(); if (!hits.length) return; pos = (pos + 1) % hits.length; const h = hits[pos]; setCur(h.si); if (h.id) select([h.id]); };
  const doReplace = (all) => { const rx = search(); if (!rx) return; let count = 0; commit('Replace', () => { const targets = all ? E.doc.slides.flatMap(s => s.objects) : selObjs(); for (const o of targets) { if (o.text) { const n = o.text.replace(rx, () => { count++; return r.value; }); o.text = n; } if (o.cells) for (const row of o.cells) for (const c of row) c.text = c.text.replace(rx, () => { count++; return r.value; }); } if (all) for (const s of E.doc.slides) if (s.notes) s.notes = s.notes.replace(rx, () => { count++; return r.value; }); }); toast(t('Replaced {n}', { n: count })); };
  dialog({ title: replace ? t('Replace') : t('Find'), body: el('div', { class: 'd-form' }, F('Find what', f), replace ? F('Replace with', r) : null, el('label', { class: 'p-chk' }, mc, ' ', t('Match case')), el('label', { class: 'p-chk' }, ww, ' ', t('Find whole words only')), info), buttons: [{ label: t('Find Next'), onClick: () => { next(); return false; } }, ...(replace ? [{ label: t('Replace'), onClick: () => { doReplace(false); next(); return false; } }, { label: t('Replace All'), primary: true, onClick: () => { doReplace(true); return false; } }] : []), { label: t('Close') }] });
  f.addEventListener('keydown', (e) => { if (e.key === 'Enter') next(); });
}
export function spelling() {
  const parts = E.doc.slides.map((s, i) => ({ i, text: s.objects.filter(o => o.text).map(o => o.text).join('\n') + (s.notes ? '\n— ' + t('Notes') + ' —\n' + s.notes : '') })).filter(p => p.text.trim());
  const box = el('div', { class: 'spell-box' }, ...parts.map(p => el('div', {}, el('b', {}, t('Slide') + ' ' + (p.i + 1)), el('div', { contenteditable: 'true', spellcheck: 'true', dir: 'auto', lang: E.doc.lang || 'en' }, p.text))));
  dialog({ title: t('Spelling and Grammar'), wide: true, body: el('div', {}, el('p', { class: 'p-note' }, t('Misspelled words are underlined by your system spell checker (right-click a word for suggestions). For full grammar correction use AI.')), box), buttons: [{ label: '✨ ' + t('Fix all with AI'), onClick: async () => { if (!AI.aiReady()) { aiError({ code: 'noai' }); return false; } const b = busy(t('AI is working…')); try { const objs = E.doc.slides.flatMap(s => s.objects.filter(o => o.text && o.text.trim())); const fixed = []; for (const o of objs) fixed.push([o, await AI.grammar(o.text)]); commit('AI grammar', () => fixed.forEach(([o, v]) => o.text = v)); toast(t('Corrections applied ({n} text boxes).', { n: fixed.length })); } catch (e) { aiError(e); } b.done(); } }, { label: t('Close'), primary: true }] });
  setTimeout(() => box.querySelector('[contenteditable]')?.focus(), 50);
}
export async function thesaurus() {
  const word = (window.getSelection()?.toString() || '').trim() || await prompt(t('Thesaurus — word'), ''); if (!word) return;
  if (!AI.aiReady()) { aiError({ code: 'noai' }); return; }
  const b = busy(t('Looking up…')); try { const r = await AI.chat('Give up to 10 synonyms for the word, same language, one per line, no numbering.', word); b.done(); pickList(t('Synonyms for') + ' "' + word + '"', r.split('\n').map(s => s.trim()).filter(Boolean), (s) => { navigator.clipboard?.writeText(s); toast(t('Copied') + ': ' + s); }); } catch (e) { b.done(); aiError(e); }
}
export function translateDialog() {
  const to = sel([['en', 'English'], ['he', 'עברית'], ['ar', 'العربية']], E.doc.lang === 'en' ? 'he' : 'en'); const scope = sel([['all', 'Entire presentation (copy)'], ['slide', 'Current slide'], ['sel', 'Selected text']], 'all'); const notes = el('input', { type: 'checkbox', checked: true });
  dialog({ title: t('Translate'), body: el('div', { class: 'd-form' }, F('Translate to', to), F('Scope', scope), el('label', { class: 'p-chk' }, notes, ' ', t('Include speaker notes')), el('p', { class: 'p-note' }, t('Translation uses your connected AI provider. Text direction switches automatically for Hebrew and Arabic.'))), buttons: [{ label: t('Cancel') }, { label: t('Translate'), primary: true, onClick: async () => {
    const lang = to.value; const slides = scope.value === 'all' ? E.doc.slides : [slide()]; const objs = scope.value === 'sel' ? selObjs().filter(o => o.text) : slides.flatMap(s => s.objects.filter(o => o.text && o.text.trim()));
    const cells = scope.value === 'sel' ? [] : slides.flatMap(s => s.objects.filter(o => o.type === 'table').flatMap(o => o.cells.flat().filter(c => c.text)));
    const notesL = notes.checked && scope.value !== 'sel' ? slides.filter(s => s.notes) : [];
    const strings = [...objs.map(o => o.text), ...cells.map(c => c.text), ...notesL.map(s => s.notes)];
    if (!strings.length) { toast(t('Nothing to translate.')); return; }
    const b = busy(t('Translating…'));
    try { const out = []; for (let i = 0; i < strings.length; i += 40) { out.push(...await AI.translateStrings(strings.slice(i, i + 40), lang)); b.update(`${Math.min(i + 40, strings.length)}/${strings.length}`); }
      const apply = () => { let k = 0; for (const o of objs) { o.text = out[k++]; if (o.dir !== 'auto') o.dir = 'auto'; if (o.align === 'left' || o.align === 'right') o.align = 'start'; } for (const c of cells) c.text = out[k++]; for (const s of notesL) s.notes = out[k++]; };
      if (scope.value === 'all') { const copy = deepClone(E.doc); copy.id = uid('d'); copy.title = E.doc.title + ' (' + { en: 'English', he: 'עברית', ar: 'العربية' }[lang] + ')'; copy.lang = lang; const ids = new Set([...objs.map(o => o.id)]); let k = 0; const map = new Map(); objs.forEach(o => map.set(o.id, out[k++])); const cellOut = out.slice(k, k + cells.length); k += cells.length; const noteOut = out.slice(k); let ci = 0, ni = 0; for (const s of copy.slides) { for (const o of s.objects) { if (map.has(o.id)) { o.text = map.get(o.id); o.dir = 'auto'; if (o.align === 'left' || o.align === 'right') o.align = 'start'; } if (o.type === 'table') for (const row of o.cells) for (const c of row) if (c.text) c.text = cellOut[ci++] ?? c.text; } if (s.notes && notes.checked) s.notes = noteOut[ni++] ?? s.notes; } void ids; b.done(); emit('openDoc', copy); toast(t('Translated copy created.')); }
      else { commit('Translate', apply); b.done(); }
    } catch (e) { b.done(); aiError(e); }
  } }] });
}
CMD.contentLanguage = () => { const s = sel([['en', 'English'], ['he', 'עברית (Hebrew)'], ['ar', 'العربية (Arabic)']], E.doc.lang || 'en'); dialog({ title: t('Language'), body: el('div', { class: 'd-form' }, el('p', { class: 'p-note' }, t('The content language sets default text direction, spell checking language and number formats for this presentation. It is independent of the interface language.')), F('Presentation language', s)), buttons: [{ label: t('Cancel') }, { label: t('OK'), primary: true, onClick: () => { commit('Language', () => E.doc.lang = s.value); renderSlidesPanel(); } }] }); };
CMD.accessibility = () => {
  const issues = [];
  E.doc.slides.forEach((s, i) => {
    if (!s.objects.some(o => o.ph === 'title' && o.text?.trim()) && !s.objects.some(o => o.name?.startsWith('!!title'))) issues.push([i, null, 'warning', 'Missing slide title']);
    for (const o of s.objects) {
      if ((o.type === 'image' || o.type === 'chart' || o.type === 'video') && !o.alt && o.name !== 'Decoration') issues.push([i, o.id, 'error', 'Missing alternative text']);
      if (o.type === 'table' && !o.header) issues.push([i, o.id, 'warning', 'Table has no header row']);
      if ((o.type === 'text' || o.type === 'shape') && o.text?.trim()) {
        const fg = resolveColor(o.color || '@text', E.doc.theme); const bgc = typeof o.fill === 'string' && o.fill !== 'none' ? resolveColor(o.fill, E.doc.theme) : (s.bg?.type === 'solid' ? resolveColor(s.bg.color, E.doc.theme) : E.doc.theme.bg);
        try { const cr = contrast(fg, bgc); if (cr < (o.size >= 32 ? 3 : 4.5)) issues.push([i, o.id, 'warning', `Low text contrast (${cr.toFixed(1)}:1)`]); } catch (e) { }
        if (o.size < 16) issues.push([i, o.id, 'tip', 'Very small text']);
        if (o.link?.type === 'url' && /^https?:\/\/[^ ]+$/.test(o.text.trim())) issues.push([i, o.id, 'tip', 'Use descriptive hyperlink text']);
      }
      if (o.type === 'video' && !o.subtitles) issues.push([i, o.id, 'tip', 'Video has no captions']);
    }
  });
  const titles = E.doc.slides.map(s => s.objects.find(o => o.ph === 'title')?.text?.trim()).filter(Boolean); const dup = titles.filter((x, i) => titles.indexOf(x) !== i); if (dup.length) issues.push([0, null, 'tip', 'Duplicate slide titles']);
  dialog({ title: t('Accessibility Checker'), wide: true, body: issues.length ? el('div', { class: 'acc-list' }, ...issues.map(([i, id, lvl, msg]) => el('button', { class: 'acc ' + lvl, onclick: () => { setCur(i); if (id) select([id]); } }, el('span', {}, lvl === 'error' ? '⛔' : lvl === 'warning' ? '⚠' : 'ℹ'), el('b', {}, t(msg)), el('small', {}, t('Slide') + ' ' + (i + 1))))) : el('p', {}, '✅ ' + t('No accessibility issues found.')), buttons: [{ label: t('Close'), primary: true }] });
};
export function inspector() {
  const notesN = E.doc.slides.filter(s => s.notes).length, comN = E.doc.slides.reduce((a, s) => a + s.comments.length, 0), hidN = E.doc.slides.filter(s => s.hidden).length, offN = E.doc.slides.reduce((a, s) => a + s.objects.filter(o => o.x > E.doc.size.w || o.y > E.doc.size.h || o.x + o.w < 0 || o.y + o.h < 0).length, 0), hidObj = E.doc.slides.reduce((a, s) => a + s.objects.filter(o => o.hidden).length, 0);
  const rows = [['Speaker notes', notesN, () => E.doc.slides.forEach(s => s.notes = '')], ['Comments', comN, () => E.doc.slides.forEach(s => s.comments = [])], ['Hidden slides', hidN, () => E.doc.slides = E.doc.slides.filter(s => !s.hidden)], ['Off-slide content', offN, () => E.doc.slides.forEach(s => s.objects = s.objects.filter(o => !(o.x > E.doc.size.w || o.y > E.doc.size.h || o.x + o.w < 0 || o.y + o.h < 0)))], ['Invisible objects', hidObj, () => E.doc.slides.forEach(s => s.objects = s.objects.filter(o => !o.hidden))], ['Document properties', E.doc.props ? 1 : 0, () => E.doc.props = {}]];
  dialog({ title: t('Document Inspector'), body: el('div', { class: 'insp' }, ...rows.map(([l, n, fn]) => el('div', { class: 'insp-row' }, el('span', {}, (n ? '⚠ ' : '✔ ') + t(l) + ': ' + n), n ? el('button', { class: 'btn sm', onclick: (e) => { structural(); commit('Remove ' + l, fn); renderSlidesPanel(); e.target.disabled = true; e.target.textContent = t('Removed'); } }, t('Remove All')) : null))), buttons: [{ label: t('Close'), primary: true }] });
}
export async function compare() {
  const f = await pickFile('.lpres,.pptx'); if (!f) return;
  const b = busy(t('Comparing…'));
  try {
    const other = /\.pptx$/i.test(f.name) ? await IO.importPPTX(f, []) : await IO.deserialize(await readAsText(f), () => prompt(t('Password'), '', { type: 'password' }));
    const txt = (s) => s.objects.filter(o => o.text).map(o => o.text.trim()).join(' | ');
    const n = Math.max(E.doc.slides.length, other.slides.length), diffs = [];
    for (let i = 0; i < n; i++) { const a = E.doc.slides[i], c = other.slides[i]; if (!a) diffs.push([i, 'Slide only in other file', '', txt(c)]); else if (!c) diffs.push([i, 'Slide only in this presentation', txt(a), '']); else { if (txt(a) !== txt(c)) diffs.push([i, 'Text changed', txt(a), txt(c)]); if (a.objects.length !== c.objects.length) diffs.push([i, 'Object count changed', String(a.objects.length), String(c.objects.length)]); if ((a.notes || '') !== (c.notes || '')) diffs.push([i, 'Notes changed', a.notes || '', c.notes || '']); if ((a.transition?.type || 'none') !== (c.transition?.type || 'none')) diffs.push([i, 'Transition changed', a.transition?.type, c.transition?.type]); } }
    b.done();
    dialog({ title: t('Compare Presentations') + ' — ' + f.name, wide: true, body: diffs.length ? el('table', { class: 'cmp-t' }, el('tr', {}, el('th', {}, '#'), el('th', {}, t('Change')), el('th', {}, t('This presentation')), el('th', {}, f.name), el('th', {})), ...diffs.map(([i, k, a, c]) => el('tr', {}, el('td', {}, i + 1), el('td', {}, t(k)), el('td', { dir: 'auto' }, String(a ?? '').slice(0, 200)), el('td', { dir: 'auto' }, String(c ?? '').slice(0, 200)), el('td', {}, other.slides[i] ? el('button', { class: 'btn sm', onclick: () => { Object.assign(E.doc.assets, other.assets); structural(); commit('Accept change', () => { if (E.doc.slides[i]) E.doc.slides[i] = cloneSlide(other.slides[i]); else E.doc.slides.push(cloneSlide(other.slides[i])); }); renderSlidesPanel(); } }, t('Accept')) : null)))) : el('p', {}, t('The presentations have the same content.')), buttons: [{ label: t('Close'), primary: true }] });
  } catch (e) { b.done(); alertBox(t('Compare failed'), e.message); }
}
export function shortcuts() {
  const km = keyMap(); const inputs = {};
  const body = el('div', { class: 'keys' }, ...Object.keys(DEFAULT_KEYS).map(k => el('div', { class: 'key-row' }, el('span', {}, t('key_' + k)), inputs[k] = el('input', { value: km[k], readonly: true, onkeydown: (e) => { e.preventDefault(); if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return; e.target.value = e.key === 'Backspace' ? '' : comboOf(e); } }))));
  dialog({ title: t('Keyboard Shortcuts'), wide: true, body: el('div', {}, el('p', { class: 'p-note' }, t('Click a field and press the new key combination. Backspace clears it.')), body), buttons: [{ label: t('Reset to defaults'), onClick: () => { localStorage.removeItem('lp.keys'); toast(t('Shortcuts reset.')); } }, { label: t('Cancel') }, { label: t('Save'), primary: true, onClick: () => { const o = {}; for (const [k, i] of Object.entries(inputs)) if (i.value !== DEFAULT_KEYS[k]) o[k] = i.value; localStorage.setItem('lp.keys', JSON.stringify(o)); toast(t('Shortcuts saved.')); } }] });
}
CMD.newWindow = () => { emit('autosaveNow'); setTimeout(() => window.open(location.pathname + '?doc=' + encodeURIComponent(E.doc.id), '_blank'), 300); };
CMD.showcase = () => emit('openDoc', signatureShowcase());

// ---------------------------------------------------------------- picture tools
CMD.removeBg = async (o) => {
  const src = assetSrc(E.doc, o.asset); const img = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
  const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, w, h), D = d.data;
  const tolIn = el('input', { type: 'range', min: 5, max: 120, value: 40 }); const prev = el('canvas', { width: Math.min(480, w), height: Math.min(480, w) * h / w, class: 'checker' });
  const compute = () => { const tol = +tolIn.value, out = new Uint8ClampedArray(D); const seen = new Uint8Array(w * h), stack = []; const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]; for (let xx = 0; xx < w; xx += 4) corners.push([xx, 0], [xx, h - 1]); for (let yy = 0; yy < h; yy += 4) corners.push([0, yy], [w - 1, yy]);
    for (const [cx, cy] of corners) { const i0 = (cy * w + cx) * 4; const ref = [D[i0], D[i0 + 1], D[i0 + 2]]; stack.push([cx, cy, ref]); }
    while (stack.length) { const [px, py, ref] = stack.pop(); if (px < 0 || py < 0 || px >= w || py >= h) continue; const k = py * w + px; if (seen[k]) continue; const i = k * 4; const dd = Math.abs(D[i] - ref[0]) + Math.abs(D[i + 1] - ref[1]) + Math.abs(D[i + 2] - ref[2]); if (dd > tol * 1.5) continue; seen[k] = 1; out[i + 3] = 0; stack.push([px + 1, py, ref], [px - 1, py, ref], [px, py + 1, ref], [px, py - 1, ref]); }
    // soften edges
    for (let k = 0; k < w * h; k++) if (!seen[k]) { const px = k % w, py = (k / w) | 0; let n = 0; if (px > 0 && seen[k - 1]) n++; if (px < w - 1 && seen[k + 1]) n++; if (py > 0 && seen[k - w]) n++; if (py < h - 1 && seen[k + w]) n++; if (n) out[k * 4 + 3] = 255 - n * 50; }
    const oc = document.createElement('canvas'); oc.width = w; oc.height = h; oc.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0); const px = prev.getContext('2d'); px.clearRect(0, 0, prev.width, prev.height); px.drawImage(oc, 0, 0, prev.width, prev.height); return oc; };
  let res = compute(); tolIn.oninput = () => { res = compute(); };
  dialog({ title: t('Remove Background'), body: el('div', {}, el('p', { class: 'p-note' }, t('Removes a solid or evenly colored background connected to the picture edges. For photos of people, the camera background removal in Selfie Presenter Studio uses AI segmentation.')), F('Tolerance', tolIn), prev), buttons: [{ label: t('Cancel') }, { label: t('Keep Changes'), primary: true, onClick: () => commit('Remove background', () => o.asset = addAsset(E.doc, 'image', res.toDataURL('image/png'))) }] });
};
CMD.compressImage = async (o) => {
  const src = assetSrc(E.doc, o.asset); const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const q = sel([[2400, 'High fidelity (2400 px)'], [1600, 'Print (1600 px)'], [1024, 'Screen (1024 px)'], [640, 'E-mail (640 px)']], 1600); const crop = el('input', { type: 'checkbox', checked: true });
  dialog({ title: t('Compress Pictures'), body: el('div', { class: 'd-form' }, el('p', {}, t('Current size') + `: ${img.naturalWidth}×${img.naturalHeight}, ${(src.length * .75 / 1024).toFixed(0)} KB`), F('Resolution', q), el('label', { class: 'p-chk' }, crop, ' ', t('Delete cropped areas of pictures'))), buttons: [{ label: t('Cancel') }, { label: t('OK'), primary: true, onClick: () => { const cr = crop.checked ? (o.crop || { l: 0, t: 0, r: 0, b: 0 }) : { l: 0, t: 0, r: 0, b: 0 }; const sw = img.naturalWidth * (1 - cr.l - cr.r), sh = img.naturalHeight * (1 - cr.t - cr.b); const k = Math.min(1, +q.value / Math.max(sw, sh)); const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k); c.getContext('2d').drawImage(img, img.naturalWidth * cr.l, img.naturalHeight * cr.t, sw, sh, 0, 0, c.width, c.height); const hasAlpha = /png|svg|gif|webp/.test(src.slice(0, 30)); const d = c.toDataURL(hasAlpha ? 'image/png' : 'image/jpeg', .85); commit('Compress picture', () => { o.asset = addAsset(E.doc, 'image', d); if (crop.checked) o.crop = { l: 0, t: 0, r: 0, b: 0 }; }); toast(t('New size') + `: ${(d.length * .75 / 1024).toFixed(0)} KB`); } }] });
};

// ---------------------------------------------------------------- media trim
export function mediaTrim(o, posterMode = false) {
  const src = assetSrc(E.doc, o.asset); const m = el(o.type, { src, controls: true, class: 'trim-media' }); m.crossOrigin = 'anonymous';
  const s = el('input', { type: 'number', step: .1, min: 0, value: o.trimStart || 0 }), e2 = el('input', { type: 'number', step: .1, min: 0, value: o.trimEnd || 0 });
  const marks = el('div', { class: 'p-row' }, ...(o.bookmarks || []).map(b => el('button', { class: 'chip', onclick: () => m.currentTime = b }, b.toFixed(1) + 's')));
  dialog({ title: posterMode ? t('Poster Frame') : t('Trim Media'), wide: true, body: el('div', { class: 'd-form' }, m, el('div', { class: 'grid2' }, F('Start time (s)', s), F('End time (s, 0 = end)', e2)), el('div', { class: 'p-btnrow' }, el('button', { class: 'btn sm', onclick: () => s.value = m.currentTime.toFixed(1) }, t('Set start here')), el('button', { class: 'btn sm', onclick: () => e2.value = m.currentTime.toFixed(1) }, t('Set end here')), o.type === 'video' ? el('button', { class: 'btn sm', onclick: () => { const c = document.createElement('canvas'); c.width = m.videoWidth; c.height = m.videoHeight; c.getContext('2d').drawImage(m, 0, 0); commit('Poster frame', () => o.poster = addAsset(E.doc, 'image', c.toDataURL('image/jpeg', .85))); toast(t('Poster frame set.')); } }, t('Use current frame as poster')) : null, el('button', { class: 'btn sm', onclick: () => commit('Bookmark', () => (o.bookmarks = o.bookmarks || []).push(+m.currentTime.toFixed(1))) }, t('Add Bookmark'))), marks), buttons: [{ label: t('Cancel') }, { label: t('OK'), primary: true, onClick: () => commit('Trim', () => { o.trimStart = +s.value; o.trimEnd = +e2.value; }) }] });
}

// ---------------------------------------------------------------- slide show setup
export function setupShow() {
  const sh = E.doc.show; const type = sel([['speaker', 'Presented by a speaker (full screen)'], ['window', 'Browsed by an individual (window)'], ['kiosk', 'Browsed at a kiosk (full screen, loops)']], sh.kiosk ? 'kiosk' : sh.windowed ? 'window' : 'speaker');
  const loop = el('input', { type: 'checkbox', checked: sh.loop }), noNarr = el('input', { type: 'checkbox', checked: sh.noNarration }), noAnim = el('input', { type: 'checkbox', checked: sh.noAnim }), perf = el('input', { type: 'checkbox', checked: E.prefs.perf }), multi = el('input', { type: 'checkbox', checked: E.prefs.multiDisplay });
  const from = el('input', { type: 'number', min: 1, value: sh.from || 1 }), to = el('input', { type: 'number', min: 1, value: sh.to || E.doc.slides.length }), pen = el('input', { type: 'color', value: sh.pen || '#ff3b30' });
  dialog({ title: t('Set Up Slide Show'), body: el('div', { class: 'd-form' }, F('Show type', type), el('label', { class: 'p-chk' }, loop, ' ', t('Loop continuously until Esc')), el('label', { class: 'p-chk' }, noNarr, ' ', t('Show without narration')), el('label', { class: 'p-chk' }, noAnim, ' ', t('Show without animation')), el('label', { class: 'p-chk' }, perf, ' ', t('Performance Mode')), el('label', { class: 'p-chk' }, multi, ' ', t('Use Presenter View on multiple displays')), el('div', { class: 'grid2' }, F('From slide', from), F('To slide', to)), F('Pen color', pen)),
    buttons: [{ label: t('Cancel') }, { label: t('OK'), primary: true, onClick: () => { commit('Set up show', () => Object.assign(sh, { loop: loop.checked || type.value === 'kiosk', kiosk: type.value === 'kiosk', windowed: type.value === 'window', noNarration: noNarr.checked, noAnim: noAnim.checked, from: +from.value, to: +to.value, pen: pen.value })); E.prefs.perf = perf.checked; E.prefs.multiDisplay = multi.checked; savePrefs(); } }] });
}
export function customShows() {
  const list = E.doc.show.customShows = E.doc.show.customShows || [];
  const body = el('div', {}); const render = () => { body.innerHTML = ''; for (const cs of list) body.append(el('div', { class: 'cs-row' }, el('b', {}, cs.name), el('small', {}, cs.slides.map(id => E.doc.slides.findIndex(s => s.id === id) + 1).filter(n => n > 0).join(', ')), el('button', { class: 'btn sm', onclick: () => { $('.dialog-back')?.remove(); startShow(0, { customShow: cs.slides }); } }, t('Show')), el('button', { class: 'btn sm', onclick: () => { commit('Delete custom show', () => list.splice(list.indexOf(cs), 1)); render(); } }, t('Remove')))); };
  render();
  const name = el('input', { placeholder: t('Custom show name'), dir: 'auto' }); const picks = el('div', { class: 'cs-picks' }, ...E.doc.slides.map((s, i) => el('label', { class: 'p-chk' }, el('input', { type: 'checkbox', value: s.id }), ` ${i + 1}. ${(s.objects.find(o => o.ph === 'title')?.text || '').slice(0, 40)}`)));
  dialog({ title: t('Custom Shows'), wide: true, body: el('div', {}, body, el('h4', {}, t('New custom show')), name, picks), buttons: [{ label: t('Close') }, { label: t('Add'), primary: true, onClick: () => { const ids = $$('input:checked', picks).map(i => i.value); if (!name.value || !ids.length) { toast(t('Enter a name and pick slides.')); return false; } commit('Custom show', () => list.push({ name: name.value, slides: ids })); render(); name.value = ''; return false; } }] });
}
export function saveTimings(timings) {
  const tot = timings.reduce((a, b) => a + (b || 0), 0);
  confirmBox(t('Rehearse Timings'), t('The total time for the slide show was {t}. Do you want to save the new slide timings?', { t: new Date(tot * 1000).toISOString().slice(11, 19) })).then(ok => { if (ok) { commit('Timings', () => timings.forEach((v, i) => { if (v != null && E.doc.slides[i]) E.doc.slides[i].transition.after = Math.round(v * 10) / 10; })); renderSlidesPanel(); toast(t('Timings saved.')); } });
}
export function transitionFullPreview() { startShow(Math.max(0, E.cur - 1), {}).then?.(() => { }); toast(t('Press → to see the transition. Esc to exit.')); }
export function compareTransitions() {
  const ids = [slide().transition?.type || 'fade', 'morph', 'quantumFlow', 'portal'].filter((v, i, a) => v !== 'none' && a.indexOf(v) === i).slice(0, 4);
  const grid = el('div', { class: 'cmp-grid' }); const sels = [];
  const prevS = E.doc.slides[Math.max(0, E.cur - 1)], curS = slide();
  const fromC = renderToCanvas(E.doc, prevS, 480, { present: true }), toC = renderToCanvas(E.doc, curS, 480, { present: true });
  let raf, t0 = performance.now(); const preps = [];
  const build = () => { preps.length = 0; grid.innerHTML = ''; sels.forEach((s, k) => { const c = el('canvas', { width: 480, height: fromC.height }); grid.append(el('div', {}, s, c)); preps.push({ c, p: prepareTransition({ doc: E.doc, from: { slide: prevS, canvas: fromC }, to: { slide: curS, canvas: toC }, transition: { type: s.value, params: defaultParams(s.value), duration: 1.4, easing: 'easeInOut' }, perf: true }) }); s.onchange = build; }); t0 = performance.now(); };
  for (let k = 0; k < 4; k++) sels.push(sel(TRANSITIONS.filter(x => x.id !== 'none').map(x => [x.id, t(x.name)]), ids[k] || TRANSITIONS[5 + k].id));
  build();
  const loop = (now) => { const p = ((now - t0) / 1800) % 1.35; for (const { c, p: pr } of preps) { const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); pr.draw(g, Math.min(1, p), 480 / E.doc.size.w, 0, 0); } raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  dialog({ title: t('Compare Transitions'), wide: true, cls: 'cmp-dialog', body: grid, buttons: [{ label: t('Close') }], onClose: () => cancelAnimationFrame(raf) });
}

// ---------------------------------------------------------------- Motion Studio (timeline)
export function motionStudio() {
  const s = slide(); let tl = buildTimeline(s); const PX = 110;
  const prev = el('canvas', { width: 640, height: 640 * E.doc.size.h / E.doc.size.w, class: 'ms-prev' });
  const lanes = el('div', { class: 'ms-lanes' }); const scrub = el('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'ms-scrub' }); const timeLab = el('span', {}, '0.00s');
  const flat = () => { tl = buildTimeline(s); let off = 0; const out = []; for (let st = 0; st < tl.steps; st++) { for (const it of tl.items.filter(x => x.step === st)) out.push({ ...it, abs0: off + it.t0, abs1: off + it.t1 }); off += tl.stepDur[st] + .3; } return { out, total: Math.max(1, off) }; };
  const draw = (time) => { const { out, total } = flat(); let step = 0, acc = 0; for (let st = 0; st < tl.steps; st++) { if (time < acc + tl.stepDur[st] + .3 || st === tl.steps - 1) { step = st; break; } acc += tl.stepDur[st] + .3; } renderSlide(prev.getContext('2d'), E.doc, s, { scale: 640 / E.doc.size.w, present: true, index: E.cur, overrides: computeOverrides(s, tl, tl.steps ? step : -1, time - acc, E.doc.size) }); timeLab.textContent = time.toFixed(2) + 's / ' + total.toFixed(2) + 's'; void out; };
  const renderLanes = () => {
    lanes.innerHTML = ''; const { out, total } = flat(); lanes.style.width = Math.max(600, total * PX + 200) + 'px';
    const ruler = el('div', { class: 'ms-ruler' }); for (let k = 0; k <= total; k += .5) ruler.append(el('span', { style: `left:${160 + k * PX}px` }, k % 1 ? '' : k + 's')); lanes.append(ruler);
    for (const it of out) {
      if (it.para > 0) continue; const a = it.a;
      const bar = el('div', { class: 'ms-bar ' + a.cat, style: `left:${160 + it.abs0 * PX}px;width:${Math.max(10, (it.abs1 - it.abs0) * PX)}px`, title: t(a.type) }, el('span', {}, t(a.type) + ' · ' + a.start), el('i', { class: 'ms-h' }));
      const row = el('div', { class: 'ms-lane' }, el('div', { class: 'ms-name' }, (it.o.name || it.o.text || it.o.type).slice(0, 22)), bar);
      // drag = delay, handle = duration
      bar.addEventListener('pointerdown', (e) => { e.preventDefault(); const x0 = e.clientX, d0 = a.delay || 0, du0 = a.dur, isH = e.target.classList.contains('ms-h'); bar.setPointerCapture(e.pointerId);
        const mv = (ev) => { const dx = (ev.clientX - x0) / PX * (isRTL() ? -1 : 1); if (isH) a.dur = Math.max(.05, +(du0 + dx).toFixed(2)); else a.delay = Math.max(0, +(d0 + dx).toFixed(2)); bar.style.left = `${160 + (it.abs0 + (a.delay - d0)) * PX}px`; bar.style.width = `${Math.max(10, a.dur * (a.repeat || 1) * PX)}px`; };
        const up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); const nd = a.delay, ndu = a.dur; a.delay = d0; a.dur = du0; commit('Motion Studio', () => { a.delay = nd; a.dur = ndu; }); renderLanes(); };
        bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up); });
      bar.addEventListener('dblclick', () => editAnim(a, it.o));
      lanes.append(row);
    }
    if (!out.length) lanes.append(el('p', { class: 'p-empty' }, t('No animations yet. Use Add Animation in the Animations tab.')));
  };
  const editAnim = (a, o) => { const ease = sel([['auto', 'Automatic'], 'linear', 'easeIn', 'easeOut', 'easeInOut', 'back', 'elastic', 'bounce'], a.ease || 'auto'); const st = sel([['click', 'On Click'], ['with', 'With Previous'], ['after', 'After Previous']], a.start); const rep = el('input', { type: 'number', min: 1, value: a.repeat || 1 }); const pts = el('textarea', { rows: 4, dir: 'ltr', value: (a.path || []).map(p => p.map(Math.round).join(',')).join('\n') });
    dialog({ title: t('Keyframes & curve') + ' — ' + t(a.type), body: el('div', { class: 'd-form' }, F('Start', st), F('Animation curve', ease), F('Repeat', rep), a.cat === 'motion' ? F('Motion path keyframes (x,y offsets per line)', pts) : null), buttons: [{ label: t('Cancel') }, { label: t('OK'), primary: true, onClick: () => { commit('Keyframes', () => { a.ease = ease.value; a.start = st.value; a.repeat = Math.max(1, +rep.value); if (a.cat === 'motion') { const p = pts.value.split('\n').map(l => l.split(',').map(Number)).filter(p => p.length === 2 && p.every(isFinite)); if (p.length > 1) { a.path = p; a.type = 'pathCustom'; } } }); renderLanes(); } }] }); };
  let playing = null; const play = () => { const { total } = flat(); const t0 = performance.now(); cancelAnimationFrame(playing); const f = (now) => { const tt = (now - t0) / 1000; scrub.value = tt / total * 1000; draw(tt); if (tt < total) playing = requestAnimationFrame(f); }; playing = requestAnimationFrame(f); };
  scrub.oninput = () => { cancelAnimationFrame(playing); draw(scrub.value / 1000 * flat().total); };
  renderLanes(); draw(0);
  dialog({ title: t('Motion Studio'), wide: true, cls: 'motion-studio', body: el('div', {}, el('div', { class: 'ms-top' }, prev, el('div', { class: 'ms-side' }, el('p', { class: 'p-note' }, t('Drag a bar to change its delay, drag its right edge to change duration. Double-click a bar to edit its keyframes and animation curve. Each click step is separated by a gap.')), el('div', { class: 'p-btnrow' }, el('button', { class: 'btn primary', onclick: play }, '▶ ' + t('Play')), timeLab), scrub)), el('div', { class: 'ms-scroll' }, lanes)), buttons: [{ label: t('Close'), primary: true }], onClose: () => cancelAnimationFrame(playing) });
}

// ---------------------------------------------------------------- Selfie Presenter Studio
export function selfieStudio(opts = {}) {
  const cs = E.doc.show.camera; const draft = deepClone(cs);
  const prev = el('canvas', { width: 960, height: 540, class: 'ss-prev' }); const pctx = prev.getContext('2d');
  let raf = 0, testRec = null, slideIdx = E.cur;
  const slideC = () => renderToCanvas(E.doc, E.doc.slides[slideIdx], 960, { present: true, index: slideIdx });
  let sc = slideC();
  const loop = () => { raf = requestAnimationFrame(loop); pctx.fillStyle = '#000'; pctx.fillRect(0, 0, 960, 540); const lay = cameraLayout(draft.enabled && camera.active ? draft : { ...draft, enabled: false }, 960, 540, E.doc.size.w / E.doc.size.h); const r = lay.slideRect; if (lay.behind && camera.active) drawCameraOverlay(pctx, camera, draft, lay.camRect, 1); pctx.drawImage(sc, r.x, r.y, r.w, r.h); if (camera.active && draft.enabled && lay.camRect && !lay.behind) drawCameraOverlay(pctx, camera, draft, lay.camRect, 1); if (!camera.active) { pctx.fillStyle = 'rgba(0,0,0,.55)'; pctx.fillRect(0, 490, 960, 50); pctx.fillStyle = '#fff'; pctx.font = '18px Segoe UI'; pctx.textAlign = 'center'; pctx.fillText(t('Camera is off — click "Enable Camera" to preview.'), 480, 522); } };
  const status = el('div', { class: 'ss-status' });
  const updStatus = () => { status.innerHTML = ''; status.append(el('span', { class: 'ind ' + (camera.active ? 'cam on' : '') }, (camera.active ? '● ' : '○ ') + (camera.active ? t('Camera active') : t('Camera off'))), el('span', { class: 'ind ' + (camera.micOn ? 'mic on' : '') }, (camera.micOn ? '● ' : '○ ') + (camera.micOn ? t('Microphone active') : t('Microphone off'))), camera.segState === 'loading' ? el('span', {}, t('Loading background model…')) : camera.segState === 'error' ? el('span', { class: 'warn' }, t('Background effects unavailable on this system — offline or GPU/WebAssembly blocked. Camera works without them.')) : null); };
  const off1 = camera.on(updStatus);
  const camSel = el('select'), micSel = el('select');
  const fillDevices = async () => { const { cams, mics } = await camera.devices(); camSel.innerHTML = ''; micSel.innerHTML = ''; cams.forEach((c, i) => camSel.append(el('option', { value: c.deviceId, selected: c.deviceId === camera.deviceId }, c.label || t('Camera') + ' ' + (i + 1)))); mics.forEach((c, i) => micSel.append(el('option', { value: c.deviceId, selected: c.deviceId === camera.micId }, c.label || t('Microphone') + ' ' + (i + 1)))); };
  fillDevices();
  const S2 = (k) => (e) => { const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' || e.target.type === 'number' ? +e.target.value : e.target.value; draft[k] = v; if (k === 'bgEffect' && v !== 'none') camera.loadSegmenter(); };
  const R = (k, min, max, step) => el('input', { type: 'range', min, max, step, value: draft[k], oninput: S2(k) });
  const C = (k) => el('input', { type: 'checkbox', checked: !!draft[k], onchange: S2(k) });
  const Sel = (k, opts) => { const s = sel(opts, draft[k]); s.onchange = S2(k); return s; };
  const resSel = sel([['640x360', '360p'], ['1280x720', '720p'], ['1920x1080', '1080p'], ['3840x2160', '4K (where supported)']], camera.res), fpsSel = sel([[15, '15 fps'], [24, '24 fps'], [30, '30 fps'], [60, '60 fps']], camera.fps);
  const enable = async () => { try { await camera.start({ deviceId: camSel.value, res: resSel.value, fps: +fpsSel.value }); draft.enabled = true; fillDevices(); } catch (e) { alertBox(t('Camera unavailable'), t('Camera permission was denied or no camera is available.') + ' ' + (e.message || '')); } };
  const qual = sel([[720, '720p'], [1080, '1080p'], [1440, '1440p (where supported)'], [2160, '4K (where supported)']], +(localStorage.getItem('lp.recq') || 1080)), fmt = sel([['mp4', 'MP4'], ['webm', 'WebM']], localStorage.getItem('lp.recf') || 'mp4'), aud = sel([['mic', 'Microphone only'], ['sys', 'System audio'], ['both', 'Microphone and system audio'], ['none', 'No audio']], localStorage.getItem('lp.reca') || 'mic');
  const presetRow = el('div', { class: 'p-btnrow wrap' }, ...Object.keys(CAM_PRESETS).map(k => el('button', { class: 'chip', onclick: () => { Object.assign(draft, CAM_PRESETS[k], { preset: k }); rebuild(); } }, t(k[0].toUpperCase() + k.slice(1)))));
  const controls = el('div', { class: 'ss-controls' });
  const rebuild = () => {
    controls.innerHTML = '';
    controls.append(
      el('h4', {}, t('Camera')), el('div', { class: 'p-btnrow wrap' }, el('button', { class: 'btn primary', onclick: enable }, t('Enable Camera')), el('button', { class: 'btn danger', onclick: () => { camera.stop(); draft.enabled = false; } }, t('Disable Camera')), el('button', { class: 'btn', onclick: () => camera.toggleMic() }, t('Microphone On/Off'))), status,
      F('Camera', camSel), F('Microphone', micSel), el('div', { class: 'grid2' }, F('Camera Resolution', resSel), F('Frame Rate', fpsSel)),
      el('label', { class: 'p-chk' }, C('mirror'), ' ', t('Mirror Camera')), F('Zoom', R('zoom', 1, 3, .05)), F('Brightness', R('brightness', 40, 180, 1)), F('Contrast', R('contrast', 40, 180, 1)), F('Saturation', R('saturation', 0, 200, 1)),
      F('Exposure', el('input', { type: 'range', min: -3, max: 3, step: .1, value: 0, oninput: async (e) => { const ok = await camera.setExposure(+e.target.value); if (!ok) e.target.title = t('Not supported by this camera'); } })),
      el('h4', {}, t('Presets')), presetRow,
      el('h4', {}, t('Layout')), F('Presenter layout', Sel('layout', [['bubble', 'Presenter Bubble'], ['pip', 'Picture-in-Picture'], ['card', 'Presenter Card'], ['side', 'Side-by-Side'], ['full', 'Full Presenter'], ['floating', 'Floating Presenter']])),
      draft.layout === 'side' ? el('div', { class: 'grid2' }, F('Presenter side', Sel('side', [['right', 'Presenter Right'], ['left', 'Presenter Left'], ['top', 'Presenter Top'], ['bottom', 'Presenter Bottom']])), F('Split', R('split', .15, .6, .01))) : null,
      draft.layout === 'full' ? F('Mode', Sel('fullMode', [['presenterLarge', 'Presenter Large'], ['slideLarge', 'Slide Large'], ['split', 'Split Screen'], ['presenterFull', 'Presenter Full Screen'], ['slideFull', 'Slide Full Screen']])) : null,
      ['bubble', 'pip', 'card', 'floating'].includes(draft.layout) ? [F('Position', Sel('corner', [['tl', 'Top Left'], ['tr', 'Top Right'], ['bl', 'Bottom Left'], ['br', 'Bottom Right'], ['custom', 'Custom Position (drag in show)']])), F('Size', R('size', .08, .6, .01)), el('label', { class: 'p-chk' }, C('lock'), ' ', t('Lock Position')), el('label', { class: 'p-chk' }, C('autoAvoid'), ' ', t('Automatically Avoid Important Slide Content'))] : null,
      draft.layout === 'floating' ? el('div', { class: 'grid2' }, F('Rotation', R('rot', -30, 30, 1)), F('Transparency', el('input', { type: 'range', min: .2, max: 1, step: .05, value: draft.opacity, oninput: S2('opacity') }))) : null,
      el('h4', {}, t('Overlay design')), F('Camera Shape', Sel('shape', CAM_SHAPES.map(x => [x, x]))), el('div', { class: 'grid2' }, F('Border color', el('input', { type: 'color', value: toHex(draft.border || '#f26a1b'), oninput: S2('border') })), F('Border thickness', R('borderW', 0, 16, 1)), F('Border style', Sel('borderStyle', [['solid', 'Solid'], ['dashed', 'Dashed']])), F('Entrance animation', Sel('anim', [['fadeIn', 'Fade In'], ['zoomIn', 'Zoom In'], ['slideIn', 'Slide In'], ['popIn', 'Pop In'], ['bounceIn', 'Bounce In'], ['reveal', 'Reveal'], ['circularReveal', 'Circular Reveal']]))),
      el('label', { class: 'p-chk' }, C('shadow'), ' ', t('Shadow')), el('label', { class: 'p-chk' }, C('glow'), ' ', t('Glow')), el('label', { class: 'p-chk' }, C('showLabel'), ' ', t('Show name label')),
      el('div', { class: 'grid2' }, F('Presenter name', el('input', { value: draft.name, dir: 'auto', oninput: S2('name') })), F('Presenter title', el('input', { value: draft.title, dir: 'auto', oninput: S2('title') }))), F('Logo', el('button', { class: 'btn sm', onclick: async () => { const f = await pickFile('image/*'); if (f) draft.logo = await readAsDataURL(f); } }, t('Choose logo…'))),
      el('h4', {}, t('Background effects')), F('Effect', Sel('bgEffect', [['none', 'None'], ['blurLight', 'Light Blur'], ['blur', 'Medium Blur'], ['blurStrong', 'Strong Blur'], ['office', 'Office'], ['classroom', 'Classroom'], ['studio', 'Studio'], ['interior', 'Modern Interior'], ['library', 'Library'], ['neutral', 'Neutral Background'], ['custom', 'Custom Image'], ['remove', 'Remove Background (appear over slide)']])),
      F('Custom background image', el('button', { class: 'btn sm', onclick: async () => { const f = await pickFile('image/*'); if (f) { draft.bgImage = await readAsDataURL(f); draft.bgEffect = 'custom'; camera.loadSegmenter(); rebuild(); } } }, t('Choose image…'))), F('Edge smoothing', R('edge', 0, 1, .05)),
      el('p', { class: 'p-note' }, t('Background effects use on-device AI segmentation (MediaPipe), downloaded once when first used. Video never leaves your computer. If segmentation is unavailable, blur and replacement are disabled and the plain camera is shown.')),
      el('h4', {}, t('Recording')), el('div', { class: 'grid2' }, F('Quality', qual), F('Format', fmt)), F('Audio', aud),
      el('p', { class: 'p-note' }, t('Recordings are saved only to your computer. Nothing is uploaded.')));
  };
  rebuild();
  const slideNav = el('div', { class: 'p-row' }, el('button', { class: 'btn sm', onclick: () => { slideIdx = Math.max(0, slideIdx - 1); sc = slideC(); } }, '←'), el('span', {}, t('Preview slide')), el('button', { class: 'btn sm', onclick: () => { slideIdx = Math.min(E.doc.slides.length - 1, slideIdx + 1); sc = slideC(); } }, '→'));
  const save = () => { Object.assign(cs, draft); localStorage.setItem('lp.recq', qual.value); localStorage.setItem('lp.recf', fmt.value); localStorage.setItem('lp.reca', aud.value); E.dirty = true; emit('autosave'); };
  const testBtn = el('button', { class: 'btn', onclick: async () => { if (testRec) return; const stream = prev.captureStream(30); const tracks = [...stream.getVideoTracks()]; if (camera.micOn) tracks.push(...camera.micStream().getAudioTracks()); const r = new MediaRecorder(new MediaStream(tracks)); const ch = []; r.ondataavailable = e => ch.push(e.data); r.start(); testRec = r; testBtn.textContent = t('Recording test (5 s)…'); await sleep(5000); r.stop(); await new Promise(res => r.onstop = res); testRec = null; testBtn.textContent = t('Test Recording'); const url = URL.createObjectURL(new Blob(ch, { type: 'video/webm' })); dialog({ title: t('Test Recording'), body: el('video', { src: url, controls: true, autoplay: true, style: 'width:100%' }), buttons: [{ label: t('Close') }] }); } }, t('Test Recording'));
  dialog({ title: t('Selfie Presenter Studio'), wide: true, cls: 'selfie-studio', body: el('div', { class: 'ss' }, el('div', { class: 'ss-left' }, prev, slideNav, el('p', { class: 'p-note' }, t('This is exactly how the audience will see your presentation.')), el('div', { class: 'p-btnrow wrap' }, testBtn)), controls),
    onClose: () => { cancelAnimationFrame(raf); off1(); },
    buttons: [{ label: t('Close'), onClick: () => save() }, { label: t('Start Presentation'), primary: true, onClick: async () => { save(); await startShow(opts.recordFrom ?? E.cur); } }, { label: '● ' + t('Start Recording'), danger: true, onClick: async () => { save(); await recordPresentation(opts.recordFrom ?? E.cur); } }] });
  raf = requestAnimationFrame(loop);
}
export async function recordPresentation(from = 0) {
  const q = +(localStorage.getItem('lp.recq') || 1080), pref = localStorage.getItem('lp.recf') || 'mp4', aud = localStorage.getItem('lp.reca') || 'mic';
  let mic = null, sys = null;
  if (aud === 'mic' || aud === 'both') { try { if (!camera.micOn) await camera.startMic(); mic = camera.micStream(); } catch (e) { toast(t('Microphone permission was denied — recording without microphone.')); } }
  if (aud === 'sys' || aud === 'both') { try { const d = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); sys = new MediaStream(d.getAudioTracks()); d.getVideoTracks().forEach(tr => tr.stop()); if (!sys.getAudioTracks().length) { sys = null; toast(t('No system audio was shared.')); } } catch (e) { toast(t('System audio capture was cancelled.')); } }
  const pl = await startShow(from);
  if (!pl) return;
  const W = Math.round(q * E.doc.size.w / E.doc.size.h) & ~1;
  pl.opts.fixedSize = { w: W, h: q }; pl.resize();
  pl.rec = new Recorder(pl.canvas, { audio: mic, systemAudio: sys, fps: 30, pref, bitrate: q >= 2160 ? 3.5e7 : q >= 1440 ? 1.6e7 : 1e7 });
  try { pl.rec.start(); pl.flash(t('Recording started')); pl.updateCamBtns(); } catch (e) { alertBox(t('Recording not supported'), t('Recording is not supported in this browser.')); }
  // pause/resume via keyboard
  const k = (e) => { if (e.key === 'r' || e.key === 'R') { if (pl.rec.state === 'recording') { pl.rec.pause(); pl.flash(t('Recording paused (R to resume)')); } else if (pl.rec.state === 'paused') { pl.rec.resume(); pl.flash(t('Recording resumed')); } pl.updateCamBtns(); } };
  window.addEventListener('keydown', k); const oe = pl.opts.onEnd; pl.opts.onEnd = (p) => { window.removeEventListener('keydown', k); oe && oe(p); };
}
const recordings = [];
export function recordingReady(blob, mime) {
  const ext = (mime || '').includes('mp4') ? 'mp4' : 'webm'; const url = URL.createObjectURL(blob); const name = (E.doc.title || 'Presentation') + ' recording ' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.' + ext;
  recordings.push({ name, blob, url, t: Date.now() });
  dialog({ title: t('Recording finished'), wide: true, body: el('div', {}, el('video', { src: url, controls: true, style: 'width:100%;max-height:60vh;background:#000' }), el('p', { class: 'p-note' }, `${(blob.size / 1048576).toFixed(1)} MB · ${ext.toUpperCase()}`)), buttons: [{ label: t('Delete'), danger: true, onClick: () => { URL.revokeObjectURL(url); recordings.splice(recordings.findIndex(r => r.url === url), 1); } }, { label: t('Insert into slide'), onClick: async () => { const d = await readAsDataURL(blob); insertObjects([makeMedia('video', addAsset(E.doc, 'video', d, name), center0(640, 360))], 'Insert recording'); } }, { label: t('Save…'), primary: true, onClick: () => saveBlobAs(blob, name) }] });
}
async function saveBlobAs(blob, name) { if (window.showSaveFilePicker) { try { const h = await window.showSaveFilePicker({ suggestedName: name }); const w = await h.createWritable(); await w.write(blob); await w.close(); toast(t('Saved') + ': ' + h.name); return; } catch (e) { if (e.name === 'AbortError') return; } } downloadBlob(blob, name); }
export function recordingsList() { dialog({ title: t('Recordings (this session)'), wide: true, body: recordings.length ? el('div', {}, ...recordings.map(r => el('div', { class: 'rec-row' }, el('video', { src: r.url, controls: true, style: 'width:240px' }), el('span', {}, r.name, el('br'), (r.blob.size / 1048576).toFixed(1) + ' MB'), el('button', { class: 'btn sm', onclick: () => saveBlobAs(r.blob, r.name) }, t('Save…')), el('button', { class: 'btn sm danger', onclick: (e) => { URL.revokeObjectURL(r.url); recordings.splice(recordings.indexOf(r), 1); e.target.closest('.rec-row').remove(); } }, t('Delete'))))) : el('p', {}, t('No recordings in this session.')), buttons: [{ label: t('Close') }] }); }
async function captureMedia({ video, audio, screen }, onDone, title) {
  let stream;
  try { stream = screen ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }) : await navigator.mediaDevices.getUserMedia({ video: video ? { width: 1280, height: 720 } : false, audio }); if (screen && audio) { try { const m = await navigator.mediaDevices.getUserMedia({ audio: true }); m.getAudioTracks().forEach(tr => stream.addTrack(tr)); } catch (e) { } } }
  catch (e) { toast(t('Permission denied or device unavailable.')); return; }
  const mime = video || screen ? pickMime('webm') : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); const ch = []; rec.ondataavailable = e => ch.push(e.data);
  const pv = video || screen ? el('video', { muted: true, autoplay: true, style: 'width:100%;background:#000;max-height:50vh' }) : el('div', { class: 'meter' }); if (pv.tagName === 'VIDEO') pv.srcObject = stream;
  const timer = el('b', {}, '00:00'); let t0 = 0, iv; const stopAll = () => { clearInterval(iv); stream.getTracks().forEach(tr => tr.stop()); };
  const d = dialog({ title, wide: !!(video || screen), body: el('div', {}, pv, el('p', { class: 'rec-ind' }, '● ', timer, ' ', el('span', { class: 'p-note' }, t('Recording indicator — your device is capturing.')))), onClose: () => { if (rec.state !== 'inactive') rec.stop(); stopAll(); }, buttons: [{ label: t('Cancel'), onClick: () => { rec.onstop = null; } }, { label: t('Pause/Resume'), onClick: () => { rec.state === 'recording' ? rec.pause() : rec.resume(); return false; } }, { label: t('Stop'), primary: true, onClick: () => { rec.onstop = () => onDone(new Blob(ch, { type: (rec.mimeType || 'video/webm').split(';')[0] })); } }] });
  rec.start(500); t0 = Date.now(); iv = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); timer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 300);
  stream.getVideoTracks()[0]?.addEventListener('ended', () => d.close());
}
export function recordNarration() { captureMedia({ audio: true }, async (blob) => { const d = await readAsDataURL(blob); const o = makeMedia('audio', addAsset(E.doc, 'audio', d, 'Narration'), { x: E.doc.size.w - 110, y: E.doc.size.h - 110, w: 70, h: 70, autoplay: true, name: 'Narration', hideIcon: true }); insertObjects([o], 'Record narration'); toast(t('Narration added to this slide (plays automatically).')); }, t('Record Narration')); }
export function recordWebcam() { captureMedia({ video: true, audio: true }, async (blob) => { const d = await readAsDataURL(blob); insertObjects([makeMedia('video', addAsset(E.doc, 'video', d, 'Webcam'), center0(480, 270))], 'Record webcam'); }, t('Record Webcam')); }
export function screenRecording() { captureMedia({ screen: true, audio: true }, async (blob) => { const d = await readAsDataURL(blob); insertObjects([makeMedia('video', addAsset(E.doc, 'video', d, 'Screen recording'), center0(800, 450))], 'Screen recording'); }, t('Screen Recording')); }
export function exportVideoDialog() {
  const q = sel([[720, '720p HD'], [1080, '1080p Full HD'], [1440, '1440p (where supported)'], [2160, '4K (where supported)']], 1080), fmt = sel([['mp4', 'MP4'], ['webm', 'WebM']], pickMime('mp4')?.includes('mp4') ? 'mp4' : 'webm'), per = el('input', { type: 'number', min: .5, step: .5, value: 4 }), cam = el('input', { type: 'checkbox' });
  dialog({ title: t('Export to Video'), body: el('div', { class: 'd-form' }, F('Quality', q), F('Format', fmt), F('Seconds per slide (when no timing is set)', per), el('label', { class: 'p-chk' }, cam, ' ', t('Include presenter camera (if enabled)')), el('p', { class: 'p-note' }, t('The video is recorded in real time with all transitions and animations. Keep this tab visible until it finishes.') + ' ' + (pickMime('mp4')?.includes('mp4') ? '' : t('This browser records WebM; MP4 is available in the desktop app and recent Chrome/Edge.')))),
    buttons: [{ label: t('Cancel') }, { label: t('Export'), primary: true, onClick: async () => { const b = busy(t('Recording video…')); try { const { blob, ext } = await IO.exportVideo(E.doc, { height: +q.value, perSlide: +per.value, pref: fmt.value, withCamera: cam.checked, onProgress: (p) => b.update(Math.round(p * 100) + '%') }); b.done(); recordingReady(blob, ext === 'mp4' ? 'video/mp4' : 'video/webm'); } catch (e) { b.done(); alertBox(t('Export failed'), e.message); } } }] });
}
export function exportGifDialog() {
  const w = sel([[480, '480 px'], [640, '640 px'], [960, '960 px']], 640), per = el('input', { type: 'number', min: .5, step: .5, value: 2 }), fps = sel([[8, '8 fps'], [12, '12 fps'], [15, '15 fps']], 12);
  dialog({ title: t('Export Animated GIF'), body: el('div', { class: 'd-form' }, F('Width', w), F('Seconds per slide', per), F('Transition frame rate', fps), el('p', { class: 'p-note' }, t('Best for short clips. GIF is limited to 256 colors.'))), buttons: [{ label: t('Cancel') }, { label: t('Export'), primary: true, onClick: async () => { const b = busy(t('Encoding GIF…')); try { const blob = await IO.exportGIF(E.doc, { width: +w.value, perSlide: +per.value, fps: +fps.value, onProgress: p => b.update(Math.round(p * 100) + '%') }); b.done(); downloadBlob(blob, (E.doc.title || 'Presentation') + '.gif'); } catch (e) { b.done(); alertBox(t('Export failed'), e.message); } } }] });
}

// ---------------------------------------------------------------- printing
export function printDialog(mode = 'full') {
  const m = sel([['full', 'Full Page Slides'], ['handouts', 'Handouts'], ['notes', 'Notes Pages'], ['outline', 'Outline']], mode), per = sel([1, 2, 3, 4, 6, 9].map(n => [n, n + ' ' + t('slides per page')]), 6), ori = sel([['landscape', 'Landscape'], ['portrait', 'Portrait']], mode === 'notes' || mode === 'handouts' ? 'portrait' : 'landscape'), mar = el('input', { type: 'number', value: 10, min: 0, max: 40 }), bg = el('input', { type: 'checkbox', checked: true }), hid = el('input', { type: 'checkbox' }), frame = el('input', { type: 'checkbox' });
  dialog({ title: t('Print'), body: el('div', { class: 'd-form' }, F('Layout', m), F('Handouts', per), F('Orientation', ori), F('Margins (mm)', mar), el('label', { class: 'p-chk' }, bg, ' ', t('Print backgrounds and colors')), el('label', { class: 'p-chk' }, frame, ' ', t('Frame slides')), el('label', { class: 'p-chk' }, hid, ' ', t('Print hidden slides')), el('p', { class: 'p-note' }, t('Choose the printer — or "Save as PDF" — in the next dialog.'))),
    buttons: [{ label: t('Cancel') }, { label: t('Print'), primary: true, onClick: () => IO.printDoc(E.doc, { mode: m.value, perPage: +per.value, orientation: ori.value, margins: +mar.value, background: bg.checked, includeHidden: hid.checked, frame: frame.checked }) }] });
}

// ---------------------------------------------------------------- quiz, outline, reuse
export function quizBuilder(opts = {}) {
  const qs = [{ q: '', options: ['', '', '', ''], correct: 0, explain: '' }]; const box = el('div', { class: 'quiz-b' });
  const render = () => { box.innerHTML = ''; qs.forEach((q, i) => box.append(el('div', { class: 'qz' }, el('b', {}, t('Question') + ' ' + (i + 1)), el('input', { value: q.q, dir: 'auto', placeholder: t('Question text'), oninput: e => q.q = e.target.value }), ...q.options.map((o, k) => el('label', { class: 'qz-opt' }, el('input', { type: 'radio', name: 'c' + i, checked: q.correct === k, onchange: () => q.correct = k }), el('input', { value: o, dir: 'auto', placeholder: t('Answer') + ' ' + String.fromCharCode(65 + k), oninput: e => q.options[k] = e.target.value }))), el('input', { value: q.explain, dir: 'auto', placeholder: t('Explanation (shown after a correct answer)'), oninput: e => q.explain = e.target.value })))); };
  render();
  const aiB = el('button', { class: 'btn', onclick: async () => { const topic = await prompt(t('Quiz topic or content'), slide().objects.filter(o => o.text).map(o => o.text).join('\n') || E.doc.title, { area: true }); if (!topic) return; const b = busy(t('AI is working…')); try { const r = await AI.quiz(topic, 4, E.doc.lang || getLang()); qs.length = 0; qs.push(...r.questions); render(); } catch (e) { aiError(e); } b.done(); } }, '✨ ' + t('Generate with AI'));
  dialog({ title: t('Interactive Quiz'), wide: true, body: el('div', {}, el('p', { class: 'p-note' }, t('Creates clickable question slides. Each answer is a button that branches to a "correct" or "try again" slide; the final slide shows completion.')), el('div', { class: 'p-btnrow' }, el('button', { class: 'btn', onclick: () => { qs.push({ q: '', options: ['', '', '', ''], correct: 0, explain: '' }); render(); } }, '+ ' + t('Question')), aiB), box), buttons: [{ label: t('Cancel') }, { label: t('Create Quiz'), primary: true, onClick: () => { const valid = qs.filter(q => q.q && q.options.filter(Boolean).length >= 2).map(q => ({ ...q, options: q.options.filter(Boolean) })); if (!valid.length) { toast(t('Add at least one question with two answers.')); return false; } const slides = AI.buildQuizSlides(E.doc, { questions: valid }); structural(); commit('Insert quiz', () => E.doc.slides.splice(E.cur + 1, 0, ...slides)); setCur(E.cur + 1); renderSlidesPanel(); } }] });
  if (opts.ai) setTimeout(() => aiB.click(), 80);
}
export function outlineImport() { prompt(t('Slides from Outline'), '# Title of first slide\n- point one\n- point two\n# Second slide\n- another point', { area: true, label: t('Each line starting with # becomes a slide title; lines starting with - become bullets.') }).then(txt => { if (!txt) return; const ss = IO.outlineToSlides(E.doc, txt); structural(); commit('Outline', () => E.doc.slides.splice(E.cur + 1, 0, ...ss)); renderSlidesPanel(); setCur(E.cur + 1); }); }
export async function reuseSlides() {
  const f = await pickFile('.lpres,.pptx'); if (!f) return; const b = busy(t('Opening…'));
  try { const other = /\.pptx$/i.test(f.name) ? await IO.importPPTX(f, []) : await IO.deserialize(await readAsText(f), () => prompt(t('Password'), '', { type: 'password' })); b.done();
    const keep = el('input', { type: 'checkbox' }); const g = el('div', { class: 'layout-pick' }); const chosen = new Set();
    other.slides.forEach((s, i) => { const c = document.createElement('canvas'); c.width = 220; c.height = 220 * other.size.h / other.size.w; renderSlide(c.getContext('2d'), other, s, { scale: 220 / other.size.w, present: true, index: i }); const bt = el('button', { onclick: () => { chosen.has(i) ? chosen.delete(i) : chosen.add(i); bt.classList.toggle('on'); } }, c, el('span', {}, String(i + 1))); g.append(bt); });
    dialog({ title: t('Reuse Slides') + ' — ' + f.name, wide: true, body: el('div', {}, el('label', { class: 'p-chk' }, keep, ' ', t('Keep source formatting (as picture background)')), g), buttons: [{ label: t('Cancel') }, { label: t('Insert'), primary: true, onClick: () => { Object.assign(E.doc.assets, other.assets); const k = Math.min(E.doc.size.w / other.size.w, E.doc.size.h / other.size.h); const ss = [...chosen].sort((a, b2) => a - b2).map(i => { const s = cloneSlide(other.slides[i]); s.objects.forEach(o => { o.x *= k; o.y *= k; o.w *= k; o.h *= k; if (o.size) o.size *= k; }); if (keep.checked) { const bgc = renderToCanvas(other, { ...other.slides[i], objects: [] }, 1280, { noMaster: true }); s.bg = { type: 'image', asset: addAsset(E.doc, 'image', bgc.toDataURL('image/jpeg', .9)) }; } return s; }); structural(); commit('Reuse slides', () => E.doc.slides.splice(E.cur + 1, 0, ...ss)); renderSlidesPanel(); } }] });
  } catch (e) { b.done(); alertBox(t('Could not open file'), e.message); }
}

// ---------------------------------------------------------------- AI dialogs
export function aiSettings() {
  const c = AI.aiConfig(); const prov = sel(Object.entries(AI.PROVIDERS).map(([k, p]) => [k, p.name]), c.provider);
  const base = el('input', { value: c.base || '', placeholder: AI.PROVIDERS[c.provider]?.base, dir: 'ltr' }), model = el('input', { value: c.model || '', placeholder: AI.PROVIDERS[c.provider]?.model, dir: 'ltr' }), key = el('input', { type: 'password', value: c.key || '', dir: 'ltr', autocomplete: 'off' }), temp = el('input', { type: 'number', min: 0, max: 2, step: .1, value: c.temperature ?? .7 }), mt = el('input', { type: 'number', min: 256, max: 32000, step: 256, value: c.maxTokens || 4000 });
  prov.onchange = () => { base.placeholder = AI.PROVIDERS[prov.value].base; model.placeholder = AI.PROVIDERS[prov.value].model; };
  dialog({ title: t('AI Settings'), body: el('div', { class: 'd-form' }, F('Provider', prov), F('API base URL (optional)', base), F('Model (optional)', model), F('API key', key), el('div', { class: 'grid2' }, F('Creativity (temperature)', temp), F('Max tokens per request', mt)),
    el('p', { class: 'p-note' }, t('Your API key is stored only on this device and is sent only to the provider you choose. Usage is billed by your provider. Without a provider, AI features stay disabled.')),
    el('p', { class: 'p-note' }, t('Usage') + `: ${c.usage?.requests || 0} ${t('requests')} · ${c.usage?.inTok || 0} / ${c.usage?.outTok || 0} ${t('tokens in/out')}`)),
    buttons: [{ label: t('Disconnect'), onClick: () => { AI.saveAiConfig({ ...c, key: '' }); refreshPanel(true); } }, { label: t('Test connection'), onClick: async () => { AI.saveAiConfig({ ...c, provider: prov.value, base: base.value, model: model.value, key: key.value, temperature: +temp.value, maxTokens: +mt.value }); const b = busy(t('Testing…')); try { const r = await AI.chat('Reply with the single word: OK', 'ping', { maxTokens: 10 }); b.done(); toast(t('Connected') + ': ' + r.slice(0, 20)); } catch (e) { b.done(); alertBox(t('Connection failed'), e.message); } return false; } }, { label: t('Save'), primary: true, onClick: () => { AI.saveAiConfig({ ...c, provider: prov.value, base: base.value, model: model.value, key: key.value, temperature: +temp.value, maxTokens: +mt.value }); refreshPanel(true); toast(t('AI settings saved.')); } }] });
}
export function aiGenerate(opts = {}) {
  if (!AI.aiReady()) { aiError({ code: 'noai' }); return; }
  const topic = el('textarea', { rows: 3, dir: 'auto', placeholder: t('e.g. The future of renewable energy in the Middle East') }), count = el('input', { type: 'number', min: 3, max: 30, value: 8 }), aud = el('input', { dir: 'auto', placeholder: t('e.g. high-school students, investors') }), tone = sel([['professional', 'Professional'], ['educational', 'Educational'], ['inspiring', 'Inspiring'], ['persuasive', 'Persuasive (pitch)'], ['casual', 'Casual'], ['academic', 'Academic']], opts.tone || 'professional'), lang = sel([['en', 'English'], ['he', 'עברית'], ['ar', 'العربية']], getLang()), theme = sel(THEMES.map(th => [th.id, th.name]), 'lasteast');
  let source = ''; const srcLab = el('span', { class: 'p-note' });
  const fileBtn = el('button', { class: 'btn sm', onclick: async () => { const f = await pickFile('.pdf,.docx,.txt,.md'); if (!f) return; const b = busy(t('Reading…')); try { source = /\.pdf$/i.test(f.name) ? await IO.pdfText(f) : /\.docx$/i.test(f.name) ? await IO.docxText(f) : await readAsText(f); srcLab.textContent = f.name + ' — ' + source.length + ' ' + t('characters'); if (!topic.value) topic.value = f.name.replace(/\.\w+$/, ''); } catch (e) { alertBox(t('Could not read file'), e.message); } b.done(); } }, t('Choose PDF, DOCX or TXT…'));
  dialog({ title: opts.outlineOnly ? t('Generate Outline') : t('Create Presentation with AI'), body: el('div', { class: 'd-form' }, F('Topic', topic), el('div', { class: 'p-row' }, fileBtn, srcLab), el('div', { class: 'grid2' }, F('Number of slides', count), F('Tone', tone), F('Language', lang), F('Theme', theme)), F('Audience', aud)),
    buttons: [{ label: t('Cancel') }, { label: t('Generate'), primary: true, onClick: async () => { if (!topic.value && !source) { toast(t('Enter a topic or choose a file.')); return false; } const b = busy(t('Generating presentation…')); try { const o = await AI.generateOutline({ topic: topic.value, count: +count.value, audience: aud.value, tone: tone.value, lang: lang.value, source }); b.done(); if (opts.outlineOnly) { pickList(t('Outline'), [o.title, ...(o.slides || []).map((s, i) => `${i + 1}. ${s.title}`)], () => { }); const ss = IO.outlineToSlides(E.doc, [o.title, ...(o.slides || []).flatMap(s => ['# ' + s.title, ...(s.bullets || []).map(x => '- ' + x)])].join('\n')); structural(); commit('AI outline', () => E.doc.slides.splice(E.cur + 1, 0, ...ss)); renderSlidesPanel(); return; } emit('openDoc', AI.outlineToDoc(o, theme.value, lang.value)); } catch (e) { b.done(); aiError(e); } } }] });
  if (opts.fromFile) setTimeout(() => fileBtn.click(), 120);
}
export async function aiDesignStudio() {
  if (!AI.aiReady()) { aiError({ code: 'noai' }); return; }
  const b = busy(t('Analyzing your presentation…'));
  try {
    const r = await AI.designAdvice(E.doc); b.done();
    const rows = (r.slides || []).filter(s => E.doc.slides[s.index - 1]); const chk = {};
    dialog({ title: t('AI Design Studio'), wide: true, body: el('div', {}, el('p', {}, el('b', {}, t('Recommended theme') + ': '), themeById(r.theme).name, ' — ', el('span', { dir: 'auto' }, r.reason || '')), el('table', { class: 'cmp-t' }, el('tr', {}, el('th', {}, ''), el('th', {}, '#'), el('th', {}, t('Layout')), el('th', {}, t('Transition')), el('th', {}, t('Animation')), el('th', {}, t('Tip'))), ...rows.map(s => el('tr', {}, el('td', {}, chk[s.index] = el('input', { type: 'checkbox', checked: true })), el('td', {}, s.index), el('td', {}, t('layout_' + s.layout)), el('td', {}, t(getT(s.transition).name)), el('td', {}, t(s.animation)), el('td', { dir: 'auto' }, s.tip || ''))))),
      buttons: [{ label: t('Cancel') }, { label: t('Apply theme only'), onClick: () => run('applyTheme', r.theme) }, { label: t('Apply all checked'), primary: true, onClick: () => { structural(); commit('AI Design Studio', () => { E.doc.theme = deepClone(themeById(r.theme)); for (const s of rows) { if (!chk[s.index].checked) continue; const sl = E.doc.slides[s.index - 1]; if (s.transition && s.index > 1) sl.transition = { ...sl.transition, type: s.transition, params: defaultParams(s.transition), duration: getT(s.transition).sig ? 1.4 : .9 }; const body = sl.objects.find(o => o.ph === 'body'); if (body && s.animation && s.animation !== 'none') body.anims = [{ ...newAnim(s.animation), byPara: true, order: 1 }]; } }); renderSlidesPanel(); } }] });
  } catch (e) { b.done(); aiError(e); }
}
export async function aiTheme() {
  const desc = await prompt(t('Describe the look you want'), t('Calm, natural, green and beige, elegant serif headings')); if (!desc) return;
  const b = busy(t('Designing theme…'));
  try { const r = await AI.chat('Design a presentation color theme. Reply ONLY with JSON {"name":string,"bg":hex,"bg2":hex,"surface":hex,"text":hex,"muted":hex,"accent":hex,"accent2":hex,"accent3":hex,"head":"font stack","body":"font stack","style":"minimal|band|swoosh|wave|glow"} with WCAG AA text contrast.', desc, { json: true }); b.done(); commit('AI theme', () => Object.assign(E.doc.theme, r, { id: 'ai-' + Date.now() })); renderSlidesPanel(); toast(t('Theme applied') + ': ' + (r.name || '')); }
  catch (e) { b.done(); aiError(e); }
}
