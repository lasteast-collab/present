// Lasteast Present — shared utilities
export const uid = (p = 'o') => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const deepClone = (o) => JSON.parse(JSON.stringify(o));

export const Ease = {
  linear: t => t,
  easeIn: t => t * t * t,
  easeOut: t => 1 - Math.pow(1 - t, 3),
  easeInOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  elastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI) / 3) + 1,
  bounce: t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; },
};
export const EASE_NAMES = Object.keys(Ease);

// ---------- color ----------
export function parseColor(c) {
  if (!c || c === 'none' || c === 'transparent') return [0, 0, 0, 0];
  if (Array.isArray(c)) return c;
  c = String(c).trim();
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map(parseFloat); return [p[0], p[1], p[2], p[3] ?? 1]; }
  return [0, 0, 0, 1];
}
export const rgba = ([r, g, b, a]) => `rgba(${r | 0},${g | 0},${b | 0},${+a.toFixed(3)})`;
export const lerpColor = (a, b, t) => { const A = parseColor(a), B = parseColor(b); return rgba(A.map((v, i) => lerp(v, B[i], t))); };
export const toHex = (c) => { const [r, g, b] = parseColor(c); return '#' + [r, g, b].map(v => (v | 0).toString(16).padStart(2, '0')).join(''); };
export function luminance(c) { const [r, g, b] = parseColor(c).map(v => v / 255); const f = v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); }
export function contrast(a, b) { const l1 = luminance(a), l2 = luminance(b); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); }

// ---------- dom ----------
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function downloadBlob(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export const readAsDataURL = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
export const readAsText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
export const readAsArrayBuffer = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file); });
export function pickFile(accept, multiple = false) {
  return new Promise(res => {
    const i = el('input', { type: 'file', accept, style: 'display:none' });
    if (multiple) i.multiple = true;
    i.onchange = () => { res(multiple ? [...i.files] : i.files[0]); i.remove(); };
    document.body.append(i); i.click();
  });
}
export const blobToDataURL = (b) => readAsDataURL(b);
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// seeded PRNG for deterministic transitions
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// detect strong RTL characters (Hebrew, Arabic)
const RTL_RE = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_RE = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
export function textDir(s) {
  for (const ch of s || '') { if (RTL_RE.test(ch)) return 'rtl'; if (LTR_RE.test(ch)) return 'ltr'; }
  return null;
}
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
