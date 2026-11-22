// Lasteast Present — storage, file formats, import/export, printing
import { uid, el, downloadBlob, deepClone, readAsArrayBuffer, readAsDataURL, readAsText, parseColor, toHex, sleep, clamp } from './util.js';
import { newDoc, makeSlide, makeText, makeShape, makeImage, makeTable, makeChart, makeMedia, addAsset, gcAssets, resolveColor, resolveFont, layoutObjects, FORMAT_VERSION, THEMES } from './model.js';
import { renderToCanvas, preloadDoc, assetSrc, shapePoints, layoutText, lineX, textTop, fontStr, tableGeom } from './renderer.js';
import { getT, PPTX_MAP } from './transitions.js';
import { t } from './i18n.js';

// ---------------- IndexedDB ----------------
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('lasteast-present', 2);
    r.onupgradeneeded = () => { const d = r.result; for (const s of ['docs', 'meta', 'versions']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) { const d = await db(); return new Promise((res, rej) => { const x = d.transaction(store, mode); const s = x.objectStore(store); const out = fn(s); x.oncomplete = () => res(out && 'result' in out ? out.result : out); x.onerror = () => rej(x.error); }); }
export const idbPut = (store, key, val) => tx(store, 'readwrite', s => s.put(val, key));
export const idbGet = (store, key) => tx(store, 'readonly', s => s.get(key));
export const idbDel = (store, key) => tx(store, 'readwrite', s => s.delete(key));
export const idbKeys = (store) => tx(store, 'readonly', s => s.getAllKeys());

export async function saveLocal(doc, thumb) {
  doc.modified = Date.now();
  await idbPut('docs', doc.id, doc);
  const meta = (await idbGet('meta', 'recent')) || [];
  const i = meta.findIndex(m => m.id === doc.id); const entry = { id: doc.id, title: doc.title, modified: doc.modified, thumb: thumb || (i >= 0 ? meta[i].thumb : null), pinned: i >= 0 ? meta[i].pinned : false, slides: doc.slides.length, fileName: i >= 0 ? meta[i].fileName : null, unsaved: !doc._savedToFile };
  if (i >= 0) meta.splice(i, 1); meta.unshift(entry); await idbPut('meta', 'recent', meta.slice(0, 60));
}
export async function recentList() { return (await idbGet('meta', 'recent')) || []; }
export async function setPinned(id, v) { const m = await recentList(); const e = m.find(x => x.id === id); if (e) { e.pinned = v; await idbPut('meta', 'recent', m); } }
export async function removeRecent(id) { const m = (await recentList()).filter(x => x.id !== id); await idbPut('meta', 'recent', m); await idbDel('docs', id); }
export const loadLocal = (id) => idbGet('docs', id);
export async function addVersion(doc, label = 'AutoSave') {
  const list = (await idbGet('versions', doc.id)) || [];
  list.unshift({ id: uid('v'), t: Date.now(), label, data: JSON.stringify(doc) });
  await idbPut('versions', doc.id, list.slice(0, 25));
}
export async function versions(docId) { return (await idbGet('versions', docId)) || []; }

// ---------------- native file (.lpres) ----------------
async function deriveKey(pass, salt) { const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function serialize(doc, password) {
  const d = deepClone(doc); delete d._savedToFile; delete d._handle; gcAssets(d);
  const json = JSON.stringify(d);
  if (!password) return new Blob([json], { type: 'application/json' });
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), key = await deriveKey(password, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json)));
  return new Blob([JSON.stringify({ format: 'lasteast-present-encrypted', version: FORMAT_VERSION, salt: b64(salt), iv: b64(iv), data: b64(ct) })], { type: 'application/json' });
}
export async function deserialize(text, askPassword) {
  let o = JSON.parse(text);
  if (o.format === 'lasteast-present-encrypted') {
    const pass = await askPassword(); if (pass == null) throw new Error('cancelled');
    try { const key = await deriveKey(pass, unb64(o.salt)); const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.data)); o = JSON.parse(new TextDecoder().decode(pt)); o._password = true; }
    catch (e) { throw new Error(t('Incorrect password.')); }
  }
  if (o.format !== 'lasteast-present') throw new Error(t('This is not a Lasteast Present file.'));
  return migrate(o);
}
function migrate(d) {
  d.show = d.show || { loop: false, customShows: [] }; d.master = d.master || { footer: '' }; d.assets = d.assets || {};
  for (const s of d.slides) { s.comments = s.comments || []; s.transition = s.transition || { type: 'none', duration: .8 }; for (const o of s.objects) { o.anims = o.anims || []; o.mid = o.mid || o.id; } }
  return d;
}
export async function saveToFile(doc, { saveAs = false, password = null } = {}) {
  const blob = await serialize(doc, password);
  const name = (doc.title || 'Presentation').replace(/[\\/:*?"<>|]+/g, '_') + '.lpres';
  if (window.showSaveFilePicker) {
    try {
      let h = !saveAs && doc._handle;
      if (!h) h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Lasteast Presentation', accept: { 'application/json': ['.lpres'] } }] });
      const w = await h.createWritable(); await w.write(blob); await w.close(); doc._handle = h; doc._savedToFile = true; return h.name;
    } catch (e) { if (e.name === 'AbortError') return null; }
  }
  downloadBlob(blob, name); doc._savedToFile = true; return name;
}

// ---------------- XML helpers ----------------
const kids = (n, name) => n ? [...n.children].filter(c => c.localName === name) : [];
const first = (n, name) => { if (!n) return null; for (const c of n.children) if (c.localName === name) return c; return null; };
const deep = (n, name) => { if (!n) return null; const all = n.getElementsByTagName('*'); for (const c of all) if (c.localName === name) return c; return null; };
const deepAll = (n, name) => n ? [...n.getElementsByTagName('*')].filter(c => c.localName === name) : [];
const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const relsPath = (p) => p.replace(/([^/]+)$/, '_rels/$1.rels');
const resolvePath = (base, target) => { if (target.startsWith('/')) return target.slice(1); const parts = base.split('/'); parts.pop(); for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); } return parts.join('/'); };
async function readRels(zip, path) { const f = zip.file(relsPath(path)); if (!f) return {}; const x = parseXml(await f.async('string')); const out = {}; for (const r of deepAll(x, 'Relationship')) out[r.getAttribute('Id')] = { target: resolvePath(path, r.getAttribute('Target')), type: r.getAttribute('Type'), external: r.getAttribute('TargetMode') === 'External' }; return out; }
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', webp: 'image/webp', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', emf: 'image/emf', wmf: 'image/wmf', tif: 'image/tiff', tiff: 'image/tiff' };
async function zipDataURL(zip, path) { const f = zip.file(path); if (!f) return null; const ext = path.split('.').pop().toLowerCase(); const b = await f.async('base64'); return `data:${MIME[ext] || 'application/octet-stream'};base64,${b}`; }

// ---------------- PPTX import ----------------
const PRST = { rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', rtTriangle: 'rtTriangle', diamond: 'diamond', pentagon: 'pentagon', homePlate: 'chevron', hexagon: 'hexagon', octagon: 'octagon', star5: 'star5', star8: 'star8', plus: 'plus', mathPlus: 'plus', rightArrow: 'arrowR', leftArrow: 'arrowL', upArrow: 'arrowU', downArrow: 'arrowD', chevron: 'chevron', parallelogram: 'parallelogram', trapezoid: 'trapezoid', heart: 'heart', wedgeRectCallout: 'callout', wedgeRoundRectCallout: 'callout', cloud: 'cloud', cloudCallout: 'cloud', moon: 'moon', line: 'line', straightConnector1: 'arrowLine', flowChartProcess: 'rect', flowChartAlternateProcess: 'roundRect', flowChartDecision: 'diamond', flowChartTerminator: 'roundRect', snip1Rect: 'rect', round2SameRect: 'roundRect', wave: 'wave', doubleWave: 'wave' };
const SCHEME = { accent1: '@accent', accent2: '@accent2', accent3: '@accent3', accent4: '@muted', accent5: '@accent', accent6: '@accent2', tx1: '@text', dk1: '@text', tx2: '@text', dk2: '@text', bg1: '@bg', lt1: '@bg', bg2: '@bg2', lt2: '@bg2', hlink: '@accent', folHlink: '@accent2', phClr: '@accent' };
function colorOf(n, themeRaw) {
  if (!n) return null;
  const c = first(n, 'srgbClr') || first(n, 'schemeClr') || first(n, 'sysClr') || first(n, 'prstClr'); if (!c) return null;
  let col = c.localName === 'srgbClr' ? '#' + c.getAttribute('val') : c.localName === 'sysClr' ? '#' + (c.getAttribute('lastClr') || '000000') : c.localName === 'prstClr' ? ({ black: '#000000', white: '#ffffff', red: '#ff0000', blue: '#0000ff', green: '#00a000' }[c.getAttribute('val')] || '#000000') : (SCHEME[c.getAttribute('val')] || '@text');
  const alpha = first(c, 'alpha'); const lm = first(c, 'lumMod'), lo = first(c, 'lumOff');
  if ((lm || lo) && col[0] === '@' && themeRaw) col = themeRaw[col.slice(1)] || col;
  if ((lm || lo) && col[0] === '#') { let [r, g, b] = parseColor(col); const m = lm ? +lm.getAttribute('val') / 1e5 : 1, o = lo ? +lo.getAttribute('val') / 1e5 * 255 : 0; col = toHex([clamp(r * m + o, 0, 255), clamp(g * m + o, 0, 255), clamp(b * m + o, 0, 255), 1]); }
  if (alpha) { const [r, g, b] = parseColor(col[0] === '@' && themeRaw ? themeRaw[col.slice(1)] : col); return `rgba(${r},${g},${b},${+alpha.getAttribute('val') / 1e5})`; }
  return col;
}
function fillOf(spPr, theme) {
  if (!spPr) return undefined;
  if (first(spPr, 'noFill')) return 'none';
  const sf = first(spPr, 'solidFill'); if (sf) return colorOf(sf, theme);
  const gf = first(spPr, 'gradFill'); if (gf) { const gs = deepAll(gf, 'gs'); const lin = first(gf, 'lin'); return { type: first(gf, 'path') ? 'radial' : 'linear', c1: colorOf(gs[0], theme) || '#fff', c2: colorOf(gs.at(-1), theme) || '#000', angle: lin ? (+lin.getAttribute('ang') / 60000 + 90) % 360 : 90 }; }
  return undefined;
}
export async function importPPTX(file, report) {
  const JSZip = window.JSZip; const zip = await JSZip.loadAsync(await readAsArrayBuffer(file));
  const pres = parseXml(await zip.file('ppt/presentation.xml').async('string'));
  const sz = deep(pres, 'sldSz'); const cx = +(sz?.getAttribute('cx') || 12192000), cy = +(sz?.getAttribute('cy') || 6858000);
  const doc = newDoc('lasteast'); doc.title = file.name.replace(/\.pptx?$/i, ''); doc.slides = [];
  const W = 1280, H = Math.round(W * cy / cx); doc.size = { w: W, h: H };
  const k = W / cx, ptPx = (pt) => pt * (W / (cx / 914400)) / 72;
  // theme
  const presRels = await readRels(zip, 'ppt/presentation.xml');
  const themeRel = Object.values(presRels).find(r => r.type.endsWith('/theme'));
  let themeRaw = null;
  if (themeRel && zip.file(themeRel.target)) {
    const tx = parseXml(await zip.file(themeRel.target).async('string')); const cs = deep(tx, 'clrScheme');
    const get = (n) => { const e = first(cs, n); if (!e) return null; const c = first(e, 'srgbClr'); return c ? '#' + c.getAttribute('val') : (first(e, 'sysClr') ? '#' + first(e, 'sysClr').getAttribute('lastClr') : null); };
    if (cs) { themeRaw = { text: get('dk1') || '#000', bg: get('lt1') || '#fff', bg2: get('lt2') || '#eee', accent: get('accent1') || '#1f6feb', accent2: get('accent2') || '#1746b5', accent3: get('accent3') || '#333', muted: get('dk2') || '#666' }; Object.assign(doc.theme, themeRaw, { surface: themeRaw.bg2, id: 'imported', name: 'Imported', style: 'minimal' }); }
    const maj = deep(deep(tx, 'majorFont'), 'latin'), min = deep(deep(tx, 'minorFont'), 'latin');
    if (maj) doc.theme.head = maj.getAttribute('typeface') + ', Segoe UI, Arial'; if (min) doc.theme.body = min.getAttribute('typeface') + ', Segoe UI, Arial';
    themeRaw = doc.theme;
  }
  const ids = deepAll(pres, 'sldId').map(s => s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
  const unsupported = {};
  const note = (k2) => unsupported[k2] = (unsupported[k2] || 0) + 1;
  for (const rid of ids) {
    const rel = presRels[rid]; if (!rel) continue; const path = rel.target; const f = zip.file(path); if (!f) continue;
    const x = parseXml(await f.async('string')); const rels = await readRels(zip, path);
    const slide = makeSlide(doc, 'blank', []);
    // background
    const bgPr = deep(deep(x, 'bg'), 'bgPr');
    if (bgPr) { const fl = fillOf(bgPr, themeRaw); if (typeof fl === 'string' && fl !== 'none') slide.bg = { type: 'solid', color: fl }; else if (fl && fl.type) slide.bg = fl; const blip = deep(bgPr, 'blip'); if (blip) { const r = rels[blip.getAttribute('r:embed')]; const d = r && await zipDataURL(zip, r.target); if (d) slide.bg = { type: 'image', asset: addAsset(doc, 'image', d) }; } }
    // layout placeholders positions
    const layRel = Object.values(rels).find(r => r.type.endsWith('/slideLayout'));
    const phPos = {};
    if (layRel && zip.file(layRel.target)) { const lx = parseXml(await zip.file(layRel.target).async('string')); for (const sp of deepAll(lx, 'sp')) { const ph = deep(sp, 'ph'); const xf = deep(sp, 'xfrm'); if (ph && xf) phPos[(ph.getAttribute('type') || 'body') + ':' + (ph.getAttribute('idx') || '')] = xf; } }
    const tree = deep(x, 'spTree');
    const walk = async (node, gx) => {
      for (const c of node.children) {
        const ln = c.localName;
        if (ln === 'grpSp') { const gxf = deep(first(c, 'grpSpPr'), 'xfrm'); let g2 = gx; if (gxf) { const off = first(gxf, 'off'), ext = first(gxf, 'ext'), coff = first(gxf, 'chOff'), cext = first(gxf, 'chExt'); if (off && ext && coff && cext) { const sx = (+ext.getAttribute('cx') || 1) / (+cext.getAttribute('cx') || 1), sy = (+ext.getAttribute('cy') || 1) / (+cext.getAttribute('cy') || 1); g2 = { ox: gx.ox + (+off.getAttribute('x') - +coff.getAttribute('x') * sx) * gx.sx, oy: gx.oy + (+off.getAttribute('y') - +coff.getAttribute('y') * sy) * gx.sy, sx: gx.sx * sx, sy: gx.sy * sy, group: uid('g') }; } } await walk(c, g2); continue; }
        if (!['sp', 'pic', 'cxnSp', 'graphicFrame'].includes(ln)) continue;
        let xf = deep(c, 'xfrm');
        const ph = deep(c, 'ph'); const phType = ph ? (ph.getAttribute('type') || 'body') : null;
        if (!xf && ph) xf = phPos[phType + ':' + (ph.getAttribute('idx') || '')] || Object.entries(phPos).find(([kk]) => kk.startsWith(phType + ':'))?.[1];
        let box;
        if (xf) { const off = first(xf, 'off'), ext = first(xf, 'ext'); box = { x: (gx.ox + +off.getAttribute('x') * gx.sx) * k, y: (gx.oy + +off.getAttribute('y') * gx.sy) * k, w: +ext.getAttribute('cx') * gx.sx * k, h: +ext.getAttribute('cy') * gx.sy * k, rot: +(xf.getAttribute('rot') || 0) / 60000, flipH: xf.getAttribute('flipH') === '1', flipV: xf.getAttribute('flipV') === '1' }; }
        else if (ph) { const L = layoutObjects(phType === 'title' || phType === 'ctrTitle' ? 'titleContent' : 'titleContent', doc); const o = L.find(q => q.ph === (phType.includes('itle') ? 'title' : 'body')); box = { x: o.x, y: o.y, w: o.w, h: o.h, rot: 0 }; }
        else continue;
        const nv = deep(c, 'cNvPr'); const name = nv?.getAttribute('name') || '';
        let obj = null;
        if (ln === 'pic') {
          const blip = deep(c, 'blip'); const r = blip && rels[blip.getAttribute('r:embed')];
          const vid = deep(c, 'videoFile') || deep(c, 'audioFile'); const media = deep(c, 'media');
          if (vid || media) { const mr = rels[(vid || media).getAttribute('r:link') || (vid || media).getAttribute('r:embed')]; const d = mr && !mr.external && await zipDataURL(zip, mr.target); if (d) { obj = makeMedia(deep(c, 'audioFile') ? 'audio' : 'video', addAsset(doc, deep(c, 'audioFile') ? 'audio' : 'video', d), box); } else note('Linked or unsupported media'); }
          else if (r) { const ext = r.target.split('.').pop().toLowerCase(); if (ext === 'emf' || ext === 'wmf') { note('EMF/WMF vector images'); } else { const d = await zipDataURL(zip, r.target); obj = makeImage(addAsset(doc, 'image', d), box); const sr = deep(c, 'srcRect'); if (sr) obj.crop = { l: +(sr.getAttribute('l') || 0) / 1e5, t: +(sr.getAttribute('t') || 0) / 1e5, r: +(sr.getAttribute('r') || 0) / 1e5, b: +(sr.getAttribute('b') || 0) / 1e5 }; const pg = deep(first(c, 'spPr'), 'prstGeom'); if (pg && PRST[pg.getAttribute('prst')] && pg.getAttribute('prst') !== 'rect') obj.mask = PRST[pg.getAttribute('prst')]; obj.alt = nv?.getAttribute('descr') || ''; } }
        } else if (ln === 'graphicFrame') {
          const tbl = deep(c, 'tbl');
          if (tbl) {
            const rows = deepAll(tbl, 'tr'), grid = deepAll(tbl, 'gridCol').map(g => +g.getAttribute('w'));
            const cells = rows.map(tr => kids(tr, 'tc').map(tc => ({ text: deepAll(tc, 'p').map(p => deepAll(p, 't').map(t2 => t2.textContent).join('')).join('\n'), fill: (() => { const f2 = fillOf(first(tc, 'tcPr'), themeRaw); return typeof f2 === 'string' && f2 !== 'none' ? f2 : null; })() })));
            obj = makeTable(cells.length, cells[0]?.length || 1, box); obj.cells = cells; const tot = grid.reduce((a, b) => a + b, 0) || 1; obj.colW = grid.map(g => g / tot);
            const sz2 = deep(tbl, 'rPr')?.getAttribute('sz'); if (sz2) obj.size = Math.round(ptPx(+sz2 / 100));
            obj.header = deep(tbl, 'tblPr')?.getAttribute('firstRow') === '1';
            rows.forEach((tr, r) => kids(tr, 'tc').forEach((tc, ci) => { const gs = +(tc.getAttribute('gridSpan') || 1), rs = +(tc.getAttribute('rowSpan') || 1); if (gs > 1 || rs > 1) obj.merges.push({ r, c: ci, rs, cs: gs }); }));
          } else if (deep(c, 'chart')) { const cr = rels[deep(c, 'chart').getAttribute('r:id')]; obj = cr ? await importChart(zip, cr.target, box) : null; if (!obj) note('Charts'); }
          else { note(deep(c, 'relIds') ? 'SmartArt diagrams' : 'Embedded objects (OLE)'); }
        } else {
          const spPr = first(c, 'spPr'); const pg = deep(spPr, 'prstGeom'); const prst = pg?.getAttribute('prst') || 'rect';
          if (deep(spPr, 'custGeom')) note('Custom freeform shapes (drawn as rectangles)');
          const fill = fillOf(spPr, themeRaw); const lnE = first(spPr, 'ln');
          const stroke = lnE ? (first(lnE, 'noFill') ? 'none' : colorOf(first(lnE, 'solidFill'), themeRaw) || 'none') : 'none';
          const txBody = first(c, 'txBody');
          const isText = (!fill || fill === 'none') && stroke === 'none' && txBody && ln === 'sp';
          obj = isText ? makeText(box) : makeShape(PRST[prst] || 'rect', { ...box, fill: fill ?? (ph ? 'none' : '@accent'), stroke, strokeW: lnE ? Math.max(1, +(lnE.getAttribute('w') || 12700) * k) : 0, text: '' });
          if (!PRST[prst]) note('Shape type "' + prst + '" (approximated)');
          if (ln === 'cxnSp') { obj.shape = deep(lnE, 'tailEnd') && deep(lnE, 'tailEnd').getAttribute('type') !== 'none' ? 'arrowLine' : 'line'; obj.stroke = stroke !== 'none' ? stroke : '@text'; if (obj.h < 4) { obj.y -= 8; obj.h = 16; } }
          if (txBody) {
            const paras = kids(txBody, 'p'); const lines = [];
            let firstRun = null, algn = null, bullets = 'none';
            for (const p of paras) { const pPr = first(p, 'pPr'); if (!algn && pPr?.getAttribute('algn')) algn = pPr.getAttribute('algn'); if (pPr && (first(pPr, 'buChar'))) bullets = 'bullet'; if (pPr && first(pPr, 'buAutoNum')) bullets = 'number'; const rs = [...p.children].filter(q => q.localName === 'r' || q.localName === 'fld'); if (!firstRun && rs.length) firstRun = first(rs[0], 'rPr'); lines.push(rs.map(r => first(r, 't')?.textContent || '').join('') + (kids(p, 'br').length ? '' : '')); }
            obj.text = lines.join('\n');
            const rPr = firstRun || deep(txBody, 'defRPr') || deep(txBody, 'endParaRPr');
            const szA = rPr?.getAttribute('sz'); obj.size = szA ? Math.round(ptPx(+szA / 100)) : (phType && phType.includes('itle') ? Math.round(ptPx(40)) : Math.round(ptPx(18)));
            if (rPr) { obj.bold = rPr.getAttribute('b') === '1'; obj.italic = rPr.getAttribute('i') === '1'; obj.underline = !!rPr.getAttribute('u') && rPr.getAttribute('u') !== 'none'; obj.strike = !!rPr.getAttribute('strike') && rPr.getAttribute('strike') !== 'noStrike'; const cc = colorOf(first(rPr, 'solidFill'), themeRaw); if (cc) obj.color = cc; const lat = first(rPr, 'latin'); if (lat) { const tf = lat.getAttribute('typeface'); obj.font = tf === '+mj-lt' ? '@head' : tf === '+mn-lt' ? '@body' : tf + ', Segoe UI, Arial'; } }
            else if (!isText) obj.color = '#ffffff';
            if (phType && phType.includes('itle')) { obj.font = obj.font === '@body' ? '@head' : obj.font; obj.ph = 'title'; if (!rPr || !rPr.getAttribute('b')) obj.bold = true; }
            else if (phType) obj.ph = phType === 'subTitle' ? 'subtitle' : 'body';
            obj.align = { l: 'left', ctr: 'center', r: 'right', just: 'justify' }[algn] || (isText ? 'start' : 'center');
            if (phType === 'ctrTitle' || phType === 'subTitle') obj.align = algn ? obj.align : 'center';
            obj.bullets = phType === 'body' && bullets === 'none' && paras.length > 1 && !deep(txBody, 'buNone') ? 'bullet' : bullets;
            const bp = first(txBody, 'bodyPr'); const anc = bp?.getAttribute('anchor'); obj.valign = anc === 'ctr' ? 'middle' : anc === 'b' ? 'bottom' : (isText ? 'top' : 'middle');
            if (bp?.getAttribute('vert') && bp.getAttribute('vert') !== 'horz') obj.vertical = true;
            if (deep(txBody, 'rtl') || deepAll(txBody, 'pPr').some(q => q.getAttribute('rtl') === '1')) obj.dir = 'rtl';
            obj.autofit = !!deep(bp, 'normAutofit') || true;
          }
          if (deep(spPr, 'outerShdw')) obj.shadow = { color: 'rgba(0,0,0,.35)', blur: 14, x: 4, y: 6 };
        }
        if (obj) { obj.rot = box.rot || 0; obj.flipH = box.flipH; obj.flipV = box.flipV; obj.name = name; if (gx.group) obj.group = gx.group; const hl = deep(nv, 'hlinkClick'); if (hl) { const hr = rels[hl.getAttribute('r:id')]; if (hr && hr.external) obj.link = { type: 'url', url: hr.target.replace(/^.*?(https?:)/, '$1') }; } slide.objects.push(obj); }
      }
    };
    if (tree) await walk(tree, { ox: 0, oy: 0, sx: 1, sy: 1, group: null });
    // notes
    const nr = Object.values(rels).find(r => r.type.endsWith('/notesSlide'));
    if (nr && zip.file(nr.target)) { const nx = parseXml(await zip.file(nr.target).async('string')); const body = deepAll(nx, 'sp').find(sp => deep(sp, 'ph')?.getAttribute('type') === 'body'); if (body) slide.notes = deepAll(body, 'p').map(p => deepAll(p, 't').map(t2 => t2.textContent).join('')).join('\n').trim(); }
    // transition
    const tr = deep(x, 'transition');
    if (tr) { const kind = [...tr.children].find(q => q.localName !== 'sndAc')?.localName; const inv = Object.entries(PPTX_MAP).find(([, v]) => v === kind); const morph = deep(x, 'morph'); slide.transition.type = morph ? 'morph' : inv ? inv[0] : kind ? 'fade' : 'none'; if (kind && !inv && !morph) note('Transition "' + kind + '" (replaced with Fade)'); const dur = tr.getAttribute('p14:dur') || tr.getAttributeNS('http://schemas.microsoft.com/office/powerpoint/2010/main', 'dur'); slide.transition.duration = dur ? +dur / 1000 : (tr.getAttribute('spd') === 'slow' ? 1 : tr.getAttribute('spd') === 'fast' ? .5 : .75); const adv = tr.getAttribute('advTm'); if (adv) slide.transition.after = +adv / 1000; if (tr.getAttribute('advClick') === '0') slide.transition.onClick = false; }
    if (deep(x, 'timing') && deepAll(x, 'par').length > 1) note('Object animations (not imported)');
    if (deep(x, 'show') || first(x.documentElement, 'show')) { }
    if (x.documentElement.getAttribute('show') === '0') slide.hidden = true;
    doc.slides.push(slide);
  }
  if (!doc.slides.length) doc.slides.push(makeSlide(doc, 'title'));
  if (report) for (const [k2, v] of Object.entries(unsupported)) report.push(`${k2}: ${v}`);
  return doc;
}
async function importChart(zip, path, box) {
  try {
    const x = parseXml(await zip.file(path).async('string'));
    const plot = deep(x, 'plotArea'); const typeEl = [...plot.children].find(c => /Chart$/.test(c.localName)); if (!typeEl) return null;
    const map = { barChart: deep(typeEl, 'barDir')?.getAttribute('val') === 'bar' ? 'bar' : 'column', lineChart: 'line', pieChart: 'pie', doughnutChart: 'doughnut', areaChart: 'area', scatterChart: 'scatter', radarChart: 'radar' };
    const ct = map[typeEl.localName]; if (!ct) return null;
    const sers = deepAll(typeEl, 'ser'); const series = []; let labels = [];
    for (const s of sers) {
      const name = deep(deep(s, 'tx'), 'v')?.textContent || 'Series';
      const cat = deep(s, 'cat') || deep(s, 'xVal'); if (cat && !labels.length) labels = deepAll(cat, 'pt').map(p => deep(p, 'v')?.textContent || '');
      const val = deep(s, 'val') || deep(s, 'yVal'); const values = deepAll(val, 'pt').map(p => +(deep(p, 'v')?.textContent || 0));
      series.push({ name, values });
    }
    const title = deepAll(deep(x, 'title'), 't').map(q => q.textContent).join('');
    return makeChart(ct, { ...box, title, data: { labels, series } });
  } catch (e) { return null; }
}

// ---------------- PPTX export ----------------
const SHAPE_PPTX = { rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', rtTriangle: 'rtTriangle', diamond: 'diamond', pentagon: 'pentagon', hexagon: 'hexagon', octagon: 'octagon', star5: 'star5', star8: 'star8', plus: 'plus', arrowR: 'rightArrow', arrowL: 'leftArrow', arrowU: 'upArrow', arrowD: 'downArrow', chevron: 'chevron', parallelogram: 'parallelogram', trapezoid: 'trapezoid', heart: 'heart', callout: 'wedgeRectCallout', wave: 'wave', cloud: 'cloud', moon: 'moon', line: 'line', arrowLine: 'line' };
export async function exportPPTX(doc, report) {
  const PptxGenJS = window.PptxGenJS; const pptx = new PptxGenJS();
  const IN = 96, th = doc.theme, R = (c) => { const v = resolveColor(c, th); if (!v || v === 'none') return null; const [r, g, b, a] = parseColor(v); return { color: toHex([r, g, b, 1]).slice(1).toUpperCase(), transparency: Math.round((1 - a) * 100) }; };
  pptx.defineLayout({ name: 'LP', width: doc.size.w / IN, height: doc.size.h / IN }); pptx.layout = 'LP'; pptx.title = doc.title; pptx.company = 'Lasteast Present';
  if (doc.lang === 'he' || doc.lang === 'ar') pptx.rtlMode = true;
  const fontName = (f) => resolveFont(f, th).split(',')[0].replace(/["']/g, '').trim();
  const pos = (o) => ({ x: o.x / IN, y: o.y / IN, w: Math.max(o.w, 1) / IN, h: Math.max(o.h, 1) / IN, rotate: o.rot || 0, flipH: !!o.flipH, flipV: !!o.flipV });
  const issues = new Set();
  for (const [si, s] of doc.slides.entries()) {
    const sl = pptx.addSlide(); if (s.hidden) sl.hidden = true;
    const bg = s.bg || doc.master.bg;
    if (bg?.type === 'image') sl.background = { data: assetSrc(doc, bg.asset) };
    else if (bg?.type === 'solid') sl.background = { color: R(bg.color)?.color };
    else if (bg?.type === 'linear' || bg?.type === 'radial') { sl.background = { color: R(bg.c1)?.color }; issues.add('Gradient backgrounds exported as solid colors'); }
    else { const c = renderToCanvas(doc, { ...s, objects: [] }, 1280, { noMaster: true }); sl.background = { data: c.toDataURL('image/png') }; }
    for (const o of s.objects) {
      const P = pos(o); if (o.name) P.objectName = o.name;
      if (o.type === 'text' || o.type === 'shape') {
        const textOpts = { fontFace: fontName(o.font), fontSize: Math.max(1, o.size * .75), color: R(o.color || '@text')?.color, bold: o.bold, italic: o.italic, underline: o.underline ? { style: 'sng' } : undefined, strike: o.strike ? 'sngStrike' : undefined, align: o.align === 'start' ? (o.dir === 'rtl' ? 'right' : 'left') : o.align, valign: o.valign === 'middle' ? 'middle' : o.valign, lineSpacingMultiple: o.lineHeight || 1.2, rtlMode: o.dir === 'rtl', charSpacing: o.letterSpacing ? o.letterSpacing * .75 : undefined, fit: o.autofit ? 'shrink' : 'none', margin: (o.pad ?? 10) * .75, isTextBox: o.type === 'text' };
        if (o.link?.type === 'url') textOpts.hyperlink = { url: o.link.url };
        const runs = (o.text || '').split('\n').map((line, i, arr) => ({ text: line, options: { breakLine: i < arr.length - 1, bullet: o.bullets === 'bullet' ? true : o.bullets === 'number' ? { type: 'number' } : false } }));
        const shapeOpts = {};
        if (o.type === 'shape') { const f = typeof o.fill === 'string' ? R(o.fill) : o.fill && o.fill.c1 ? R(o.fill.c1) : null; if (o.fill && typeof o.fill === 'object') issues.add('Gradient shape fills exported as solid colors'); if (f) shapeOpts.fill = { color: f.color, transparency: Math.max(f.transparency, Math.round((1 - (o.opacity ?? 1)) * 100)) }; const ln = R(o.stroke); if (ln && o.strokeW) shapeOpts.line = { color: ln.color, width: o.strokeW * .75, dashType: o.dash === 'dash' ? 'dash' : o.dash === 'dot' ? 'sysDot' : 'solid', endArrowType: o.shape === 'arrowLine' ? 'triangle' : undefined }; if (o.shape === 'line' || o.shape === 'arrowLine') shapeOpts.line = { color: (R(o.stroke !== 'none' ? o.stroke : '@text') || { color: '000000' }).color, width: (o.strokeW || 3) * .75, endArrowType: o.shape === 'arrowLine' ? 'triangle' : undefined }; if (o.shape === 'roundRect') shapeOpts.rectRadius = Math.min(.5, o.radius / Math.min(o.w, o.h)); if (o.shadow) shapeOpts.shadow = { type: 'outer', blur: (o.shadow.blur || 14) * .75, offset: 4, angle: 45, color: '000000', opacity: .35 }; if (!SHAPE_PPTX[o.shape]) issues.add('Some shapes approximated'); }
        if (o.type === 'shape' && (o.shape === 'line' || o.shape === 'arrowLine')) { sl.addShape('line', { ...P, y: P.y + P.h / 2, h: 0, ...shapeOpts }); continue; }
        if ((o.text || '').length) sl.addText(runs, { ...P, ...textOpts, ...(o.type === 'shape' ? { shape: SHAPE_PPTX[o.shape] || 'rect', ...shapeOpts } : {}) });
        else if (o.type === 'shape') sl.addShape(SHAPE_PPTX[o.shape] || 'rect', { ...P, ...shapeOpts });
        if (o.textGradient || o.textOutline || o.glow || o.reflection) issues.add('WordArt effects (gradient/outline/glow/reflection) partially preserved');
      } else if (o.type === 'image') {
        const src = assetSrc(doc, o.asset); if (!src) continue;
        const opt = { ...P, data: src, altText: o.alt || undefined };
        if (o.crop && (o.crop.l || o.crop.t || o.crop.r || o.crop.b)) { const c = document.createElement('canvas'); const img = await loadImg(src); const sw = img.naturalWidth * (1 - o.crop.l - o.crop.r), sh = img.naturalHeight * (1 - o.crop.t - o.crop.b); c.width = Math.max(1, sw); c.height = Math.max(1, sh); c.getContext('2d').drawImage(img, img.naturalWidth * o.crop.l, img.naturalHeight * o.crop.t, sw, sh, 0, 0, sw, sh); opt.data = c.toDataURL('image/png'); }
        if (o.mask && o.mask !== 'rect' || o.radius) { opt.rounding = o.mask === 'ellipse'; if (o.mask !== 'ellipse') issues.add('Image shape masks other than circle exported as rectangles'); }
        if (o.filters && Object.keys(o.filters).length) issues.add('Image color adjustments not preserved in PPTX');
        if (o.link?.type === 'url') opt.hyperlink = { url: o.link.url };
        sl.addImage(opt);
      } else if (o.type === 'table') {
        const rows = o.cells.map((row, r) => row.map((cell, c) => { const m = (o.merges || []).find(mm => mm.r === r && mm.c === c); const covered = (o.merges || []).some(mm => r >= mm.r && r < mm.r + mm.rs && c >= mm.c && c < mm.c + mm.cs && !(mm.r === r && mm.c === c)); if (covered) return null; const head = o.header && r === 0; return { text: cell.text, options: { bold: head || cell.bold, color: R(head ? o.headColor : (cell.color || o.color))?.color, fill: { color: R(cell.fill || (head ? o.headFill : (o.band && r % 2 === 0 ? '@surface' : '@bg')))?.color }, fontSize: o.size * .75, fontFace: fontName(o.font), colspan: m?.cs, rowspan: m?.rs, border: { type: 'solid', pt: o.borderW || .5, color: R(o.border)?.color } } }; }).filter(Boolean));
        sl.addTable(rows, { ...P, colW: (o.colW || Array(o.cells[0].length).fill(1 / o.cells[0].length)).map(f => f * o.w / IN) });
      } else if (o.type === 'chart') {
        const T = { column: 'bar', bar: 'bar', line: 'line', area: 'area', pie: 'pie', doughnut: 'doughnut', scatter: 'scatter', radar: 'radar', combo: 'bar', waterfall: 'bar' }[o.chartType];
        if (o.chartType === 'combo' || o.chartType === 'waterfall') issues.add(`${o.chartType} chart exported as a column chart`);
        const data = o.chartType === 'scatter' ? [{ name: 'X', values: o.data.labels.map(Number) }, ...o.data.series] : o.data.series.map(s => ({ name: s.name, labels: o.data.labels, values: s.values.map(Number) }));
        sl.addChart(T, data, { ...P, barDir: o.chartType === 'bar' ? 'bar' : 'col', showLegend: o.showLegend, legendPos: 'b', showTitle: !!o.title, title: o.title, showValue: o.showLabels, chartColors: (o.palette || []).map(c => R(c)?.color || '1F6FEB') });
      } else if (o.type === 'video' || o.type === 'audio') {
        const src = assetSrc(doc, o.asset); const ext = (src.match(/^data:\w+\/([\w+-]+)/) || [])[1] || 'mp4';
        try { sl.addMedia({ ...P, type: o.type, data: src, extn: ext === 'mpeg' ? 'mp3' : ext }); } catch (e) { issues.add('Some media could not be embedded'); }
      }
      if (o.anims && o.anims.length) issues.add('Object animations are kept in .lpres files; PPTX export does not include them');
    }
    // master footer/number/logo
    if (doc.master.footer) sl.addText(doc.master.footer, { x: 0, y: (doc.size.h - doc.size.h * .07) / IN, w: doc.size.w / IN, h: doc.size.h * .05 / IN, align: 'center', fontSize: 10, color: R('@muted')?.color });
    if (doc.master.showNumber) sl.slideNumber = { x: (doc.size.w - 80) / IN, y: (doc.size.h - 40) / IN, fontSize: 10, color: R('@muted')?.color };
    if (doc.master.logo) { const lsrc = assetSrc(doc, doc.master.logo); if (lsrc) { const img = await loadImg(lsrc); const lh = doc.size.h * .08, lw = lh * img.naturalWidth / img.naturalHeight; sl.addImage({ data: lsrc, x: (doc.size.w - lw - 24) / IN, y: (doc.size.h - lh - 24) / IN, w: lw / IN, h: lh / IN }); } }
    if (s.notes) sl.addNotes(s.notes);
    const tt = s.transition?.type; if (tt && tt !== 'none' && !PPTX_MAP[tt] && tt !== 'morph') issues.add(`Transition "${getT(tt).name}" has no PowerPoint equivalent (exported as Fade; kept in .lpres)`);
  }
  let buf = await pptx.write({ outputType: 'arraybuffer' });
  // inject transitions into slide XML
  const zip = await window.JSZip.loadAsync(buf);
  for (const [i, s] of doc.slides.entries()) {
    const path = `ppt/slides/slide${i + 1}.xml`; const f = zip.file(path); if (!f) continue; let xml = await f.async('string');
    const tr = s.transition || {}; const type = tr.type || 'none'; if (type === 'none' && tr.after == null) continue;
    const ms = Math.round((tr.duration || .8) * 1000), spd = ms > 900 ? 'slow' : ms < 500 ? 'fast' : 'med';
    const adv = `${tr.onClick === false ? ' advClick="0"' : ''}${tr.after != null && tr.after !== '' ? ` advTm="${Math.round(tr.after * 1000)}"` : ''}`;
    const dirAttr = (id) => /Left$/.test(id) ? ' dir="l"' : /Right$/.test(id) ? ' dir="r"' : /Up$/.test(id) ? ' dir="u"' : /Down$/.test(id) ? ' dir="d"' : '';
    let el2 = PPTX_MAP[type] ? `<p:${PPTX_MAP[type]}${PPTX_MAP[type] === 'push' || PPTX_MAP[type] === 'wipe' ? dirAttr(type) : ''}${type === 'splitH' ? ' orient="horz"' : type === 'splitV' ? ' orient="vert"' : ''}/>` : (type === 'none' ? '' : '<p:fade/>');
    let block = `<p:transition spd="${spd}"${adv}>${el2}</p:transition>`;
    if (type === 'morph') block = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159"><p:transition spd="slow"${adv}><p159:morph option="byObject"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"${adv}><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`;
    xml = xml.replace(/<p:transition[\s\S]*?<\/p:transition>|<p:transition[^>]*\/>/, '');
    xml = xml.includes('<p:timing') ? xml.replace('<p:timing', block + '<p:timing') : xml.replace('</p:sld>', block + '</p:sld>');
    zip.file(path, xml);
  }
  if (report) report.push(...issues);
  return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

// ---------------- images / PDF / SVG / HTML ----------------
export async function slideImages(doc, { width = 1920, type = 'image/png', quality = .92, includeHidden = false } = {}) {
  await preloadDoc(doc); const out = [];
  for (const [i, s] of doc.slides.entries()) { if (s.hidden && !includeHidden) continue; const c = renderToCanvas(doc, s, width, { present: true, index: i }); out.push({ i, blob: await new Promise(r => c.toBlob(r, type, quality)), canvas: c }); }
  return out;
}
export async function exportImagesZip(doc, type = 'png') {
  const imgs = await slideImages(doc, { type: type === 'jpg' ? 'image/jpeg' : 'image/png' });
  const zip = new window.JSZip(); imgs.forEach(({ i, blob }) => zip.file(`Slide${String(i + 1).padStart(2, '0')}.${type}`, blob));
  return zip.generateAsync({ type: 'blob' });
}
export async function exportPDF(doc, { includeHidden = false, mode = 'slides' } = {}) {
  await preloadDoc(doc); const { jsPDF } = window.jspdf;
  const W = doc.size.w, H = doc.size.h;
  if (mode === 'notes') {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' }); let first2 = true;
    for (const [i, s] of doc.slides.entries()) { if (s.hidden && !includeHidden) continue; if (!first2) pdf.addPage(); first2 = false; const c = renderToCanvas(doc, s, 1400, { present: true, index: i }); const pw = 515, ph = pw * H / W; pdf.addImage(c.toDataURL('image/jpeg', .9), 'JPEG', 40, 40, pw, ph); pdf.setFontSize(12); pdf.text(pdf.splitTextToSize(s.notes || '', 515), 40, 60 + ph); pdf.setFontSize(9); pdf.text(String(i + 1), 555, 820); }
    return pdf.output('blob');
  }
  const pdf = new jsPDF({ orientation: W >= H ? 'landscape' : 'portrait', unit: 'px', format: [W, H], hotfixes: ['px_scaling'], compress: true });
  let firstPage = true;
  for (const [i, s] of doc.slides.entries()) {
    if (s.hidden && !includeHidden) continue; if (!firstPage) pdf.addPage([W, H], W >= H ? 'landscape' : 'portrait'); firstPage = false;
    const c = renderToCanvas(doc, s, W * 2, { present: true, index: i }); pdf.addImage(c.toDataURL('image/jpeg', .92), 'JPEG', 0, 0, W, H);
    for (const o of s.objects) if (o.link) { if (o.link.type === 'url') pdf.link(o.x, o.y, o.w, o.h, { url: o.link.url }); }
  }
  pdf.setProperties({ title: doc.title, creator: 'Lasteast Present Professional 2027' });
  return pdf.output('blob');
}
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export async function exportSVG(doc, index) {
  await preloadDoc(doc);
  const s = doc.slides[index], th = doc.theme, W = doc.size.w, H = doc.size.h; const parts = []; let gid = 0;
  const mctx = document.createElement('canvas').getContext('2d');
  const fill = (f, w, h) => { if (!f || f === 'none') return 'none'; if (typeof f === 'string') return resolveColor(f, th); if (f.type === 'linear' || f.type === 'radial') { const id = 'g' + (++gid); parts.push(f.type === 'linear' ? `<defs><linearGradient id="${id}" gradientTransform="rotate(${(f.angle ?? 90) - 90} .5 .5)"><stop offset="0" stop-color="${resolveColor(f.c1, th)}"/><stop offset="1" stop-color="${resolveColor(f.c2, th)}"/></linearGradient></defs>` : `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${resolveColor(f.c1, th)}"/><stop offset="1" stop-color="${resolveColor(f.c2, th)}"/></radialGradient></defs>`); return `url(#${id})`; } return resolveColor(f.c1 || '#ccc', th); };
  const bgc = renderToCanvas(doc, { ...s, objects: [] }, W, { noMaster: true });
  parts.push(`<image href="${bgc.toDataURL('image/png')}" x="0" y="0" width="${W}" height="${H}"/>`);
  for (const o of s.objects) {
    const tf = `translate(${o.x + o.w / 2} ${o.y + o.h / 2}) rotate(${o.rot || 0}) translate(${-o.w / 2} ${-o.h / 2})`;
    const op = o.opacity ?? 1;
    if (o.type === 'shape' || o.type === 'text') {
      let g = `<g transform="${tf}" opacity="${op}">`;
      if (o.shape === 'line' || o.shape === 'arrowLine') g += `<line x1="0" y1="${o.h / 2}" x2="${o.w}" y2="${o.h / 2}" stroke="${resolveColor(o.stroke !== 'none' ? o.stroke : '@text', th)}" stroke-width="${o.strokeW || 3}" stroke-linecap="round"/>`;
      else if ((o.fill && o.fill !== 'none') || (o.stroke && o.stroke !== 'none')) g += `<polygon points="${shapePoints(o.shape || 'rect', o.w, o.h, o.radius).map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="${fill(o.fill, o.w, o.h)}" stroke="${o.stroke && o.stroke !== 'none' ? resolveColor(o.stroke, th) : 'none'}" stroke-width="${o.strokeW || 0}"/>`;
      if (o.text) {
        const lay = layoutText(mctx, o, th, o.w, o.h, doc.lang === 'ar' || doc.lang === 'he' ? 'rtl' : 'ltr'); const top = textTop(o, lay, o.h);
        const fam = resolveFont(o.font, th);
        for (const L of lay.lines) { const { x, al } = lineX(L, o, lay); const by = top + L.y + lay.size * 1.02; g += `<text x="${x.toFixed(1)}" y="${by.toFixed(1)}" font-family="${esc(fam)}" font-size="${lay.size.toFixed(1)}" font-weight="${o.bold ? 700 : 400}" font-style="${o.italic ? 'italic' : 'normal'}" fill="${resolveColor(o.color || '@text', th)}" text-anchor="${al === 'left' ? 'start' : al === 'right' ? 'end' : 'middle'}" direction="${L.dir}"${o.underline ? ' text-decoration="underline"' : ''}>${L.bullet ? esc(L.bullet) + ' ' : ''}${esc(L.text)}</text>`; }
      }
      parts.push(g + '</g>');
    } else {
      const c = document.createElement('canvas'); c.width = Math.max(1, o.w * 2); c.height = Math.max(1, o.h * 2); const x2 = c.getContext('2d'); x2.scale(2, 2);
      const { drawObject } = await import('./renderer.js'); drawObject(x2, { ...o, x: 0, y: 0, rot: 0 }, doc, { present: true });
      parts.push(`<image transform="${tf}" opacity="${op}" href="${c.toDataURL('image/png')}" width="${o.w}" height="${o.h}"/>`);
    }
  }
  return new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`], { type: 'image/svg+xml' });
}
export async function exportHTML(doc) {
  const imgs = await slideImages(doc, { width: 1920, type: 'image/jpeg', quality: .88 });
  const slides = []; for (const { i, canvas } of imgs) slides.push({ src: canvas.toDataURL('image/jpeg', .88), notes: doc.slides[i].notes || '', tr: doc.slides[i].transition?.type || 'none', dur: doc.slides[i].transition?.duration || .8, after: doc.slides[i].transition?.after ?? null });
  const html = `<!DOCTYPE html><html lang="${doc.lang || 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.title)}</title><meta name="generator" content="Lasteast Present Professional 2027">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:Segoe UI,Arial,sans-serif}#s{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}#s img{position:absolute;max-width:100%;max-height:100%;transition-property:opacity,transform;transition-timing-function:ease-in-out}.bar{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);color:#fff;background:#0008;padding:6px 14px;border-radius:20px;font-size:13px;opacity:.0;transition:opacity .3s}body:hover .bar{opacity:1}.bar button{background:none;border:0;color:#fff;font-size:18px;cursor:pointer}</style></head>
<body><div id="s"></div><div class="bar"><button onclick="go(i-1)">&#8592;</button> <span id="n"></span> <button onclick="go(i+1)">&#8594;</button> <button onclick="document.documentElement.requestFullscreen()">&#x26F6;</button></div>
<script>const S=${JSON.stringify(slides)};let i=-1,cur=null,tm;const s=document.getElementById('s');
function go(k){if(k<0||k>=S.length||k===i)return;const back=k<i;i=k;const im=new Image();im.src=S[k].src;const d=S[k].dur*1000,t=S[k].tr;im.style.transitionDuration=d+'ms';
const sx=/Left|push|slide|cover/i.test(t)?(back?-1:1):0, sy=/Up|Down/i.test(t)?(/Up/.test(t)?1:-1):0;im.style.opacity=0;im.style.transform=t==='none'||/fade|dissolve/i.test(t)?'none':(/zoom|morph|portal|infinity/i.test(t)?'scale(.85)':'translate('+(sx*30)+'%,'+(sy*30)+'%)');
s.appendChild(im);requestAnimationFrame(()=>requestAnimationFrame(()=>{im.style.opacity=1;im.style.transform='none';if(cur){const c=cur;c.style.transitionDuration=d+'ms';c.style.opacity=0;setTimeout(()=>c.remove(),d+50);}cur=im;}));
document.getElementById('n').textContent=(k+1)+' / '+S.length;clearTimeout(tm);if(S[k].after!=null)tm=setTimeout(()=>go(i+1),S[k].after*1000);}
addEventListener('keydown',e=>{if(['ArrowRight',' ','PageDown','Enter'].includes(e.key))go(i+1);if(['ArrowLeft','PageUp','Backspace'].includes(e.key))go(i-1);if(e.key==='Home')go(0);if(e.key==='End')go(S.length-1);});
s.addEventListener('click',()=>go(i+1));go(0);</script></body></html>`;
  return new Blob([html], { type: 'text/html' });
}

// ---------------- GIF encoder (LZW, 6x6x6+grays palette) ----------------
function gifEncode(frames, w, h) {
  const pal = []; for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) pal.push([r * 51, g * 51, b * 51]); for (let i = 0; i < 40; i++) pal.push([i * 6.5 | 0, i * 6.5 | 0, i * 6.5 | 0]); while (pal.length < 256) pal.push([0, 0, 0]);
  const out = []; const B = (b) => out.push(b & 255), W2 = (v) => { B(v); B(v >> 8); };
  'GIF89a'.split('').forEach(c => B(c.charCodeAt(0))); W2(w); W2(h); B(0xF7); B(0); B(0); pal.forEach(([r, g, b]) => { B(r); B(g); B(b); });
  B(0x21); B(0xFF); B(11); 'NETSCAPE2.0'.split('').forEach(c => B(c.charCodeAt(0))); B(3); B(1); W2(0); B(0);
  for (const { data, delay } of frames) {
    B(0x21); B(0xF9); B(4); B(0); W2(Math.round(delay / 10)); B(0); B(0);
    B(0x2C); W2(0); W2(0); W2(w); W2(h); B(0);
    const idx = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); idx[i] = mx - mn < 10 ? 216 + Math.min(39, Math.round(r / 6.5)) : Math.round(r / 51) * 36 + Math.round(g / 51) * 6 + Math.round(b / 51); }
    const minCode = 8; B(minCode); const clear = 256, eoi = 257; let dict = new Map(), next = 258, size = 9, bits = 0, acc = 0; const bytes = [];
    const emit = (code) => { acc |= code << bits; bits += size; while (bits >= 8) { bytes.push(acc & 255); acc >>= 8; bits -= 8; } };
    emit(clear); let cur = idx[0];
    for (let i = 1; i < idx.length; i++) { const k = idx[i], key = cur * 4096 + k; if (dict.has(key)) { cur = dict.get(key); continue; } emit(cur); if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; } else { emit(clear); dict = new Map(); next = 258; size = 9; } cur = k; }
    emit(cur); emit(eoi); if (bits > 0) bytes.push(acc & 255);
    for (let i = 0; i < bytes.length; i += 255) { const chunk = bytes.slice(i, i + 255); B(chunk.length); chunk.forEach(B); } B(0);
  }
  B(0x3B); return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}
export async function exportGIF(doc, { width = 640, perSlide = 2, fps = 12, onProgress } = {}) {
  const { prepareTransition } = await import('./transitions.js'); await preloadDoc(doc);
  const h = Math.round(width * doc.size.h / doc.size.w), c = document.createElement('canvas'); c.width = width; c.height = h; const ctx = c.getContext('2d'); const frames = [];
  const vis = doc.slides.map((s, i) => [s, i]).filter(([s]) => !s.hidden); const sc = width / doc.size.w;
  for (let k = 0; k < vis.length; k++) {
    const [s, i] = vis[k]; const cur = renderToCanvas(doc, s, width, { present: true, index: i });
    if (k > 0 && s.transition?.type && s.transition.type !== 'none') {
      const prev = renderToCanvas(doc, vis[k - 1][0], width, { present: true, index: vis[k - 1][1] });
      const pr = prepareTransition({ doc, from: { slide: vis[k - 1][0], canvas: prev }, to: { slide: s, canvas: cur }, transition: s.transition, perf: true });
      const n = Math.max(4, Math.round((s.transition.duration || .8) * fps));
      for (let f = 1; f < n; f++) { ctx.clearRect(0, 0, width, h); pr.draw(ctx, f / n, sc, 0, 0); frames.push({ data: ctx.getImageData(0, 0, width, h).data, delay: 1000 / fps }); }
    }
    ctx.drawImage(cur, 0, 0); frames.push({ data: ctx.getImageData(0, 0, width, h).data, delay: (s.transition?.after || perSlide) * 1000 });
    onProgress && onProgress((k + 1) / vis.length); await sleep(0);
  }
  return gifEncode(frames, width, h);
}

// Real-time video export using the slideshow engine + MediaRecorder
export async function exportVideo(doc, { height = 1080, perSlide = 3, pref = 'mp4', onProgress, withCamera = false } = {}) {
  const { Player } = await import('./slideshow.js'); const { Recorder } = await import('./recorder.js');
  await preloadDoc(doc);
  const w = Math.round(height * doc.size.w / doc.size.h) & ~1, h = height & ~1;
  const host = el('div', { style: { position: 'fixed', left: '-20000px', top: '0', width: w + 'px', height: h + 'px' } }); document.body.append(host);
  return new Promise((resolve) => {
    let rec;
    const pl = new Player(host, { ...doc, show: { ...doc.show, camera: { ...doc.show.camera, enabled: withCamera && doc.show.camera.enabled } } }, { embedded: true, fixedSize: { w, h }, noMedia: false, onEnd: async () => { const blob = await rec.stop(); host.remove(); resolve({ blob, ext: rec.ext }); } });
    rec = new Recorder(pl.canvas, { fps: 30, pref, bitrate: height >= 2160 ? 3.5e7 : height >= 1440 ? 1.6e7 : 1e7 }); rec.start();
    const total = pl.order.length;
    const tick = () => {
      if (pl.ended) return;
      if (pl.transitionRun || pl.animating()) return setTimeout(tick, 100);
      const after = pl.slide.transition?.after; const wait = (pl.step < pl.tl.steps - 1) ? 600 : (after != null && after !== '' ? after : perSlide) * 1000;
      setTimeout(() => { onProgress && onProgress(pl.pos / total); if (pl.pos >= total - 1 && pl.allDone()) { setTimeout(() => pl.end(), 300); return; } pl.next(); setTimeout(tick, 120); }, wait);
    };
    setTimeout(tick, 400);
  });
}

// ---------------- Import helpers ----------------
export async function importImagesAsSlides(doc, files) {
  const out = [];
  for (const f of files) { const d = await readAsDataURL(f); const img = await loadImg(d); const s = makeSlide(doc, 'blank', []); const sc = Math.min(doc.size.w / img.naturalWidth, doc.size.h / img.naturalHeight); const w = img.naturalWidth * sc, h = img.naturalHeight * sc; s.objects.push(makeImage(addAsset(doc, 'image', d, f.name), { x: (doc.size.w - w) / 2, y: (doc.size.h - h) / 2, w, h, name: f.name })); out.push(s); }
  return out;
}
export async function docxText(file) {
  const zip = await window.JSZip.loadAsync(await readAsArrayBuffer(file)); const x = parseXml(await zip.file('word/document.xml').async('string'));
  return deepAll(x, 'p').map(p => { const st = deep(p, 'pStyle')?.getAttribute('w:val') || ''; const txt = deepAll(p, 't').map(t2 => t2.textContent).join(''); return /^Heading1|^Title/i.test(st) ? '# ' + txt : /^Heading/i.test(st) ? '## ' + txt : txt; }).join('\n');
}
export function outlineToSlides(doc, text) {
  const lines = text.split(/\r?\n/), slides = []; let cur = null;
  const push = () => { if (cur) slides.push(cur); };
  for (const raw of lines) {
    const l = raw.trim(); if (!l) continue;
    if (/^#\s+/.test(l) || (!cur && !/^[-*•]/.test(l))) { push(); cur = { title: l.replace(/^#+\s*/, ''), body: [] }; }
    else if (/^##\s+/.test(l)) { push(); cur = { title: l.replace(/^#+\s*/, ''), body: [] }; }
    else (cur = cur || { title: '', body: [] }).body.push(l.replace(/^[-*•\d.)]+\s*/, ''));
  }
  push();
  return slides.map((s, i) => { const layout = i === 0 && !s.body.length ? 'title' : 'titleContent'; const sl = makeSlide(doc, layout); for (const o of sl.objects) { if (o.ph === 'title') o.text = s.title; if (o.ph === 'body') o.text = s.body.join('\n'); } return sl; });
}
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; } else if (c === '"') q = true; else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
export async function xlsxRows(file) {
  const zip = await window.JSZip.loadAsync(await readAsArrayBuffer(file));
  const ss = zip.file('xl/sharedStrings.xml') ? deepAll(parseXml(await zip.file('xl/sharedStrings.xml').async('string')), 'si').map(si => deepAll(si, 't').map(t2 => t2.textContent).join('')) : [];
  const sheet = parseXml(await zip.file('xl/worksheets/sheet1.xml').async('string')); const rows = [];
  for (const r of deepAll(sheet, 'row')) { const row = []; for (const c of kids(r, 'c')) { const ref = c.getAttribute('r'); const col = ref.replace(/\d+/g, '').split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1; const v = first(c, 'v')?.textContent ?? deep(c, 't')?.textContent ?? ''; row[col] = c.getAttribute('t') === 's' ? ss[+v] : v; } rows.push(Array.from(row, x => x ?? '')); }
  return rows;
}
export function rowsToChartData(rows) { const labels = rows.slice(1).map(r => r[0]); const series = rows[0].slice(1).map((name, j) => ({ name: name || 'Series ' + (j + 1), values: rows.slice(1).map(r => +r[j + 1] || 0) })); return { labels, series }; }
export async function importPDF(doc, file) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ data: await readAsArrayBuffer(file) }).promise; const slides = [];
  for (let p = 1; p <= pdf.numPages; p++) { const page = await pdf.getPage(p); const vp = page.getViewport({ scale: 2 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; const s = makeSlide(doc, 'blank', []); const sc = Math.min(doc.size.w / c.width, doc.size.h / c.height); s.objects.push(makeImage(addAsset(doc, 'image', c.toDataURL('image/jpeg', .9)), { x: (doc.size.w - c.width * sc) / 2, y: (doc.size.h - c.height * sc) / 2, w: c.width * sc, h: c.height * sc, name: 'PDF page ' + p })); const tc = await page.getTextContent(); s.notes = tc.items.map(i => i.str).join(' ').slice(0, 4000); slides.push(s); }
  return slides;
}
export async function pdfText(file) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ data: await readAsArrayBuffer(file) }).promise; let out = '';
  for (let p = 1; p <= Math.min(pdf.numPages, 60); p++) { const page = await pdf.getPage(p); const tc = await page.getTextContent(); out += tc.items.map(i => i.str).join(' ') + '\n\n'; }
  return out;
}
export async function importODP(doc, file, report) {
  const zip = await window.JSZip.loadAsync(await readAsArrayBuffer(file)); const x = parseXml(await zip.file('content.xml').async('string'));
  const pages = deepAll(x, 'page'); const slides = []; const cm = (v) => { const m = String(v || '0').match(/([\d.]+)(cm|in|mm|pt)?/); if (!m) return 0; const n = +m[1]; return (m[2] === 'in' ? n * 96 : m[2] === 'mm' ? n * 96 / 25.4 : m[2] === 'pt' ? n * 96 / 72 : n * 96 / 2.54); };
  const k = doc.size.w / cm('28cm');
  for (const pg of pages) {
    const s = makeSlide(doc, 'blank', []);
    for (const f of kids(pg, 'frame').concat(kids(pg, 'custom-shape'), kids(pg, 'rect'), kids(pg, 'ellipse'))) {
      const box = { x: cm(f.getAttribute('svg:x')) * k, y: cm(f.getAttribute('svg:y')) * k, w: cm(f.getAttribute('svg:width')) * k, h: cm(f.getAttribute('svg:height')) * k };
      const img = deep(f, 'image'); const txt = deepAll(f, 'p').map(p => p.textContent).join('\n');
      if (img && zip.file(img.getAttribute('xlink:href'))) s.objects.push(makeImage(addAsset(doc, 'image', await zipDataURL(zip, img.getAttribute('xlink:href'))), box));
      else if (txt) s.objects.push(makeText({ ...box, text: txt, size: f.getAttribute('presentation:class') === 'title' ? 40 : 24, bold: f.getAttribute('presentation:class') === 'title', font: f.getAttribute('presentation:class') === 'title' ? '@head' : '@body' }));
      else if (f.localName !== 'frame') s.objects.push(makeShape(f.localName === 'ellipse' ? 'ellipse' : 'rect', box));
    }
    slides.push(s);
  }
  report && report.push('ODP import: text, pictures and basic shapes are imported; styles are approximated.');
  return slides;
}

// ---------------- Printing ----------------
export async function printDoc(doc, { mode = 'full', perPage = 6, orientation = 'landscape', margins = 10, background = true, includeHidden = false, frame = false } = {}) {
  await preloadDoc(doc);
  const area = el('div', { id: 'print-area' });
  const styles = el('style', {}, `@page{size:A4 ${orientation};margin:${margins}mm} @media print{body>*:not(#print-area){display:none!important} #print-area{display:block!important}} #print-area{display:none} .pp{page-break-after:always;display:flex;flex-wrap:wrap;gap:6mm;align-content:flex-start;font-family:Segoe UI,Arial} .pp img{border:${frame ? '1px solid #999' : '0'};max-width:100%} .pp .cell{box-sizing:border-box} .pp .notes{white-space:pre-wrap;font-size:11pt;margin-top:6mm} .pp .lines{flex:1;border-bottom:1px solid #ccc;height:7mm} .pp h2{margin:0 0 4mm;font-size:14pt} .pp .ol{font-size:12pt;margin:0 0 4mm}`);
  const slides = doc.slides.map((s, i) => [s, i]).filter(([s]) => includeHidden || !s.hidden);
  const img = (s, i, w = 1600) => renderToCanvas(doc, background ? s : { ...s, bg: { type: 'solid', color: '#ffffff' } }, w, { present: true, index: i, noBg: !background }).toDataURL('image/jpeg', .9);
  if (mode === 'full') for (const [s, i] of slides) area.append(el('div', { class: 'pp', style: 'height:calc(100vh - 2px);align-items:center;justify-content:center' }, el('img', { src: img(s, i), style: 'width:100%' })));
  else if (mode === 'notes') for (const [s, i] of slides) area.append(el('div', { class: 'pp', style: 'flex-direction:column' }, el('img', { src: img(s, i, 1200), style: 'width:100%' }), el('div', { class: 'notes', dir: 'auto' }, s.notes || '')));
  else if (mode === 'outline') { const p = el('div', { class: 'pp', style: 'flex-direction:column' }); for (const [s, i] of slides) { const title = s.objects.find(o => o.ph === 'title')?.text || `Slide ${i + 1}`; p.append(el('h2', { dir: 'auto' }, `${i + 1}. ${title}`)); for (const o of s.objects) if (o.type === 'text' && o.ph !== 'title' && o.text) p.append(el('div', { class: 'ol', dir: 'auto' }, ...o.text.split('\n').map(l => el('div', {}, '• ' + l)))); } area.append(p); }
  else { // handouts
    const cols = perPage <= 2 ? 1 : perPage <= 4 ? 2 : perPage === 9 ? 3 : (orientation === 'portrait' ? 2 : 3);
    for (let k = 0; k < slides.length; k += perPage) { const p = el('div', { class: 'pp' }); for (const [s, i] of slides.slice(k, k + perPage)) { const cell = el('div', { class: 'cell', style: `width:calc(${100 / cols}% - 6mm);display:flex;gap:4mm` }, el('img', { src: img(s, i, 900), style: perPage === 3 ? 'width:55%' : 'width:100%' })); if (perPage === 3) cell.append(el('div', { style: 'flex:1;display:flex;flex-direction:column;gap:2mm' }, ...Array.from({ length: 6 }, () => el('div', { class: 'lines' })))); p.append(cell); } area.append(p); }
  }
  document.head.append(styles); document.body.append(area);
  await sleep(300); window.print(); await sleep(500); area.remove(); styles.remove();
}
