// Lasteast Present — canvas slide renderer (single source of truth for editor, slideshow, export, transitions)
import { resolveColor, resolveFont } from './model.js';
import { textDir, parseColor, rgba, clamp } from './util.js';

// ---------- image cache ----------
const imgCache = new Map();
const listeners = new Set();
export const onAssetLoad = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function getImage(src) {
  if (!src) return null;
  let e = imgCache.get(src);
  if (!e) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    e = { img, ok: false, err: false }; imgCache.set(src, e);
    img.onload = () => { e.ok = true; listeners.forEach(f => f()); };
    img.onerror = () => { e.err = true; listeners.forEach(f => f()); };
    img.src = src;
  }
  return e.ok ? e.img : null;
}
export function preloadDoc(doc) {
  const srcs = Object.values(doc.assets).filter(a => a.type === 'image').map(a => a.data);
  return Promise.all(srcs.map(s => new Promise(r => { const e = imgCache.get(s); if (e && (e.ok || e.err)) return r(); getImage(s); const t = setInterval(() => { const x = imgCache.get(s); if (x.ok || x.err) { clearInterval(t); r(); } }, 30); setTimeout(() => { clearInterval(t); r(); }, 8000); })));
}
export const assetSrc = (doc, id) => (id && doc.assets[id]) ? doc.assets[id].data : null;

// ---------- textures ----------
const texCache = {};
export const TEXTURES = ['linen', 'dots', 'grid', 'stripes', 'noise', 'paper', 'carbon', 'waves'];
function texture(name, color, theme) {
  const key = name + color;
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const col = resolveColor(color || '@muted', theme);
  x.fillStyle = col; x.globalAlpha = .18;
  if (name === 'dots') { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(8 + i * 16, 8 + j * 16, 2.2, 0, 7); x.fill(); } }
  else if (name === 'grid') { x.globalAlpha = .14; for (let i = 0; i <= 64; i += 16) { x.fillRect(i, 0, 1, 64); x.fillRect(0, i, 64, 1); } }
  else if (name === 'stripes') { x.globalAlpha = .1; for (let i = -64; i < 64; i += 12) { x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 64, 0); x.lineTo(i + 70, 0); x.lineTo(i + 6, 64); x.fill(); } }
  else if (name === 'linen') { x.globalAlpha = .07; for (let i = 0; i < 64; i += 2) { x.fillRect(0, i, 64, 1); x.fillRect(i, 0, 1, 64); } }
  else if (name === 'carbon') { x.globalAlpha = .16; for (let i = 0; i < 64; i += 8) for (let j = 0; j < 64; j += 8) if ((i + j) % 16 === 0) x.fillRect(i, j, 8, 8); }
  else if (name === 'waves') { x.globalAlpha = .15; x.strokeStyle = col; for (let j = 8; j < 64; j += 16) { x.beginPath(); for (let i = 0; i <= 64; i++) x.lineTo(i, j + Math.sin(i / 64 * Math.PI * 2) * 4); x.stroke(); } }
  else { const d = x.createImageData(64, 64); const [r, g, b] = parseColor(col); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = r; d.data[i + 1] = g; d.data[i + 2] = b; d.data[i + 3] = Math.random() * (name === 'paper' ? 22 : 40); } x.putImageData(d, 0, 0); }
  return (texCache[key] = c);
}

// ---------- fills ----------
export function makeFill(ctx, fill, theme, w, h, doc) {
  if (!fill || fill === 'none') return null;
  if (typeof fill === 'string') return resolveColor(fill, theme);
  if (fill.type === 'linear') {
    const a = (fill.angle ?? 90) * Math.PI / 180, cx = w / 2, cy = h / 2, r = Math.abs(w * Math.sin(a)) / 2 + Math.abs(h * Math.cos(a)) / 2;
    const g = ctx.createLinearGradient(cx - Math.sin(a) * r, cy + Math.cos(a) * r - h, cx + Math.sin(a) * r, cy - Math.cos(a) * r + h);
    const g2 = ctx.createLinearGradient(cx - Math.cos(a - Math.PI / 2) * r, cy - Math.sin(a - Math.PI / 2) * r, cx + Math.cos(a - Math.PI / 2) * r, cy + Math.sin(a - Math.PI / 2) * r);
    void g; g2.addColorStop(0, resolveColor(fill.c1, theme)); g2.addColorStop(1, resolveColor(fill.c2, theme)); return g2;
  }
  if (fill.type === 'radial') { const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2); g.addColorStop(0, resolveColor(fill.c1, theme)); g.addColorStop(1, resolveColor(fill.c2, theme)); return g; }
  if (fill.type === 'texture') return ctx.createPattern(texture(fill.texture, fill.c1, theme), 'repeat');
  return resolveColor(fill.c1 || '#ccc', theme);
}

// ---------- shapes as polygons ----------
export const SHAPES = ['rect', 'roundRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star5', 'star8', 'plus', 'arrowR', 'arrowL', 'arrowU', 'arrowD', 'chevron', 'parallelogram', 'trapezoid', 'heart', 'callout', 'wave', 'cloud', 'moon', 'line', 'arrowLine'];
function poly(n, w, h, rot = -Math.PI / 2) { return Array.from({ length: n }, (_, i) => [w / 2 + Math.cos(rot + i * 2 * Math.PI / n) * w / 2, h / 2 + Math.sin(rot + i * 2 * Math.PI / n) * h / 2]); }
function star(n, w, h, inner = .45) { return Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? inner : 1, a = -Math.PI / 2 + i * Math.PI / n; return [w / 2 + Math.cos(a) * w / 2 * r, h / 2 + Math.sin(a) * h / 2 * r]; }); }
export function shapePoints(shape, w, h, radius = 16) {
  switch (shape) {
    case 'rect': return [[0, 0], [w, 0], [w, h], [0, h]];
    case 'roundRect': {
      const r = Math.min(radius, w / 2, h / 2), pts = [], seg = 10;
      const corner = (cx, cy, a0) => { for (let i = 0; i <= seg; i++) { const a = a0 + i / seg * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
      corner(w - r, r, -Math.PI / 2); corner(w - r, h - r, 0); corner(r, h - r, Math.PI / 2); corner(r, r, Math.PI); return pts;
    }
    case 'ellipse': return Array.from({ length: 160 }, (_, i) => { const a = -Math.PI / 2 + i / 160 * Math.PI * 2; return [w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2]; });
    case 'triangle': return [[w / 2, 0], [w, h], [0, h]];
    case 'rtTriangle': return [[0, 0], [w, h], [0, h]];
    case 'diamond': return [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
    case 'pentagon': return poly(5, w, h);
    case 'hexagon': return [[w * .25, 0], [w * .75, 0], [w, h / 2], [w * .75, h], [w * .25, h], [0, h / 2]];
    case 'octagon': return poly(8, w, h, -Math.PI / 2 + Math.PI / 8);
    case 'star5': return star(5, w, h, .42);
    case 'star8': return star(8, w, h, .6);
    case 'plus': { const a = w / 3, b = h / 3; return [[a, 0], [2 * a, 0], [2 * a, b], [w, b], [w, 2 * b], [2 * a, 2 * b], [2 * a, h], [a, h], [a, 2 * b], [0, 2 * b], [0, b], [a, b]]; }
    case 'arrowR': return [[0, h * .25], [w * .62, h * .25], [w * .62, 0], [w, h / 2], [w * .62, h], [w * .62, h * .75], [0, h * .75]];
    case 'arrowL': return shapePoints('arrowR', w, h).map(([x, y]) => [w - x, y]);
    case 'arrowU': return [[w * .25, h], [w * .25, h * .38], [0, h * .38], [w / 2, 0], [w, h * .38], [w * .75, h * .38], [w * .75, h]];
    case 'arrowD': return shapePoints('arrowU', w, h).map(([x, y]) => [x, h - y]);
    case 'chevron': return [[0, 0], [w * .7, 0], [w, h / 2], [w * .7, h], [0, h], [w * .3, h / 2]];
    case 'parallelogram': return [[w * .22, 0], [w, 0], [w * .78, h], [0, h]];
    case 'trapezoid': return [[w * .2, 0], [w * .8, 0], [w, h], [0, h]];
    case 'heart': return Array.from({ length: 120 }, (_, i) => { const t = i / 120 * Math.PI * 2; const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); return [w / 2 + x / 34 * w, h * .42 - y / 30 * h]; });
    case 'callout': return [[0, 0], [w, 0], [w, h * .75], [w * .4, h * .75], [w * .18, h], [w * .22, h * .75], [0, h * .75]];
    case 'wave': { const pts = []; for (let i = 0; i <= 60; i++) pts.push([i / 60 * w, h * .3 + Math.sin(i / 60 * Math.PI * 2) * h * .25]); pts.push([w, h], [0, h]); return pts; }
    case 'cloud': return Array.from({ length: 180 }, (_, i) => { const a = i / 180 * Math.PI * 2; const r = 1 + .12 * Math.pow(Math.abs(Math.sin(a * 3.5)), .6); return [w / 2 + Math.cos(a) * w / 2 / 1.12 * r, h / 2 + Math.sin(a) * h / 2 / 1.12 * r]; });
    case 'moon': { const pts = []; for (let i = 0; i <= 60; i++) { const a = -Math.PI / 2 + i / 60 * Math.PI * 2 * .5 + 0; pts.push([w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2]); } for (let i = 60; i >= 0; i--) { const a = -Math.PI / 2 + i / 60 * Math.PI; pts.push([w / 2 + Math.cos(a) * w * .22, h / 2 + Math.sin(a) * h / 2]); } return pts.map(([x, y]) => [w - x, y]); }
    default: return [[0, 0], [w, 0], [w, h], [0, h]];
  }
}
export function resample(pts, n) {
  const segs = [], L = [0]; let tot = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push([a, b, d]); tot += d; L.push(tot); }
  const out = []; let si = 0;
  for (let k = 0; k < n; k++) { const t = k / n * tot; while (si < segs.length - 1 && L[si + 1] < t) si++; const [a, b, d] = segs[si]; const f = d ? (t - L[si]) / d : 0; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
  // rotate so the first point is the one closest to the top-center (consistent starting angle for morphing)
  let best = 0, bd = Infinity; const cx = out.reduce((s, p) => s + p[0], 0) / n;
  out.forEach((p, i) => { const d = Math.abs(p[0] - cx) + p[1] * 2; if (d < bd) { bd = d; best = i; } });
  return out.slice(best).concat(out.slice(0, best));
}
function tracePts(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }

// ---------- text layout ----------
export function fontStr(o, theme, size) { return `${o.italic ? 'italic ' : ''}${o.bold ? '700' : '400'} ${size}px ${resolveFont(o.font, theme)}`; }
export function layoutText(ctx, o, theme, boxW, boxH, docDir = 'ltr') {
  const paras = String(o.text ?? '').split('\n');
  let scale = 1, res;
  for (let iter = 0; iter < 14; iter++) {
    res = doLayout(ctx, o, theme, paras, boxW, (o.size || 24) * scale, docDir);
    if (!o.autofit || res.height <= boxH - 2 * (o.pad ?? 10) || scale < .3) break;
    scale *= .9;
  }
  res.scale = scale; return res;
}
function doLayout(ctx, o, theme, paras, boxW, size, docDir) {
  ctx.save(); ctx.font = fontStr(o, theme, size);
  if ('letterSpacing' in ctx) ctx.letterSpacing = (o.letterSpacing || 0) + 'px';
  const pad = o.pad ?? 10, cols = Math.max(1, o.columns || 1), gap = 24;
  const colW = (boxW - 2 * pad - (cols - 1) * gap) / cols;
  const lh = size * (o.lineHeight || 1.2), lines = []; let y = 0, num = 0;
  paras.forEach((p, pi) => {
    const dir = o.dir === 'auto' || !o.dir ? (textDir(p) || docDir) : o.dir;
    let bullet = '';
    if (o.bullets === 'bullet' && p.trim()) bullet = '•';
    else if (o.bullets === 'number' && p.trim()) bullet = (++num) + '.';
    const ind = bullet ? size * 1.15 : 0, avail = colW - ind;
    const words = p.split(/(\s+)/).filter(s => s.length);
    let cur = '', first = true;
    const push = (txt) => { lines.push({ text: txt.replace(/\s+$/, ''), y, dir, para: pi, bullet: first ? bullet : '', ind, w: ctx.measureText(txt.replace(/\s+$/, '')).width, size }); y += lh; first = false; };
    if (!words.length) { lines.push({ text: '', y, dir, para: pi, bullet: '', ind, w: 0, size }); y += lh; }
    for (const wd of words) {
      const test = cur + wd;
      if (ctx.measureText(test.trimEnd()).width > avail && cur.trim()) { push(cur); cur = wd.trimStart(); }
      else cur = test;
      // hard-break very long words
      while (ctx.measureText(cur).width > avail && cur.length > 1) { let k = cur.length - 1; while (k > 1 && ctx.measureText(cur.slice(0, k)).width > avail) k--; push(cur.slice(0, k)); cur = cur.slice(k); }
    }
    if (words.length) push(cur);
    y += o.paraSpace || 0;
  });
  // words positions (for morph by word)
  for (const L of lines) { L.words = []; let x = 0; for (const part of L.text.split(/(\s+)/)) { const w = ctx.measureText(part).width; if (part.trim()) L.words.push({ t: part, x, w }); x += w; } }
  ctx.restore();
  const height = Math.max(0, y - (o.paraSpace || 0));
  // columns
  if (cols > 1) { const per = Math.ceil(lines.length / cols); lines.forEach((L, i) => { const c = Math.floor(i / per); L.col = c; L.y = (i % per) * lh; }); return { lines, height: Math.min(height, per * lh), lh, colW, cols, gap, size }; }
  lines.forEach(L => L.col = 0);
  return { lines, height, lh, colW, cols, gap, size };
}
export function lineX(L, o, lay, boxW) {
  const pad = o.pad ?? 10, colX = pad + L.col * (lay.colW + lay.gap);
  let al = o.align || 'start'; if (al === 'start' || al === 'justify') al = L.dir === 'rtl' ? 'right' : 'left';
  if (al === 'left') return { x: colX + (L.dir === 'rtl' ? 0 : L.ind), al };
  if (al === 'right') return { x: colX + lay.colW - (L.dir === 'rtl' ? L.ind : 0), al };
  return { x: colX + lay.colW / 2 + (L.dir === 'rtl' ? -L.ind / 2 : L.ind / 2), al: 'center' };
}
// left edge of a laid-out line
export function lineLeft(L, o, lay) { const { x, al } = lineX(L, o, lay); return al === 'left' ? x : al === 'right' ? x - L.w : x - L.w / 2; }
export function textTop(o, lay, boxH) { const pad = o.pad ?? 10; return o.valign === 'middle' ? (boxH - lay.height) / 2 : o.valign === 'bottom' ? boxH - pad - lay.height : pad; }

export function drawTextBlock(ctx, o, theme, w, h, opts = {}) {
  const editor = opts.editor, docDir = opts.docDir || 'ltr';
  let txt = o.text, faint = false;
  if ((!txt || !txt.trim()) && o.placeholder && editor && !opts.hidePlaceholder) { txt = o.placeholder; faint = true; }
  if (!txt) return;
  const oo = faint ? { ...o, text: txt } : o;
  let W = w, H = h;
  if (o.vertical) { ctx.translate(w, 0); ctx.rotate(Math.PI / 2); W = h; H = w; }
  const lay = layoutText(ctx, oo, theme, W, H, docDir);
  const top = textTop(oo, lay, H);
  ctx.font = fontStr(oo, theme, lay.size);
  if ('letterSpacing' in ctx) ctx.letterSpacing = (o.letterSpacing || 0) + 'px';
  ctx.textBaseline = 'alphabetic';
  const color = resolveColor(o.color || '@text', theme);
  let fillStyle = color;
  if (o.textGradient) { const g = ctx.createLinearGradient(0, top, 0, top + lay.height); g.addColorStop(0, resolveColor(o.textGradient.c1, theme)); g.addColorStop(1, resolveColor(o.textGradient.c2, theme)); fillStyle = g; }
  const paraAlpha = opts.paraAlpha;
  for (const L of lay.lines) {
    const pa = paraAlpha ? (paraAlpha[L.para] ?? 1) : 1; if (pa <= 0) continue;
    const { x, al } = lineX(L, oo, lay, W);
    const by = top + L.y + lay.size * 0.92 + (lay.lh - lay.size * 1.2) / 2 + lay.size * .1;
    ctx.save(); ctx.globalAlpha *= pa * (faint ? .45 : 1);
    ctx.direction = L.dir; ctx.textAlign = al;
    if (o.highlight && L.text) { ctx.fillStyle = resolveColor(o.highlight, theme); const lx = lineLeft(L, oo, lay); ctx.fillRect(lx - 4, top + L.y, L.w + 8, lay.lh); }
    if (o.textShadow) { ctx.shadowColor = resolveColor(o.textShadow.color || 'rgba(0,0,0,.45)', theme); ctx.shadowBlur = o.textShadow.blur ?? 8; ctx.shadowOffsetX = o.textShadow.x ?? 3; ctx.shadowOffsetY = o.textShadow.y ?? 3; }
    ctx.fillStyle = fillStyle;
    if (L.bullet) { ctx.save(); ctx.fillStyle = resolveColor(o.bulletColor || o.color || '@accent', theme); ctx.textAlign = L.dir === 'rtl' ? 'right' : 'left'; const bx = L.dir === 'rtl' ? lineLeft(L, oo, lay) + L.w + lay.size * .3 : lineLeft(L, oo, lay) - L.ind; ctx.fillText(L.bullet, L.dir === 'rtl' ? bx + L.ind - lay.size * .3 : bx, by); ctx.restore(); }
    ctx.fillText(L.text, x, by);
    if (o.textOutline && o.textOutline.width) { ctx.shadowColor = 'transparent'; ctx.lineWidth = o.textOutline.width; ctx.strokeStyle = resolveColor(o.textOutline.color, theme); ctx.strokeText(L.text, x, by); }
    if ((o.underline || o.strike) && L.text) {
      const lx = lineLeft(L, oo, lay); ctx.fillStyle = color; const th = Math.max(1, lay.size / 16);
      if (o.underline) ctx.fillRect(lx, by + lay.size * .12, L.w, th);
      if (o.strike) ctx.fillRect(lx, by - lay.size * .3, L.w, th);
    }
    if (o.link && !faint && opts.editor) { /* link hint */ ctx.fillStyle = color; ctx.globalAlpha *= .5; ctx.fillRect(lineLeft(L, oo, lay), by + lay.size * .14, L.w, 1); }
    ctx.restore();
  }
  return lay;
}

// ---------- charts ----------
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
export const CHART_TYPES = ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'radar', 'combo', 'waterfall'];
function drawChart(ctx, o, theme, w, h, prog = 1) {
  const pal = (o.palette || ['@accent', '@accent2', '@accent3', '@muted']).map(c => resolveColor(c, theme));
  const col = (i, s) => resolveColor(s?.color || pal[i % pal.length], theme);
  const txt = resolveColor(o.color || '@text', theme), font = resolveFont(o.font, theme);
  const { labels = [], series = [] } = o.data || {};
  let top = 10, bottom = h - 10, left = 10, right = w - 10;
  ctx.fillStyle = txt; ctx.textBaseline = 'middle';
  if (o.title) { ctx.font = `700 ${Math.max(14, h * .06)}px ${font}`; ctx.textAlign = 'center'; ctx.fillText(o.title, w / 2, top + h * .04); top += h * .1; }
  const pie = o.chartType === 'pie' || o.chartType === 'doughnut';
  if (o.showLegend && series.length) {
    const items = pie ? labels : series.map(s => s.name); ctx.font = `${Math.max(11, h * .04)}px ${font}`; ctx.textAlign = 'left';
    const tw = items.reduce((s, it) => s + ctx.measureText(it).width + 34, 0); let x = (w - tw) / 2; const y = bottom - h * .03;
    items.forEach((it, i) => { ctx.fillStyle = col(i, pie ? null : series[i]); ctx.fillRect(x, y - 6, 12, 12); ctx.fillStyle = txt; ctx.fillText(it, x + 18, y); x += ctx.measureText(it).width + 34; });
    bottom -= h * .09;
  }
  ctx.font = `${Math.max(10, h * .035)}px ${font}`;
  if (pie) {
    const vals = series[0]?.values || [], tot = vals.reduce((a, b) => a + Math.max(0, +b || 0), 0) || 1;
    const cx = w / 2, cy = (top + bottom) / 2, r = Math.min(right - left, bottom - top) / 2 * .95; let a = -Math.PI / 2;
    vals.forEach((v, i) => { const da = Math.max(0, +v || 0) / tot * Math.PI * 2 * prog; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a, a + da); ctx.closePath(); ctx.fillStyle = col(i); ctx.fill(); ctx.strokeStyle = resolveColor('@bg', theme); ctx.lineWidth = 2; ctx.stroke();
      if (o.showLabels || true) { const m = a + da / 2, lr = o.chartType === 'doughnut' ? r * .78 : r * .62; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; if (da > .25) ctx.fillText(Math.round(v / tot * 100) + '%', cx + Math.cos(m) * lr, cy + Math.sin(m) * lr); }
      a += da; });
    if (o.chartType === 'doughnut') { ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(cx, cy, r * .55, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    return;
  }
  if (o.chartType === 'radar') {
    const cx = w / 2, cy = (top + bottom) / 2, r = Math.min(right - left, bottom - top) / 2 * .8, n = labels.length || 1;
    const mx = niceMax(Math.max(1, ...series.flatMap(s => s.values.map(v => +v || 0))));
    ctx.strokeStyle = resolveColor('@muted', theme); ctx.globalAlpha = .35;
    for (let k = 1; k <= 4; k++) { ctx.beginPath(); for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; ctx.lineTo(cx + Math.cos(a) * r * k / 4, cy + Math.sin(a) * r * k / 4); } ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = txt; ctx.textAlign = 'center';
    labels.forEach((l, i) => { const a = -Math.PI / 2 + i / n * Math.PI * 2; ctx.fillText(l, cx + Math.cos(a) * (r + 18), cy + Math.sin(a) * (r + 14)); });
    series.forEach((s, si) => { ctx.beginPath(); s.values.forEach((v, i) => { const a = -Math.PI / 2 + i / n * Math.PI * 2, rr = (+v || 0) / mx * r * prog; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }); ctx.closePath(); ctx.fillStyle = col(si, s); ctx.globalAlpha = .3; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = col(si, s); ctx.lineWidth = 2.5; ctx.stroke(); });
    return;
  }
  // axes
  const horiz = o.chartType === 'bar';
  let vals = series.flatMap(s => s.values.map(v => +v || 0));
  if (o.chartType === 'waterfall') { let acc = 0; vals = (series[0]?.values || []).map(v => (acc += +v || 0)); vals.push(0); }
  const mn = Math.min(0, ...vals), mx = niceMax(Math.max(1, ...vals)) , rng = mx - mn || 1;
  ctx.textAlign = 'right'; const axW = ctx.measureText(String(mx)).width + 12; left += horiz ? Math.max(...labels.map(l => ctx.measureText(l).width), 20) + 12 : axW; bottom -= 22;
  const X = (i, n) => left + (i + .5) / n * (right - left), Y = v => bottom - (v - mn) / rng * (bottom - top);
  ctx.strokeStyle = resolveColor('@muted', theme); ctx.lineWidth = 1; ctx.fillStyle = txt;
  for (let k = 0; k <= 4; k++) {
    const v = mn + rng * k / 4; ctx.globalAlpha = .25; ctx.beginPath();
    if (horiz) { const x = left + k / 4 * (right - left); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.fillText(+v.toFixed(2), x, bottom + 12); }
    else { const y = Y(v); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); ctx.globalAlpha = 1; ctx.textAlign = 'right'; ctx.fillText(+v.toFixed(2), left - 6, y); }
  }
  ctx.globalAlpha = 1;
  const n = labels.length || 1;
  labels.forEach((l, i) => { if (horiz) { ctx.textAlign = 'right'; ctx.fillText(l, left - 6, top + (i + .5) / n * (bottom - top)); } else { ctx.textAlign = 'center'; ctx.fillText(l, X(i, n), bottom + 12); } });
  if (o.chartType === 'waterfall') {
    let acc = 0; const s = series[0] || { values: [] }; const bw = (right - left) / n * .6;
    s.values.forEach((v, i) => { v = +v || 0; const y0 = Y(acc), y1 = Y(acc + v * prog); ctx.fillStyle = v >= 0 ? col(0) : col(1); ctx.fillRect(X(i, n) - bw / 2, Math.min(y0, y1), bw, Math.abs(y1 - y0)); acc += v; });
    return;
  }
  const bars = o.chartType === 'column' || horiz ? series : o.chartType === 'combo' ? series.slice(0, 1) : [];
  const nb = bars.length || 1, groupW = (horiz ? (bottom - top) : (right - left)) / n * .72, bw = groupW / nb;
  bars.forEach((s, si) => s.values.forEach((v, i) => {
    v = (+v || 0) * prog; ctx.fillStyle = col(si, s);
    if (horiz) { const cy = top + (i + .5) / n * (bottom - top) - groupW / 2 + si * bw; const x0 = left + (0 - mn) / rng * (right - left), x1 = left + (v - mn) / rng * (right - left); ctx.fillRect(Math.min(x0, x1), cy + 2, Math.abs(x1 - x0), bw - 4); if (o.showLabels) { ctx.fillStyle = txt; ctx.textAlign = 'left'; ctx.fillText(+v.toFixed(1), x1 + 4, cy + bw / 2); } }
    else { const cx = X(i, n) - groupW / 2 + si * bw; const y0 = Y(0), y1 = Y(v); ctx.fillRect(cx + 2, Math.min(y0, y1), bw - 4, Math.abs(y1 - y0)); if (o.showLabels) { ctx.fillStyle = txt; ctx.textAlign = 'center'; ctx.fillText(+v.toFixed(1), cx + bw / 2, y1 - 10); } }
  }));
  const lines = o.chartType === 'line' || o.chartType === 'area' || o.chartType === 'scatter' ? series : o.chartType === 'combo' ? series.slice(1) : [];
  lines.forEach((s, si0) => {
    const si = o.chartType === 'combo' ? si0 + 1 : si0, c = col(si, s);
    const pts = s.values.map((v, i) => [X(i, n), Y((+v || 0) * prog)]);
    if (o.chartType === 'area') { ctx.beginPath(); ctx.moveTo(pts[0]?.[0], Y(0)); pts.forEach(p => ctx.lineTo(...p)); ctx.lineTo(pts.at(-1)?.[0], Y(0)); ctx.closePath(); ctx.fillStyle = c; ctx.globalAlpha = .35; ctx.fill(); ctx.globalAlpha = 1; }
    if (o.chartType !== 'scatter') { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.stroke(); }
    pts.forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], o.chartType === 'scatter' ? 6 : 4, 0, 7); ctx.fillStyle = c; ctx.fill(); });
    if (o.showLabels) { ctx.fillStyle = txt; ctx.textAlign = 'center'; pts.forEach((p, i) => ctx.fillText(s.values[i], p[0], p[1] - 14)); }
  });
}

// ---------- tables ----------
export function tableGeom(o) {
  const R = o.cells.length, C = o.cells[0]?.length || 1;
  const cw = o.colW && o.colW.length === C ? o.colW : Array(C).fill(1 / C);
  const rh = o.rowH && o.rowH.length === R ? o.rowH : Array(R).fill(1 / R);
  const xs = [0]; cw.forEach(f => xs.push(xs.at(-1) + f * o.w)); const ys = [0]; rh.forEach(f => ys.push(ys.at(-1) + f * o.h));
  return { R, C, xs, ys };
}
export function mergeAt(o, r, c) { return (o.merges || []).find(m => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs); }
function drawTable(ctx, o, theme, opts) {
  const { R, C, xs, ys } = tableGeom(o);
  const border = resolveColor(o.border || '@muted', theme);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const m = mergeAt(o, r, c); if (m && (m.r !== r || m.c !== c)) continue;
    const rs = m ? m.rs : 1, cs = m ? m.cs : 1;
    const x = xs[c], y = ys[r], w = xs[c + cs] - x, h = ys[r + rs] - y, cell = o.cells[r][c];
    const head = o.header && r === 0;
    ctx.fillStyle = resolveColor(cell.fill || (head ? o.headFill : (o.band && r % 2 === 0 ? '@surface' : '@bg')), theme);
    ctx.fillRect(x, y, w, h);
    if (o.borderW) { ctx.strokeStyle = border; ctx.lineWidth = o.borderW; ctx.globalAlpha = .6; ctx.strokeRect(x, y, w, h); ctx.globalAlpha = 1; }
    if (cell.text) { ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); drawTextBlock(ctx, { text: cell.text, font: o.font, size: o.size, color: head ? o.headColor : (cell.color || o.color), bold: head || cell.bold, align: cell.align || 'start', valign: 'middle', lineHeight: 1.15, pad: 8, autofit: true, dir: 'auto' }, theme, w, h, opts); ctx.restore(); }
  }
}

// ---------- icons for media ----------
function mediaIcon(ctx, kind, w, h, theme) {
  ctx.fillStyle = kind === 'audio' ? resolveColor('@accent', theme) : '#111'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff'; const s = Math.min(w, h) * .32;
  ctx.save(); ctx.translate(w / 2, h / 2);
  if (kind === 'audio') { ctx.beginPath(); ctx.moveTo(-s * .8, -s * .35); ctx.lineTo(-s * .3, -s * .35); ctx.lineTo(s * .2, -s * .8); ctx.lineTo(s * .2, s * .8); ctx.lineTo(-s * .3, s * .35); ctx.lineTo(-s * .8, s * .35); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = s * .12; ctx.beginPath(); ctx.arc(s * .3, 0, s * .5, -.8, .8); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.globalAlpha = .25; ctx.fill(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(-s * .35, -s * .5); ctx.lineTo(s * .55, 0); ctx.lineTo(-s * .35, s * .5); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

// ---------- main object draw ----------
export const objFilterCss = (f = {}) => {
  const p = [];
  if (f.brightness != null && f.brightness !== 100) p.push(`brightness(${f.brightness}%)`);
  if (f.contrast != null && f.contrast !== 100) p.push(`contrast(${f.contrast}%)`);
  if (f.saturate != null && f.saturate !== 100) p.push(`saturate(${f.saturate}%)`);
  if (f.grayscale) p.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia) p.push(`sepia(${f.sepia}%)`);
  if (f.hue) p.push(`hue-rotate(${f.hue}deg)`);
  if (f.blur) p.push(`blur(${f.blur}px)`);
  if (f.invert) p.push(`invert(${f.invert}%)`);
  return p.join(' ') || 'none';
};

export function drawObject(ctx, o, doc, opts = {}, ov = null) {
  const theme = doc.theme;
  let { x, y, w, h, rot, opacity } = o;
  if (ov) { x += ov.dx || 0; y += ov.dy || 0; if (ov.x != null) x = ov.x; if (ov.y != null) y = ov.y; if (ov.w != null) w = ov.w; if (ov.h != null) h = ov.h; rot = (ov.rot != null ? ov.rot : rot) + (ov.drot || 0); opacity = (ov.opacity != null ? ov.opacity : opacity) * (ov.alpha ?? 1); }
  if (opacity <= 0.001 || w < .5 && h < .5 && o.shape !== 'line') return;
  ctx.save();
  ctx.globalAlpha *= clamp(opacity, 0, 1);
  ctx.translate(x + w / 2, y + h / 2);
  if (rot) ctx.rotate(rot * Math.PI / 180);
  if (ov && (ov.sx != null || ov.sy != null || ov.scale != null)) ctx.scale((ov.sx ?? 1) * (ov.scale ?? 1), (ov.sy ?? 1) * (ov.scale ?? 1));
  if (o.flipH || o.flipV) ctx.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
  ctx.translate(-w / 2, -h / 2);
  if (ov && ov.clip) { const c = ov.clip; ctx.beginPath(); if (c.circle != null) ctx.arc(w / 2, h / 2, Math.hypot(w, h) / 2 * c.circle, 0, 7); else ctx.rect(c.x * w, c.y * h, c.w * w, c.h * h); ctx.clip(); }
  if (ov && ov.filter) ctx.filter = ov.filter;
  const shadow = o.shadow, glow = o.glow;
  const applyFx = () => {
    if (glow && glow.size) { ctx.shadowColor = resolveColor(glow.color || '@accent', theme); ctx.shadowBlur = glow.size; ctx.shadowOffsetX = ctx.shadowOffsetY = 0; }
    else if (shadow) { ctx.shadowColor = resolveColor(shadow.color || 'rgba(0,0,0,.35)', theme); ctx.shadowBlur = shadow.blur ?? 18; ctx.shadowOffsetX = shadow.x ?? 6; ctx.shadowOffsetY = shadow.y ?? 8; }
  };
  const clearFx = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; };

  if (o.type === 'shape' || o.type === 'text') {
    const pts = ov && ov.pts ? ov.pts : null;
    if (o.shape === 'line' || o.shape === 'arrowLine') {
      ctx.strokeStyle = resolveColor(o.stroke !== 'none' ? o.stroke : (typeof o.fill === 'string' ? o.fill : '@text'), theme); ctx.lineWidth = o.strokeW || 3; ctx.lineCap = 'round';
      if (o.dash === 'dash') ctx.setLineDash([o.strokeW * 3, o.strokeW * 2]); else if (o.dash === 'dot') ctx.setLineDash([1, o.strokeW * 2]);
      applyFx(); ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w - (o.shape === 'arrowLine' ? ctx.lineWidth * 2 : 0), h / 2); ctx.stroke(); ctx.setLineDash([]);
      if (o.shape === 'arrowLine') { const s = Math.max(10, ctx.lineWidth * 3.5); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(w, h / 2); ctx.lineTo(w - s, h / 2 - s * .6); ctx.lineTo(w - s, h / 2 + s * .6); ctx.closePath(); ctx.fill(); }
      clearFx();
    } else {
      const fillStyle = ov && ov.fill ? ov.fill : makeFill(ctx, o.fill, theme, w, h, doc);
      const hasStroke = o.stroke && o.stroke !== 'none' && o.strokeW > 0;
      if (fillStyle || hasStroke) {
        tracePts(ctx, pts || shapePoints(o.shape || 'rect', w, h, o.radius));
        if (fillStyle) { applyFx(); ctx.fillStyle = fillStyle; ctx.fill(); clearFx(); }
        if (hasStroke) { if (!fillStyle) applyFx(); ctx.strokeStyle = ov && ov.stroke ? ov.stroke : resolveColor(o.stroke, theme); ctx.lineWidth = o.strokeW; if (o.dash === 'dash') ctx.setLineDash([o.strokeW * 3, o.strokeW * 2]); else if (o.dash === 'dot') ctx.setLineDash([1, o.strokeW * 2]); ctx.lineCap = 'round'; ctx.stroke(); ctx.setLineDash([]); clearFx(); }
      } else if (opts.editor && o.type === 'text' && !(o.text || '').trim() && o.placeholder) {
        ctx.strokeStyle = 'rgba(128,128,128,.6)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.2; ctx.strokeRect(0, 0, w, h); ctx.setLineDash([]);
      }
      if (!(ov && ov.hideText)) {
        if (!fillStyle && shadow) applyFx();
        if (o.glow && o.type === 'text' && !fillStyle) applyFx();
        if (ov && ov.textOverride) ov.textOverride(ctx, w, h);
        else drawTextBlock(ctx, ov && ov.color ? { ...o, color: ov.color, size: ov.size ?? o.size } : (ov && ov.size ? { ...o, size: ov.size } : o), theme, w, h, { ...opts, paraAlpha: ov && ov.paraAlpha });
        clearFx();
      }
    }
  } else if (o.type === 'image') {
    const src = assetSrc(doc, o.asset), img = getImage(src);
    const crop = ov && ov.crop ? ov.crop : (o.crop || { l: 0, t: 0, r: 0, b: 0 });
    ctx.save();
    const mask = ov && ov.pts ? ov.pts : (o.mask && o.mask !== 'rect' ? shapePoints(o.mask, w, h, o.radius) : (o.radius ? shapePoints('roundRect', w, h, o.radius) : null));
    if (shadow) { applyFx(); tracePts(ctx, mask || shapePoints('rect', w, h)); ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.fill(); clearFx(); }
    if (mask) { tracePts(ctx, mask); ctx.clip(); }
    if (img) {
      const iw = img.naturalWidth, ih = img.naturalHeight, sx = crop.l * iw, sy = crop.t * ih, sw = iw * (1 - crop.l - crop.r), sh = ih * (1 - crop.t - crop.b);
      const f = objFilterCss(o.filters); if (f !== 'none') ctx.filter = f;
      if (o.filters?.transparency) ctx.globalAlpha *= 1 - o.filters.transparency / 100;
      if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      ctx.filter = 'none';
    } else { ctx.fillStyle = 'rgba(128,128,128,.25)'; ctx.fillRect(0, 0, w, h); }
    ctx.restore();
    if (o.stroke && o.stroke !== 'none' && o.strokeW) { tracePts(ctx, mask || shapePoints('rect', w, h)); ctx.strokeStyle = resolveColor(o.stroke, theme); ctx.lineWidth = o.strokeW; ctx.stroke(); }
  } else if (o.type === 'chart') { drawChart(ctx, o, theme, w, h, ov?.chartProg ?? 1); }
  else if (o.type === 'table') { drawTable(ctx, { ...o, w, h }, theme, opts); }
  else if (o.type === 'video' || o.type === 'audio') {
    const live = opts.media && opts.media[o.id];
    if (live && o.type === 'video' && live.readyState >= 2) ctx.drawImage(live, 0, 0, w, h);
    else if (o.poster && getImage(assetSrc(doc, o.poster))) ctx.drawImage(getImage(assetSrc(doc, o.poster)), 0, 0, w, h);
    else if (!(opts.present && o.type === 'audio' && o.hideIcon)) mediaIcon(ctx, o.type, w, h, theme);
  }
  if (o.reflection && !opts.noReflect) {
    ctx.save(); ctx.translate(0, h * 2 + 4); ctx.scale(1, -1); ctx.globalAlpha *= .22;
    ctx.beginPath(); ctx.rect(0, h - h * .45, w, h * .45); ctx.clip();
    const copy = { ...o, x: 0, y: 0, rot: 0, reflection: false, shadow: null, glow: null }; ctx.translate(w / 2, h / 2); ctx.translate(-w / 2, -h / 2);
    drawObject(ctx, copy, doc, { ...opts, noReflect: true }); ctx.restore();
  }
  ctx.restore();
}

// ---------- background & master ----------
export function drawBackground(ctx, doc, slide, w, h) {
  const theme = doc.theme, bg = slide.bg || doc.master.bg || { type: 'theme' };
  ctx.save();
  if (bg.type === 'image' && bg.asset) {
    ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, w, h);
    const img = getImage(assetSrc(doc, bg.asset));
    if (img) { const s = Math.max(w / img.naturalWidth, h / img.naturalHeight); const iw = img.naturalWidth * s, ih = img.naturalHeight * s; ctx.globalAlpha = 1 - (bg.transparency || 0) / 100; ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih); }
  } else if (bg.type === 'theme') {
    if (theme.style === 'glow' || theme.style === 'wave') { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, theme.bg); g.addColorStop(1, theme.bg2); ctx.fillStyle = g; } else ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1 - (bg.transparency || 0) / 100;
    ctx.fillStyle = makeFill(ctx, bg.type === 'solid' ? bg.color : bg, theme, w, h, doc) || theme.bg; ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}
export function drawMaster(ctx, doc, slide, index, w, h) {
  const m = doc.master, theme = doc.theme;
  if (slide.hideMaster) return;
  ctx.save(); ctx.fillStyle = resolveColor('@muted', theme); ctx.font = `${Math.round(h * .022)}px ${theme.body}`; ctx.textBaseline = 'middle';
  const y = h - h * .045;
  if (m.footer) { ctx.textAlign = 'center'; ctx.fillText(m.footer, w / 2, y); }
  if (m.showNumber) { ctx.textAlign = doc.lang === 'en' ? 'right' : 'left'; ctx.fillText(String(index + 1), doc.lang === 'en' ? w - w * .04 : w * .04, y); }
  if (m.showDate) { ctx.textAlign = doc.lang === 'en' ? 'left' : 'right'; ctx.fillText(new Date().toLocaleDateString(doc.lang || 'en'), doc.lang === 'en' ? w * .04 : w - w * .04, y); }
  if (m.logo) {
    const img = getImage(assetSrc(doc, m.logo));
    if (img) { const lh = h * .08, lw = lh * img.naturalWidth / img.naturalHeight, pad = w * .025; const pos = m.logoPos || 'br'; const lx = pos.includes('r') ? w - pad - lw : pad; const ly = pos.includes('b') ? h - pad - lh - (m.footer || m.showNumber ? h * .04 : 0) : pad; ctx.drawImage(img, lx, ly, lw, lh); }
  }
  ctx.restore();
}

// opts: { scale, editor, overrides: Map(id->ov), hide: Set, index, media, present, after: fn(ctx) }
export function renderSlide(ctx, doc, slide, opts = {}) {
  const { w, h } = doc.size, s = opts.scale ?? 1;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (opts.clear !== false) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(s, 0, 0, s, opts.ox || 0, opts.oy || 0);
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  if (!opts.noBg) drawBackground(ctx, doc, slide, w, h);
  const ovs = opts.overrides, docDir = doc.lang === 'he' || doc.lang === 'ar' ? 'rtl' : 'ltr';
  for (const o of slide.objects) {
    if (opts.hide && opts.hide.has(o.id)) continue;
    if (opts.present && o.hidden) continue;
    drawObject(ctx, o, doc, { ...opts, docDir }, ovs ? ovs.get(o.id) : null);
  }
  if (!opts.noMaster) drawMaster(ctx, doc, slide, opts.index ?? doc.slides.indexOf(slide), w, h);
  if (opts.after) opts.after(ctx);
  ctx.restore();
}

export function renderToCanvas(doc, slide, width, opts = {}) {
  const c = opts.canvas || document.createElement('canvas');
  const s = width / doc.size.w; c.width = Math.round(width); c.height = Math.round(doc.size.h * s);
  renderSlide(c.getContext('2d'), doc, slide, { scale: s, ...opts });
  return c;
}

// ---------- geometry helpers ----------
export function objCorners(o) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, a = (o.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-o.w / 2, -o.h / 2], [o.w / 2, -o.h / 2], [o.w / 2, o.h / 2], [-o.w / 2, o.h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
export function objAABB(o) { const p = objCorners(o); const xs = p.map(q => q[0]), ys = p.map(q => q[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
export function hitObj(o, px, py, tol = 4) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, a = -(o.rot || 0) * Math.PI / 180;
  const dx = px - cx, dy = py - cy, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  const hh = o.shape === 'line' || o.shape === 'arrowLine' ? Math.max(o.h, 16) : o.h;
  return Math.abs(lx) <= o.w / 2 + tol && Math.abs(ly) <= hh / 2 + tol;
}
