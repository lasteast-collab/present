// Lasteast Present — AI assistant (configurable provider; never simulated)
import { makeSlide, makeText, makeShape, makeChart, newDoc, THEMES } from './model.js';
import { uid } from './util.js';

const KEY = 'lp.ai';
export const PROVIDERS = {
  openai: { name: 'OpenAI (or any OpenAI-compatible API)', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { name: 'Anthropic Claude', base: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' },
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  ollama: { name: 'Ollama (local)', base: 'http://localhost:11434/v1', model: 'llama3.1' },
};
export function aiConfig() { try { return { provider: 'openai', base: '', model: '', key: '', temperature: .7, maxTokens: 4000, usage: { requests: 0, inTok: 0, outTok: 0 }, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { provider: 'openai', usage: { requests: 0, inTok: 0, outTok: 0 } }; } }
export function saveAiConfig(c) { localStorage.setItem(KEY, JSON.stringify(c)); }
export function aiReady() { const c = aiConfig(); return !!(c.provider && (c.key || c.provider === 'ollama')); }
export class AINotConfigured extends Error { constructor() { super('AI provider not configured'); this.code = 'noai'; } }

export async function chat(system, user, { json = false, maxTokens } = {}) {
  const c = aiConfig(); if (!aiReady()) throw new AINotConfigured();
  const p = PROVIDERS[c.provider] || PROVIDERS.openai, base = (c.base || p.base).replace(/\/$/, ''), model = c.model || p.model;
  let text, inTok = 0, outTok = 0;
  if (c.provider === 'anthropic') {
    const r = await fetch(base + '/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: maxTokens || c.maxTokens || 4000, temperature: +c.temperature, system, messages: [{ role: 'user', content: user }] }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || r.statusText);
    text = j.content.map(b => b.text || '').join(''); inTok = j.usage?.input_tokens || 0; outTok = j.usage?.output_tokens || 0;
  } else {
    const headers = { 'content-type': 'application/json' }; if (c.key) headers.authorization = 'Bearer ' + c.key;
    if (c.provider === 'openrouter') { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Lasteast Present'; }
    const body = { model, temperature: +c.temperature, max_tokens: maxTokens || c.maxTokens || 4000, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (json && c.provider === 'openai') body.response_format = { type: 'json_object' };
    const r = await fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || r.statusText);
    text = j.choices[0].message.content; inTok = j.usage?.prompt_tokens || 0; outTok = j.usage?.completion_tokens || 0;
  }
  const cc = aiConfig(); cc.usage = cc.usage || { requests: 0, inTok: 0, outTok: 0 }; cc.usage.requests++; cc.usage.inTok += inTok; cc.usage.outTok += outTok; saveAiConfig(cc);
  if (!json) return text.trim();
  const s = text.indexOf('{'), e = text.lastIndexOf('}'); if (s < 0) throw new Error('The AI response did not contain JSON.');
  return JSON.parse(text.slice(s, e + 1));
}
const LANG = { en: 'English', he: 'Hebrew', ar: 'Arabic' };

export async function generateOutline({ topic, count = 8, audience = '', tone = 'professional', lang = 'en', source = '' }) {
  const sys = `You are a world-class presentation designer. Reply ONLY with JSON: {"title":string,"subtitle":string,"slides":[{"layout":"title|titleContent|twoContent|section|bigNumber|quote|chart|comparison","title":string,"bullets":[string],"right":[string],"number":string,"quote":string,"author":string,"chart":{"type":"column|bar|line|pie|doughnut","labels":[string],"series":[{"name":string,"values":[number]}]},"notes":string,"image":string}]}. Write all text in ${LANG[lang] || 'English'}. Bullets: max 5, max 12 words each. "image" is a short description of a suitable photo. Speaker notes: 2-4 sentences. Do not invent precise statistics unless given in the source; label illustrative numbers as examples.`;
  const user = `Create a ${count}-slide ${tone} presentation${audience ? ' for ' + audience : ''} about: ${topic}${source ? '\n\nBase it on this source material:\n' + source.slice(0, 24000) : ''}`;
  return chat(sys, user, { json: true, maxTokens: 6000 });
}
export function outlineToDoc(o, themeId = 'lasteast', lang = 'en') {
  const doc = newDoc(themeId); doc.title = o.title || 'Presentation'; doc.lang = lang; doc.slides = [];
  const set = (s, ph, v) => { const t = s.objects.find(x => x.ph === ph); if (t && v != null) t.text = v; };
  const tr = ['fade', 'morph', 'pushLeft', 'smoothFade', 'liquidShift'];
  const first = makeSlide(doc, 'title'); set(first, 'title', o.title); set(first, 'subtitle', o.subtitle || ''); doc.slides.push(first);
  (o.slides || []).forEach((sl, i) => {
    let s;
    if (sl.layout === 'chart' && sl.chart) { s = makeSlide(doc, 'titleOnly'); set(s, 'title', sl.title); s.objects.push(makeChart(sl.chart.type || 'column', { x: 90, y: 180, w: doc.size.w - 180, h: doc.size.h - 240, title: '', data: { labels: sl.chart.labels || [], series: sl.chart.series || [] } })); }
    else if (sl.layout === 'bigNumber') { s = makeSlide(doc, 'bigNumber'); set(s, 'title', sl.number || sl.title); set(s, 'subtitle', sl.number ? sl.title : (sl.bullets || [])[0]); }
    else if (sl.layout === 'quote') { s = makeSlide(doc, 'quote'); set(s, 'body', sl.quote || sl.title); set(s, 'subtitle', sl.author ? '— ' + sl.author : ''); }
    else if (sl.layout === 'section') { s = makeSlide(doc, 'section'); set(s, 'title', sl.title); set(s, 'subtitle', (sl.bullets || [])[0] || ''); }
    else if ((sl.layout === 'twoContent' || sl.layout === 'comparison') && sl.right) { s = makeSlide(doc, 'twoContent'); set(s, 'title', sl.title); set(s, 'body', (sl.bullets || []).join('\n')); set(s, 'body2', (sl.right || []).join('\n')); }
    else { s = makeSlide(doc, 'titleContent'); set(s, 'title', sl.title); set(s, 'body', (sl.bullets || []).join('\n')); const b = s.objects.find(x => x.ph === 'body'); if (b) b.anims = [{ id: uid('an'), cat: 'entrance', type: 'fadeIn', start: 'click', dur: .5, delay: 0, repeat: 1, byPara: true }]; }
    s.notes = sl.notes || ''; if (sl.image) s.notes += (s.notes ? '\n\n' : '') + 'Suggested image: ' + sl.image;
    s.transition = { type: tr[i % tr.length], duration: .9, params: {}, onClick: true, after: null, easing: 'easeInOut' };
    doc.slides.push(s);
  });
  return doc;
}
export const rewrite = (text, style = 'professional', lang) => chat(`Rewrite the user's slide text to be ${style}, concise and clear. Keep the same language${lang ? ' (' + LANG[lang] + ')' : ''} and the same line structure (one bullet per line). Reply with the rewritten text only.`, text);
export const summarize = (text) => chat('Summarize the text into at most 5 short slide bullets, one per line, same language as the input. Reply with bullets only, no symbols.', text);
export const grammar = (text) => chat('Correct spelling and grammar. Preserve meaning, language, tone and line breaks. Reply with corrected text only.', text);
export const speakerNotes = (slideText, deckTitle) => chat('Write natural speaker notes (60-120 words) a presenter can say for this slide. Same language as the slide. Reply with the notes only.', `Presentation: ${deckTitle}\nSlide content:\n${slideText}`);
export const suggestTitles = (text) => chat('Suggest 5 strong, short slide titles for this content, same language. One per line, no numbering.', text);
export const suggestImages = (text) => chat('Suggest 4 image ideas for this slide. For each give a short search query and alt text, one per line as: query — alt text. Same language as the slide.', text);
export async function translateStrings(strings, lang) {
  const r = await chat(`Translate every string in the JSON array into ${LANG[lang]}. Keep line breaks, numbers, names and brand names. Reply ONLY with JSON {"out":[...]} with the same length and order.`, JSON.stringify(strings), { json: true, maxTokens: 8000 });
  if (!Array.isArray(r.out) || r.out.length !== strings.length) throw new Error('Translation returned an unexpected result.');
  return r.out;
}
export async function designAdvice(doc) {
  const summary = doc.slides.map((s, i) => `${i + 1}: ` + s.objects.filter(o => o.text).map(o => o.text.split('\n')[0]).join(' | ')).join('\n');
  return chat(`You are a presentation design director. Reply ONLY with JSON {"theme": one of ${JSON.stringify(THEMES.map(t => t.id))}, "reason": string, "slides":[{"index":number,"layout":"title|titleContent|twoContent|section|bigNumber|quote|titleOnly","transition": one of ["fade","morph","pushLeft","smoothFade","liquidShift","portal","quantumFlow","magneticAssembly","infinityZoom","cubeLeft","lightSweep","aurora"],"animation": one of ["fadeIn","flyIn","zoomIn","riseUp","wipeIn","none"],"tip":string}]}`, `Deck "${doc.title}":\n${summary}`, { json: true });
}
export async function quiz(topic, n = 4, lang = 'en') {
  return chat(`Create a multiple-choice quiz. Reply ONLY with JSON {"questions":[{"q":string,"options":[string,string,string,string],"correct":0-3,"explain":string}]}. Language: ${LANG[lang]}.`, `Topic or content:\n${topic}\nNumber of questions: ${n}`, { json: true });
}
export async function diagram(text, kind = 'process') {
  return chat(`Turn the text into a ${kind} diagram. Reply ONLY with JSON {"items":[string], "children":[[number]]} where items are short labels (max 5 words) and children lists child indexes for hierarchies (optional). Same language as the input.`, text, { json: true });
}

// Build interactive quiz slides with branching navigation and a scoreboard
export function buildQuizSlides(doc, data) {
  const { w, h } = doc.size, out = [];
  const qs = data.questions || [];
  const qSlides = qs.map(() => makeSlide(doc, 'blank', []));
  const fbOk = qs.map(() => makeSlide(doc, 'blank', [])), fbNo = qs.map(() => makeSlide(doc, 'blank', []));
  const end = makeSlide(doc, 'blank', [makeText({ text: 'Quiz complete!', x: 80, y: h * .35, w: w - 160, h: 120, font: '@head', size: 64, bold: true, align: 'center', color: '@accent' }), makeText({ text: 'Great work. Review any questions you missed.', x: 80, y: h * .55, w: w - 160, h: 60, size: 28, align: 'center', color: '@muted' })]);
  qs.forEach((q, i) => {
    const s = qSlides[i];
    s.objects.push(makeShape('roundRect', { text: `Question ${i + 1} / ${qs.length}`, x: 80, y: 50, w: 260, h: 44, fill: '@accent', radius: 22, size: 18, bold: true }));
    s.objects.push(makeText({ text: q.q, x: 80, y: 120, w: w - 160, h: 160, font: '@head', size: 40, bold: true }));
    q.options.forEach((opt, k) => {
      const bx = 80 + (k % 2) * ((w - 180) / 2 + 20), by = 320 + Math.floor(k / 2) * 150;
      s.objects.push(makeShape('roundRect', { name: 'Answer ' + (k + 1), text: String.fromCharCode(65 + k) + '.  ' + opt, x: bx, y: by, w: (w - 180) / 2, h: 120, fill: '@surface', stroke: '@accent', strokeW: 3, color: '@text', size: 24, radius: 18, align: 'start', link: { type: 'slide', slide: (k === q.correct ? fbOk : fbNo)[i].id }, anims: [{ id: uid('an'), cat: 'entrance', type: 'popIn', start: k ? 'after' : 'with', dur: .35, delay: 0, repeat: 1 }] }));
    });
    s.notes = 'Correct answer: ' + q.options[q.correct] + '\n' + (q.explain || '');
    s.transition = { type: 'magneticAssembly', duration: 1.2, params: {}, onClick: false, after: null, easing: 'easeInOut' };
    const nextId = i + 1 < qs.length ? qSlides[i + 1].id : end.id;
    fbOk[i].objects.push(makeText({ text: '✔ Correct!', x: 80, y: h * .25, w: w - 160, h: 120, font: '@head', size: 72, bold: true, align: 'center', color: '#2a9d4a' }), makeText({ text: q.explain || '', x: 120, y: h * .45, w: w - 240, h: 140, size: 26, align: 'center' }), makeShape('roundRect', { text: 'Next →', x: w / 2 - 120, y: h * .72, w: 240, h: 64, fill: '@accent', radius: 32, size: 24, bold: true, link: { type: 'slide', slide: nextId } }));
    fbNo[i].objects.push(makeText({ text: '✖ Not quite', x: 80, y: h * .25, w: w - 160, h: 120, font: '@head', size: 72, bold: true, align: 'center', color: '#d6361f' }), makeText({ text: 'Have another look at the question.', x: 120, y: h * .45, w: w - 240, h: 80, size: 26, align: 'center' }), makeShape('roundRect', { text: '← Try again', x: w / 2 - 120, y: h * .65, w: 240, h: 64, fill: '@accent2', radius: 32, size: 24, bold: true, link: { type: 'slide', slide: qSlides[i].id } }));
    fbOk[i].hidden = fbNo[i].hidden = true;
    fbOk[i].transition = { type: 'flash', duration: .5, params: {}, onClick: false }; fbNo[i].transition = { type: 'fade', duration: .4, params: {}, onClick: false };
    out.push(s, fbOk[i], fbNo[i]);
  });
  out.push(end);
  return out;
}
