// Lasteast Present — editor state, history (undo/redo), events, autosave
import { debounce, deepClone } from './util.js';

export const CMD = {};
export const E = {
  doc: null, cur: 0, sel: [], zoom: 1, fit: true, view: 'normal', readOnly: false,
  history: [], future: [], clipboard: null, painter: null, animPainter: null,
  prefs: Object.assign({ grid: false, ruler: true, guides: true, snap: true, gridSize: 20, colorMode: 'color', uiTheme: 'light', perf: false, spell: true, autosave: true, notes: true, panel: 'format', multiDisplay: false, captions: false }, JSON.parse(localStorage.getItem('lp.prefs') || '{}')),
  favorites: new Set(JSON.parse(localStorage.getItem('lp.favT') || '[]')), recentT: JSON.parse(localStorage.getItem('lp.recentT') || '[]'),
};
export const savePrefs = () => localStorage.setItem('lp.prefs', JSON.stringify(E.prefs));
export const saveFavs = () => { localStorage.setItem('lp.favT', JSON.stringify([...E.favorites])); localStorage.setItem('lp.recentT', JSON.stringify(E.recentT.slice(0, 12))); };

const L = {};
export const on = (ev, fn) => { (L[ev] = L[ev] || new Set()).add(fn); return () => L[ev].delete(fn); };
export const emit = (ev, d) => (L[ev] || []).forEach(f => f(d));

export const slide = () => E.doc.slides[E.cur];
export const selObjs = () => { const s = slide(); return s ? s.objects.filter(o => E.sel.includes(o.id)) : []; };
export const sel1 = () => selObjs()[0] || null;
export const findObj = (id) => slide()?.objects.find(o => o.id === id);

const snap = () => JSON.stringify({ slides: E.doc.slides, theme: E.doc.theme, master: E.doc.master, size: E.doc.size, show: E.doc.show, title: E.doc.title, lang: E.doc.lang, customLayouts: E.doc.customLayouts || [] });
function restore(s) { const o = JSON.parse(s); Object.assign(E.doc, o); E.cur = Math.min(E.cur, E.doc.slides.length - 1); E.sel = E.sel.filter(id => slide()?.objects.some(x => x.id === id)); }
let lastLabel = '', lastT = 0;
export function commit(label, fn, { merge = false } = {}) {
  if (E.readOnly) { emit('toast', 'Read-only mode: editing is disabled.'); return; }
  const before = snap();
  const r = fn && fn();
  const now = performance.now();
  if (!(merge && label === lastLabel && now - lastT < 800 && E.history.length)) { E.history.push({ label, s: before, cur: E.cur }); if (E.history.length > 120) E.history.shift(); }
  lastLabel = label; lastT = now; E.future = [];
  E.doc.modified = Date.now(); E.dirty = true;
  emit('change', { label }); autosave();
  return r;
}
export function undo() { const h = E.history.pop(); if (!h) return; E.future.push({ label: h.label, s: snap(), cur: E.cur }); restore(h.s); E.cur = Math.min(h.cur, E.doc.slides.length - 1); emit('change', { undo: true }); autosave(); }
export function redo() { const h = E.future.pop(); if (!h) return; E.history.push({ label: h.label, s: snap(), cur: E.cur }); restore(h.s); E.cur = Math.min(h.cur, E.doc.slides.length - 1); emit('change', { redo: true }); autosave(); }
export const canUndo = () => E.history.length > 0, canRedo = () => E.future.length > 0;

export const autosave = debounce(() => { if (E.prefs.autosave && E.doc) emit('autosave'); }, 1200);
export function select(ids, add = false) { E.sel = add ? [...new Set([...E.sel, ...ids])] : [...ids]; emit('select'); }
export function setCur(i) { E.cur = Math.max(0, Math.min(i, E.doc.slides.length - 1)); E.sel = []; emit('slide'); }
export const snapshot = () => deepClone(E.doc);
