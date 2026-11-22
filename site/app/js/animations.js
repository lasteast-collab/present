// Lasteast Present — object animation engine
import { Ease, uid, clamp } from './util.js';

export const ANIMS = {
  entrance: ['appear', 'fadeIn', 'flyIn', 'floatIn', 'riseUp', 'zoomIn', 'popIn', 'bounceIn', 'growTurn', 'swivel', 'wipeIn', 'splitIn', 'wheelIn', 'blurIn', 'drop'],
  exit: ['disappear', 'fadeOut', 'flyOut', 'floatOut', 'sinkDown', 'zoomOut', 'popOut', 'shrinkTurn', 'wipeOut', 'wheelOut', 'blurOut'],
  emphasis: ['pulse', 'spin', 'growShrink', 'teeter', 'shake', 'bounce', 'transparency', 'flicker', 'heartbeat'],
  motion: ['pathLine', 'pathArc', 'pathCircle', 'pathZigzag', 'pathCustom'],
};
export const ANIM_CAT = Object.fromEntries(Object.entries(ANIMS).flatMap(([c, l]) => l.map(t => [t, c])));
export const DIR_ANIMS = new Set(['flyIn', 'flyOut', 'wipeIn', 'wipeOut', 'floatIn', 'floatOut', 'pathLine', 'pathArc']);

export function newAnim(type, start = 'click') {
  return { id: uid('an'), cat: ANIM_CAT[type], type, start, dur: ANIM_CAT[type] === 'emphasis' ? .8 : ANIM_CAT[type] === 'motion' ? 1.6 : .55, delay: 0, repeat: 1, dir: 'bottom', dist: 300, path: null, byPara: false, trigger: null, ease: 'auto' };
}

const dirVec = (d) => ({ left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1], tl: [-1, -1], tr: [1, -1], bl: [-1, 1], br: [1, 1] }[d] || [0, 1]);

// returns override fragment for an animation at progress p (0..1, already in time domain)
export function animFx(a, o, p, size) {
  const e = a.ease && a.ease !== 'auto' ? Ease[a.ease] || Ease.easeOut : null;
  const out = {};
  const E = (f) => e ? e(p) : f(p);
  switch (a.type) {
    case 'appear': out.alpha = p > 0 ? 1 : 0; break;
    case 'disappear': out.alpha = p >= 1 ? 0 : 1; break;
    case 'fadeIn': out.alpha = E(Ease.easeOut); break;
    case 'fadeOut': out.alpha = 1 - E(Ease.easeIn); break;
    case 'flyIn': { const [dx, dy] = dirVec(a.dir), q = 1 - E(Ease.easeOut); out.dx = dx * q * (dx > 0 ? size.w - o.x : o.x + o.w) * 1.05; out.dy = dy * q * (dy > 0 ? size.h - o.y : o.y + o.h) * 1.05; break; }
    case 'flyOut': { const [dx, dy] = dirVec(a.dir), q = E(Ease.easeIn); out.dx = dx * q * (dx > 0 ? size.w - o.x : o.x + o.w) * 1.05; out.dy = dy * q * (dy > 0 ? size.h - o.y : o.y + o.h) * 1.05; break; }
    case 'floatIn': { const q = E(Ease.easeOut), [dx, dy] = dirVec(a.dir); out.alpha = q; out.dx = dx * (1 - q) * 60; out.dy = dy * (1 - q) * 60; break; }
    case 'floatOut': { const q = E(Ease.easeIn), [dx, dy] = dirVec(a.dir); out.alpha = 1 - q; out.dx = dx * q * 60; out.dy = dy * q * 60; break; }
    case 'riseUp': { const q = E(Ease.back); out.alpha = clamp(p * 2, 0, 1); out.dy = (1 - q) * 120; break; }
    case 'sinkDown': { const q = E(Ease.easeIn); out.alpha = 1 - q; out.dy = q * 120; break; }
    case 'zoomIn': { const q = E(Ease.easeOut); out.alpha = q; out.scale = .3 + .7 * q; break; }
    case 'zoomOut': { const q = E(Ease.easeIn); out.alpha = 1 - q; out.scale = 1 - .7 * q; break; }
    case 'popIn': { const q = E(Ease.back); out.alpha = clamp(p * 3, 0, 1); out.scale = Math.max(0, q); break; }
    case 'popOut': { const q = E(Ease.easeIn); out.alpha = 1 - q; out.scale = 1 + .25 * Math.sin(q * Math.PI) - q; break; }
    case 'bounceIn': { const q = E(Ease.bounce); out.alpha = clamp(p * 4, 0, 1); out.dy = -(1 - q) * (o.y + o.h); break; }
    case 'drop': { const q = E(Ease.bounce); out.alpha = clamp(p * 4, 0, 1); out.scale = 1 + (1 - q) * .8; break; }
    case 'growTurn': { const q = E(Ease.easeOut); out.alpha = q; out.scale = q; out.drot = (1 - q) * -90; break; }
    case 'shrinkTurn': { const q = E(Ease.easeIn); out.alpha = 1 - q; out.scale = 1 - q; out.drot = q * 90; break; }
    case 'swivel': { const q = E(Ease.easeOut); out.alpha = q; out.sx = Math.cos((1 - q) * Math.PI * 2.5) * q + (1 - q) * .01; break; }
    case 'wipeIn': case 'wipeOut': {
      let q = E(Ease.easeInOut); if (a.type === 'wipeOut') q = 1 - q;
      const d = a.dir; out.clip = d === 'left' ? { x: 1 - q, y: 0, w: q, h: 1 } : d === 'right' ? { x: 0, y: 0, w: q, h: 1 } : d === 'top' ? { x: 0, y: 1 - q, w: 1, h: q } : { x: 0, y: 0, w: 1, h: q };
      if (d === 'right') out.clip = { x: 0, y: 0, w: q, h: 1 }; if (d === 'left') out.clip = { x: 1 - q, y: 0, w: q, h: 1 };
      if (d === 'bottom') out.clip = { x: 0, y: 1 - q, w: 1, h: q }; if (d === 'top') out.clip = { x: 0, y: 0, w: 1, h: q };
      break;
    }
    case 'splitIn': { const q = E(Ease.easeInOut); out.clip = { x: .5 - q / 2, y: 0, w: q, h: 1 }; break; }
    case 'wheelIn': out.clip = { circle: E(Ease.easeOut) }; break;
    case 'wheelOut': out.clip = { circle: 1 - E(Ease.easeIn) }; break;
    case 'blurIn': { const q = E(Ease.easeOut); out.alpha = q; out.filter = `blur(${(1 - q) * 20}px)`; break; }
    case 'blurOut': { const q = E(Ease.easeIn); out.alpha = 1 - q; out.filter = `blur(${q * 20}px)`; break; }
    // emphasis (return to identity at p = 1)
    case 'pulse': out.scale = 1 + .12 * Math.sin(p * Math.PI); break;
    case 'growShrink': out.scale = 1 + .35 * Math.sin(p * Math.PI); break;
    case 'heartbeat': out.scale = 1 + .15 * Math.abs(Math.sin(p * Math.PI * 3)) * (1 - p); break;
    case 'spin': out.drot = E(Ease.easeInOut) * 360; break;
    case 'teeter': out.drot = Math.sin(p * Math.PI * 4) * 8 * (1 - p); break;
    case 'shake': out.dx = Math.sin(p * Math.PI * 10) * 14 * (1 - p); break;
    case 'bounce': out.dy = -Math.abs(Math.sin(p * Math.PI * 2)) * 50 * (1 - p); break;
    case 'transparency': out.alpha = 1 - .6 * Math.sin(p * Math.PI); break;
    case 'flicker': out.alpha = p < 1 ? (Math.sin(p * 60) > 0 ? 1 : .25) : 1; break;
    // motion paths (persist the end offset)
    default: if (a.cat === 'motion') { const [x, y] = pathPoint(a, E(Ease.easeInOut)); out.dx = x; out.dy = y; }
  }
  return out;
}
export function pathPoint(a, t) {
  const [dx, dy] = dirVec(a.dir || 'right'), D = a.dist || 300;
  switch (a.type) {
    case 'pathLine': return [dx * D * t, dy * D * t];
    case 'pathArc': return [dx * D * t + (dy ? D * .5 * Math.sin(t * Math.PI) : 0), dy * D * t - (dx ? D * .35 * Math.sin(t * Math.PI) : 0)];
    case 'pathCircle': { const r = D / 3; return [Math.sin(t * Math.PI * 2) * r, -(1 - Math.cos(t * Math.PI * 2)) * r]; }
    case 'pathZigzag': { const seg = t * 4, k = Math.floor(seg), f = seg - k; const ys = [0, -1, 1, -1, 0]; return [D * t, (ys[k] + (ys[Math.min(k + 1, 4)] - ys[k]) * f) * D * .2]; }
    case 'pathCustom': { const P = a.path && a.path.length > 1 ? a.path : [[0, 0], [D, 0]]; const L = []; let tot = 0; for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); L.push(d); tot += d; } let tt = t * tot; for (let i = 0; i < L.length; i++) { if (tt <= L[i] || i === L.length - 1) { const f = L[i] ? clamp(tt / L[i], 0, 1) : 0; return [P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f]; } tt -= L[i]; } return P.at(-1); }
  }
  return [0, 0];
}

// Build ordered timeline: [{ anim, obj, step, t0, t1, para }]
export function buildTimeline(slide) {
  const list = [];
  for (const o of slide.objects) for (const a of (o.anims || [])) if (!a.trigger) list.push({ a, o });
  list.sort((x, y) => (x.a.order ?? 0) - (y.a.order ?? 0));
  // expand by-paragraph text builds
  const ex = [];
  for (const it of list) {
    if (it.a.byPara && it.a.cat === 'entrance' && (it.o.text || '').includes('\n')) {
      const n = it.o.text.split('\n').length;
      for (let i = 0; i < n; i++) ex.push({ ...it, para: i, paraCount: n, start: i === 0 ? it.a.start : 'click' });
    } else ex.push({ ...it, start: it.a.start });
  }
  const out = []; let step = -1, lastStart = 0, lastEnd = 0;
  ex.forEach((it, i) => {
    const dur = (it.a.dur || .5) * (it.a.repeat || 1), delay = it.a.delay || 0;
    if (it.start === 'click' || i === 0) { step++; if (i === 0 && it.start !== 'click') step = 0, it.auto = true; lastStart = 0; lastEnd = 0; const t0 = (i === 0 && it.start === 'after') ? delay : delay; out.push({ ...it, step, t0, t1: t0 + dur }); lastStart = t0; lastEnd = t0 + dur; return; }
    const t0 = (it.start === 'with' ? lastStart : lastEnd) + delay;
    out.push({ ...it, step, t0, t1: t0 + dur }); lastStart = t0; lastEnd = Math.max(lastEnd, t0 + dur);
  });
  const steps = step + 1;
  const autoFirst = ex.length > 0 && ex[0].start !== 'click';
  const stepDur = Array(steps).fill(0); out.forEach(e => stepDur[e.step] = Math.max(stepDur[e.step], e.t1));
  return { items: out, steps, autoFirst, stepDur };
}

// Compute overrides map for: steps < step completed, step at time t, later pending
export function computeOverrides(slide, tl, step, t, size, triggers = null) {
  const per = new Map();
  const progressOf = (it) => it.step < step ? 1 : it.step > step ? -1 : (t < it.t0 ? -1 : clamp((t - it.t0) / ((it.t1 - it.t0) || 1e-6), 0, 1));
  for (const it of tl.items) { if (!per.has(it.o.id)) per.set(it.o.id, []); per.get(it.o.id).push({ ...it, p: progressOf(it) }); }
  if (triggers) for (const tr of triggers) { if (!per.has(tr.o.id)) per.set(tr.o.id, []); per.get(tr.o.id).push(tr); }
  const res = new Map();
  for (const [id, arr] of per) {
    const o = arr[0].o; const ov = { alpha: 1, dx: 0, dy: 0 };
    const nonPara = arr.filter(x => x.para == null);
    const first = nonPara.find(x => !x.trigger);
    if (first && first.a.cat === 'entrance' && first.p < 0) ov.alpha = 0;
    for (const it of nonPara) {
      if (it.p < 0) continue;
      const rep = it.a.repeat || 1, pp = it.p >= 1 ? 1 : (it.p * rep) % 1;
      const fx = animFx(it.a, o, it.p >= 1 ? 1 : pp, size);
      if (it.a.cat === 'motion') { ov.dx += fx.dx || 0; ov.dy += fx.dy || 0; continue; }
      if (it.a.cat === 'entrance') { ov.alpha = fx.alpha ?? 1; }
      else if (it.a.cat === 'exit') ov.alpha = Math.min(ov.alpha, fx.alpha ?? 1) * (fx.alpha == null && it.p >= 1 ? 0 : 1);
      else if (fx.alpha != null) ov.alpha *= fx.alpha;
      if (it.a.cat === 'exit' && it.p >= 1) ov.alpha = 0;
      for (const k of ['scale', 'sx', 'sy', 'clip', 'filter']) if (fx[k] != null) ov[k] = fx[k];
      if (fx.drot) ov.drot = (ov.drot || 0) + (it.a.type === 'spin' && it.p >= 1 ? 0 : fx.drot);
      if (fx.dx) ov.dx += fx.dx; if (fx.dy) ov.dy += fx.dy;
    }
    const paras = arr.filter(x => x.para != null);
    if (paras.length) { ov.paraAlpha = Array(paras[0].paraCount).fill(0); for (const it of paras) ov.paraAlpha[it.para] = it.p < 0 ? 0 : Ease.easeOut(it.p); }
    res.set(id, ov);
  }
  return res;
}
