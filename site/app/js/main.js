// Lasteast Present — application boot, splash, home (start) screen, file routing, autosave
import { el, $, $$, readAsText, readAsDataURL, pickFile, debounce } from './util.js';
import { E, on, emit, savePrefs, commit } from './state.js';
import { t, setLang, getLang, onLang, isRTL } from './i18n.js';
import { ICONS } from './icons.js';
import { newDoc, buildTemplate, TEMPLATE_CATEGORIES, THEMES, signatureShowcase, makeSlide, makeTable, makeChart, addAsset } from './model.js';
import { renderToCanvas, shapePoints, preloadDoc } from './renderer.js';
import { mountEditor, thumbDataURL, refreshAll } from './editor.js';
import * as IO from './io.js';
import * as D from './dialogs.js';
import { startAudience } from './slideshow.js';
import { SIGNATURE, getT } from './transitions.js';

window.LP_VERSION = '1.0.3';
window.__shapePts = (s) => s === 'line' || s === 'arrowLine' ? null : shapePoints(s, 24, 24, 5).map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
document.body.dataset.theme = E.prefs.uiTheme;
const app = $('#app'), home = $('#home');

// ---------------- boot ----------------
const params = new URLSearchParams(location.search);
if (params.get('audience')) { $('#splash')?.remove(); app.hidden = true; home.hidden = true; startAudience(params.get('audience')); }
else boot();

async function boot() {
  await splash();
  const id = params.get('doc');
  if (id) { const d = await IO.loadLocal(id); if (d) return openDoc(d); }
  if (params.get('new') === '1') return openDoc(newDoc());
  if (params.get('showcase') === '1') return openDoc(signatureShowcase());
  showHome();
  if (window.lpDesktop?.onOpenFile) window.lpDesktop.onOpenFile(async (name, b64) => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); openFile(new File([bin], name)); });
}
function splash() {
  return new Promise(res => {
    const s = $('#splash'); if (!s) return res();
    if (sessionStorage.getItem('lp.splashed')) { s.remove(); return res(); }
    sessionStorage.setItem('lp.splashed', '1');
    s.classList.add('go'); setTimeout(() => { s.classList.add('out'); setTimeout(() => { s.remove(); res(); }, 450); }, 1700);
    s.addEventListener('click', () => { s.remove(); res(); }, { once: true });
  });
}

// ---------------- home screen ----------------
let homeSection = 'home';
async function showHome(section = 'home') {
  homeSection = section || 'home';
  app.hidden = true; home.hidden = false; E.doc = null; document.title = 'Lasteast Present';
  const recent = await IO.recentList();
  home.innerHTML = '';
  const nav = el('nav', { class: 'h-nav' },
    el('div', { class: 'h-brand' }, el('span', { class: 'h-logo', html: ICONS.logo }), el('div', {}, el('b', {}, 'Lasteast Present'), el('small', {}, 'Professional 2024'))),
    ...[['home', 'home', 'Home'], ['new', 'newslide', 'New'], ['open', 'folder', 'Open'], ['templates', 'themes', 'Templates'], ['recover', 'history', 'Recover']].map(([k, ic, l]) => el('button', { class: 'h-nav-i' + (homeSection === k ? ' on' : ''), onclick: () => k === 'open' ? openDialog() : showHome(k) }, el('span', { class: 'ic', html: ICONS[ic] }), t(l))),
    el('div', { class: 'h-spacer' }),
    el('select', { class: 'tb-lang', title: t('Interface language'), onchange: (e) => setLang(e.target.value) }, ...[['en', 'English'], ['he', 'עברית'], ['ar', 'العربية']].map(([v, n]) => el('option', { value: v, selected: getLang() === v }, n))),
    el('button', { class: 'h-nav-i', onclick: () => { E.prefs.uiTheme = E.prefs.uiTheme === 'dark' ? 'light' : 'dark'; savePrefs(); document.body.dataset.theme = E.prefs.uiTheme; showHome(homeSection); } }, el('span', { class: 'ic', html: E.prefs.uiTheme === 'dark' ? ICONS.sun : ICONS.moon }), t(E.prefs.uiTheme === 'dark' ? 'Light mode' : 'Dark mode')),
    el('button', { class: 'h-nav-i', onclick: () => D.aiSettings() }, el('span', { class: 'ic', html: ICONS.settings }), t('AI Settings')),
    el('button', { class: 'h-nav-i', onclick: () => D.dialog({ title: t('About'), body: D.about(), buttons: [{ label: t('OK'), primary: true }] }) }, el('span', { class: 'ic', html: ICONS.info }), t('About')));
  const main = el('main', { class: 'h-main' });
  const hour = new Date().getHours();
  main.append(el('header', { class: 'h-hero' }, el('div', {}, el('h1', {}, t(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')), el('p', { class: 'slogan' }, 'Ideas. Design. Present.')), el('input', { type: 'search', class: 'h-search', placeholder: t('Search presentations and templates'), oninput: debounce((e) => filterHome(e.target.value), 150) })));
  if (homeSection === 'home' || homeSection === 'new') {
    main.append(el('section', { class: 'h-new' },
      newCard('newslide', 'Blank Presentation', () => openDoc(newDoc()), 'blank'),
      newCard('star', 'Lasteast Signature Showcase', () => openDoc(signatureShowcase()), 'sig'),
      newCard('ai', 'Create from AI', () => { openDoc(newDoc()); setTimeout(() => D.aiGenerate(), 300); }, 'ai'),
      newCard('import', 'Import PowerPoint', async () => { const f = await pickFile('.pptx,.ppt'); if (f) openFile(f); }, 'pptx'),
      newCard('folder', 'Open…', () => openDialog(), 'open')));
    main.append(sigStrip());
  }
  if (homeSection === 'home' || homeSection === 'templates' || homeSection === 'new') main.append(templatesSec(homeSection === 'templates'));
  if (homeSection === 'home' || homeSection === 'recover') main.append(recentSec(recent, homeSection === 'recover'));
  home.append(nav, main);
  // drag & drop open
  home.ondragover = (e) => { e.preventDefault(); home.classList.add('dropping'); }; home.ondragleave = () => home.classList.remove('dropping');
  home.ondrop = (e) => { e.preventDefault(); home.classList.remove('dropping'); const f = e.dataTransfer.files[0]; if (f) openFile(f); };
}
const newCard = (ic, label, fn, cls) => el('button', { class: 'h-card new ' + cls, onclick: fn }, el('div', { class: 'h-card-img' }, el('span', { class: 'ic', html: ICONS[ic] })), el('span', {}, t(label)));
function sigStrip() {
  return el('section', { class: 'h-sig' }, el('h2', {}, el('span', { html: ICONS.logo, class: 'mini-logo' }), t('Lasteast Signature Transitions')), el('div', { class: 'h-sig-row' }, ...SIGNATURE.map(id => el('button', { class: 'h-sig-i', onclick: () => openDoc(signatureShowcase()) }, el('span', { class: 'sig-dot ' + id }), el('b', {}, t(getT(id).name)), el('small', {}, t(getT(id).desc || ''))))));
}
let tplCache = {};
function templatesSec(all) {
  const sec = el('section', { class: 'h-tpl' }, el('h2', {}, t('Templates')));
  const chips = el('div', { class: 'chips' }); const grid = el('div', { class: 'h-grid' });
  let cat = all ? 'all' : 'featured';
  const cats = [...(all ? [] : ['featured']), 'all', ...TEMPLATE_CATEGORIES];
  const render = () => {
    chips.innerHTML = ''; for (const c of cats) chips.append(el('button', { class: 'chip' + (cat === c ? ' on' : ''), onclick: () => { cat = c; render(); } }, t('tpl_' + c)));
    grid.innerHTML = '';
    const list = cat === 'featured' ? ['business', 'pitch', 'education', 'technology', 'marketing', 'creative'] : cat === 'all' ? TEMPLATE_CATEGORIES : [cat];
    for (const c of list) {
      const variants = cat === 'all' || cat === 'featured' ? [null] : [null, ...THEMES.slice(0, 5).map(x => x.id)];
      for (const th of variants) {
        const key = c + (th || ''); const d = tplCache[key] || (tplCache[key] = buildTemplate(c, th));
        const cv = renderToCanvas(d, d.slides[0], 360, { present: true, index: 0 });
        grid.append(el('button', { class: 'h-card tpl', 'data-name': (t('tpl_' + c) + ' ' + d.title).toLowerCase(), onclick: () => openDoc(buildTemplate(c, th)) }, el('div', { class: 'h-card-img' }, cv), el('span', {}, t('tpl_' + c) + (th ? ' · ' + THEMES.find(x => x.id === th).name : '')), el('small', { dir: 'auto' }, d.title)));
      }
    }
  };
  render(); sec.append(chips, grid); return sec;
}
function recentSec(recent, recover) {
  const list = recover ? recent.filter(r => r.unsaved) : recent;
  const sec = el('section', { class: 'h-recent' }, el('h2', {}, t(recover ? 'Recover Unsaved Presentations' : 'Recent')));
  if (recover) sec.append(el('p', { class: 'p-note' }, t('These presentations were kept by AutoSave on this device but never saved to a file.')));
  if (!list.length) { sec.append(el('p', { class: 'p-empty' }, t(recover ? 'Nothing to recover.' : 'Presentations you open or create will appear here.'))); return sec; }
  const pinned = list.filter(r => r.pinned), rest = list.filter(r => !r.pinned);
  const table = el('div', { class: 'h-list' });
  for (const r of [...pinned, ...rest]) table.append(el('div', { class: 'h-row', 'data-name': (r.title || '').toLowerCase(), onclick: (e) => { if (e.target.closest('button')) return; IO.loadLocal(r.id).then(d => d ? openDoc(d) : D.toast(t('This presentation is no longer available.'))); } },
    r.thumb ? el('img', { src: r.thumb, alt: '' }) : el('div', { class: 'nothumb' }), el('div', { class: 'h-row-t' }, el('b', { dir: 'auto' }, r.title || t('Untitled presentation')), el('small', {}, `${r.slides || 0} ${t('slides')} · ${new Date(r.modified).toLocaleString(getLang())}${r.unsaved ? ' · ' + t('Not saved to a file') : ''}`)),
    el('button', { class: 'mini' + (r.pinned ? ' on' : ''), title: t(r.pinned ? 'Unpin' : 'Pin'), html: ICONS.pin, onclick: async () => { await IO.setPinned(r.id, !r.pinned); showHome(homeSection); } }),
    el('button', { class: 'mini', title: t('Remove from this device'), html: ICONS.trash, onclick: async () => { if (await D.confirmBox(t('Remove'), t('Remove "{n}" from this device? Files you saved are not affected.', { n: r.title }))) { await IO.removeRecent(r.id); showHome(homeSection); } } })));
  sec.append(table); return sec;
}
function filterHome(q) { q = q.toLowerCase(); $$('[data-name]', home).forEach(n => n.hidden = q && !n.dataset.name.includes(q)); }
onLang(() => { if (!home.hidden) showHome(homeSection); });

// ---------------- documents ----------------
export async function openDoc(doc) {
  E.doc = doc; E.cur = 0; E.sel = []; E.history = []; E.future = []; E.view = 'normal'; E.readOnly = !!doc._readOnly; E.dirty = false;
  home.hidden = true; app.hidden = false; document.title = (doc.title || 'Presentation') + ' — Lasteast Present';
  await preloadDoc(doc);
  mountEditor(app);
  IO.saveLocal(doc, thumbDataURL()).catch(() => { });
}
async function openDialog() {
  if (window.showOpenFilePicker) {
    try { const [h] = await window.showOpenFilePicker({ types: [{ description: t('Presentations'), accept: { 'application/octet-stream': ['.lpres', '.pptx', '.ppt', '.pdf', '.odp', '.docx', '.txt', '.md', '.csv', '.xlsx'] } }] }); const f = await h.getFile(); return openFile(f, h); } catch (e) { if (e.name === 'AbortError') return; }
  }
  const f = await pickFile('.lpres,.pptx,.ppt,.pdf,.odp,.docx,.txt,.md,.csv,.xlsx,image/*'); if (f) openFile(f);
}
async function openFile(f, handle) {
  const n = f.name.toLowerCase(), b = D.busy(t('Opening') + ' ' + f.name + '…');
  try {
    if (/\.(lpres|json)$/.test(n)) { const d = await IO.deserialize(await readAsText(f), () => D.prompt(t('This presentation is password protected'), '', { type: 'password', label: t('Enter password to open') + ': ' + f.name })); d._handle = handle; d._savedToFile = true; b.done(); return openDoc(d); }
    if (n.endsWith('.pptx') || n.endsWith('.ppsx') || n.endsWith('.potx')) { const rep = []; const d = await IO.importPPTX(f, rep); b.done(); await openDoc(d); if (rep.length) D.compatReport(rep, 'PPTX'); return; }
    if (n.endsWith('.ppt')) { b.done(); return D.alertBox(t('PowerPoint 97-2003 file'), t('Legacy .ppt files use a closed binary format that cannot be read reliably in this version. Open it in PowerPoint, LibreOffice or Google Slides and save it as .pptx, then open the .pptx here.')); }
    const d = newDoc(); d.title = f.name.replace(/\.\w+$/, ''); d.slides = [];
    if (n.endsWith('.pdf')) d.slides = await IO.importPDF(d, f);
    else if (n.endsWith('.odp')) { const rep = []; d.slides = await IO.importODP(d, f, rep); }
    else if (n.endsWith('.docx')) d.slides = IO.outlineToSlides(d, await IO.docxText(f));
    else if (/\.(txt|md)$/.test(n)) d.slides = IO.outlineToSlides(d, await readAsText(f));
    else if (/\.(csv|xlsx)$/.test(n)) { const rows = n.endsWith('.csv') ? IO.parseCSV(await readAsText(f)) : await IO.xlsxRows(f); d.slides = dataSlides(d, rows); }
    else if (f.type.startsWith('image/')) d.slides = await IO.importImagesAsSlides(d, [f]);
    else throw new Error(t('Unsupported file type: ') + f.name);
    if (!d.slides.length) d.slides.push(makeSlide(d, 'title'));
    b.done(); openDoc(d);
  } catch (e) { b.done(); if (e.message !== 'cancelled') D.alertBox(t('Could not open file'), String(e.message || e)); }
}
function dataSlides(d, rows) {
  const s1 = makeSlide(d, 'titleOnly'); s1.objects[0].text = t('Data'); const R = Math.min(rows.length, 12), C = Math.min(Math.max(...rows.map(r => r.length)), 8);
  const tb = makeTable(R, C, { x: 80, y: 170, w: d.size.w - 160, h: Math.min(d.size.h - 220, 44 * R) }); for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) tb.cells[r][c] = { text: String(rows[r][c] ?? '') }; s1.objects.push(tb);
  const s2 = makeSlide(d, 'titleOnly'); s2.objects[0].text = t('Chart'); s2.objects.push(makeChart('column', { x: 80, y: 170, w: d.size.w - 160, h: d.size.h - 220, title: '', data: IO.rowsToChartData(rows.slice(0, 30)) }));
  return [s1, s2];
}
async function importInto(f) {
  const n = f.name.toLowerCase(), b = D.busy(t('Importing') + ' ' + f.name + '…');
  try {
    let ss = [], rep = [];
    if (n.endsWith('.pptx')) { const o = await IO.importPPTX(f, rep); Object.assign(E.doc.assets, o.assets); const k = Math.min(E.doc.size.w / o.size.w, E.doc.size.h / o.size.h); ss = o.slides.map(s => { s.objects.forEach(q => { q.x *= k; q.y *= k; q.w *= k; q.h *= k; if (q.size) q.size *= k; }); return s; }); }
    else if (n.endsWith('.pdf')) ss = await IO.importPDF(E.doc, f);
    else if (n.endsWith('.odp')) ss = await IO.importODP(E.doc, f, rep);
    else if (n.endsWith('.docx')) ss = IO.outlineToSlides(E.doc, await IO.docxText(f));
    else if (/\.(txt|md)$/.test(n)) ss = IO.outlineToSlides(E.doc, await readAsText(f));
    else if (/\.(csv|xlsx)$/.test(n)) ss = dataSlides(E.doc, n.endsWith('.csv') ? IO.parseCSV(await readAsText(f)) : await IO.xlsxRows(f));
    else if (n.endsWith('.lpres')) { const o = await IO.deserialize(await readAsText(f), () => D.prompt(t('Password'), '', { type: 'password' })); Object.assign(E.doc.assets, o.assets); ss = o.slides; }
    else if (n.endsWith('.ppt')) { b.done(); return D.alertBox(t('PowerPoint 97-2003 file'), t('Legacy .ppt files use a closed binary format that cannot be read reliably in this version. Open it in PowerPoint, LibreOffice or Google Slides and save it as .pptx, then open the .pptx here.')); }
    b.done(); if (!ss.length) return;
    E._structural = true; commit('Import', () => E.doc.slides.splice(E.cur + 1, 0, ...ss)); await preloadDoc(E.doc); refreshAll();
    D.toast(t('Imported {n} slides.', { n: ss.length })); if (rep.length) D.compatReport(rep, n.split('.').pop().toUpperCase());
  } catch (e) { b.done(); D.alertBox(t('Import failed'), String(e.message || e)); }
}

on('newPres', () => openDoc(newDoc()));
on('openDialog', () => openDialog());
on('openFile', (f) => E.doc ? (/\.(lpres|pptx)$/i.test(f.name) ? D.confirmBox(t('Open file'), t('Open "{n}" as a new presentation? Choose Cancel to insert its slides into this one.', { n: f.name })).then(ok => ok ? openFile(f) : importInto(f)) : importInto(f)) : openFile(f));
on('importInto', (f) => importInto(f));
on('openDoc', (d) => openDoc(d));
on('goHome', async (sec) => { if (E.doc) await IO.saveLocal(E.doc, thumbDataURL()).catch(() => { }); showHome(sec); });

// ---------------- AutoSave & recovery ----------------
let lastVersion = Date.now();
const doAutosave = async () => { if (!E.doc) return; try { await IO.saveLocal(E.doc, thumbDataURL()); E.dirty = false; const sv = $('.tb-saved'); if (sv) sv.textContent = t('AutoSaved'); if (Date.now() - lastVersion > 180000) { lastVersion = Date.now(); await IO.addVersion(E.doc); } } catch (e) { console.warn('AutoSave failed', e); const sv = $('.tb-saved'); if (sv) sv.textContent = t('AutoSave failed (storage full?)'); } };
on('autosave', doAutosave); on('autosaveNow', doAutosave);
window.addEventListener('beforeunload', (e) => { if (E.doc && (E.dirty || !E.doc._savedToFile)) { doAutosave(); if (!E.prefs.autosave) { e.preventDefault(); e.returnValue = ''; } } });
document.addEventListener('visibilitychange', () => { if (document.hidden && E.doc) doAutosave(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
