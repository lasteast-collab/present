// Lasteast Present — document model, themes, layouts, templates
import { uid, deepClone } from './util.js';

export const FORMAT_VERSION = 1;
export const SIZES = { '16:9': { w: 1280, h: 720 }, '4:3': { w: 960, h: 720 }, 'A4': { w: 1123, h: 794 }, '1:1': { w: 1080, h: 1080 }, '9:16': { w: 720, h: 1280 } };

export const THEMES = [
  { id: 'lasteast', name: 'Lasteast', bg: '#ffffff', bg2: '#eef4ff', surface: '#fff7f0', text: '#1d1f24', muted: '#6b6f78', accent: '#1f6feb', accent2: '#1746b5', accent3: '#2b2f36', head: 'Poppins, Segoe UI, Arial', body: 'Inter, Segoe UI, Arial', style: 'swoosh' },
  { id: 'midnight', name: 'Midnight', bg: '#0f1222', bg2: '#1a1f3b', surface: '#1c2140', text: '#f2f4ff', muted: '#9aa3c7', accent: '#6c8cff', accent2: '#ff6fb1', accent3: '#36d6c3', head: 'Poppins, Segoe UI, Arial', body: 'Inter, Segoe UI, Arial', style: 'glow' },
  { id: 'ember', name: 'Ember', bg: '#1b1412', bg2: '#2b1a14', surface: '#2a1d18', text: '#fff4ec', muted: '#c9a99a', accent: '#ff7a2f', accent2: '#ffc24a', accent3: '#e2453c', head: 'Georgia, Times New Roman', body: 'Segoe UI, Arial', style: 'band' },
  { id: 'paper', name: 'Paper', bg: '#faf7f2', bg2: '#efe8dc', surface: '#ffffff', text: '#2a2723', muted: '#7c766c', accent: '#2f6f62', accent2: '#c0613b', accent3: '#3b4f7a', head: 'Georgia, Times New Roman', body: 'Georgia, Times New Roman', style: 'minimal' },
  { id: 'ocean', name: 'Ocean', bg: '#f3f9fc', bg2: '#d8eef7', surface: '#ffffff', text: '#0e2a3a', muted: '#4f6b7a', accent: '#0f8bbf', accent2: '#13b39a', accent3: '#ef7d57', head: 'Segoe UI, Arial', body: 'Segoe UI, Arial', style: 'wave' },
  { id: 'forest', name: 'Forest', bg: '#f4f6ef', bg2: '#e1e8d3', surface: '#ffffff', text: '#1f2a1c', muted: '#5e6b55', accent: '#3d7a3a', accent2: '#c9a227', accent3: '#7a4e2d', head: 'Trebuchet MS, Segoe UI', body: 'Segoe UI, Arial', style: 'band' },
  { id: 'mono', name: 'Mono', bg: '#ffffff', bg2: '#f1f1f1', surface: '#f6f6f6', text: '#111111', muted: '#666666', accent: '#111111', accent2: '#e63946', accent3: '#888888', head: 'Helvetica Neue, Arial', body: 'Helvetica Neue, Arial', style: 'minimal' },
  { id: 'neon', name: 'Neon', bg: '#07070c', bg2: '#141428', surface: '#12121f', text: '#eafffb', muted: '#8aa5a0', accent: '#18f0c8', accent2: '#ff2bd6', accent3: '#ffe14d', head: 'Consolas, Segoe UI', body: 'Segoe UI, Arial', style: 'glow' },
  { id: 'sunrise', name: 'Sunrise', bg: '#fff8f0', bg2: '#ffe3cc', surface: '#ffffff', text: '#3a1f1a', muted: '#8a6158', accent: '#ff5e62', accent2: '#ff9966', accent3: '#6a3093', head: 'Poppins, Segoe UI', body: 'Segoe UI, Arial', style: 'swoosh' },
  { id: 'corporate', name: 'Corporate', bg: '#ffffff', bg2: '#eef2f7', surface: '#f5f7fa', text: '#1b2a41', muted: '#5b6b82', accent: '#1f4e8c', accent2: '#2a9d8f', accent3: '#e9c46a', head: 'Segoe UI, Arial', body: 'Segoe UI, Arial', style: 'band' },
  { id: 'desert', name: 'Desert', bg: '#f7efe3', bg2: '#ecd9bd', surface: '#fffaf2', text: '#3b2a1a', muted: '#86705a', accent: '#b5582c', accent2: '#2e6f73', accent3: '#d9a441', head: 'Noto Naskh Arabic, Georgia', body: 'Noto Sans Arabic, Segoe UI', style: 'minimal' },
  { id: 'violet', name: 'Violet', bg: '#f8f5ff', bg2: '#e9dfff', surface: '#ffffff', text: '#24133f', muted: '#6c5a8a', accent: '#7b3fe4', accent2: '#e2459a', accent3: '#2ab7ca', head: 'Poppins, Segoe UI', body: 'Segoe UI, Arial', style: 'wave' },
];
export const themeById = (id) => THEMES.find(t => t.id === id) || THEMES[0];

const TOKEN_KEYS = ['bg', 'bg2', 'surface', 'text', 'muted', 'accent', 'accent2', 'accent3'];
export function resolveColor(c, theme) {
  if (typeof c === 'string' && c[0] === '@') { const k = c.slice(1); return theme[k] || '#000'; }
  return c;
}
export function resolveFont(f, theme) {
  if (f === '@head') return theme.head;
  if (f === '@body' || !f) return theme.body;
  return f;
}
export const THEME_TOKENS = TOKEN_KEYS;

// ---------- objects ----------
const base = (o) => ({ id: uid('o'), mid: null, name: '', x: 100, y: 100, w: 300, h: 150, rot: 0, opacity: 1, locked: false, group: null, anims: [], ...o });
export const textDefaults = () => ({ text: '', font: '@body', size: 28, color: '@text', bold: false, italic: false, underline: false, strike: false, align: 'start', valign: 'top', lineHeight: 1.2, paraSpace: 6, bullets: 'none', dir: 'auto', letterSpacing: 0, autofit: true, pad: 10, columns: 1, highlight: null, textOutline: null, textGradient: null, textShadow: null, vertical: false, link: null });

export function makeText(o = {}) { const b = base({ type: 'text', shape: 'rect', fill: 'none', stroke: 'none', strokeW: 0, ...textDefaults(), ...o }); b.mid = b.mid || b.id; return b; }
export function makeShape(shape = 'rect', o = {}) { const b = base({ type: 'shape', shape, fill: '@accent', stroke: 'none', strokeW: 2, dash: 'solid', radius: 16, ...textDefaults(), color: '#ffffff', align: 'center', valign: 'middle', size: 24, ...o }); b.mid = b.mid || b.id; return b; }
export function makeImage(asset, o = {}) { const b = base({ type: 'image', asset, crop: { l: 0, t: 0, r: 0, b: 0 }, filters: {}, radius: 0, stroke: 'none', strokeW: 0, alt: '', mask: 'rect', ...o }); b.mid = b.mid || b.id; return b; }
export function makeTable(rows = 3, cols = 3, o = {}) {
  const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => ({ text: r === 0 ? `Header ${c + 1}` : '', fill: null })));
  const b = base({ type: 'table', cells, header: true, size: 18, font: '@body', color: '@text', headFill: '@accent', headColor: '#ffffff', band: true, border: '@muted', borderW: 1, merges: [], colW: null, rowH: null, w: 720, h: 60 * rows, ...o }); b.mid = b.mid || b.id; return b;
}
export function makeChart(chartType = 'column', o = {}) {
  const b = base({
    type: 'chart', chartType, w: 640, h: 380, title: 'Chart Title', showLegend: true, showLabels: false, font: '@body', color: '@text',
    data: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Series 1', values: [12, 19, 15, 24] }, { name: 'Series 2', values: [8, 11, 17, 14] }] },
    palette: ['@accent', '@accent2', '@accent3', '@muted'], ...o
  }); b.mid = b.mid || b.id; return b;
}
export function makeMedia(kind, asset, o = {}) { const b = base({ type: kind, asset, w: kind === 'audio' ? 80 : 640, h: kind === 'audio' ? 80 : 360, autoplay: false, loop: false, volume: 1, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, acrossSlides: false, poster: null, ...o }); b.mid = b.mid || b.id; return b; }

// ---------- slides & layouts ----------
export const LAYOUTS = ['title', 'titleContent', 'section', 'twoContent', 'comparison', 'titleOnly', 'blank', 'pictureCaption', 'quote', 'bigNumber'];

export function layoutObjects(layout, doc) {
  const { w, h } = doc.size, m = w * 0.07;
  const T = (o) => makeText(o);
  switch (layout) {
    case 'title': return [
      T({ ph: 'title', placeholder: 'Click to add title', x: m, y: h * .30, w: w - 2 * m, h: h * .22, font: '@head', size: 64, bold: true, align: 'center', valign: 'bottom', color: '@text' }),
      T({ ph: 'subtitle', placeholder: 'Click to add subtitle', x: m, y: h * .55, w: w - 2 * m, h: h * .12, size: 28, align: 'center', color: '@muted' })];
    case 'titleContent': return [
      T({ ph: 'title', placeholder: 'Click to add title', x: m, y: h * .07, w: w - 2 * m, h: h * .15, font: '@head', size: 44, bold: true, valign: 'middle' }),
      T({ ph: 'body', placeholder: 'Click to add text', x: m, y: h * .26, w: w - 2 * m, h: h * .62, size: 26, bullets: 'bullet' })];
    case 'section': return [
      T({ ph: 'title', placeholder: 'Section title', x: m, y: h * .38, w: w - 2 * m, h: h * .18, font: '@head', size: 56, bold: true, color: '@accent' }),
      T({ ph: 'subtitle', placeholder: 'Section description', x: m, y: h * .57, w: w - 2 * m, h: h * .1, size: 24, color: '@muted' })];
    case 'twoContent': return [
      T({ ph: 'title', placeholder: 'Click to add title', x: m, y: h * .07, w: w - 2 * m, h: h * .15, font: '@head', size: 44, bold: true, valign: 'middle' }),
      T({ ph: 'body', placeholder: 'Left content', x: m, y: h * .26, w: (w - 2 * m) / 2 - 16, h: h * .62, size: 24, bullets: 'bullet' }),
      T({ ph: 'body2', placeholder: 'Right content', x: w / 2 + 16, y: h * .26, w: (w - 2 * m) / 2 - 16, h: h * .62, size: 24, bullets: 'bullet' })];
    case 'comparison': return [
      T({ ph: 'title', placeholder: 'Click to add title', x: m, y: h * .06, w: w - 2 * m, h: h * .14, font: '@head', size: 42, bold: true, valign: 'middle' }),
      T({ ph: 'h1', placeholder: 'Option A', x: m, y: h * .23, w: (w - 2 * m) / 2 - 16, h: h * .09, size: 28, bold: true, color: '@accent' }),
      T({ ph: 'body', placeholder: 'Details', x: m, y: h * .33, w: (w - 2 * m) / 2 - 16, h: h * .56, size: 22, bullets: 'bullet' }),
      T({ ph: 'h2', placeholder: 'Option B', x: w / 2 + 16, y: h * .23, w: (w - 2 * m) / 2 - 16, h: h * .09, size: 28, bold: true, color: '@accent2' }),
      T({ ph: 'body2', placeholder: 'Details', x: w / 2 + 16, y: h * .33, w: (w - 2 * m) / 2 - 16, h: h * .56, size: 22, bullets: 'bullet' })];
    case 'titleOnly': return [T({ ph: 'title', placeholder: 'Click to add title', x: m, y: h * .07, w: w - 2 * m, h: h * .15, font: '@head', size: 44, bold: true, valign: 'middle' })];
    case 'pictureCaption': return [
      makeShape('rect', { ph: 'picture', name: 'Picture placeholder', x: m, y: h * .1, w: w * .5, h: h * .8, fill: '@bg2', radius: 0, text: 'Insert a picture', color: '@muted', size: 20 }),
      T({ ph: 'title', placeholder: 'Caption title', x: w * .6, y: h * .2, w: w * .33, h: h * .2, font: '@head', size: 36, bold: true, valign: 'bottom' }),
      T({ ph: 'body', placeholder: 'Caption text', x: w * .6, y: h * .43, w: w * .33, h: h * .4, size: 20, color: '@muted' })];
    case 'quote': return [
      T({ name: 'Quote mark', text: '“', x: m, y: h * .08, w: 160, h: 180, font: 'Georgia', size: 180, color: '@accent', bold: true }),
      T({ ph: 'body', placeholder: 'Add a quote', x: m + 40, y: h * .3, w: w - 2 * m - 80, h: h * .3, font: '@head', size: 40, italic: true, align: 'center', valign: 'middle' }),
      T({ ph: 'subtitle', placeholder: '— Author', x: m, y: h * .66, w: w - 2 * m, h: h * .1, size: 24, align: 'center', color: '@muted' })];
    case 'bigNumber': return [
      T({ ph: 'title', placeholder: '87%', x: m, y: h * .18, w: w - 2 * m, h: h * .38, font: '@head', size: 180, bold: true, align: 'center', valign: 'middle', color: '@accent' }),
      T({ ph: 'subtitle', placeholder: 'What this number means', x: m, y: h * .6, w: w - 2 * m, h: h * .12, size: 30, align: 'center' })];
    default: return [];
  }
}

export function makeSlide(doc, layout = 'titleContent', objs) {
  return { id: uid('s'), layout, bg: null, hidden: false, notes: '', comments: [], objects: objs || layoutObjects(layout, doc), transition: { type: 'none', duration: 0.8, params: {}, onClick: true, after: null, sound: null, easing: 'easeInOut' }, camera: null };
}

export function newDoc(themeId = 'lasteast', sizeKey = '16:9') {
  const doc = { format: 'lasteast-present', version: FORMAT_VERSION, id: uid('d'), title: 'Untitled presentation', created: Date.now(), modified: Date.now(), size: { ...SIZES[sizeKey] }, theme: deepClone(themeById(themeId)), master: { logo: null, logoPos: 'br', footer: '', showNumber: false, showDate: false, bg: null, deco: true }, assets: {}, slides: [], show: { loop: false, kiosk: false, customShows: [], camera: defaultCamera() }, lang: 'en' };
  doc.slides.push(makeSlide(doc, 'title'));
  return doc;
}

export function defaultCamera() {
  return { enabled: false, layout: 'bubble', shape: 'circle', corner: 'br', x: null, y: null, size: 0.22, border: '#1f6feb', borderW: 4, shadow: true, glow: false, mirror: true, opacity: 1, brightness: 100, contrast: 100, saturation: 100, zoom: 1, bgEffect: 'none', bgImage: null, edge: 0.5, name: '', title: '', preset: 'professional', autoAvoid: true, anim: 'zoomIn', side: 'right', split: 0.35 };
}

// Assets
export function addAsset(doc, type, data, name = '') {
  for (const [k, a] of Object.entries(doc.assets)) if (a.data === data) return k;
  const id = uid('a'); doc.assets[id] = { type, data, name }; return id;
}
export function gcAssets(doc) {
  const used = new Set();
  for (const s of doc.slides) { if (s.bg && s.bg.asset) used.add(s.bg.asset); for (const o of s.objects) { if (o.asset) used.add(o.asset); if (o.poster) used.add(o.poster); } }
  if (doc.master.logo) used.add(doc.master.logo);
  if (doc.master.bg && doc.master.bg.asset) used.add(doc.master.bg.asset);
  for (const k of Object.keys(doc.assets)) if (!used.has(k)) delete doc.assets[k];
}

// clone slide preserving morph ids so Morph can match duplicated objects
export function cloneSlide(slide) {
  const s = deepClone(slide); s.id = uid('s');
  const gmap = {};
  for (const o of s.objects) { o.id = uid('o'); if (o.group) o.group = gmap[o.group] || (gmap[o.group] = uid('g')); }
  return s;
}
export function cloneObject(o) { const c = deepClone(o); c.id = uid('o'); c.mid = c.id; return c; }

// ---------- templates ----------
export const TEMPLATE_CATEGORIES = ['business', 'education', 'marketing', 'technology', 'science', 'finance', 'portfolio', 'personal', 'infographics', 'minimalist', 'creative', 'school', 'social', 'training', 'corporate', 'pitch'];

const TPL = {
  business: { theme: 'corporate', title: 'Quarterly Business Review', sub: 'Results, priorities and next steps', agenda: ['Highlights', 'Performance', 'Customers', 'Roadmap', 'Next steps'], points: ['Revenue grew 18% year over year', 'Two new enterprise customers signed', 'Operating margin improved to 21%', 'Hiring plan on track for Q3'], chart: 'column', num: '+18%', numSub: 'Year-over-year revenue growth' },
  education: { theme: 'ocean', title: 'Introduction to Photosynthesis', sub: 'Biology · Grade 9', agenda: ['What is photosynthesis?', 'Light reactions', 'The Calvin cycle', 'Quiz'], points: ['Plants convert light energy into chemical energy', 'Happens inside chloroplasts', 'Produces glucose and oxygen', 'Needs water, CO₂ and sunlight'], chart: 'pie', num: '6CO₂', numSub: 'Carbon dioxide molecules per glucose' },
  marketing: { theme: 'sunrise', title: 'Spring Campaign Launch', sub: 'Audience · Channels · Creative', agenda: ['Goals', 'Audience', 'Channels', 'Creative', 'Budget'], points: ['Reach 2M new viewers in 6 weeks', 'Lead with short-form video', 'Retarget engaged visitors', 'Weekly creative refresh'], chart: 'doughnut', num: '2M', numSub: 'Target reach' },
  technology: { theme: 'midnight', title: 'Platform Architecture 2025', sub: 'Engineering all-hands', agenda: ['Current state', 'Target architecture', 'Migration plan', 'Risks'], points: ['Move services to event-driven messaging', 'Unified observability stack', 'Zero-downtime deployments', 'Security by default'], chart: 'line', num: '99.99%', numSub: 'Availability target' },
  science: { theme: 'paper', title: 'Climate Data Findings', sub: 'Research summary', agenda: ['Hypothesis', 'Method', 'Results', 'Discussion'], points: ['Collected 12 years of sensor data', 'Average temperature rose 0.8°C', 'Strong correlation with CO₂ levels', 'Further study of ocean heat needed'], chart: 'scatter', num: '0.8°C', numSub: 'Average temperature increase' },
  finance: { theme: 'forest', title: 'Annual Financial Report', sub: 'Fiscal year overview', agenda: ['Summary', 'Income', 'Expenses', 'Outlook'], points: ['Net income up 12%', 'Operating costs reduced 6%', 'Healthy cash reserves', 'Dividend maintained'], chart: 'area', num: '$4.2M', numSub: 'Net income' },
  portfolio: { theme: 'mono', title: 'Selected Work', sub: 'Design portfolio', agenda: ['About me', 'Projects', 'Process', 'Contact'], points: ['Brand identity for 20+ startups', 'Product design for mobile apps', 'Editorial and print', 'Motion design'], chart: 'bar', num: '10 yrs', numSub: 'Of design practice' },
  personal: { theme: 'violet', title: 'My Year in Review', sub: 'Goals, moments and plans', agenda: ['Highlights', 'Lessons', 'Next year'], points: ['Ran my first half-marathon', 'Learned to cook 30 recipes', 'Read 24 books', 'Visited 4 new cities'], chart: 'bar', num: '24', numSub: 'Books read' },
  infographics: { theme: 'ocean', title: 'Data at a Glance', sub: 'Infographic report', agenda: ['Key figures', 'Trends', 'Breakdown'], points: ['3 of 4 users prefer mobile', 'Peak traffic at 8pm', 'Average session: 6 minutes', 'Retention up 9%'], chart: 'doughnut', num: '75%', numSub: 'Prefer mobile' },
  minimalist: { theme: 'mono', title: 'Less, but better.', sub: 'A minimalist presentation', agenda: ['Idea', 'Approach', 'Result'], points: ['One idea per slide', 'Generous white space', 'Strong typography', 'Clear hierarchy'], chart: 'line', num: '1', numSub: 'Idea per slide' },
  creative: { theme: 'neon', title: 'Ideas Unleashed', sub: 'A creative showcase', agenda: ['Spark', 'Explore', 'Create', 'Share'], points: ['Start with curiosity', 'Prototype quickly', 'Embrace bold color', 'Tell a story'], chart: 'radar', num: '∞', numSub: 'Possibilities' },
  school: { theme: 'sunrise', title: 'The Solar System', sub: 'School project', agenda: ['The Sun', 'Inner planets', 'Outer planets', 'Fun facts'], points: ['8 planets orbit the Sun', 'Jupiter is the largest planet', 'Venus is the hottest', 'A day on Mars is 24.6 hours'], chart: 'bar', num: '8', numSub: 'Planets' },
  social: { theme: 'neon', title: '5 Tips for Better Slides', sub: '@lasteast', agenda: ['Tip 1–5'], points: ['Use big, bold headlines', 'Keep text short', 'Add contrast', 'Animate with purpose', 'End with a call to action'], chart: 'column', num: '5', numSub: 'Quick tips', size: '1:1' },
  training: { theme: 'corporate', title: 'New Employee Onboarding', sub: 'Welcome to the team', agenda: ['Our mission', 'Tools', 'Policies', 'Your first week'], points: ['Meet your buddy', 'Set up your accounts', 'Complete security training', 'Join team rituals'], chart: 'bar', num: 'Week 1', numSub: 'Getting started' },
  corporate: { theme: 'lasteast', title: 'Company Strategy 2026', sub: 'Leadership briefing', agenda: ['Vision', 'Markets', 'Strategy', 'Execution'], points: ['Expand into two new regions', 'Double down on customer success', 'Invest in AI-driven products', 'Operational excellence'], chart: 'combo', num: '3', numSub: 'Strategic pillars' },
  pitch: { theme: 'ember', title: 'Lumen — Smart Energy for Homes', sub: 'Seed round pitch', agenda: ['Problem', 'Solution', 'Market', 'Traction', 'Ask'], points: ['Homes waste 30% of energy', 'Lumen optimizes usage automatically', '$40B addressable market', '1,200 paying households'], chart: 'line', num: '$1.5M', numSub: 'Seed raise' },
};

function deco(doc, kind) {
  const { w, h } = doc.size, st = doc.theme.style, out = [];
  const S = (shape, o) => out.push(makeShape(shape, { name: 'Decoration', locked: false, ...o }));
  if (kind === 'title') {
    if (st === 'swoosh') { S('ellipse', { x: w * .62, y: -h * .35, w: w * .7, h: w * .7, fill: '@accent', opacity: .12 }); S('ellipse', { x: -w * .15, y: h * .7, w: w * .35, h: w * .35, fill: '@accent2', opacity: .12 }); S('rect', { x: w * .35, y: h * .73, w: w * .3, h: 6, fill: '@accent', radius: 3 }); }
    else if (st === 'glow') { S('ellipse', { x: w * .55, y: -h * .2, w: w * .6, h: w * .6, fill: { type: 'radial', c1: '@accent', c2: 'rgba(0,0,0,0)' }, opacity: .5 }); S('ellipse', { x: -w * .2, y: h * .4, w: w * .5, h: w * .5, fill: { type: 'radial', c1: '@accent2', c2: 'rgba(0,0,0,0)' }, opacity: .4 }); }
    else if (st === 'band') { S('rect', { x: 0, y: 0, w: w * .04, h, fill: '@accent', radius: 0 }); S('rect', { x: w * .04, y: 0, w: w * .012, h, fill: '@accent2', radius: 0 }); }
    else if (st === 'wave') { S('wave', { x: 0, y: h * .78, w, h: h * .22, fill: '@accent', opacity: .9, radius: 0 }); S('wave', { x: 0, y: h * .84, w, h: h * .16, fill: '@accent2', opacity: .8, radius: 0 }); }
    else { S('rect', { x: w * .45, y: h * .73, w: w * .1, h: 4, fill: '@accent', radius: 2 }); }
  } else {
    if (st === 'band') S('rect', { x: 0, y: 0, w: w * .012, h, fill: '@accent', radius: 0 });
    else if (st === 'swoosh') S('rect', { x: w * .07, y: h * .215, w: 90, h: 5, fill: '@accent', radius: 3 });
    else if (st === 'wave') S('wave', { x: 0, y: h * .93, w, h: h * .07, fill: '@accent', opacity: .85, radius: 0 });
    else if (st === 'glow') S('ellipse', { x: w * .8, y: -h * .3, w: w * .4, h: w * .4, fill: { type: 'radial', c1: '@accent', c2: 'rgba(0,0,0,0)' }, opacity: .35 });
  }
  return out;
}
const fill = (objs, map) => { for (const o of objs) if (o.ph && map[o.ph] != null) o.text = map[o.ph]; return objs; };

export function buildTemplate(cat, themeId) {
  const t = TPL[cat] || TPL.business;
  const doc = newDoc(themeId || t.theme, t.size || '16:9');
  doc.title = t.title; doc.slides = [];
  const add = (layout, map, extra = [], decoKind = 'content') => { const s = makeSlide(doc, layout, [...deco(doc, decoKind), ...fill(layoutObjects(layout, doc), map), ...extra]); doc.slides.push(s); return s; };
  add('title', { title: t.title, subtitle: t.sub }, [], 'title').transition = { ...doc.slides[0]?.transition, type: 'none' };
  doc.slides[0].transition = { type: 'none', duration: .8, params: {}, onClick: true, after: null, easing: 'easeInOut' };
  // agenda as numbered cards
  const { w, h } = doc.size, n = t.agenda.length, cw = (w * .86 - (n - 1) * 20) / n;
  const cards = t.agenda.flatMap((a, i) => [
    makeShape('roundRect', { name: 'Agenda card ' + (i + 1), x: w * .07 + i * (cw + 20), y: h * .34, w: cw, h: h * .42, fill: '@surface', stroke: '@bg2', strokeW: 2, radius: 18, text: '', anims: [{ id: uid('a'), cat: 'entrance', type: 'flyIn', dir: 'bottom', start: i ? 'after' : 'click', dur: .45, delay: 0, repeat: 1 }] }),
    makeText({ name: 'Agenda number ' + (i + 1), text: String(i + 1).padStart(2, '0'), x: w * .07 + i * (cw + 20) + 20, y: h * .37, w: cw - 40, h: 70, font: '@head', size: 44, bold: true, color: '@accent' }),
    makeText({ name: 'Agenda item ' + (i + 1), text: a, x: w * .07 + i * (cw + 20) + 20, y: h * .5, w: cw - 40, h: h * .22, size: 22, bold: true })]);
  add('titleOnly', { title: 'Agenda' }, cards);
  const s3 = add('titleContent', { title: t.agenda[1] || 'Key points', body: t.points.join('\n') });
  s3.objects.find(o => o.ph === 'body').anims = [{ id: uid('a'), cat: 'entrance', type: 'fadeIn', start: 'click', dur: .5, delay: 0, repeat: 1, byPara: true }];
  add('bigNumber', { title: t.num, subtitle: t.numSub });
  const ch = makeChart(t.chart, { x: w * .07, y: h * .25, w: w * .86, h: h * .66, title: '' });
  if (t.chart === 'pie' || t.chart === 'doughnut') ch.data = { labels: ['A', 'B', 'C', 'D'], series: [{ name: 'Share', values: [42, 26, 18, 14] }] };
  if (t.chart === 'scatter') ch.data = { labels: ['1', '2', '3', '4', '5', '6', '7', '8'], series: [{ name: 'Observations', values: [3, 4.2, 4.1, 5.3, 6.1, 6.4, 7.5, 8.2] }] };
  add('titleOnly', { title: 'By the numbers' }, [ch]);
  add('twoContent', { title: 'Next steps', body: t.points.slice(0, 2).join('\n'), body2: t.points.slice(2).join('\n') });
  add('section', { title: 'Thank you', subtitle: 'Ideas. Design. Present.' }, [], 'title');
  doc.slides.forEach((s, i) => { if (i) s.transition = { type: i % 2 ? 'morph' : 'fade', duration: .9, params: {}, onClick: true, after: null, easing: 'easeInOut' }; });
  return doc;
}

export function signatureShowcase() {
  const doc = newDoc('midnight'); doc.title = 'Lasteast Signature Showcase'; doc.slides = [];
  const { w, h } = doc.size;
  const sig = [['morph', 'Morph', 'Objects glide, resize and recolor between slides.'], ['quantumFlow', 'Quantum Flow', 'The slide dissolves into flowing particles.'], ['portal', 'Portal', 'A glowing portal opens onto the next slide.'], ['magneticAssembly', 'Magnetic Assembly', 'Elements are pulled into place by magnetism.'], ['infinityZoom', 'Infinity Zoom', 'An endless dive into depth.'], ['liquidShift', 'Liquid Shift', 'A fluid ripple transforms the scene.']];
  const orb = makeShape('ellipse', { name: '!!orb', x: w * .7, y: h * .2, w: 260, h: 260, fill: { type: 'radial', c1: '@accent', c2: '@accent2' } });
  const bar = makeShape('roundRect', { name: '!!bar', x: w * .07, y: h * .78, w: 200, h: 14, fill: '@accent3', radius: 7 });
  const s0 = makeSlide(doc, 'blank', [orb, bar, makeText({ name: '!!title', text: 'Lasteast Signature', x: w * .07, y: h * .3, w: w * .6, h: 120, font: '@head', size: 72, bold: true }), makeText({ name: 'sub', text: 'Ideas. Design. Present.', x: w * .07, y: h * .5, w: w * .6, h: 60, size: 30, color: '@muted' })]);
  doc.slides.push(s0);
  sig.forEach(([id, name, desc], i) => {
    const o2 = deepClone(orb); o2.id = uid('o'); o2.x = [w * .08, w * .7, w * .4, w * .05, w * .75, w * .45][i]; o2.y = [h * .55, h * .55, h * .05, h * .1, h * .6, h * .6][i]; o2.w = o2.h = [180, 320, 200, 380, 140, 240][i];
    o2.fill = { type: 'radial', c1: ['@accent', '@accent2', '@accent3', '@accent', '@accent2', '@accent3'][i], c2: '@accent2' };
    const b2 = deepClone(bar); b2.id = uid('o'); b2.w = 160 + i * 90; b2.rot = i * 8;
    const s = makeSlide(doc, 'blank', [o2, b2,
      makeText({ name: '!!title', text: name, x: w * .07, y: h * .32, w: w * .7, h: 110, font: '@head', size: 66, bold: true }),
      makeText({ name: 'desc' + i, text: desc, x: w * .07, y: h * .5, w: w * .6, h: 80, size: 28, color: '@muted' }),
      makeShape('roundRect', { name: 'badge' + i, text: 'SIGNATURE ' + (i + 1) + '/6', x: w * .07, y: h * .2, w: 230, h: 44, fill: '@accent', radius: 22, size: 18, bold: true })]);
    s.transition = { type: id, duration: id === 'morph' ? 1.2 : 1.6, params: {}, onClick: true, after: 2.5, easing: 'easeInOut' };
    s.notes = `${name}: ${desc}`;
    doc.slides.push(s);
  });
  return doc;
}
