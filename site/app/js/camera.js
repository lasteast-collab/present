// Lasteast Present — Selfie Presenter Mode (webcam, background effects, overlay layouts)
import { clamp, Ease } from './util.js';
import { shapePoints, objAABB, getImage } from './renderer.js';

const SEG_LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const SEG_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const SEG_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

class CameraManager {
  constructor() {
    this.stream = null; this.mic = null; this.video = document.createElement('video'); this.video.muted = true; this.video.playsInline = true;
    this.active = false; this.micOn = false; this.listeners = new Set();
    this.proc = document.createElement('canvas'); this.pctx = this.proc.getContext('2d', { willReadFrequently: false });
    this.seg = null; this.segState = 'off'; this.mask = document.createElement('canvas'); this.lastSeg = 0;
    this.deviceId = localStorage.getItem('lp.cam') || ''; this.micId = localStorage.getItem('lp.mic') || '';
    this.res = localStorage.getItem('lp.camres') || '1280x720'; this.fps = +(localStorage.getItem('lp.camfps') || 30);
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(f => f(this)); }
  async devices() {
    try { const d = await navigator.mediaDevices.enumerateDevices(); return { cams: d.filter(x => x.kind === 'videoinput'), mics: d.filter(x => x.kind === 'audioinput') }; } catch (e) { return { cams: [], mics: [] }; }
  }
  // Camera is only ever started by an explicit user action.
  async start(opts = {}) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
    if (opts.deviceId != null) { this.deviceId = opts.deviceId; localStorage.setItem('lp.cam', this.deviceId); }
    if (opts.res) { this.res = opts.res; localStorage.setItem('lp.camres', this.res); }
    if (opts.fps) { this.fps = opts.fps; localStorage.setItem('lp.camfps', this.fps); }
    this.stopVideo();
    const [w, h] = this.res.split('x').map(Number);
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: this.deviceId ? { exact: this.deviceId } : undefined, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: this.fps } }, audio: false });
    this.video.srcObject = this.stream; await this.video.play().catch(() => { });
    this.active = true; this.startedAt = performance.now(); this.emit();
  }
  stopVideo() { if (this.stream) this.stream.getTracks().forEach(t => t.stop()); this.stream = null; this.active = false; }
  stop() { this.stopVideo(); this.emit(); }
  async startMic(id) {
    if (id != null) { this.micId = id; localStorage.setItem('lp.mic', id); }
    this.stopMic();
    this.mic = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: this.micId ? { exact: this.micId } : undefined, echoCancellation: true, noiseSuppression: true } });
    this.micOn = true; this.emit();
  }
  stopMic() { if (this.mic) this.mic.getTracks().forEach(t => t.stop()); this.mic = null; this.micOn = false; this.emit(); }
  async toggleMic() { if (this.micOn) this.stopMic(); else { try { await this.startMic(); } catch (e) { alert('Microphone permission was denied or no microphone is available.'); } } }
  micStream() { return this.mic; }
  capabilities() { const tr = this.stream?.getVideoTracks()[0]; return tr && tr.getCapabilities ? tr.getCapabilities() : {}; }
  async setExposure(v) { const tr = this.stream?.getVideoTracks()[0]; const c = this.capabilities(); if (!tr || !c.exposureCompensation) return false; try { await tr.applyConstraints({ advanced: [{ exposureCompensation: clamp(v, c.exposureCompensation.min, c.exposureCompensation.max) }] }); return true; } catch (e) { return false; } }

  async loadSegmenter() {
    if (this.seg || this.segState === 'loading') return this.segState === 'ready';
    this.segState = 'loading'; this.emit();
    try {
      const vision = await import(/* @vite-ignore */ SEG_LIB);
      const fileset = await vision.FilesetResolver.forVisionTasks(SEG_WASM);
      this.seg = await vision.ImageSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: SEG_MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false });
      this.segState = 'ready'; this.emit(); return true;
    } catch (e) { console.warn('Segmenter unavailable', e); this.segState = 'error'; this.segError = String(e.message || e); this.emit(); return false; }
  }
  updateMask() {
    const now = performance.now(); if (!this.seg || now - this.lastSeg < 55 || this.video.readyState < 2) return;
    this.lastSeg = now;
    try {
      const r = this.seg.segmentForVideo(this.video, now); const m = r.confidenceMasks[0];
      const w = m.width, h = m.height, data = m.getAsFloat32Array();
      if (this.mask.width !== w) { this.mask.width = w; this.mask.height = h; this.maskImg = this.mask.getContext('2d').createImageData(w, h); }
      const D = this.maskImg.data; for (let i = 0; i < data.length; i++) { D[i * 4] = D[i * 4 + 1] = D[i * 4 + 2] = 255; D[i * 4 + 3] = data[i] * 255; }
      this.mask.getContext('2d').putImageData(this.maskImg, 0, 0); r.close?.();
    } catch (e) { }
  }
  // Produce processed camera frame (mirror, zoom, color, background effect) at w×h (cover crop)
  frame(cs, w, h) {
    const v = this.video; if (!this.active || v.readyState < 2) return null;
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    if (this.proc.width !== w || this.proc.height !== h) { this.proc.width = w; this.proc.height = h; }
    const x = this.pctx, vw = v.videoWidth, vh = v.videoHeight, z = cs.zoom || 1;
    const s = Math.max(w / vw, h / vh) * z, dw = vw * s, dh = vh * s, dx = (w - dw) / 2, dy = (h - dh) / 2;
    x.save(); x.clearRect(0, 0, w, h);
    if (cs.mirror) { x.translate(w, 0); x.scale(-1, 1); }
    const color = `brightness(${cs.brightness ?? 100}%) contrast(${cs.contrast ?? 100}%) saturate(${cs.saturation ?? 100}%)`;
    const bgfx = cs.bgEffect || 'none';
    if (bgfx !== 'none' && this.segState === 'ready') {
      this.updateMask();
      // background layer
      if (bgfx.startsWith('blur')) { x.filter = `blur(${bgfx === 'blurLight' ? 6 : bgfx === 'blurStrong' ? 22 : 12}px) ${color}`; x.drawImage(v, dx, dy, dw, dh); x.filter = 'none'; }
      else if (bgfx === 'remove') { /* transparent */ }
      else { drawVirtualBg(x, bgfx, cs, w, h, cs.mirror); }
      // person layer through mask
      const tmp = this._tmp || (this._tmp = document.createElement('canvas')); tmp.width = w; tmp.height = h; const tx = tmp.getContext('2d');
      tx.clearRect(0, 0, w, h); tx.filter = color; tx.drawImage(v, dx, dy, dw, dh); tx.filter = `blur(${(cs.edge ?? .5) * 4}px)`;
      tx.globalCompositeOperation = 'destination-in'; tx.drawImage(this.mask, dx, dy, dw, dh); tx.globalCompositeOperation = 'source-over'; tx.filter = 'none';
      x.drawImage(tmp, 0, 0);
    } else { x.filter = color; x.drawImage(v, dx, dy, dw, dh); x.filter = 'none'; }
    x.restore();
    return this.proc;
  }
}
export const camera = new CameraManager();
export const VIRTUAL_BGS = ['office', 'classroom', 'studio', 'interior', 'library', 'neutral'];
function drawVirtualBg(x, kind, cs, w, h, mirror) {
  x.save(); if (mirror) { x.setTransform(1, 0, 0, 1, 0, 0); }
  if (kind === 'custom' && cs.bgImage) { const img = getImage(cs.bgImage); if (img) { const s = Math.max(w / img.naturalWidth, h / img.naturalHeight); x.drawImage(img, (w - img.naturalWidth * s) / 2, (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s); } x.restore(); return; }
  const P = { office: ['#c9d6df', '#8fa3b1', '#e8eef2'], classroom: ['#2f5d50', '#e7d8b8', '#3b7a64'], studio: ['#1b1b24', '#3a2b52', '#0d0d12'], interior: ['#efe4d6', '#c7a98a', '#fff7ec'], library: ['#4a2e1f', '#7b4b2a', '#2b1a10'], neutral: ['#d9d9d9', '#bfbfbf', '#ececec'] }[kind] || ['#ccc', '#999', '#eee'];
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, P[2]); g.addColorStop(1, P[0]); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = P[1];
  if (kind === 'office') { for (let i = 0; i < 3; i++) { x.globalAlpha = .5; x.fillRect(w * (.1 + i * .3), h * .15, w * .22, h * .45); } x.globalAlpha = 1; x.fillRect(0, h * .78, w, h * .22); }
  else if (kind === 'classroom') { x.fillStyle = P[0]; x.fillRect(w * .1, h * .12, w * .8, h * .45); x.strokeStyle = P[1]; x.lineWidth = h * .02; x.strokeRect(w * .1, h * .12, w * .8, h * .45); x.fillStyle = '#ffffff55'; x.font = `${h * .06}px serif`; x.fillText('a² + b² = c²', w * .2, h * .35); }
  else if (kind === 'studio') { const r = x.createRadialGradient(w / 2, h * .4, 0, w / 2, h * .4, w * .6); r.addColorStop(0, P[1]); r.addColorStop(1, P[2]); x.fillStyle = r; x.fillRect(0, 0, w, h); }
  else if (kind === 'interior') { x.globalAlpha = .6; x.fillRect(w * .62, h * .1, w * .28, h * .5); x.fillStyle = '#7a9a6a'; x.beginPath(); x.ellipse(w * .2, h * .55, w * .08, h * .2, 0, 0, 7); x.fill(); x.globalAlpha = 1; }
  else if (kind === 'library') { for (let r = 0; r < 4; r++) for (let i = 0; i < 26; i++) { x.fillStyle = ['#7b2d26', '#2b4a6b', '#c49a45', '#3d5c3a', '#5a3d6b'][(i * 7 + r) % 5]; x.fillRect(i * w / 26 + 2, h * (.05 + r * .23), w / 26 - 4, h * .19); } }
  x.restore();
}

// Layout: returns slideRect (letterboxed slide area) and camRect
export function cameraLayout(cs, W, H, aspect) {
  const fit = (ax, ay, aw, ah) => { let w = aw, h = aw / aspect; if (h > ah) { h = ah; w = ah * aspect; } return { x: ax + (aw - w) / 2, y: ay + (ah - h) / 2, w, h }; };
  if (!cs || !cs.enabled) return { slideRect: fit(0, 0, W, H), camRect: null };
  const sz = clamp(cs.size || .22, .08, .6), pad = Math.round(Math.min(W, H) * .03);
  if (cs.layout === 'side') {
    const f = clamp(cs.split || .35, .15, .6), side = cs.side || 'right';
    if (side === 'right' || side === 'left') { const cw = W * f; const cam = { x: side === 'right' ? W - cw : 0, y: 0, w: cw, h: H }; return { slideRect: fit(side === 'right' ? 0 : cw, 0, W - cw, H), camRect: inset(cam, pad) }; }
    const ch = H * f; const cam = { x: 0, y: side === 'bottom' ? H - ch : 0, w: W, h: ch }; return { slideRect: fit(0, side === 'bottom' ? 0 : ch, W, H - ch), camRect: inset(cam, pad) };
  }
  if (cs.layout === 'full') {
    const m = cs.fullMode || 'presenterLarge';
    if (m === 'presenterFull') return { slideRect: { x: W, y: H, w: 1, h: 1 }, camRect: { x: 0, y: 0, w: W, h: H }, full: true };
    if (m === 'slideFull') return { slideRect: fit(0, 0, W, H), camRect: null };
    if (m === 'split') return { slideRect: fit(0, 0, W / 2, H), camRect: { x: W / 2, y: 0, w: W / 2, h: H } };
    if (m === 'slideLarge') { const r = fit(0, 0, W, H); const cw = W * .28, ch = cw * .75; return { slideRect: r, camRect: { x: W - cw - pad, y: H - ch - pad, w: cw, h: ch } }; }
    const sw = W * .42; const sr = fit(pad, H - sw / aspect - pad, sw, sw / aspect); return { slideRect: sr, camRect: { x: 0, y: 0, w: W, h: H }, behind: true };
  }
  const slideRect = fit(0, 0, W, H);
  const ratio = cs.layout === 'pip' ? 16 / 9 : cs.layout === 'card' ? 4 / 3.6 : (cs.shape === 'roundRect' || cs.shape === 'rect') ? 4 / 3 : 1;
  const ch = H * sz * (cs.layout === 'pip' ? .9 : 1.1), cw = ch * ratio;
  let x, y; const c = cs.corner || 'br';
  if (c === 'custom' && cs.x != null) { x = cs.x * W; y = cs.y * H; }
  else { x = c.includes('l') ? pad : W - cw - pad; y = c.includes('t') ? pad : H - ch - pad; }
  return { slideRect, camRect: { x: clamp(x, 0, W - cw), y: clamp(y, 0, H - ch), w: cw, h: ch } };
}
const inset = (r, p) => ({ x: r.x + p, y: r.y + p, w: r.w - 2 * p, h: r.h - 2 * p });

// Choose a corner that overlaps important slide content the least (titles, text, charts, images weighted)
export function smartCorner(slide, size, camSize, pref = 'br') {
  const cw = size.h * (camSize || .22) * 1.1, ch = cw, pad = size.h * .03;
  const corners = ['br', 'bl', 'tr', 'tl'];
  const rectFor = (c) => ({ x: c.includes('l') ? pad : size.w - cw - pad, y: c.includes('t') ? pad : size.h - ch - pad, w: cw, h: ch });
  const weight = (o) => o.ph === 'title' ? 4 : o.type === 'chart' || o.type === 'table' ? 3 : o.type === 'image' || o.type === 'video' ? 2.5 : o.type === 'text' && (o.text || '').trim() ? 2 : o.name === 'Decoration' ? .1 : 1;
  let best = pref, bs = Infinity;
  for (const c of [pref, ...corners.filter(x => x !== pref)]) {
    const r = rectFor(c); let s = 0;
    for (const o of slide.objects) { const b = objAABB(o); const ix = Math.max(0, Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x)), iy = Math.max(0, Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y)); s += ix * iy * weight(o); }
    if (c === pref) s *= .8;
    if (s < bs - 1) { bs = s; best = c; }
  }
  return best;
}

export const CAM_SHAPES = ['circle', 'squircle', 'roundRect', 'rect', 'hexagon', 'heart', 'star5'];
function camPath(ctx, shape, w, h, radius) {
  ctx.beginPath();
  if (shape === 'circle') { ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); return; }
  const pts = shape === 'squircle' ? shapePoints('roundRect', w, h, Math.min(w, h) * .32) : shape === 'roundRect' ? shapePoints('roundRect', w, h, radius ?? Math.min(w, h) * .12) : shapePoints(shape === 'rect' ? 'rect' : shape, w, h, 0);
  pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
}

// Draw the presenter overlay (frame + video + labels)
export function drawCameraOverlay(ctx, cam, cs, r, enter = 1) {
  const full = cs.layout === 'full' && (cs.fullMode === 'presenterFull' || cs.fullMode === 'presenterLarge' || cs.fullMode === 'split') || cs.layout === 'side';
  const shape = cs.layout === 'pip' || full ? 'rect' : cs.layout === 'card' ? 'roundRect' : (cs.shape || 'circle');
  let { x, y, w, h } = r;
  const labelH = cs.layout === 'card' ? h * .22 : 0, vh = h - labelH;
  const a = cs.anim || 'zoomIn', e = Ease.easeOut(enter);
  ctx.save(); ctx.globalAlpha *= clamp(cs.opacity ?? 1, 0, 1);
  if (a === 'fadeIn') ctx.globalAlpha *= e;
  if (a === 'zoomIn' || a === 'popIn' || a === 'bounceIn') { const s = a === 'bounceIn' ? Ease.bounce(enter) : a === 'popIn' ? Ease.back(enter) : e; ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s); ctx.translate(-x - w / 2, -y - h / 2); }
  if (a === 'slideIn') ctx.translate((1 - e) * (x > ctx.canvas.width / 2 ? w + 60 : -w - 60), 0);
  if (cs.rot && cs.layout === 'floating') { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(cs.rot * Math.PI / 180); ctx.translate(-x - w / 2, -y - h / 2); }
  ctx.translate(x, y);
  if (cs.layout === 'card') { ctx.save(); camPath(ctx, 'roundRect', w, h, Math.min(w, h) * .06); ctx.fillStyle = cs.cardBg || '#16181f'; if (cs.shadow) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; } ctx.fill(); ctx.restore(); }
  if (!full && cs.shadow && cs.layout !== 'card') { ctx.save(); camPath(ctx, shape, w, vh); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 8; ctx.fillStyle = '#000'; ctx.fill(); ctx.restore(); }
  if (cs.glow) { ctx.save(); camPath(ctx, shape, w, vh); ctx.shadowColor = cs.border || '#f26a1b'; ctx.shadowBlur = 30; ctx.strokeStyle = cs.border || '#f26a1b'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
  ctx.save();
  if (a === 'circularReveal' || a === 'reveal') { ctx.beginPath(); if (a === 'circularReveal') ctx.arc(w / 2, vh / 2, Math.hypot(w, vh) / 2 * e, 0, 7); else ctx.rect(0, 0, w * e, vh); ctx.clip(); }
  camPath(ctx, shape, w, vh, cs.layout === 'card' ? Math.min(w, vh) * .06 : undefined); ctx.clip();
  const f = cam.frame(cs, w * (ctx.getTransform().a || 1), vh * (ctx.getTransform().d || 1));
  if (f) ctx.drawImage(f, 0, 0, w, vh); else { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, w, vh); }
  ctx.restore();
  if (cs.borderW > 0 && !full) { ctx.save(); camPath(ctx, shape, w, vh, cs.layout === 'card' ? Math.min(w, vh) * .06 : undefined); ctx.strokeStyle = cs.border || '#f26a1b'; ctx.lineWidth = cs.borderW; if (cs.borderStyle === 'dashed') ctx.setLineDash([cs.borderW * 3, cs.borderW * 2]); ctx.stroke(); ctx.restore(); }
  if ((cs.name || cs.title) && (cs.layout === 'card' || cs.showLabel)) {
    const fs = Math.max(11, (labelH || h * .16) * .38);
    ctx.fillStyle = cs.layout === 'card' ? '#fff' : 'rgba(0,0,0,.55)';
    if (cs.layout !== 'card') { ctx.fillRect(0, vh - fs * 2.6, w, fs * 2.6); ctx.fillStyle = '#fff'; }
    ctx.textAlign = 'center'; ctx.font = `700 ${fs}px Segoe UI, Arial`; ctx.direction = 'inherit';
    const ly = cs.layout === 'card' ? vh + labelH * .42 : vh - fs * 1.45;
    ctx.fillText(cs.name || '', w / 2, ly); ctx.font = `${fs * .78}px Segoe UI, Arial`; ctx.fillStyle = cs.layout === 'card' ? (cs.border || '#f26a1b') : '#ddd'; ctx.fillText(cs.title || '', w / 2, ly + fs * 1.05);
  }
  if (cs.logo) { const img = getImage(cs.logo); if (img) { const lh = Math.min(w, h) * .14; ctx.drawImage(img, w - lh * img.naturalWidth / img.naturalHeight - 6, 6, lh * img.naturalWidth / img.naturalHeight, lh); } }
  ctx.restore();
}

export const CAM_PRESETS = {
  minimal: { layout: 'bubble', shape: 'circle', borderW: 0, shadow: true, glow: false, size: .2 },
  professional: { layout: 'bubble', shape: 'circle', borderW: 4, border: '#f26a1b', shadow: true, glow: false, size: .22 },
  teacher: { layout: 'card', shape: 'roundRect', borderW: 3, border: '#2a9d8f', shadow: true, size: .3, showLabel: true },
  webinar: { layout: 'side', side: 'right', split: .3, borderW: 0, shadow: false },
  news: { layout: 'pip', shape: 'rect', borderW: 3, border: '#e63946', shadow: true, size: .28, showLabel: true },
  podcast: { layout: 'full', fullMode: 'split' },
  modern: { layout: 'bubble', shape: 'squircle', borderW: 3, border: '#6c8cff', glow: true, shadow: false, size: .24 },
  cinematic: { layout: 'full', fullMode: 'presenterLarge' },
};
