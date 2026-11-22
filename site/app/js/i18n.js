// Lasteast Present — interface language engine (EN / HE / AR, instant switching, RTL/LTR)
import { DICT } from './lang.js';
let lang = localStorage.getItem('lp.lang') || (navigator.language || 'en').slice(0, 2);
if (!['en', 'he', 'ar'].includes(lang)) lang = 'en';
const subs = new Set();
export const LANGS = [{ id: 'en', name: 'English', dir: 'ltr' }, { id: 'he', name: 'עברית', dir: 'rtl' }, { id: 'ar', name: 'العربية', dir: 'rtl' }];
export const getLang = () => lang;
export const isRTL = () => lang === 'he' || lang === 'ar';
export function t(s, vars) {
  let out = (lang !== 'en' && DICT[lang] && DICT[lang][s]) || (DICT.en && DICT.en[s]) || s;
  if (out === s && /^(tpl|layout|cam|key)_|^[a-z]+[A-Z]/.test(s) && DICT.human) out = DICT.human(s);
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace('{' + k + '}', v);
  return out;
}
export function setLang(l) {
  lang = l; localStorage.setItem('lp.lang', l);
  document.documentElement.lang = l; document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
  applyI18n(document); subs.forEach(f => f(l));
}
export const onLang = (f) => { subs.add(f); return () => subs.delete(f); };
// Elements carry data-i18n (text), data-i18n-title, data-i18n-ph (placeholder), data-i18n-aria
export function applyI18n(root) {
  root.querySelectorAll('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n));
  root.querySelectorAll('[data-i18n-title]').forEach(e => e.title = t(e.dataset.i18nTitle));
  root.querySelectorAll('[data-i18n-ph]').forEach(e => e.placeholder = t(e.dataset.i18nPh));
  root.querySelectorAll('[data-i18n-aria]').forEach(e => e.setAttribute('aria-label', t(e.dataset.i18nAria)));
}
document.documentElement.lang = lang; document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
