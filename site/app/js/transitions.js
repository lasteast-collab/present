// Lasteast Present — Transition Studio engine
// GPU (WebGL) shader transitions + object-aware canvas engines (Morph, Quantum Flow, Magnetic Assembly, ...)
import { Ease, clamp, lerp, lerpColor, rng, parseColor, rgba } from './util.js';
import { drawObject, drawBackground, drawMaster, renderSlide, shapePoints, resample, layoutText, lineLeft, textTop, fontStr, makeFill } from './renderer.js';
import { resolveColor } from './model.js';

// ---------------- catalog ----------------
const DIR4 = ['left', 'right', 'up', 'down'];
const P = (key, label, type, def, a, b, step) => ({ key, label, type, def, min: a, max: b, step, options: type === 'sel' ? a : null });
const dirP = (def = 0) => P('dir', 'Direction', 'sel', def, DIR4);
const inten = (def = 1) => P('intensity', 'Intensity', 'range', def, 0, 2, .05);

export const CATEGORIES = ['signature', 'basic', 'directional', 'geometric', '3d', 'cinematic', 'morph', 'exclusive'];
export const SIGNATURE = ['morph', 'quantumFlow', 'portal', 'magneticAssembly', 'infinityZoom', 'liquidShift'];

const T = [];
const add = (id, cat, name, kind, params = [], extra = {}) => T.push({ id, cat, name, kind, params, ...extra });

// Basic
add('none', 'basic', 'None', 'none');
add('cut', 'basic', 'Cut', 'gl');
add('fade', 'basic', 'Fade', 'gl');
add('smoothFade', 'basic', 'Smooth Fade', 'gl');
add('dissolve', 'basic', 'Dissolve', 'gl', [P('grain', 'Grain size', 'range', 6, 1, 40, 1)]);
add('crossfade', 'basic', 'Crossfade', 'gl');
add('flash', 'basic', 'Flash', 'gl', [inten(1)]);
add('fadeBlack', 'basic', 'Fade Through Black', 'gl', [P('color', 'Color', 'col', '#000000')]);
add('fadeWhite', 'basic', 'Fade Through White', 'gl', [P('color', 'Color', 'col', '#ffffff')]);
// Directional
for (const [i, d] of DIR4.entries()) { const D = d[0].toUpperCase() + d.slice(1); add('push' + D, 'directional', 'Push ' + D, 'gl', [], { glsl: 'push', fixed: { dir: i } }); }
for (const [i, d] of DIR4.entries()) { const D = d[0].toUpperCase() + d.slice(1); add('slide' + D, 'directional', 'Slide ' + D, 'gl', [], { glsl: 'slide', fixed: { dir: i } }); }
add('cover', 'directional', 'Cover', 'gl', [dirP(0)]);
add('uncover', 'directional', 'Uncover', 'gl', [dirP(0)]);
add('reveal', 'directional', 'Reveal', 'gl', [dirP(0)]);
for (const [i, d] of DIR4.entries()) { const D = d[0].toUpperCase() + d.slice(1); add('wipe' + D, 'directional', 'Wipe ' + D, 'gl', [P('soft', 'Softness', 'range', .08, 0, .4, .01)], { glsl: 'wipe', fixed: { dir: i } }); }
add('diagonalWipe', 'directional', 'Diagonal Wipe', 'gl', [P('soft', 'Softness', 'range', .1, 0, .4, .01)]);
add('cornerReveal', 'directional', 'Corner Reveal', 'gl', [P('corner', 'Corner', 'sel', 0, ['top-left', 'top-right', 'bottom-left', 'bottom-right'])]);
// Geometric
add('splitH', 'geometric', 'Split Horizontal', 'gl'); add('splitV', 'geometric', 'Split Vertical', 'gl'); add('splitD', 'geometric', 'Split Diagonal', 'gl');
add('boxIn', 'geometric', 'Box In', 'gl'); add('boxOut', 'geometric', 'Box Out', 'gl');
add('circleIn', 'geometric', 'Circle In', 'gl'); add('circleOut', 'geometric', 'Circle Out', 'gl');
add('diamondIn', 'geometric', 'Diamond In', 'gl'); add('diamondOut', 'geometric', 'Diamond Out', 'gl');
add('shapeReveal', 'geometric', 'Shape Reveal', 'gl', [P('points', 'Points', 'range', 5, 3, 12, 1)]);
add('gridReveal', 'geometric', 'Grid Reveal', 'gl', [P('cells', 'Cells', 'range', 8, 3, 24, 1)]);
add('checkerboard', 'geometric', 'Checkerboard', 'gl', [P('cells', 'Cells', 'range', 8, 3, 24, 1)]);
add('blinds', 'geometric', 'Blinds', 'gl', [P('count', 'Count', 'range', 10, 2, 40, 1)]);
add('strips', 'geometric', 'Strips', 'gl', [P('count', 'Count', 'range', 12, 2, 40, 1)]);
add('randomBars', 'geometric', 'Random Bars', 'gl', [P('count', 'Count', 'range', 60, 10, 200, 1)]);
add('spiralReveal', 'geometric', 'Spiral Reveal', 'gl', [P('turns', 'Turns', 'range', 2, .5, 6, .1)]);
// 3D
add('cubeRotation', '3d', 'Cube Rotation', 'gl', [P('zoom', 'Camera pull', 'range', .5, 0, 1.5, .05)], { glsl: 'cube', fixed: { dir: 0 } });
for (const [i, d] of DIR4.entries()) { const D = d[0].toUpperCase() + d.slice(1); add('cube' + D, '3d', 'Cube ' + D, 'gl', [P('zoom', 'Camera pull', 'range', .3, 0, 1.5, .05)], { glsl: 'cube', fixed: { dir: i } }); }
add('flipH', '3d', 'Flip Horizontal', 'gl', [], { glsl: 'flip', fixed: { dir: 0 } }); add('flipV', '3d', 'Flip Vertical', 'gl', [], { glsl: 'flip', fixed: { dir: 1 } });
add('pageFlip', '3d', 'Page Flip', 'gl'); add('pageTurn', '3d', 'Page Turn', 'gl');
add('bookOpen', '3d', 'Book Open', 'gl'); add('bookClose', '3d', 'Book Close', 'gl');
add('galleryRotation', '3d', 'Gallery Rotation', 'gl'); add('zoom3d', '3d', '3D Zoom', 'gl'); add('perspectiveSlide', '3d', 'Perspective Slide', 'gl', [dirP(0)]);
add('carousel', '3d', 'Carousel', 'gl'); add('sphereRotation', '3d', 'Sphere Rotation', 'gl');
// Cinematic
add('cinematicFade', 'cinematic', 'Cinematic Fade', 'gl', [P('bars', 'Letterbox', 'range', .12, 0, .25, .01)]);
add('lightSweep', 'cinematic', 'Light Sweep', 'gl', [inten(1.2), P('width', 'Width', 'range', .15, .02, .5, .01), P('color', 'Light color', 'col', '#fff3d6')]);
add('lensFlare', 'cinematic', 'Lens Flare', 'gl', [inten(1), P('color', 'Flare color', 'col', '#ffb36b')]);
add('spotlightReveal', 'cinematic', 'Spotlight Reveal', 'gl', [P('x', 'Focus X', 'range', .5, 0, 1, .01), P('y', 'Focus Y', 'range', .5, 0, 1, .01)]);
add('focusBlur', 'cinematic', 'Focus Blur', 'gl', [P('blur', 'Blur', 'range', 18, 2, 40, 1)]);
add('depthBlur', 'cinematic', 'Depth Blur', 'gl', [P('blur', 'Blur', 'range', 14, 2, 40, 1)]);
add('motionBlur', 'cinematic', 'Motion Blur', 'gl', [dirP(0), P('blur', 'Blur', 'range', .08, 0, .25, .01)]);
add('filmDissolve', 'cinematic', 'Film Dissolve', 'gl', [P('grain', 'Grain', 'range', .2, 0, .6, .01)]);
add('filmBurn', 'cinematic', 'Film Burn', 'gl', [P('color', 'Burn color', 'col', '#ff7a1a')]);
add('cinematicZoom', 'cinematic', 'Cinematic Zoom', 'gl', [inten(1)]);
add('panReveal', 'cinematic', 'Pan and Reveal', 'gl', [dirP(0)]);
add('cameraPush', 'cinematic', 'Camera Push', 'gl'); add('cameraPull', 'cinematic', 'Camera Pull', 'gl');
add('cinematicRotation', 'cinematic', 'Cinematic Rotation', 'gl', [P('angle', 'Angle', 'range', 25, 5, 90, 1)]);
add('dynamicFocus', 'cinematic', 'Dynamic Focus', 'gl', [P('x', 'Focus X', 'range', .5, 0, 1, .01), P('y', 'Focus Y', 'range', .5, 0, 1, .01), P('blur', 'Blur', 'range', 16, 2, 40, 1)]);
add('colorFade', 'cinematic', 'Color Fade', 'gl', [P('color', 'Color', 'col', '#f26a1b')]);
// Morph family (canvas, object-aware)
const morphParams = [P('textMode', 'Text', 'sel', 4, ['By Character', 'By Word', 'By Object', 'Fade Between Text', 'Smart Text Morph']), P('matching', 'Matching', 'sel', 0, ['Smart', 'Names & IDs only', 'Strict (IDs only)']), P('unmatched', 'Unmatched objects', 'sel', 0, ['Fade', 'Fade + scale', 'Fly'])];
add('morph', 'morph', 'Morph', 'morph', morphParams, { sig: true, desc: 'Object-aware: matching objects glide, resize, rotate, recolor and reshape between slides.', use: 'Product reveals, zooming into details, storytelling' });
for (const [id, name, mode] of [['morphZoom', 'Morph Zoom', 'zoom'], ['morphPan', 'Morph Pan', 'pan'], ['morphRotation', 'Morph Rotation', 'rotate'], ['morphScale', 'Morph Scale', 'scale'], ['morphPosition', 'Morph Position', 'position'], ['morphShape', 'Morph Shape', 'shape'], ['morphText', 'Morph Text', 'text'], ['morphImage', 'Morph Image', 'image'], ['morphObjects', 'Morph Objects', 'objects'], ['morphGroup', 'Morph Group', 'group'], ['morphPerspective', 'Morph Perspective', 'perspective'], ['smartMorph', 'Smart Morph', 'smart'], ['continuousMorph', 'Continuous Morph', 'continuous']])
  add(id, 'morph', name, 'morph', morphParams, { mode });
// Lasteast exclusives
const ex = (id, name, kind, params, desc, use, sig = false) => add(id, sig ? 'signature' : 'exclusive', name, kind, params, { excl: true, sig, desc, use });
ex('quantumFlow', 'Quantum Flow', 'quantum', [P('density', 'Particle density', 'range', 1, .3, 2, .05), P('psize', 'Particle size', 'range', 1.6, .5, 4, .1), P('dir', 'Flow direction', 'sel', 0, ['right', 'left', 'up', 'down', 'radial']), P('turbulence', 'Turbulence', 'range', .6, 0, 2, .05), P('attraction', 'Attraction', 'range', .7, 0, 1, .05), P('wind', 'Wind', 'range', .4, 0, 1.5, .05), P('glow', 'Glow', 'range', .6, 0, 1.5, .05), P('randomness', 'Randomness', 'range', .5, 0, 1, .05), P('pattern', 'Assembly pattern', 'sel', 0, ['Flow', 'By brightness', 'In place', 'Spiral']), P('color', 'Particle tint', 'col', '#ffffff'), P('tint', 'Tint amount', 'range', 0, 0, 1, .05)], 'The slide dissolves into flowing particles that reorganize into the next slide.', 'Tech, innovation, big reveals', true);
ex('liquidShift', 'Liquid Shift', 'gl', [P('strength', 'Wave strength', 'range', .05, 0, .2, .005), P('freq', 'Wave frequency', 'range', 12, 2, 40, 1), P('ripple', 'Ripple', 'range', .6, 0, 2, .05), P('angle', 'Direction', 'range', 0, 0, 360, 5), P('smooth', 'Smoothness', 'range', .2, .02, .6, .01), P('mix', 'Color mixing', 'range', .4, 0, 1, .05), P('blur', 'Blur', 'range', .3, 0, 1, .05), P('edge', 'Liquid edge', 'range', .5, 0, 1, .05), P('random', 'Randomness', 'range', .5, 0, 1, .05)], 'Slides transform through a fluid ripple distortion.', 'Creative, wellness, smooth topic changes', true);
ex('pixelStorm', 'Pixel Storm', 'pixel', [P('psize', 'Pixel size', 'range', 22, 6, 80, 1), P('dir', 'Assembly direction', 'sel', 0, ['random', 'left', 'right', 'up', 'down', 'center']), P('randomness', 'Randomness', 'range', .7, 0, 1, .05), P('pattern', 'Pattern', 'sel', 0, ['Storm', 'Swirl', 'Rain']), P('color', 'Pixel edge color', 'col', '#ffffff'), P('edge', 'Edge glow', 'range', .2, 0, 1, .05)], 'The slide breaks into animated pixels that assemble into the next slide.', 'Gaming, digital, retro');
ex('infinityZoom', 'Infinity Zoom', 'gl', [P('depth', 'Depth', 'range', 14, 3, 60, 1), P('x', 'Focal X', 'range', .5, 0, 1, .01), P('y', 'Focal Y', 'range', .5, 0, 1, .01), P('rotation', 'Rotation', 'range', 0, -180, 180, 5), P('blur', 'Motion blur', 'range', .5, 0, 1, .05), P('persp', 'Perspective', 'range', .3, 0, 1, .05), P('dirIn', 'Zoom direction', 'sel', 0, ['In', 'Out']), P('loop', 'Infinite loop layers', 'sel', 1, ['Off', 'On'])], 'A continuous dive through the slide into the next, with an endless depth illusion.', 'Drilling into detail, journeys, chapters', true);
ex('portal', 'Portal', 'gl', [P('shape', 'Portal shape', 'sel', 0, ['Circle', 'Diamond', 'Square', 'Star', 'Hexagon']), P('x', 'Position X', 'range', .5, 0, 1, .01), P('y', 'Position Y', 'range', .5, 0, 1, .01), P('size', 'Portal size', 'range', 1, .3, 1.5, .05), P('rotation', 'Rotation', 'range', 90, -360, 360, 5), P('glow', 'Glow', 'range', 1, 0, 2, .05), P('border', 'Border', 'range', .02, 0, .08, .002), P('depth', 'Depth', 'range', .6, 0, 2, .05), P('distort', 'Background distortion', 'range', .5, 0, 1.5, .05), P('color', 'Glow color', 'col', '#6c8cff'), P('opening', 'Opening speed', 'range', 1, .4, 2, .05), P('closing', 'Closing speed', 'range', 1, .4, 2, .05)], 'A glowing dimensional portal opens and reveals the next slide.', 'Sci-fi, new chapters, product launches', true);
ex('gravityShift', 'Gravity Shift', 'gravity', [P('dir', 'Gravity direction', 'sel', 0, ['down', 'up', 'left', 'right']), P('strength', 'Gravity strength', 'range', 1, .3, 2.5, .05), P('bounce', 'Bounce', 'range', .5, 0, 1, .05), P('rotation', 'Object rotation', 'range', 1, 0, 3, .05), P('intensity', 'Motion intensity', 'range', 1, .3, 2, .05), P('randomness', 'Randomness', 'range', .5, 0, 1, .05)], 'Slide elements fall or rise under simulated gravity before the next slide lands.', 'Playful, education, surprises');
ex('prismReveal', 'Prism Reveal', 'gl', [P('width', 'Spectrum width', 'range', .03, 0, .12, .002), inten(1), P('angle', 'Direction', 'range', 30, 0, 360, 5), P('glow', 'Glow', 'range', .7, 0, 2, .05), P('blur', 'Blur', 'range', .3, 0, 1, .05)], 'The slide separates into colorful light layers that merge into the next slide.', 'Design, photography, creative');
ex('magneticAssembly', 'Magnetic Assembly', 'magnetic', [P('strength', 'Attraction strength', 'range', 1, .2, 2, .05), P('start', 'Starting position', 'sel', 0, ['Scattered', 'Edges', 'Center', 'Direction']), P('dir', 'Assembly direction', 'sel', 0, ['left', 'right', 'up', 'down']), P('rotation', 'Object rotation', 'range', 1, 0, 3, .05), P('curve', 'Motion curve', 'sel', 0, ['Magnetic snap', 'Elastic', 'Smooth', 'Bounce']), P('order', 'Assembly order', 'sel', 0, ['Sequence', 'By group', 'Simultaneous']), P('stagger', 'Staggering', 'range', .5, 0, 1, .05), P('randomness', 'Randomness', 'range', .6, 0, 1, .05), P('particles', 'Particle effects', 'range', .6, 0, 1, .05)], 'The next slide’s elements fly toward their places as if pulled by magnets.', 'Agenda slides, team intros, building ideas', true);
ex('waveDimension', 'Wave Dimension', 'gl', [P('angle', 'Wave direction', 'range', 0, 0, 360, 5), P('height', 'Wave height', 'range', .05, 0, .2, .005), P('count', 'Number of waves', 'range', 3, 1, 10, 1), P('depth', '3D depth', 'range', .8, 0, 2, .05), P('distort', 'Distortion', 'range', .5, 0, 1.5, .05)], 'A three-dimensional wave passes through the slide and transforms the scene.', 'Transitions between topics');
ex('neonTrace', 'Neon Trace', 'gl', [P('color', 'Neon color', 'col', '#18f0c8'), P('glow', 'Glow', 'range', 1, 0, 2, .05), P('thick', 'Line thickness', 'range', 1.5, .5, 4, .1), P('dir', 'Trace direction', 'sel', 0, ['Clockwise', 'Left to right', 'Center out']), P('dark', 'Background darkness', 'range', .85, 0, 1, .05)], 'Neon lines trace the slide’s shapes and edges before revealing the next.', 'Tech, nightlife, futuristic');
ex('shatterRebuild', 'Shatter Rebuild', 'shatter', [P('fsize', 'Fragment size', 'range', 90, 40, 240, 5), P('shape', 'Fragment shape', 'sel', 0, ['Triangles', 'Squares']), P('explode', 'Explosion strength', 'range', 1, .3, 2, .05), P('rotation', 'Rotation', 'range', 1, 0, 3, .05), P('gravity', 'Gravity', 'range', .5, 0, 2, .05), P('dir', 'Reassembly direction', 'sel', 0, ['Center', 'Left', 'Right', 'Random'])], 'The slide breaks into 3D fragments that reconstruct into the next slide.', 'Breakthroughs, disruption, dramatic reveals');
ex('foldSpace', 'Fold Space', 'gl', [P('count', 'Fold count', 'range', 6, 2, 16, 1), P('angle', 'Fold angle', 'range', .8, .2, 1, .05), P('dir', 'Fold direction', 'sel', 0, ['Horizontal', 'Vertical']), P('persp', 'Perspective', 'range', .25, 0, .6, .01)], 'The slide folds through multiple geometric planes to reveal the next.', 'Architecture, maps, process steps');
ex('aurora', 'Aurora', 'gl', [inten(1), P('speed', 'Speed', 'range', 1, .2, 3, .05), P('glow', 'Glow', 'range', 1, 0, 2, .05), P('alpha', 'Transparency', 'range', .7, 0, 1, .05), P('angle', 'Direction', 'range', 0, 0, 360, 5), P('color', 'Color 1', 'col', '#36d6c3'), P('color2', 'Color 2', 'col', '#6c8cff'), P('color3', 'Color 3', 'col', '#ff6fb1')], 'Colorful atmospheric light waves sweep one slide into the next.', 'Calm openings, nature, inspiration');
ex('orbit', 'Orbit', 'gl', [P('dir', 'Orbit direction', 'sel', 0, ['Clockwise', 'Counter-clockwise']), P('radius', 'Orbit radius', 'range', .55, .3, 2, .05), P('tilt', 'Rotation', 'range', 12, 0, 45, 1), P('persp', 'Perspective', 'range', 1, .3, 2, .05)], 'The current slide orbits away while the next enters along an orbital path.', 'Space, global topics, cycles');
ex('timeWarp', 'Time Warp', 'gl', [P('distort', 'Distortion', 'range', 1, 0, 2, .05), P('blur', 'Blur', 'range', .6, 0, 1, .05), P('dir', 'Direction', 'sel', 0, ['Radial', 'Horizontal', 'Vertical']), inten(1), P('waves', 'Time-wave pattern', 'range', 6, 0, 20, 1)], 'The slide stretches through a time distortion into the next scene.', 'History, flashbacks, before/after');
ex('dreamscape', 'Dreamscape', 'gl', [P('blur', 'Blur', 'range', 12, 0, 30, 1), P('density', 'Cloud density', 'range', 3, 1, 8, .1), P('color', 'Color atmosphere', 'col', '#e9dfff'), P('distort', 'Distortion', 'range', .3, 0, 1, .05), P('bright', 'Brightness', 'range', .5, 0, 1, .05)], 'The slide softly blurs and drifts through dream-like clouds into the next.', 'Storytelling, vision, emotions');
ex('holographicShift', 'Holographic Shift', 'gl', [P('color', 'Holo color 1', 'col', '#18f0c8'), P('color2', 'Holo color 2', 'col', '#ff2bd6'), P('layers', 'Layer count', 'range', 6, 2, 16, 1), P('interf', 'Interference', 'range', .6, 0, 1.5, .05), P('glitch', 'Glitch intensity', 'range', .6, 0, 1.5, .05), P('alpha', 'Transparency', 'range', .3, 0, 1, .05)], 'Futuristic holographic layers and interference patterns shift the scene.', 'Tech demos, futuristic themes');
ex('magneticWipe', 'Magnetic Wipe', 'gl', [P('x', 'Focal X', 'range', .5, 0, 1, .01), P('y', 'Focal Y', 'range', .5, 0, 1, .01), P('curve', 'Curve', 'range', .35, 0, 1, .01), P('angle', 'Direction', 'range', 0, 0, 360, 5), P('glow', 'Edge glow', 'range', 1, 0, 2, .05), P('color', 'Edge color', 'col', '#f26a1b'), P('shape', 'Shape', 'sel', 0, ['Bulge', 'Pinch'])], 'A smart wipe that curves around a focal point instead of a straight line.', 'Highlighting a subject, focus changes');
ex('kaleidoscope', 'Kaleidoscope', 'gl', [P('count', 'Symmetry count', 'range', 6, 3, 16, 1), P('rotation', 'Rotation', 'range', 90, 0, 720, 5), P('zoom', 'Zoom', 'range', 1, .5, 3, .05), inten(1)], 'The slide transforms through symmetrical, rotating reflections.', 'Art, music, celebrations');
ex('dimensionBreak', 'Dimension Break', 'gl', [P('fsize', 'Fragment size', 'range', 6, 3, 14, 1), P('depth', 'Depth', 'range', 1, .3, 2, .05), P('dir', 'Break direction', 'sel', 0, ['Center', 'Left', 'Right', 'Top', 'Bottom']), P('light', 'Lighting', 'range', 1, 0, 2, .05), P('color', 'Boundary light', 'col', '#9fd3ff')], 'The slide shatters through a dimensional boundary revealing the next slide behind it.', 'Big announcements, keynotes');
// put the signature set first
for (const id of SIGNATURE) { const t = T.find(x => x.id === id); t.sig = true; t.cat = 'signature'; }
const morphT = T.find(t => t.id === 'morph'); morphT.cat = 'signature';

export const TRANSITIONS = T;
export const getT = (id) => T.find(t => t.id === id) || T[0];
export function defaultParams(id) { const t = getT(id); const o = { ...(t.fixed || {}) }; for (const p of t.params) o[p.key] = p.def; return o; }

export const PRESETS = {
  subtle: { dur: .7, int: .5, ease: 'easeInOut' }, professional: { dur: 1, int: .8, ease: 'easeInOut' }, dynamic: { dur: .85, int: 1.2, ease: 'easeOut' },
  cinematic: { dur: 1.6, int: 1, ease: 'easeInOut' }, dramatic: { dur: 2, int: 1.6, ease: 'easeIn' }, futuristic: { dur: 1.3, int: 1.3, ease: 'back' }, creative: { dur: 1.2, int: 1.4, ease: 'elastic' },
};
const INTENSITY_KEYS = new Set(['intensity', 'strength', 'glow', 'turbulence', 'explode', 'distort', 'ripple', 'height', 'depth', 'glitch', 'interf', 'rotation', 'wind', 'blur', 'width', 'particles']);
export function applyPreset(tr, name) {
  const pr = PRESETS[name]; if (!pr) return tr;
  const t = getT(tr.type), base = defaultParams(tr.type), params = { ...base };
  for (const p of t.params) if (p.type === 'range' && INTENSITY_KEYS.has(p.key)) params[p.key] = clamp(base[p.key] * pr.int, p.min, p.max);
  return { ...tr, duration: +(pr.dur * (t.sig ? 1.2 : 1)).toFixed(2), easing: tr.type === 'morph' && pr.ease === 'elastic' ? 'easeInOut' : pr.ease, params, preset: name };
}

// ---------------- GLSL ----------------
const HEAD = `
precision highp float;
uniform sampler2D from, to; uniform float progress, ratio; uniform vec2 res; uniform float P[12]; uniform vec3 C[3];
varying vec2 vUv;
#define PI 3.14159265
vec4 getFrom(vec2 uv){ return texture2D(from, uv); }
vec4 getTo(vec2 uv){ return texture2D(to, uv); }
float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(rand(i),rand(i+vec2(1.,0.)),f.x),mix(rand(i+vec2(0.,1.)),rand(i+vec2(1.,1.)),f.x),f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
bool inside(vec2 uv){ return uv.x>=0.&&uv.x<=1.&&uv.y>=0.&&uv.y<=1.; }
vec4 fromS(vec2 uv){ return inside(uv)?getFrom(uv):vec4(0.,0.,0.,1.); }
vec4 toS(vec2 uv){ return inside(uv)?getTo(uv):vec4(0.,0.,0.,1.); }
vec2 dir4(float d){ return d<.5?vec2(-1.,0.):d<1.5?vec2(1.,0.):d<2.5?vec2(0.,1.):vec2(0.,-1.); }
vec2 angDir(float deg){ float a=deg*PI/180.; return vec2(cos(a),sin(a)); }
mat3 rotX(float a){ float c=cos(a),s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotY(float a){ float c=cos(a),s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotZ(float a){ float c=cos(a),s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
vec2 rot2(vec2 v, float a){ float c=cos(a),s=sin(a); return vec2(c*v.x-s*v.y, s*v.x+c*v.y); }
const float FOC = 2.2;
// ray-cast a quad of half-size hs (in screen units, x scaled by ratio) at center Cc with rotation R
vec4 hitQuad(vec2 uv, vec3 Cc, mat3 R, vec2 hs){
  vec2 s=(uv-.5)*vec2(ratio,1.);
  vec3 O=vec3(0.,0.,-FOC), d=vec3(s,FOC);
  vec3 o=(O-Cc)*R, dd=d*R;
  if(abs(dd.z)<1e-6) return vec4(0.,0.,-1.,0.);
  float t=-o.z/dd.z; vec3 h=o+t*dd;
  vec2 q=vec2(h.x/(2.*hs.x)+.5, h.y/(2.*hs.y)+.5);
  if(t<=0.||q.x<0.||q.x>1.||q.y<0.||q.y>1.) return vec4(0.,0.,-1.,0.);
  return vec4(q, t, o.z>0.?1.:0.);   // w = 1 when seeing the back face
}
float shade(mat3 R){ vec3 n=R*vec3(0.,0.,-1.); return .45+.55*abs(n.z); }
vec4 blurTex(sampler2D tx, vec2 uv, float r){
  vec4 acc=vec4(0.); float tot=0.;
  for(int i=0;i<24;i++){ float fi=float(i); float a=fi*2.39996; float rr=sqrt(fi/24.)*r; vec2 o=vec2(cos(a),sin(a))*rr/res; vec2 u=clamp(uv+o,0.,1.); acc+=texture2D(tx,u); tot+=1.; }
  return acc/tot;
}
vec3 hue(float h){ return clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
`;
const G = {
  cut: `return progress<.5?getFrom(uv):getTo(uv);`,
  fade: `return mix(getFrom(uv),getTo(uv),progress);`,
  smoothFade: `float t=smoothstep(0.,1.,progress); vec4 c=mix(getFrom(uv),getTo(uv),t); c.rgb*=1.+.07*sin(progress*PI); return c;`,
  dissolve: `float n=rand(floor(uv*res/max(P[0],1.))); float m=smoothstep(n-.04,n+.04,progress*1.08-.04); return mix(getFrom(uv),getTo(uv),m);`,
  crossfade: `vec4 a=pow(getFrom(uv),vec4(2.2)), b=pow(getTo(uv),vec4(2.2)); return pow(mix(a,b,progress),vec4(1./2.2));`,
  flash: `vec4 c=mix(getFrom(uv),getTo(uv),smoothstep(.4,.6,progress)); float f=pow(1.-abs(progress*2.-1.),3.)*P[0]; return vec4(mix(c.rgb,vec3(1.),clamp(f,0.,1.)),1.);`,
  fadeBlack: `vec4 k=vec4(C[0],1.); return progress<.5?mix(getFrom(uv),k,progress*2.):mix(k,getTo(uv),progress*2.-1.);`,
  fadeWhite: `vec4 k=vec4(C[0],1.); return progress<.5?mix(getFrom(uv),k,progress*2.):mix(k,getTo(uv),progress*2.-1.);`,
  push: `vec2 d=dir4(P[0]); vec2 a=uv-d*progress; if(inside(a)) return getFrom(a); return getTo(uv-d*(progress-1.));`,
  slide: `vec2 d=dir4(P[0]); vec2 b=uv-d*(progress-1.); if(inside(b)){ return getTo(b);} vec4 c=fromS(uv-d*progress*.3); float e=length(d*(uv-(.5+d*.5)) ); return vec4(c.rgb*(1.-.45*progress),1.);`,
  cover: `vec2 d=dir4(P[0]); vec2 b=uv-d*(progress-1.); if(inside(b)) return getTo(b); return vec4(getFrom(uv).rgb*(1.-.35*progress),1.);`,
  uncover: `vec2 d=dir4(P[0]); vec2 a=uv-d*progress; if(inside(a)) return getFrom(a); return vec4(getTo(uv).rgb*(.65+.35*progress),1.);`,
  reveal: `vec2 d=dir4(P[0]); if(progress<.5){ vec2 a=uv-d*progress*.45; return vec4(fromS(a).rgb*(1.-progress*2.),1.);} vec2 b=uv+d*(1.-progress)*.08; return vec4(toS(b).rgb*(progress*2.-1.),1.);`,
  wipe: `float s=P[0]<.5?1.-uv.x:P[0]<1.5?uv.x:P[0]<2.5?uv.y:1.-uv.y; float e=P[1]+.001; float m=smoothstep(progress*(1.+e)-e,progress*(1.+e),s); return mix(getTo(uv),getFrom(uv),m);`,
  diagonalWipe: `float s=(uv.x+(1.-uv.y))*.5; float e=P[0]+.001; float m=smoothstep(progress*(1.+e)-e,progress*(1.+e),s); return mix(getTo(uv),getFrom(uv),m);`,
  cornerReveal: `vec2 c=P[0]<.5?vec2(0.,1.):P[0]<1.5?vec2(1.,1.):P[0]<2.5?vec2(0.,0.):vec2(1.,0.); float r=length((uv-c)*vec2(ratio,1.))/length(vec2(ratio,1.)); float m=smoothstep(progress-.03,progress,r); return mix(getTo(uv),getFrom(uv),m);`,
  splitH: `float o=progress*.5; if(uv.y>.5){ vec2 a=uv-vec2(0.,o); if(a.y>=.5) return getFrom(a);} else { vec2 a=uv+vec2(0.,o); if(a.y<.5) return getFrom(a);} return getTo(uv);`,
  splitV: `float o=progress*.5; if(uv.x>.5){ vec2 a=uv-vec2(o,0.); if(a.x>=.5) return getFrom(a);} else { vec2 a=uv+vec2(o,0.); if(a.x<.5) return getFrom(a);} return getTo(uv);`,
  splitD: `vec2 n=normalize(vec2(1.,1.)); float sd=sign(dot(uv-.5,n)); vec2 a=uv-n*sd*progress*.75; if(sign(dot(a-.5,n))==sd&&inside(a)) return getFrom(a); return getTo(uv);`,
  boxOut: `vec2 q=abs(uv-.5)*2.; float m=max(q.x,q.y); return mix(getTo(uv),getFrom(uv),smoothstep(progress-.01,progress,m));`,
  boxIn: `vec2 q=abs(uv-.5)*2.; float m=max(q.x,q.y); return mix(getFrom(uv),getTo(uv),smoothstep(1.-progress-.01,1.-progress,m));`,
  circleOut: `float r=length((uv-.5)*vec2(ratio,1.))/length(vec2(ratio,1.)*.5); return mix(getTo(uv),getFrom(uv),smoothstep(progress-.01,progress,r));`,
  circleIn: `float r=length((uv-.5)*vec2(ratio,1.))/length(vec2(ratio,1.)*.5); return mix(getFrom(uv),getTo(uv),smoothstep(1.-progress-.01,1.-progress,r));`,
  diamondOut: `vec2 q=abs(uv-.5)*2.; float m=(q.x+q.y)*.5; return mix(getTo(uv),getFrom(uv),smoothstep(progress-.01,progress,m));`,
  diamondIn: `vec2 q=abs(uv-.5)*2.; float m=(q.x+q.y)*.5; return mix(getFrom(uv),getTo(uv),smoothstep(1.-progress-.01,1.-progress,m));`,
  shapeReveal: `vec2 v=(uv-.5)*vec2(ratio,1.); float a=atan(v.y,v.x)+progress*2.; float f=.62+.38*cos(P[0]*a); float r=length(v)/f; return mix(getTo(uv),getFrom(uv),smoothstep(progress*1.6-.02,progress*1.6,r));`,
  gridReveal: `float N=P[0]; vec2 cell=floor(uv*vec2(N*ratio,N)); float dl=rand(cell)*.6; float t=clamp((progress-dl)/.4,0.,1.); vec2 q=abs(fract(uv*vec2(N*ratio,N))-.5)*2.; return max(q.x,q.y)<t?getTo(uv):getFrom(uv);`,
  checkerboard: `float N=P[0]; vec2 cell=floor(uv*vec2(N*ratio,N)); float off=mod(cell.x+cell.y,2.); float s=fract(uv.x*N*ratio); float t=clamp(progress*2.-off,0.,1.); return s<t?getTo(uv):getFrom(uv);`,
  blinds: `float s=fract(uv.y*P[0]); return abs(s-.5)*2.<progress?getTo(uv):getFrom(uv);`,
  strips: `float N=P[0]; float s=(floor(uv.x*N)+floor((1.-uv.y)*N))/(2.*N); return s<progress*1.08-.04?getTo(uv):getFrom(uv);`,
  randomBars: `float r=rand(vec2(floor(uv.y*P[0]),3.1)); return r<progress?getTo(uv):getFrom(uv);`,
  spiralReveal: `vec2 v=(uv-.5)*vec2(ratio,1.); float a=atan(v.y,v.x)/(2.*PI)+.5; float r=length(v)/length(vec2(ratio,1.)*.5); float s=(fract(a+r*P[0])+floor(r*P[0]))/P[0]; s=clamp(r*.6+fract(a-r*P[0])*.4,0.,1.); return mix(getTo(uv),getFrom(uv),smoothstep(progress-.02,progress,s));`,
  // ---- 3D ----
  cube: `float p=progress; float d=P[0]; bool vert=d>1.5; float sg=(d<.5||d>2.5)?1.:-1.;
    float side=vert?1.:ratio; vec3 cc=vec3(0.,0.,side*.5+P[1]*sin(p*PI)); float a=p*PI*.5*sg;
    mat3 R1=vert?rotX(a):rotY(a); mat3 R2=vert?rotX(a-sg*PI*.5):rotY(a-sg*PI*.5);
    vec3 c1=cc+R1*vec3(0.,0.,-side*.5), c2=cc+R2*vec3(0.,0.,-side*.5);
    vec4 h1=hitQuad(uv,c1,R1,vec2(ratio*.5,.5)), h2=hitQuad(uv,c2,R2,vec2(ratio*.5,.5));
    vec4 col=vec4(0.,0.,0.,1.); float best=1e9;
    if(h1.z>0.&&h1.w<.5&&h1.z<best){ best=h1.z; col=vec4(getFrom(h1.xy).rgb*shade(R1),1.);}
    if(h2.z>0.&&h2.w<.5&&h2.z<best){ best=h2.z; col=vec4(getTo(h2.xy).rgb*shade(R2),1.);} return col;`,
  flip: `float p=progress; float a=p*PI; mat3 R=P[0]<.5?rotY(a):rotX(a); vec3 cc=vec3(0.,0.,.35*sin(p*PI)); vec4 h=hitQuad(uv,cc,R,vec2(ratio*.5,.5)); if(h.z<0.) return vec4(0.,0.,0.,1.);
    if(h.w<.5) return vec4(getFrom(h.xy).rgb*shade(R),1.); vec2 q=P[0]<.5?vec2(1.-h.x,h.y):vec2(h.x,1.-h.y); return vec4(getTo(q).rgb*shade(R),1.);`,
  pageFlip: `float a=-progress*PI; mat3 R=rotY(a); vec3 cc=R*vec3(ratio*.25,0.,0.); vec4 h=hitQuad(uv,cc,R,vec2(ratio*.25,.5));
    vec4 base=uv.x<.5?getFrom(uv):getTo(uv); float sh=1.-.35*sin(progress*PI)*smoothstep(.3,0.,abs(uv.x-.5)); base.rgb*=sh;
    if(h.z>0.){ if(h.w<.5) return vec4(getFrom(vec2(.5+h.x*.5,h.y)).rgb*shade(R),1.); return vec4(getTo(vec2(.5-h.x*.5,h.y)).rgb*shade(R),1.);} return base;`,
  pageTurn: `float a=-progress*PI*.98; mat3 R=rotY(a); vec3 hinge=vec3(-ratio*.5,0.,0.); vec3 cc=hinge+R*vec3(ratio*.5,0.,0.); vec4 h=hitQuad(uv,cc,R,vec2(ratio*.5,.5));
    vec4 base=getTo(uv); base.rgb*=1.-.4*(1.-progress)*smoothstep(.0,1.,1.-uv.x)*sin(progress*PI);
    if(h.z>0.){ if(h.w<.5) return vec4(getFrom(h.xy).rgb*shade(R),1.); return vec4(vec3(.93)*shade(R)*mix(vec3(1.),getFrom(vec2(1.-h.x,h.y)).rgb,.12),1.);} return base;`,
  bookOpen: `float a=progress*PI*.5*1.02; mat3 RL=rotY(-a), RR=rotY(a); vec3 cl=vec3(-ratio*.5,0.,0.)+RL*vec3(ratio*.25,0.,0.), cr=vec3(ratio*.5,0.,0.)+RR*vec3(-ratio*.25,0.,0.);
    vec4 hl=hitQuad(uv,cl,RL,vec2(ratio*.25,.5)), hr=hitQuad(uv,cr,RR,vec2(ratio*.25,.5)); vec4 col=vec4(getTo(uv).rgb*(.6+.4*progress),1.); float best=1e9;
    if(hl.z>0.&&hl.z<best){best=hl.z; col=vec4(getFrom(vec2(hl.x*.5,hl.y)).rgb*shade(RL),1.);} if(hr.z>0.&&hr.z<best){best=hr.z; col=vec4(getFrom(vec2(.5+hr.x*.5,hr.y)).rgb*shade(RR),1.);} return col;`,
  bookClose: `float a=(1.-progress)*PI*.5*1.02; mat3 RL=rotY(-a), RR=rotY(a); vec3 cl=vec3(-ratio*.5,0.,0.)+RL*vec3(ratio*.25,0.,0.), cr=vec3(ratio*.5,0.,0.)+RR*vec3(-ratio*.25,0.,0.);
    vec4 hl=hitQuad(uv,cl,RL,vec2(ratio*.25,.5)), hr=hitQuad(uv,cr,RR,vec2(ratio*.25,.5)); vec4 col=vec4(getFrom(uv).rgb*(1.-.4*progress),1.); float best=1e9;
    if(hl.z>0.&&hl.z<best){best=hl.z; col=vec4(getTo(vec2(hl.x*.5,hl.y)).rgb*shade(RL),1.);} if(hr.z>0.&&hr.z<best){best=hr.z; col=vec4(getTo(vec2(.5+hr.x*.5,hr.y)).rgb*shade(RR),1.);} return col;`,
  galleryRotation: `float R0=ratio*1.1; float a=progress*PI/3.; vec3 cc=vec3(0.,0.,-R0+.6*sin(progress*PI)*0.);
    mat3 R1=rotY(-a), R2=rotY(PI/3.-a); vec3 pc=vec3(0.,0.,R0*.0); vec3 c1=vec3(0.,0.,.9*sin(progress*PI))+R1*vec3(0.,0.,0.)+vec3(-sin(a)*R0,0.,R0-cos(a)*R0)*vec3(1.,1.,1.);
    vec3 c2=vec3(0.,0.,.9*sin(progress*PI))+vec3(sin(PI/3.-a)*R0,0.,R0-cos(PI/3.-a)*R0);
    vec4 h1=hitQuad(uv,c1,R1,vec2(ratio*.5,.5)), h2=hitQuad(uv,c2,R2,vec2(ratio*.5,.5)); vec4 col=vec4(vec3(.05),1.); float best=1e9;
    if(h1.z>0.&&h1.z<best){best=h1.z; col=vec4(getFrom(h1.w>.5?vec2(1.-h1.x,h1.y):h1.xy).rgb*shade(R1),1.);} if(h2.z>0.&&h2.z<best){best=h2.z; col=vec4(getTo(h2.w>.5?vec2(1.-h2.x,h2.y):h2.xy).rgb*shade(R2),1.);} return col;`,
  carousel: `float Rr=ratio*.9; float a=progress*PI*.5; vec3 cen=vec3(0.,0.,Rr+.8*sin(progress*PI)); vec4 col=vec4(vec3(.04),1.); float best=1e9;
    for(int i=-1;i<3;i++){ float fi=float(i); float ang=fi*PI*.5-a; mat3 R=rotY(-ang); vec3 c=cen+R*vec3(0.,0.,-Rr); vec4 h=hitQuad(uv,c,R,vec2(ratio*.5,.5));
      if(h.z>0.&&h.w<.5&&h.z<best){ best=h.z; vec4 tc= i==0?getFrom(h.xy): i==1?getTo(h.xy): vec4(vec3(.18),1.); col=vec4(tc.rgb*shade(R)*(i==0||i==1?1.:.6),1.);} } return col;`,
  zoom3d: `float p=progress; vec3 c1=vec3(0.,0.,-1.6*p*p); vec3 c2=vec3(0.,0.,4.*(1.-p)*(1.-p)); vec4 h2=hitQuad(uv,c2,mat3(1.),vec2(ratio*.5,.5)); vec4 h1=hitQuad(uv,c1,mat3(1.),vec2(ratio*.5,.5));
    vec4 b=h2.z>0.?vec4(getTo(h2.xy).rgb*smoothstep(0.,.5,p),1.):vec4(0.,0.,0.,1.); if(h1.z>0.&&p<.999){ vec4 a=getFrom(h1.xy); return mix(a,b,smoothstep(.25,.75,p)); } return b;`,
  perspectiveSlide: `float p=progress; float sg=P[0]<.5?1.:-1.; float a1=p*PI*.4*sg, a2=(1.-p)*PI*.4*-sg; mat3 R1=rotY(a1), R2=rotY(a2);
    vec3 c1=vec3(-sg*p*ratio*1.1,0.,.6*sin(p*PI)), c2=vec3(sg*(1.-p)*ratio*1.1,0.,.6*sin(p*PI)); vec4 h1=hitQuad(uv,c1,R1,vec2(ratio*.5,.5)), h2=hitQuad(uv,c2,R2,vec2(ratio*.5,.5));
    vec4 col=vec4(vec3(.05),1.); float best=1e9; if(h1.z>0.&&h1.z<best){best=h1.z; col=vec4(getFrom(h1.xy).rgb*shade(R1),1.);} if(h2.z>0.&&h2.z<best){best=h2.z; col=vec4(getTo(h2.xy).rgb*shade(R2),1.);} return col;`,
  sphereRotation: `float p=progress; vec2 s=(uv-.5)*vec2(ratio,1.); float pull=sin(p*PI); float rad=mix(1.4,.48,pull); vec3 O=vec3(0.,0.,-FOC), d=normalize(vec3(s,FOC)); vec3 cc=vec3(0.,0.,.0);
    float b=dot(O-cc,d), c=dot(O-cc,O-cc)-rad*rad, disc=b*b-c; vec4 flatC=p<.5?getFrom(uv):getTo(uv);
    if(disc<0.) return mix(flatC,vec4(0.,0.,0.,1.),smoothstep(0.,.25,pull));
    float t=-b-sqrt(disc); vec3 hp=(O+t*d-cc)/rad; hp=rotY(-p*PI)*hp; float lon=atan(hp.x,-hp.z), lat=asin(clamp(hp.y,-1.,1.));
    bool front=abs(lon)<PI*.5; vec2 q=vec2(front?lon/PI+.5:(lon>0.?lon-PI:lon+PI)/PI+.5, lat/PI+.5); vec4 sc=front?getFrom(q):getTo(q); float l=.5+.5*max(0.,-dot(normalize(O+t*d-cc),d));
    return mix(flatC,vec4(sc.rgb*l,1.),smoothstep(0.,.3,pull));`,
  // ---- cinematic ----
  cinematicFade: `float bar=P[0]*sin(progress*PI); if(uv.y<bar||uv.y>1.-bar) return vec4(0.,0.,0.,1.); vec2 z1=(uv-.5)/(1.+.06*progress)+.5, z2=(uv-.5)/(1.06-.06*progress)+.5;
    vec3 c=progress<.5?fromS(z1).rgb*(1.-progress*2.):toS(z2).rgb*(progress*2.-1.); return vec4(c,1.);`,
  lightSweep: `vec2 v=uv*vec2(ratio,1.); float s=(v.x*.8+v.y*.6)/(ratio*.8+.6); float b=mix(-.25,1.25,progress); vec4 base=s<b?getTo(uv):getFrom(uv);
    float g=exp(-pow((s-b)/max(P[1],.01),2.))*P[0]; return vec4(base.rgb+C[0]*g,1.);`,
  lensFlare: `vec4 base=mix(getFrom(uv),getTo(uv),smoothstep(.35,.65,progress)); float bell=sin(progress*PI); vec2 fc=mix(vec2(-.1,.95),vec2(1.1,.3),progress); vec2 v=(uv-fc)*vec2(ratio,1.);
    float core=.02/(length(v)+.02); float streak=.004/(abs(v.y)+.004)*exp(-abs(v.x)*1.5); vec2 gc=vec2(1.)-fc; float ghost=0.; for(int i=1;i<4;i++){ vec2 gp=mix(fc,gc,float(i)*.3); ghost+=.012/(length((uv-gp)*vec2(ratio,1.))+.03)*.5; }
    vec3 fl=C[0]*(core+streak*.6+ghost)*bell*P[0]*1.4; return vec4(base.rgb+fl,1.);`,
  spotlightReveal: `vec2 c=vec2(P[0],P[1]); float d=length((uv-c)*vec2(ratio,1.))/ratio; float r=progress<.5?mix(1.3,0.,progress*2.):mix(0.,1.3,progress*2.-1.); vec4 img=progress<.5?getFrom(uv):getTo(uv); float m=smoothstep(r,r-.12,d); return vec4(img.rgb*m,1.);`,
  focusBlur: `float r=sin(progress*PI)*P[0]; vec4 a=blurTex(from,uv,r), b=blurTex(to,uv,r); return mix(a,b,smoothstep(.35,.65,progress));`,
  depthBlur: `float p=progress; vec2 u1=(uv-.5)/(1.+.3*p)+.5, u2=(uv-.5)/(.8+.2*p)+.5; vec4 a=blurTex(from,clamp(u1,0.,1.),p*P[0]); vec4 b=inside(u2)?blurTex(to,u2,(1.-p)*P[0]):vec4(0.,0.,0.,1.); return mix(a,b,smoothstep(.2,.8,p));`,
  motionBlur: `vec2 d=dir4(P[0]); vec4 acc=vec4(0.); float bl=P[1]*sin(progress*PI); for(int i=0;i<12;i++){ float f=(float(i)/11.-.5)*bl; vec2 u=uv+d*f; vec2 a=u-d*progress; acc+= inside(a)?getFrom(a):toS(u-d*(progress-1.)); } return acc/12.;`,
  filmDissolve: `float n=rand(floor(uv*res/3.)+floor(progress*24.)); float m=smoothstep(n-.15,n+.15,progress*1.3-.15); vec4 c=mix(getFrom(uv),getTo(uv),m); float g=(rand(uv*res+progress*91.)-.5)*P[0]; float fl=1.+.08*sin(progress*90.)*sin(progress*PI); float vig=1.-.35*length(uv-.5); return vec4((c.rgb+g)*fl*vig,1.);`,
  filmBurn: `float n=fbm(uv*vec2(4.*ratio,4.)+3.)*.7+(1.-uv.x)*.25+uv.y*.1; float th=progress*1.35-.2; float m=smoothstep(th-.02,th+.02,n); float edge=smoothstep(.12,0.,abs(n-th))*(1.-progress*.6); vec4 c=mix(getTo(uv),getFrom(uv),m); return vec4(c.rgb+C[0]*edge*2.+vec3(1.,.9,.6)*pow(edge,4.)*1.5,1.);`,
  cinematicZoom: `float p=progress; vec2 c=vec2(.5); vec4 acc=vec4(0.); float z1=1.+2.*p*p*P[0], z2=1.+.4*(1.-p)*P[0]; for(int i=0;i<10;i++){ float f=float(i)/9.*.06*sin(p*PI)*P[0]; vec2 u1=(uv-c)/(z1+f)+c, u2=(uv-c)/(z2+f)+c; acc+=mix(fromS(u1),toS(u2),smoothstep(.4,.6,p)); } return acc/10.;`,
  panReveal: `vec2 d=dir4(P[0]); vec2 a=uv-d*progress; vec2 b=uv-d*(progress-1.)*.3; if(inside(a)){ float sh=1.; return getFrom(a);} float e=smoothstep(0.,.25,length((a-clamp(a,0.,1.))*vec2(ratio,1.))); return vec4(toS(b).rgb*(.55+.45*e),1.);`,
  cameraPush: `float p=progress; vec2 u1=(uv-.5)/(1.+.8*p)+.5, u2=(uv-.5)/(.6+.4*p)+.5; vec4 a=fromS(u1), b=toS(u2); return mix(a,b,smoothstep(.3,.7,p));`,
  cameraPull: `float p=progress; vec2 u1=(uv-.5)/(1.-.4*p)+.5, u2=(uv-.5)/(1.8-.8*p)+.5; vec4 a=fromS(u1), b=toS(u2); return mix(a,b,smoothstep(.3,.7,p));`,
  cinematicRotation: `float p=progress, A=P[0]*PI/180.; vec2 v=(uv-.5)*vec2(ratio,1.); vec2 v1=rot2(v,-A*p)*(1.+.5*sin(p*PI)), v2=rot2(v,A*(1.-p))*(1.+.5*sin(p*PI)); vec2 u1=v1/vec2(ratio,1.)+.5, u2=v2/vec2(ratio,1.)+.5; float r=sin(p*PI)*10.;
    vec4 a=inside(u1)?blurTex(from,u1,r):vec4(0.,0.,0.,1.), b=inside(u2)?blurTex(to,u2,r):vec4(0.,0.,0.,1.); return mix(a,b,smoothstep(.4,.6,p));`,
  dynamicFocus: `vec2 c=vec2(P[0],P[1]); float d=length((uv-c)*vec2(ratio,1.))/ratio; float p=progress; float r1=clamp(d*1.6-(.6-p*1.4),0.,1.)*P[2]*p*1.5; float r2=clamp(d*1.6-(p*1.6-.6),0.,1.)*P[2]*(1.-p)*1.5; vec4 a=blurTex(from,uv,r1), b=blurTex(to,uv,r2); return mix(a,b,smoothstep(.35,.65,p));`,
  colorFade: `float p=progress; vec4 a=getFrom(uv), b=getTo(uv); float la=dot(a.rgb,vec3(.3,.59,.11)), lb=dot(b.rgb,vec3(.3,.59,.11)); vec3 k=C[0]; vec3 a2=mix(a.rgb,k*la*1.6,clamp(p*2.,0.,1.)), b2=mix(b.rgb,k*lb*1.6,clamp(2.-p*2.,0.,1.)); vec3 c=p<.5?mix(a2,k,smoothstep(.2,.5,p)*.6):mix(k,b2,1.-(1.-smoothstep(.5,.8,p))*.6); return vec4(c,1.);`,
  // ---- Lasteast exclusives ----
  liquidShift: `float p=progress, bell=sin(p*PI); vec2 dir=angDir(P[3]); float s=dot(uv-.5,dir)+.5; float nz=fbm(uv*3.+vec2(p*2.,0.))*(.3+P[8]*.4);
    float w=sin(s*P[1]+p*10.)+P[2]*sin(length((uv-.5)*vec2(ratio,1.))*P[1]*1.6-p*14.); vec2 n=vec2(fbm(uv*4.+p*3.)-.5,fbm(uv*4.-p*3.+7.)-.5);
    vec2 disp=(dir*w*.6+n*1.2)*P[0]*bell; float front=p*(1.+2.*P[4]+.6)-P[4]-.3; float m=smoothstep(front-P[4],front+P[4],s+nz*.6-.3);
    vec4 a=blurTex(from,clamp(uv+disp,0.,1.),P[6]*bell*8.), b=blurTex(to,clamp(uv-disp*(1.-p),0.,1.),P[6]*bell*8.);
    vec4 c=mix(b,a,m); float edge=smoothstep(.5,0.,abs(m-.5))*P[7]; vec3 mixc=mix(a.rgb,b.rgb,.5); c.rgb=mix(c.rgb,mixc,P[5]*edge); c.rgb+=edge*.12*bell; return vec4(c.rgb,1.);`,
  infinityZoom: `float p=P[6]>.5?1.-progress:progress; vec2 f=vec2(P[1],1.-P[2]); float Z=max(P[0],1.5); float L=log(Z); float rot=P[3]*PI/180.*p; vec4 acc=vec4(0.);
    float persp=P[5]; for(int k=0;k<8;k++){ float fk=float(k)/7.; float pp=clamp(p+(fk-.5)*.05*P[4]*sin(progress*PI),0.,1.); float sc=exp(pp*L);
      vec2 v=(uv-f)*vec2(ratio,1.); float r=length(v); v=rot2(v,-rot*(1.+persp*r)); v/=vec2(ratio,1.);
      vec2 uf=f+v/sc, ut=f+v/(sc/Z); vec4 c;
      vec2 q=abs(ut-.5); float edge=smoothstep(.5,.47,max(q.x*1.,q.y));
      if(inside(ut)){ c=mix(fromS(uf),getTo(ut),edge); if(P[7]>.5){ vec2 ut2=f+v/(sc/(Z*Z)); if(inside(ut2)) c=mix(c,getFrom(ut2),smoothstep(.5,.47,max(abs(ut2.x-.5),abs(ut2.y-.5)))*(1.-smoothstep(.6,1.,pp))); } }
      else c=fromS(uf);
      acc+=c; } vec4 c=acc/8.; float vig=1.-.4*sin(progress*PI)*length(uv-f); return vec4(c.rgb*vig,1.);`,
  portal: `vec2 c=vec2(P[1],1.-P[2]); vec2 v=(uv-c)*vec2(ratio,1.); float ro=P[4]*PI/180.*progress; vec2 vr=rot2(v,ro); float sh=P[0]; float d;
    if(sh<.5) d=length(vr); else if(sh<1.5) d=(abs(vr.x)+abs(vr.y))*.75; else if(sh<2.5) d=max(abs(vr.x),abs(vr.y))*1.05; else if(sh<3.5){ float a=atan(vr.y,vr.x); d=length(vr)/(.72+.28*cos(5.*a)); } else { vec2 q=abs(vr); d=max(q.x*.866+q.y*.5,q.y); }
    float maxR=length(vec2(max(c.x,1.-c.x)*ratio,max(c.y,1.-c.y)))*1.6/P[3]; float po=pow(clamp(progress,0.,1.),1./P[9]); float r=maxR*P[3]*smoothstep(0.,1.,po); r=max(r,0.);
    float t=clamp(1.-d/max(r,1e-4),0.,1.); vec2 swirl=rot2(v,(1.-progress)*P[8]*2.5*exp(-d*3.)); float bd=exp(-abs(d-r)*14.)*P[8]*.08*sin(progress*PI);
    vec2 uf=c+(swirl*(1.+bd))/vec2(ratio,1.); vec4 outside=fromS(uf); float z=1.+P[7]*(1.-progress)*(1.-t*.5); vec2 ut=c+rot2(v,-ro*.5*(1.-progress))/vec2(ratio,1.)/z; vec4 ins=toS(ut);
    float inMask=smoothstep(r+.004,r-.004,d); vec4 col=mix(outside,ins,inMask); float ring=exp(-pow((d-r)/max(P[6]+.004,.001),2.))*P[5]; float fl=.75+.25*noise(vec2(atan(v.y,v.x)*6.,progress*20.));
    col.rgb+=C[0]*ring*fl*(1.-smoothstep(.85,1.,progress))*1.5+C[0]*exp(-abs(d-r)*30.)*P[5]*.25*(1.-progress); return vec4(col.rgb,1.);`,
  prismReveal: `float p=progress, bell=sin(p*PI); vec2 dir=angDir(P[2]); float s=dot(uv-.5,dir)+.5; float w=P[0]*bell*P[1]; float m=smoothstep(p*1.4-.3,p*1.4-.1,s);
    vec3 a=vec3(getFrom(clamp(uv+dir*w,0.,1.)).r,getFrom(uv).g,getFrom(clamp(uv-dir*w,0.,1.)).b); vec3 b=vec3(getTo(clamp(uv-dir*w,0.,1.)).r,getTo(uv).g,getTo(clamp(uv+dir*w,0.,1.)).b);
    if(P[4]>0.){ a=mix(a,blurTex(from,uv,P[4]*bell*10.).rgb,.4*P[4]); b=mix(b,blurTex(to,uv,P[4]*bell*10.).rgb,.4*P[4]); }
    vec3 c=mix(b,a,m); float band=exp(-pow((s-(p*1.4-.2))*7.,2.)); c+=hue(fract(s*2.5+p))*band*P[3]*.6*bell+hue(fract(uv.y*1.5-p))*.08*bell*P[1]; return vec4(c,1.);`,
  waveDimension: `vec2 dir=angDir(P[0]); float s=dot(uv-.5,dir)+.5; float front=progress*1.6-.3; float env=exp(-pow((s-front)*3.,2.)); float ph=(s-front)*P[2]*2.*PI;
    float h=sin(ph)*P[1]*env; float dh=cos(ph)*env*P[1]*P[2]*6.; vec2 nrm=dir*dh*P[4]; vec2 u=clamp(uv+nrm*.5+dir*h,0.,1.); vec4 c=s<front?getTo(u):getFrom(u); float l=1.+dh*P[3]*1.4; return vec4(c.rgb*l+vec3(.08)*max(dh,0.)*P[3],1.);`,
  neonTrace: `vec2 px=1.5*P[1]/res; float p=progress;
    float ef=0., et=0.; for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++){ if(i==0&&j==0) continue; vec2 o=vec2(float(i),float(j))*px; float w=(i==0||j==0)?2.:1.; ef+=w*length(getFrom(uv+o).rgb-getFrom(uv).rgb); et+=w*length(getTo(uv+o).rgb-getTo(uv).rgb); }
    ef=smoothstep(.15,.9,ef); et=smoothstep(.15,.9,et);
    vec2 v=(uv-.5)*vec2(ratio,1.); float ord=P[2]<.5?(atan(v.y,v.x)/(2.*PI)+.5):P[2]<1.5?uv.x:length(v)/length(vec2(ratio,1.)*.5);
    float trace=smoothstep(ord-.02,ord+.02,p*2.2); float gl=P[0]; float dk=P[3];
    vec3 base; float neon;
    if(p<.5){ float f=smoothstep(0.,.45,p); base=getFrom(uv).rgb*(1.-dk*f); neon=ef*trace; }
    else { float f=smoothstep(.55,1.,p); base=mix(getFrom(uv).rgb*(1.-dk),getTo(uv).rgb,f); neon=mix(ef,et,smoothstep(.5,.7,p))*(1.-f*.9); }
    vec2 bq=abs(uv-.5)*2.; float border=smoothstep(.985,1.,max(bq.x,bq.y))*trace;
    return vec4(base+C[0]*(neon+border)*gl*1.4+C[0]*neon*neon*gl*.5,1.);`,
  foldSpace: `float N=P[0]; bool vert=P[2]>.5; float x=vert?1.-uv.y:uv.x; float y=vert?uv.x:uv.y; float W=1.-progress; vec3 col;
    if(x<W){ float lx=x/max(W,1e-4); float idx=floor(lx*N); float f=fract(lx*N); float sg=mod(idx,2.)<.5?1.:-1.; float ang=acos(clamp(W,0.,1.))*P[1];
      float yy=.5+(y-.5)*(1.+sg*(f-.5)*sin(ang)*P[3]*2.); vec2 src=vert?vec2(yy,1.-lx):vec2(lx,yy); col=(inside(src)?getFrom(src).rgb:vec3(0.))*(1.-.5*sin(ang)*(sg>0.?f:1.-f));
    } else { float lx=(x-W)/max(1.-W,1e-4); float idx=floor(lx*N); float f=fract(lx*N); float sg=mod(idx,2.)<.5?-1.:1.; float ang=acos(clamp(1.-W,0.,1.))*P[1];
      float yy=.5+(y-.5)*(1.+sg*(f-.5)*sin(ang)*P[3]*2.); vec2 src=vert?vec2(yy,1.-lx):vec2(lx,yy); col=(inside(src)?getTo(src).rgb:vec3(0.))*(1.-.5*sin(ang)*(sg>0.?f:1.-f)); }
    return vec4(col,1.);`,
  aurora: `float p=progress, bell=sin(p*PI); vec2 dir=angDir(P[4]); float s=dot(uv-.5,dir)+.5; float t=p*P[1]*3.;
    float n=fbm(vec2(uv.x*3.+t,uv.y*.6))*.6; float m=smoothstep(p*1.5-.35,p*1.5-.15,s+n-.3); vec4 base=mix(getTo(uv),getFrom(uv),m);
    vec3 au=vec3(0.); for(int i=0;i<3;i++){ float fi=float(i); float y0=.35+fi*.15+.18*(fbm(vec2(uv.x*2.+t+fi*3.,fi))-.5); float band=exp(-pow((uv.y-y0)*7.,2.))*(.6+.4*noise(vec2(uv.x*14.+t*2.,fi)));
      vec3 cc=i==0?C[0]:i==1?C[1]:C[2]; au+=cc*band; } au*=P[0]*bell*P[2]; return vec4(mix(base.rgb,base.rgb+au,P[3]),1.);`,
  orbit: `float p=progress; float sg=P[0]<.5?1.:-1.; float Rr=P[1]*ratio; float a1=sg*p*PI*.42, a2=sg*(p-1.)*PI*.42; float tl=P[2]*PI/180.;
    vec3 cen=vec3(0.,0.,Rr); mat3 R1=rotZ(tl*sin(p*PI)*sg)*rotY(a1), R2=rotZ(-tl*sin(p*PI)*sg)*rotY(a2); vec3 c1=cen+rotY(a1)*vec3(0.,0.,-Rr), c2=cen+rotY(a2)*vec3(0.,0.,-Rr);
    c1.z+=P[3]*.6*sin(p*PI); c2.z+=P[3]*.6*sin(p*PI); vec4 h1=hitQuad(uv,c1,R1,vec2(ratio*.5,.5)), h2=hitQuad(uv,c2,R2,vec2(ratio*.5,.5)); vec4 col=vec4(vec3(.02),1.); float best=1e9;
    if(h1.z>0.&&h1.z<best){best=h1.z; col=vec4(getFrom(h1.w>.5?vec2(1.-h1.x,h1.y):h1.xy).rgb*shade(R1),1.);} if(h2.z>0.&&h2.z<best){best=h2.z; col=vec4(getTo(h2.w>.5?vec2(1.-h2.x,h2.y):h2.xy).rgb*shade(R2),1.);}
    float stars=step(.997,rand(floor(uv*res/2.)))*.8; if(best>1e8) col.rgb+=stars; return col;`,
  timeWarp: `float p=progress, bell=sin(p*PI)*P[3]; vec2 c=vec2(.5); vec2 v=(uv-c)*vec2(ratio,1.); float r=length(v); vec4 acc=vec4(0.);
    for(int i=0;i<12;i++){ float fi=float(i)/11.; float k=bell*P[0]*(.15+fi*P[1]*.35); vec2 u;
      if(P[2]<.5){ float wr=r*(1.-k*(1.-r))+sin(r*P[4]*6.-p*20.)*.01*bell; u=c+normalize(v+1e-5)*wr/vec2(ratio,1.); }
      else if(P[2]<1.5){ u=vec2(c.x+(uv.x-c.x)*(1.-k*.8)+sin(uv.y*P[4]*3.-p*12.)*.01*bell, uv.y); }
      else { u=vec2(uv.x, c.y+(uv.y-c.y)*(1.-k*.8)+sin(uv.x*P[4]*3.-p*12.)*.01*bell); }
      acc+=mix(fromS(u),toS(u),smoothstep(.4,.6,p)); }
    vec4 col=acc/12.; col.rgb+=vec3(.25,.35,.6)*bell*.15*sin(r*P[4]*8.-p*30.); return vec4(col.rgb,1.);`,
  dreamscape: `float p=progress, bell=sin(p*PI); float cl=fbm(uv*vec2(ratio,1.)*P[1]+vec2(p*1.5,p*.5)); vec2 d=(vec2(fbm(uv*3.+p),fbm(uv*3.-p+5.))-.5)*P[2]*.15*bell;
    vec4 a=blurTex(from,clamp(uv+d,0.,1.),P[0]*bell), b=blurTex(to,clamp(uv-d,0.,1.),P[0]*bell); float m=smoothstep(p*1.4-.45,p*1.4-.05,cl+.2); vec4 c=mix(a,b,1.-m);
    float cloud=smoothstep(.35,.85,cl)*bell; c.rgb=mix(c.rgb,C[0],cloud*.55); c.rgb+=vec3(1.)*cloud*P[3]*.35; c.rgb=mix(c.rgb,c.rgb*C[0]*1.2,.2*bell); return vec4(c.rgb,1.);`,
  holographicShift: `float p=progress, bell=sin(p*PI); float L=P[0]; float row=floor(uv.y*L*4.); float g=(rand(vec2(row,floor(p*30.)))-.5)*.08*P[2]*bell*step(.6,rand(vec2(row,floor(p*15.)+3.)));
    vec2 u=vec2(uv.x+g,uv.y); float band=rand(vec2(floor(uv.y*L),2.)); float sw=step(band,p*1.15-.05); float sh=.006*bell*(1.+P[2]);
    vec3 a=vec3(fromS(u+vec2(sh,0.)).r,fromS(u).g,fromS(u-vec2(sh,0.)).b), b=vec3(toS(u-vec2(sh,0.)).r,toS(u).g,toS(u+vec2(sh,0.)).b); vec3 c=mix(a,b,sw);
    float scan=.5+.5*sin(uv.y*res.y*.7+p*40.); float inter=.5+.5*sin((uv.x+uv.y)*80.*P[1]+p*25.); vec3 holo=mix(C[0],C[1],inter);
    c=mix(c,c*.7+holo*.6,bell*(1.-P[3])*.6); c+=holo*scan*.08*bell*P[1]; return vec4(c,1.);`,
  magneticWipe: `vec2 f=vec2(P[0],1.-P[1]); vec2 dir=angDir(P[3]); float s=dot(uv-.5,dir)+.5; vec2 v=(uv-f)*vec2(ratio,1.); float bend=P[2]*exp(-dot(v,v)*6.)*(P[5]<.5?1.:-1.);
    float front=progress*(1.+P[2]*2.+.1)-P[2]-.05; float sv=s-bend*.5; float m=smoothstep(front-.006,front+.006,sv); vec4 c=mix(getTo(uv),getFrom(uv),m); float edge=exp(-abs(sv-front)*90.)*P[4];
    return vec4(c.rgb+C[0]*edge*1.3+C[0]*exp(-abs(sv-front)*15.)*P[4]*.2,1.);`,
  kaleidoscope: `float p=progress, k=sin(p*PI)*P[3]; vec2 v=(uv-.5)*vec2(ratio,1.); float r=length(v)/P[2]; float a=atan(v.y,v.x)+P[1]*PI/180.*p; float seg=2.*PI/P[0]; a=mod(a,seg); a=abs(a-seg*.5);
    vec2 kv=vec2(cos(a),sin(a))*r; vec2 ku=kv/vec2(ratio,1.)+.5; ku=abs(mod(ku,2.)-1.); vec2 u=mix(uv,ku,clamp(k,0.,1.)); vec4 c=mix(getFrom(u),getTo(u),smoothstep(.35,.65,p)); return c;`,
  dimensionBreak: `float N=P[0]; vec2 sc=vec2(N*ratio,N); vec2 ori=P[2]<.5?vec2(.5):P[2]<1.5?vec2(0.,.5):P[2]<2.5?vec2(1.,.5):P[2]<3.5?vec2(.5,1.):vec2(.5,0.);
    vec2 g=uv*sc; vec2 gi=floor(g); float bestS=-1.; vec4 col=vec4(0.); bool hit=false;
    for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 cell=gi+vec2(float(i),float(j)); vec2 cp=cell+vec2(rand(cell),rand(cell+7.1));
      float dl=length((cp/sc-ori)*vec2(ratio,1.))/ratio*.8; float t=clamp((progress*1.6-dl)/.7,0.,1.); t=t*t;
      float s=1.+t*P[1]*(1.5+rand(cell+3.)*1.5); vec2 off=(cp/sc-ori)*t*.6*P[1]+vec2(rand(cell+1.)-.5,rand(cell+2.)-.5)*t*.4; float rt=(rand(cell+5.)-.5)*t*2.;
      vec2 local=rot2(uv-cp/sc-off,-rt)/s; vec2 src=cp/sc+local; vec2 gs=src*sc; vec2 gsi=floor(gs); float md=1e9; vec2 owner=vec2(0.);
      for(int b=-1;b<=1;b++) for(int a=-1;a<=1;a++){ vec2 c2=gsi+vec2(float(a),float(b)); vec2 p2=c2+vec2(rand(c2),rand(c2+7.1)); float d=length(gs-p2); if(d<md){md=d; owner=c2;} }
      if(owner==cell&&inside(src)&&s>bestS&&t<.999){ bestS=s; float lit=1.+(rand(cell+9.)-.4)*t*P[3]; vec4 fc=getFrom(src); col=vec4(fc.rgb*lit*(1.-t*.3),1.-smoothstep(.75,1.,t)); hit=true; } }
    vec4 back=getTo(uv); vec2 vv=(uv-ori)*vec2(ratio,1.); float glow=exp(-length(vv)*2.5)*sin(progress*PI)*P[3]; back.rgb+=C[0]*glow*.6;
    if(hit) return vec4(mix(back.rgb,col.rgb,col.a),1.); return back;`,
};

// ---------------- WebGL runner ----------------
class GLRunner {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
    this.progs = {};
    if (!this.gl) return;
    const gl = this.gl;
    this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.tex = [gl.createTexture(), gl.createTexture()];
    for (const t of this.tex) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
  }
  get ok() { return !!this.gl; }
  program(name) {
    if (this.progs[name]) return this.progs[name];
    const gl = this.gl, vs = gl.createShader(gl.VERTEX_SHADER), fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vs, 'attribute vec2 p; varying vec2 vUv; void main(){ vUv=p*.5+.5; gl_Position=vec4(p,0.,1.); }'); gl.compileShader(vs);
    gl.shaderSource(fs, HEAD + `vec4 transition(vec2 uv){ ${G[name]} }\nvoid main(){ gl_FragColor = transition(vUv); }`); gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { console.error('Shader', name, gl.getShaderInfoLog(fs)); this.progs[name] = null; return null; }
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    const u = (n) => gl.getUniformLocation(pr, n);
    this.progs[name] = { pr, loc: { from: u('from'), to: u('to'), progress: u('progress'), ratio: u('ratio'), res: u('res'), P: u('P'), C: u('C') }, attr: gl.getAttribLocation(pr, 'p') };
    return this.progs[name];
  }
  setSources(a, b, w, h) {
    const gl = this.gl; this.canvas.width = w; this.canvas.height = h;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    [a, b].forEach((src, i) => { gl.bindTexture(gl.TEXTURE_2D, this.tex[i]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); });
  }
  draw(name, p, Pv, Cv) {
    const gl = this.gl, pg = this.program(name); if (!pg) return false;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.useProgram(pg.pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.enableVertexAttribArray(pg.attr); gl.vertexAttribPointer(pg.attr, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[0]); gl.uniform1i(pg.loc.from, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex[1]); gl.uniform1i(pg.loc.to, 1);
    gl.uniform1f(pg.loc.progress, p); gl.uniform1f(pg.loc.ratio, this.canvas.width / this.canvas.height); gl.uniform2f(pg.loc.res, this.canvas.width, this.canvas.height);
    gl.uniform1fv(pg.loc.P, Pv); gl.uniform3fv(pg.loc.C, Cv);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); return true;
  }
}
let _gl = null; export const glRunner = () => (_gl || (_gl = new GLRunner()));
export function compileAll() { const g = glRunner(); if (!g.ok) return { ok: false }; const bad = []; for (const k of Object.keys(G)) if (!g.program(k)) bad.push(k); return { ok: true, bad }; }

function packParams(t, params) {
  const Pv = new Float32Array(12), Cv = new Float32Array(9); let pi = 0, ci = 0;
  const all = [...(t.fixed ? Object.keys(t.fixed).map(k => ({ key: k, type: 'range' })) : []), ...t.params];
  for (const p of all) {
    const v = params[p.key] ?? p.def ?? (t.fixed || {})[p.key];
    if (p.type === 'col') { const c = parseColor(v); Cv[ci * 3] = c[0] / 255; Cv[ci * 3 + 1] = c[1] / 255; Cv[ci * 3 + 2] = c[2] / 255; ci++; }
    else if (pi < 12) Pv[pi++] = +v || 0;
  }
  return { Pv, Cv };
}

// ---------------- canvas engines ----------------
function scaledCtx(ctx, scale, ox = 0, oy = 0) { ctx.setTransform(scale, 0, 0, scale, ox, oy); }

// --- Morph ---
const morphable = (o) => o.type !== 'video' && o.type !== 'audio';
function textSim(a, b) {
  a = (a || '').toLowerCase().trim(); b = (b || '').toLowerCase().trim(); if (!a && !b) return 1; if (!a || !b) return 0; if (a === b) return 1;
  const A = new Set(a.split(/\s+/)), B = new Set(b.split(/\s+/)); let i = 0; for (const x of A) if (B.has(x)) i++; return i / Math.max(A.size, B.size);
}
export function matchObjects(fromSlide, toSlide, doc, mode = 0, manual = {}) {
  const pairs = [], usedA = new Set(), usedB = new Set();
  const A = fromSlide.objects.filter(morphable), B = toSlide.objects.filter(morphable);
  const pair = (a, b, why, score = 1) => { pairs.push({ a, b, why, score }); usedA.add(a.id); usedB.add(b.id); };
  for (const [ai, bi] of Object.entries(manual || {})) { const a = A.find(o => o.id === ai), b = B.find(o => o.id === bi); if (a && b && !usedA.has(a.id) && !usedB.has(b.id)) pair(a, b, 'manual'); }
  if (mode < 2) for (const a of A) { if (usedA.has(a.id) || !a.name || !a.name.startsWith('!!')) continue; const b = B.find(o => !usedB.has(o.id) && o.name === a.name); if (b) pair(a, b, 'name'); }
  for (const a of A) { if (usedA.has(a.id)) continue; const b = B.find(o => !usedB.has(o.id) && o.mid && o.mid === a.mid); if (b) pair(a, b, 'id'); }
  if (mode < 2) for (const a of A) { if (usedA.has(a.id) || !a.name || /^(Decoration|Picture|Text|Shape|Image)/.test(a.name)) continue; const b = B.find(o => !usedB.has(o.id) && o.name === a.name && o.type === a.type); if (b) pair(a, b, 'name'); }
  if (mode === 0) {
    const diag = Math.hypot(doc.size.w, doc.size.h), cand = [];
    for (const a of A) { if (usedA.has(a.id)) continue; for (const b of B) { if (usedB.has(b.id) || a.type !== b.type) continue;
      const ts = textSim(a.text, b.text), shp = a.type === 'shape' ? (a.shape === b.shape ? 1 : .4) : 1;
      const img = a.type === 'image' ? (a.asset === b.asset ? 1 : 0) : 1;
      const dist = 1 - Math.min(1, Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2) / diag);
      const sz = Math.min(a.w * a.h, b.w * b.h) / Math.max(a.w * a.h, b.w * b.h, 1);
      const ph = a.ph && a.ph === b.ph ? .15 : 0;
      const sc = (a.type === 'text' ? .45 * ts + .2 * dist + .15 * sz + ph + .2 * (a.size === b.size) : a.type === 'image' ? .6 * img + .2 * dist + .2 * sz : .35 * shp + .3 * dist + .2 * sz + .15 * (JSON.stringify(a.fill) === JSON.stringify(b.fill)));
      cand.push({ a, b, sc }); } }
    cand.sort((x, y) => y.sc - x.sc);
    for (const c of cand) if (c.sc > .55 && !usedA.has(c.a.id) && !usedB.has(c.b.id)) pair(c.a, c.b, 'smart', c.sc);
  }
  return { pairs, onlyA: A.filter(o => !usedA.has(o.id)), onlyB: B.filter(o => !usedB.has(o.id)) };
}
export function suggestMatches(fromSlide, toSlide, doc) { return matchObjects(fromSlide, toSlide, doc, 0).pairs; }

function lerpFill(ctx, fa, fb, theme, w, h, t) {
  const r = (c) => resolveColor(c, theme);
  if (typeof fa === 'string' && typeof fb === 'string') { if (fa === 'none' && fb === 'none') return null; return lerpColor(fa === 'none' ? rgba([...parseColor(r(fb)).slice(0, 3), 0]) : r(fa), fb === 'none' ? rgba([...parseColor(r(fa)).slice(0, 3), 0]) : r(fb), t); }
  const ga = typeof fa === 'string' ? { type: fb?.type || 'linear', c1: fa, c2: fa, angle: fb?.angle } : fa, gb = typeof fb === 'string' ? { type: fa?.type || 'linear', c1: fb, c2: fb, angle: fa?.angle } : fb;
  if (!ga || !gb || ga.type === 'texture' || gb.type === 'texture') return makeFill(ctx, t < .5 ? fa : fb, theme, w, h);
  return makeFill(ctx, { type: t < .5 ? ga.type : gb.type, c1: lerpColor(r(ga.c1), r(gb.c1), t), c2: lerpColor(r(ga.c2), r(gb.c2), t), angle: lerp(ga.angle ?? 90, gb.angle ?? 90, t) }, theme, w, h);
}
function lcsWords(a, b) {
  const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i].t.toLowerCase() === b[j].t.toLowerCase() ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = []; let i = 0, j = 0; while (i < n && j < m) { if (a[i].t.toLowerCase() === b[j].t.toLowerCase()) { pairs.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return pairs;
}
function wordBoxes(ctx, o, theme, docDir, byChar) {
  const lay = layoutText(ctx, o, theme, o.w, o.h, docDir), top = textTop(o, lay, o.h), out = [];
  ctx.save(); ctx.font = fontStr(o, theme, lay.size);
  for (const L of lay.lines) {
    const left = lineLeft(L, o, lay);
    if (L.dir === 'rtl') { if (L.text) out.push({ t: L.text, x: o.x + left, y: o.y + top + L.y, size: lay.size, dir: 'rtl' }); continue; }
    if (byChar) { let x = 0; for (const ch of L.text) { const w = ctx.measureText(ch).width; if (ch.trim()) out.push({ t: ch, x: o.x + left + x, y: o.y + top + L.y, size: lay.size, dir: 'ltr' }); x += w; } }
    else for (const wd of L.words) out.push({ t: wd.t, x: o.x + left + wd.x * (lay.size / lay.size), y: o.y + top + L.y, size: lay.size, dir: 'ltr' });
  }
  ctx.restore(); return { boxes: out, lay };
}

function morphEngine(env) {
  const { doc, from, to, params, mode } = env, theme = doc.theme, size = doc.size;
  const m = matchObjects(from.slide, to.slide, doc, +params.matching || 0, params.map || to.slide.transition?.morphMap || {});
  const docDir = doc.lang === 'he' || doc.lang === 'ar' ? 'rtl' : 'ltr';
  const mctx = document.createElement('canvas').getContext('2d');
  const items = [];
  const idxA = new Map(from.slide.objects.map((o, i) => [o.id, i])), idxB = new Map(to.slide.objects.map((o, i) => [o.id, i]));
  const tm = +params.textMode;
  for (const { a, b } of m.pairs) {
    const it = { kind: 'pair', a, b, z0: idxA.get(a.id), z1: idxB.get(b.id) };
    const sa = a.type === 'shape' || a.type === 'text', diffShape = sa && (a.shape !== b.shape || (a.radius !== b.radius && (a.shape === 'roundRect' || b.shape === 'roundRect')));
    if (diffShape && a.shape !== 'line' && b.shape !== 'line') { it.ptsA = resample(shapePoints(a.shape, 1000, 1000, a.radius * 1000 / Math.min(a.w, a.h)), 160); it.ptsB = resample(shapePoints(b.shape, 1000, 1000, b.radius * 1000 / Math.min(b.w, b.h)), 160); }
    if ((a.text || '') !== (b.text || '') && (sa)) {
      const smart = tm === 4, mode2 = tm === 0 ? 'char' : tm === 1 ? 'word' : tm === 2 ? 'object' : tm === 3 ? 'fade' : 'word';
      it.textMode = smart ? ((a.text || '').length < 60 && (b.text || '').length < 60 ? 'char' : 'word') : mode2;
      if (it.textMode === 'char' || it.textMode === 'word') {
        const WA = wordBoxes(mctx, a, theme, docDir, it.textMode === 'char'), WB = wordBoxes(mctx, b, theme, docDir, it.textMode === 'char');
        it.wa = WA.boxes; it.wb = WB.boxes; it.wpairs = lcsWords(it.wa, it.wb);
      }
    }
    if (a.type === 'image' && a.asset !== b.asset) it.crossImage = true;
    items.push(it);
  }
  for (const a of m.onlyA) items.push({ kind: 'out', a, z0: idxA.get(a.id), z1: -1 });
  for (const b of m.onlyB) items.push({ kind: 'in', b, z0: 1e3, z1: idxB.get(b.id) });
  const continuous = mode === 'continuous';
  const unm = +params.unmatched || 0;
  const r = rng(7);
  for (const it of items) it.fly = [(r() - .5) * size.w * .6, (r() - .5) * size.h * .6];

  const drawWords = (ctx, it, t, color) => {
    const done = new Set(), doneB = new Set();
    ctx.save(); ctx.textBaseline = 'alphabetic';
    const ca = resolveColor(it.a.color || '@text', theme), cb = resolveColor(it.b.color || '@text', theme);
    for (const [i, j] of it.wpairs) {
      const A = it.wa[i], B = it.wb[j]; done.add(i); doneB.add(j);
      const sz = lerp(A.size, B.size, t), x = lerp(A.x, B.x, t), y = lerp(A.y, B.y, t);
      ctx.font = fontStr(t < .5 ? it.a : it.b, theme, sz); ctx.fillStyle = lerpColor(ca, cb, t); ctx.direction = B.dir; ctx.textAlign = B.dir === 'rtl' ? 'left' : 'left';
      ctx.fillText(B.t, x, y + sz * 1.02);
    }
    it.wa.forEach((A, i) => { if (done.has(i)) return; ctx.globalAlpha = 1 - Ease.easeInOut(clamp(t / .6, 0, 1)); ctx.font = fontStr(it.a, theme, A.size); ctx.fillStyle = ca; ctx.direction = A.dir; ctx.textAlign = 'left'; ctx.fillText(A.t, A.x, A.y + A.size * 1.02); });
    it.wb.forEach((B, j) => { if (doneB.has(j)) return; ctx.globalAlpha = Ease.easeInOut(clamp((t - .4) / .6, 0, 1)); ctx.font = fontStr(it.b, theme, B.size); ctx.fillStyle = cb; ctx.direction = B.dir; ctx.textAlign = 'left'; ctx.fillText(B.t, B.x, B.y + B.size * 1.02); });
    ctx.restore();
  };

  return {
    draw(ctx, p, scale, ox, oy) {
      const t = continuous ? p : p;
      ctx.save(); scaledCtx(ctx, scale, ox, oy);
      ctx.beginPath(); ctx.rect(0, 0, size.w, size.h); ctx.clip();
      drawBackground(ctx, doc, from.slide, size.w, size.h);
      ctx.globalAlpha = t; drawBackground(ctx, doc, to.slide, size.w, size.h); ctx.globalAlpha = 1;
      // camera variants
      const bell = Math.sin(t * Math.PI), cx = size.w / 2, cy = size.h / 2;
      ctx.translate(cx, cy);
      if (mode === 'zoom') ctx.scale(1 + .18 * bell, 1 + .18 * bell);
      if (mode === 'pan') ctx.translate(-size.w * .05 * bell, 0);
      if (mode === 'rotate') ctx.rotate(bell * .05);
      if (mode === 'perspective') ctx.transform(1, bell * .04, -bell * .08, 1, 0, 0);
      ctx.translate(-cx, -cy);
      const sorted = items.slice().sort((x, y) => lerp(x.z0 === 1e3 ? x.z1 : x.z0, x.z1 < 0 ? x.z0 : x.z1, t) - lerp(y.z0 === 1e3 ? y.z1 : y.z0, y.z1 < 0 ? y.z0 : y.z1, t));
      for (const it of sorted) {
        if (it.kind === 'out') {
          const q = continuous ? t : clamp(t * 1.8, 0, 1), ov = { alpha: 1 - q };
          if (unm === 1 || mode === 'scale' || mode === 'objects') ov.scale = 1 - q * .4;
          if (unm === 2) { ov.dx = it.fly[0] * q; ov.dy = it.fly[1] * q; }
          if (mode === 'rotate') ov.drot = q * 45;
          drawObject(ctx, it.a, doc, { docDir, present: true }, ov); continue;
        }
        if (it.kind === 'in') {
          const q = continuous ? t : clamp(t * 1.8 - .8, 0, 1), ov = { alpha: q };
          if (unm === 1 || mode === 'scale' || mode === 'objects') ov.scale = .6 + q * .4;
          if (unm === 2) { ov.dx = it.fly[0] * (1 - q); ov.dy = it.fly[1] * (1 - q); }
          if (mode === 'rotate') ov.drot = (1 - q) * -45;
          drawObject(ctx, it.b, doc, { docDir, present: true }, ov); continue;
        }
        const { a, b } = it, w = lerp(a.w, b.w, t), h = lerp(a.h, b.h, t);
        let drot = (b.rot || 0) - (a.rot || 0); if (drot > 180) drot -= 360; if (drot < -180) drot += 360;
        const ov = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w, h, rot: (a.rot || 0) + drot * t, opacity: lerp(a.opacity ?? 1, b.opacity ?? 1, t) };
        if (mode === 'group' && a.group) ov.scale = 1 + .06 * bell;
        if (a.type === 'shape' || a.type === 'text') {
          ov.fill = lerpFill(ctx, a.fill, b.fill, theme, w, h, t);
          if (a.stroke !== 'none' || b.stroke !== 'none') ov.stroke = lerpColor(resolveColor(a.stroke !== 'none' ? a.stroke : b.stroke, theme), resolveColor(b.stroke !== 'none' ? b.stroke : a.stroke, theme), t);
          if (it.ptsA) ov.pts = it.ptsA.map((pa, i) => [lerp(pa[0], it.ptsB[i][0], t) / 1000 * w, lerp(pa[1], it.ptsB[i][1], t) / 1000 * h]);
          else if (a.shape === 'roundRect') ov.pts = shapePoints('roundRect', w, h, lerp(a.radius, b.radius, t));
          const base = t < .5 ? a : b;
          if (it.wpairs) { ov.hideText = true; drawObject(ctx, { ...base, shape: b.shape, strokeW: lerp(a.strokeW || 0, b.strokeW || 0, t) }, doc, { docDir, present: true }, ov); drawWords(ctx, it, t); continue; }
          if ((a.text || '') !== (b.text || '')) {
            ov.textOverride = (c, W, H) => { c.save(); c.globalAlpha *= 1 - t; drawTextBlockScaled(c, a, theme, W, H, docDir); c.restore(); c.save(); c.globalAlpha *= t; drawTextBlockScaled(c, b, theme, W, H, docDir); c.restore(); };
          } else { ov.color = lerpColor(resolveColor(a.color || '@text', theme), resolveColor(b.color || '@text', theme), t); ov.size = lerp(a.size, b.size, t); }
          drawObject(ctx, { ...base, shape: b.shape, strokeW: lerp(a.strokeW || 0, b.strokeW || 0, t), bold: t < .5 ? a.bold : b.bold, italic: t < .5 ? a.italic : b.italic, font: t < .5 ? a.font : b.font, align: t < .5 ? a.align : b.align }, doc, { docDir, present: true }, ov);
        } else if (a.type === 'image') {
          const ca = a.crop || { l: 0, t: 0, r: 0, b: 0 }, cb = b.crop || { l: 0, t: 0, r: 0, b: 0 };
          ov.crop = { l: lerp(ca.l, cb.l, t), t: lerp(ca.t, cb.t, t), r: lerp(ca.r, cb.r, t), b: lerp(ca.b, cb.b, t) };
          if ((a.mask || 'rect') !== (b.mask || 'rect') || a.radius !== b.radius) { const pa = resample(shapePoints(a.mask === 'rect' || !a.mask ? (a.radius ? 'roundRect' : 'rect') : a.mask, 1000, 1000, a.radius * 1000 / Math.min(a.w, a.h)), 160), pb = resample(shapePoints(b.mask === 'rect' || !b.mask ? (b.radius ? 'roundRect' : 'rect') : b.mask, 1000, 1000, b.radius * 1000 / Math.min(b.w, b.h)), 160); ov.pts = pa.map((q, i) => [lerp(q[0], pb[i][0], t) / 1000 * w, lerp(q[1], pb[i][1], t) / 1000 * h]); }
          if (it.crossImage) { drawObject(ctx, a, doc, { present: true }, { ...ov, opacity: ov.opacity * (1 - t) }); drawObject(ctx, b, doc, { present: true }, { ...ov, crop: cb, opacity: ov.opacity * t }); }
          else drawObject(ctx, { ...b, filters: t < .5 ? a.filters : b.filters }, doc, { present: true }, ov);
        } else {
          // charts/tables: interpolate box, crossfade content
          drawObject(ctx, a, doc, { present: true }, { ...ov, opacity: ov.opacity * (1 - t) });
          drawObject(ctx, b, doc, { present: true }, { ...ov, opacity: ov.opacity * t, chartProg: b.type === 'chart' ? .3 + .7 * t : 1 });
        }
      }
      ctx.restore();
      ctx.save(); scaledCtx(ctx, scale, ox, oy); ctx.globalAlpha = 1 - t; drawMaster(ctx, doc, from.slide, env.fromIndex ?? 0, size.w, size.h); ctx.globalAlpha = t; drawMaster(ctx, doc, to.slide, env.toIndex ?? 0, size.w, size.h); ctx.restore();
    }, info: m,
  };
}
function drawTextBlockScaled(c, o, theme, W, H, docDir) {
  // draw o's text scaled into the interpolated box W×H
  const sx = W / o.w, sy = H / o.h; c.save(); c.scale(sx, sy);
  import_drawTextBlock(c, o, theme, o.w, o.h, docDir); c.restore();
}
import { drawTextBlock as import_drawTextBlock_ } from './renderer.js';
const import_drawTextBlock = (c, o, theme, w, h, docDir) => import_drawTextBlock_(c, o, theme, w, h, { docDir });

// --- Quantum Flow ---
function quantumEngine(env) {
  const { fromC, toC, params, perf } = env, W = fromC.width, H = fromC.height;
  const density = (+params.density || 1) * (perf ? .45 : 1);
  const gw = Math.round(clamp(150 * Math.sqrt(density), 40, 260)), gh = Math.round(gw * H / W);
  const sample = (c) => { const s = document.createElement('canvas'); s.width = gw; s.height = gh; const x = s.getContext('2d'); x.drawImage(c, 0, 0, gw, gh); return x.getImageData(0, 0, gw, gh).data; };
  const A = sample(fromC), B = sample(toC), n = gw * gh, R = rng(11), rand = +params.randomness;
  const lum = (d, i) => d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11;
  const idx = Array.from({ length: n }, (_, i) => i);
  let targ = idx.slice();
  const pat = +params.pattern;
  if (pat === 0) { // flow: targets shuffled locally
    targ = idx.map(i => { const x = i % gw, y = (i / gw) | 0; const nx = clamp(x + Math.round((R() - .5) * gw * .5 * rand), 0, gw - 1), ny = clamp(y + Math.round((R() - .5) * gh * .5 * rand), 0, gh - 1); return ny * gw + nx; });
  } else if (pat === 1) { const sa = idx.slice().sort((a, b) => lum(A, a) - lum(A, b)), sb = idx.slice().sort((a, b) => lum(B, a) - lum(B, b)); sa.forEach((a, k) => targ[a] = sb[k]); }
  else if (pat === 3) { const ang = (i) => { const x = i % gw - gw / 2, y = ((i / gw) | 0) - gh / 2; return Math.atan2(y, x) + Math.hypot(x, y) * .05; }; const sa = idx.slice().sort((a, b) => ang(a) - ang(b)), sb = idx.slice().sort((a, b) => ang(b) - ang(a)); sa.forEach((a, k) => targ[a] = sb[k]); }
  const dirs = [[1, 0], [-1, 0], [0, -1], [0, 1]], dsel = +params.dir;
  const parts = new Float32Array(n * 9); // sx sy tx ty delay r g b phase
  for (let i = 0; i < n; i++) {
    const x = i % gw, y = (i / gw) | 0, tg = targ[i], tx = tg % gw, ty = (tg / gw) | 0;
    let s; if (dsel === 4) s = Math.hypot(x / gw - .5, y / gh - .5) * 1.4; else { const [dx, dy] = dirs[dsel]; s = dx ? (dx > 0 ? x / gw : 1 - x / gw) : (dy > 0 ? y / gh : 1 - y / gh); }
    const k = i * 9; parts[k] = x; parts[k + 1] = y; parts[k + 2] = tx; parts[k + 3] = ty; parts[k + 4] = s * .35 + R() * .15 * rand; parts[k + 8] = R() * 6.28;
    parts[k + 5] = tg; // store target index for color
  }
  const tint = parseColor(params.color || '#fff'), tintAmt = +params.tint || 0;
  const pc = document.createElement('canvas'); pc.width = gw * 4; pc.height = gh * 4; const px = pc.getContext('2d');
  const img = px.createImageData(pc.width, pc.height), D = img.data, PW = pc.width, PH = pc.height;
  const psz = Math.max(1, Math.round(+params.psize || 1.6)), turb = +params.turbulence, wind = +params.wind, attr = +params.attraction, glow = +params.glow;
  const [wdx, wdy] = dsel === 4 ? [0, 0] : dirs[dsel];
  return {
    draw(ctx, p, scale, ox, oy) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dw = W * scale / (env.srcScale || 1), dh = H * scale / (env.srcScale || 1);
      // base layers
      const fa = clamp(1 - p * 3.2, 0, 1), ta = clamp((p - .72) / .28, 0, 1);
      ctx.fillStyle = '#000'; ctx.fillRect(ox, oy, dw, dh);
      if (fa > 0) { ctx.globalAlpha = fa; ctx.drawImage(fromC, ox, oy, dw, dh); }
      D.fill(0);
      for (let i = 0; i < n; i++) {
        const k = i * 9, d = parts[k + 4]; let q = clamp((p - d * .6) / (.85 - .25), 0, 1);
        const e = q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
        const sx = parts[k], sy = parts[k + 1], tx = parts[k + 2], ty = parts[k + 3];
        const bell = Math.sin(q * Math.PI), ph = parts[k + 8];
        let x = sx + (tx - sx) * (attr * e + (1 - attr) * q), y = sy + (ty - sy) * (attr * e + (1 - attr) * q);
        x += (wdx * wind * gw * .25 + Math.sin(ph + q * 9) * turb * 4) * bell; y += (wdy * wind * gh * .25 + Math.cos(ph * 1.3 + q * 7) * turb * 4) * bell;
        const ti = parts[k + 5] | 0;
        let r = A[i * 4] + (B[ti * 4] - A[i * 4]) * e, g = A[i * 4 + 1] + (B[ti * 4 + 1] - A[i * 4 + 1]) * e, b = A[i * 4 + 2] + (B[ti * 4 + 2] - A[i * 4 + 2]) * e;
        if (tintAmt) { const ta2 = tintAmt * bell; r += (tint[0] - r) * ta2; g += (tint[1] - g) * ta2; b += (tint[2] - b) * ta2; }
        const a = q <= 0 ? (p > d * .6 ? 1 : 0) : 1; if (!a && fa > .95) continue;
        const X = Math.round(x * 4), Y = Math.round(y * 4), s = psz + Math.round(bell * psz);
        for (let yy = 0; yy < s; yy++) { const Yy = Y + yy; if (Yy < 0 || Yy >= PH) continue; for (let xx = 0; xx < s; xx++) { const Xx = X + xx; if (Xx < 0 || Xx >= PW) continue; const o = (Yy * PW + Xx) * 4; D[o] = r; D[o + 1] = g; D[o + 2] = b; D[o + 3] = 255; } }
      }
      px.putImageData(img, 0, 0);
      ctx.globalAlpha = 1 - ta * .9; ctx.imageSmoothingEnabled = true;
      ctx.drawImage(pc, ox, oy, dw, dh);
      if (glow > 0 && !env.perf) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = glow * .35 * Math.sin(p * Math.PI); ctx.filter = 'blur(6px)'; ctx.drawImage(pc, ox, oy, dw, dh); ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; }
      if (ta > 0) { ctx.globalAlpha = ta; ctx.drawImage(toC, ox, oy, dw, dh); }
      ctx.restore();
    },
  };
}

// --- Magnetic Assembly / Gravity Shift (object level) ---
function assemblyEngine(env, kind) {
  const { doc, from, to, params } = env, size = doc.size, theme = doc.theme, R = rng(23), rand = +params.randomness || 0;
  const objsB = to.slide.objects, objsA = from.slide.objects, nB = objsB.length || 1;
  const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const gdir = kind === 'gravity' ? dirs[['down', 'up', 'left', 'right'][+params.dir || 0]] : dirs[['left', 'right', 'up', 'down'][+params.dir || 0]];
  const groups = new Map(); objsB.forEach((o, i) => { const g = o.group || o.id; if (!groups.has(g)) groups.set(g, groups.size); });
  const startsB = objsB.map((o, i) => {
    const st = +params.start; let x, y;
    if (kind === 'gravity') { x = o.x + (R() - .5) * 80 * rand; y = o.y; const off = (size.h + o.h) * (1.1 + R() * .3 * rand); x -= gdir[0] * (size.w + o.w) * 1.1; y -= gdir[1] * off; }
    else if (st === 0) { const a = R() * Math.PI * 2, r = Math.max(size.w, size.h) * (.7 + R() * .5); x = size.w / 2 + Math.cos(a) * r - o.w / 2; y = size.h / 2 + Math.sin(a) * r - o.h / 2; }
    else if (st === 1) { const e = (R() * 4) | 0; x = e === 0 ? -o.w - 40 : e === 1 ? size.w + 40 : o.x + (R() - .5) * 300; y = e === 2 ? -o.h - 40 : e === 3 ? size.h + 40 : o.y + (R() - .5) * 200; if (e < 2) y = o.y + (R() - .5) * 400 * rand; }
    else if (st === 2) { x = size.w / 2 - o.w / 2 + (R() - .5) * 60; y = size.h / 2 - o.h / 2 + (R() - .5) * 60; }
    else { x = o.x - gdir[0] * size.w * 1.2 + (R() - .5) * 200 * rand; y = o.y - gdir[1] * size.h * 1.2 + (R() - .5) * 200 * rand; }
    const order = +params.order;
    const k = order === 2 ? 0 : order === 1 ? groups.get(o.group || o.id) / Math.max(1, groups.size - 1) : i / Math.max(1, nB - 1);
    return { x, y, rot: (R() - .5) * 240 * (+params.rotation || 0), delay: k * (+params.stagger ?? .5) * .55 + R() * .08 * rand };
  });
  const outA = objsA.map(o => ({ vx: (R() - .5) * 2 * rand, vr: (R() - .5) * 2, delay: R() * .25 * rand + (kind === 'gravity' ? (gdir[1] > 0 ? (1 - (o.y + o.h) / size.h) * .25 : 0) : 0) }));
  const curve = ['back', 'elastic', 'easeInOut', 'bounce'][+params.curve || 0];
  const strength = +params.strength || 1;
  const sparks = Array.from({ length: Math.round(80 * (+params.particles || 0)) }, () => ({ o: (R() * nB) | 0, a: R() * 6.28, r: 30 + R() * 120, s: 1 + R() * 3 }));
  return {
    draw(ctx, p, scale, ox, oy) {
      ctx.save(); scaledCtx(ctx, scale, ox, oy); ctx.beginPath(); ctx.rect(0, 0, size.w, size.h); ctx.clip();
      const docDir = doc.lang === 'he' || doc.lang === 'ar' ? 'rtl' : 'ltr';
      if (kind === 'gravity') {
        drawBackground(ctx, doc, from.slide, size.w, size.h);
        const pb = clamp((p - .35) / .3, 0, 1); ctx.globalAlpha = pb; drawBackground(ctx, doc, to.slide, size.w, size.h); ctx.globalAlpha = 1;
        const g = (+params.strength || 1), inten = +params.intensity || 1;
        objsA.forEach((o, i) => { const q = clamp((p - outA[i].delay) / .55, 0, 1); if (q >= 1) return; const fall = q * q * g * (size.h + o.h) * 1.4 * inten; drawObject(ctx, o, doc, { docDir, present: true }, { dx: gdir[0] * fall + outA[i].vx * q * 200, dy: gdir[1] * fall, drot: outA[i].vr * q * 90 * (+params.rotation || 0), alpha: 1 }); });
        objsB.forEach((o, i) => { const s = startsB[i]; const q = clamp((p - .4 - s.delay * .5) / .5, 0, 1); if (q <= 0) return; const bounce = +params.bounce; const e = bounce > 0 ? lerp(Ease.easeOut(q), Ease.bounce(q), bounce) : Ease.easeIn(q) * 0 + Ease.easeOut(q);
          drawObject(ctx, o, doc, { docDir, present: true }, { dx: (s.x - o.x) * (1 - e), dy: (s.y - o.y) * (1 - e), drot: s.rot * .3 * (1 - e) }); });
      } else {
        drawBackground(ctx, doc, from.slide, size.w, size.h);
        const fq = clamp(p / .35, 0, 1);
        objsA.forEach((o, i) => { if (fq >= 1) return; const cx = o.x + o.w / 2 - size.w / 2, cy = o.y + o.h / 2 - size.h / 2; drawObject(ctx, o, doc, { docDir, present: true }, { dx: cx * fq * .6, dy: cy * fq * .6, scale: 1 - fq * .3, alpha: 1 - fq, filter: `blur(${fq * 6}px)` }); });
        ctx.globalAlpha = clamp(p / .4, 0, 1); drawBackground(ctx, doc, to.slide, size.w, size.h); ctx.globalAlpha = 1;
        const pts = [];
        objsB.forEach((o, i) => {
          const s = startsB[i]; const span = .62 / Math.max(.5, strength * .8); const q = clamp((p - .12 - s.delay * .5) / span, 0, 1);
          const e = Ease[curve](q), x = lerp(s.x, o.x, e), y = lerp(s.y, o.y, e);
          pts.push([x + o.w / 2, y + o.h / 2, q]);
          drawObject(ctx, o, doc, { docDir, present: true }, { x, y, drot: s.rot * (1 - Ease.easeOut(q)), alpha: clamp(q * 3, 0, 1), scale: lerp(.6, 1, Ease.easeOut(q)) });
        });
        ctx.fillStyle = resolveColor('@accent', theme);
        for (const sp of sparks) { const pt = pts[sp.o]; if (!pt || pt[2] <= 0 || pt[2] >= 1) continue; const q = pt[2]; const rr = sp.r * (1 - q); ctx.globalAlpha = Math.sin(q * Math.PI) * .9; ctx.beginPath(); ctx.arc(pt[0] + Math.cos(sp.a + q * 8) * rr, pt[1] + Math.sin(sp.a + q * 8) * rr, sp.s, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      drawMaster(ctx, doc, to.slide, env.toIndex ?? 0, size.w, size.h);
      ctx.restore();
    },
  };
}

// --- Pixel Storm ---
function pixelEngine(env) {
  const { fromC, toC, params } = env, W = fromC.width, H = fromC.height, s = Math.max(4, Math.round((+params.psize || 22) * W / 1280));
  const cols = Math.ceil(W / s), rows = Math.ceil(H / s), R = rng(5), rand = +params.randomness, pat = +params.pattern, dsel = +params.dir;
  const blocks = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    let ord; const nx = x / cols, ny = y / rows;
    ord = [R(), nx, 1 - nx, 1 - ny, ny, Math.hypot(nx - .5, ny - .5) * 1.4][dsel] ?? R();
    ord = ord * (1 - rand * .5) + R() * rand * .5;
    const a = R() * Math.PI * 2, r = (.4 + R()) * Math.max(W, H) * .6;
    blocks.push({ x: x * s, y: y * s, ord, ox: Math.cos(a) * r, oy: Math.sin(a) * r, ix: (R() - .5) * W * 1.2, iy: (R() - .5) * H * 1.2, sp: (R() - .5) * 8 });
  }
  const edge = +params.edge, ec = params.color || '#fff';
  return {
    draw(ctx, p, scale, ox, oy) {
      const k = scale / (env.srcScale || 1);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(ox, oy, W * k, H * k);
      ctx.beginPath(); ctx.rect(ox, oy, W * k, H * k); ctx.clip();
      for (const b of blocks) {
        const qo = clamp((p - b.ord * .4) / .35, 0, 1), qi = clamp((p - .35 - b.ord * .35) / .3, 0, 1);
        if (qo < 1) { const e = Ease.easeIn(qo); let dx = b.ox * e, dy = b.oy * e; if (pat === 1) { const a = e * 3 + b.sp; dx = Math.cos(a) * e * W * .4; dy = Math.sin(a) * e * H * .4; } if (pat === 2) { dx = 0; dy = e * H * (1 + b.ord); }
          ctx.globalAlpha = 1 - qo * .7; ctx.drawImage(fromC, b.x, b.y, s, s, ox + (b.x + dx) * k, oy + (b.y + dy) * k, s * k * (1 - e * .5), s * k * (1 - e * .5)); }
        if (qi > 0) { const e = Ease.easeOut(qi); let dx = b.ix * (1 - e), dy = b.iy * (1 - e); if (pat === 2) { dx = 0; dy = -H * (1 - e) * (1 + b.ord); }
          ctx.globalAlpha = Math.min(1, qi * 2); ctx.drawImage(toC, b.x, b.y, s, s, ox + (b.x + dx) * k, oy + (b.y + dy) * k, s * k + .6, s * k + .6);
          if (edge > 0 && qi < 1) { ctx.globalAlpha = edge * (1 - qi); ctx.strokeStyle = ec; ctx.lineWidth = 1; ctx.strokeRect(ox + (b.x + dx) * k, oy + (b.y + dy) * k, s * k, s * k); } }
      }
      ctx.restore();
    },
  };
}

// --- Shatter Rebuild ---
function shatterEngine(env) {
  const { fromC, toC, params } = env, W = fromC.width, H = fromC.height, fs = Math.max(20, (+params.fsize || 90) * W / 1280), R = rng(9);
  const cols = Math.ceil(W / fs), rows = Math.ceil(H / fs), tri = +params.shape === 0, frags = [];
  const J = (x, y) => [x * fs + (x > 0 && x < cols ? (R() - .5) * fs * .5 : 0), y * fs + (y > 0 && y < rows ? (R() - .5) * fs * .5 : 0)];
  const grid = []; for (let y = 0; y <= rows; y++) { grid.push([]); for (let x = 0; x <= cols; x++) grid[y].push(J(x, y)); }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const a = grid[y][x], b = grid[y][x + 1], c = grid[y + 1][x + 1], d = grid[y + 1][x];
    const polys = tri ? (R() > .5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]]) : [[a, b, c, d]];
    for (const pl of polys) { const cx = pl.reduce((s, q) => s + q[0], 0) / pl.length, cy = pl.reduce((s, q) => s + q[1], 0) / pl.length; frags.push({ pl, cx, cy, vx: (cx - W / 2) / W * 2 + (R() - .5), vy: (cy - H / 2) / H * 2 + (R() - .5), vr: (R() - .5) * 6, fl: R() * 6.28, d: R() }); }
  }
  const ex = +params.explode || 1, rotk = +params.rotation, grav = +params.gravity, rd = +params.dir;
  const drawFrags = (ctx, src, q, k, ox, oy, rebuild) => {
    for (const f of frags) {
      let order = rd === 0 ? Math.hypot(f.cx / W - .5, f.cy / H - .5) : rd === 1 ? f.cx / W : rd === 2 ? 1 - f.cx / W : f.d;
      const e = clamp(q * 1.4 - order * .4, 0, 1), m = rebuild ? Ease.easeOut(1 - e) : Ease.easeIn(e);
      if (!rebuild && e >= 1) continue;
      const dx = f.vx * W * .6 * ex * m, dy = f.vy * H * .6 * ex * m + grav * m * m * H * .5, rot = f.vr * m * rotk, flip = Math.cos(f.fl + m * 4 * rotk);
      ctx.save(); ctx.translate(ox + (f.cx + dx) * k, oy + (f.cy + dy) * k); ctx.rotate(rot); ctx.scale(flip, 1); ctx.translate(-f.cx * k, -f.cy * k);
      ctx.beginPath(); f.pl.forEach((pt, i) => i ? ctx.lineTo(pt[0] * k, pt[1] * k) : ctx.moveTo(pt[0] * k, pt[1] * k)); ctx.closePath(); ctx.clip();
      ctx.globalAlpha = rebuild ? clamp(1 - m * .55, 0, 1) : 1; ctx.drawImage(src, 0, 0, W * k, H * k);
      ctx.fillStyle = flip < 0 ? 'rgba(0,0,0,.35)' : `rgba(255,255,255,${.12 * m})`; ctx.fillRect(0, 0, W * k, H * k);
      ctx.restore();
    }
  };
  return {
    draw(ctx, p, scale, ox, oy) {
      const k = scale / (env.srcScale || 1); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createRadialGradient(ox + W * k / 2, oy + H * k / 2, 0, ox + W * k / 2, oy + H * k / 2, W * k * .7); g.addColorStop(0, '#1b1d2a'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(ox, oy, W * k, H * k);
      ctx.beginPath(); ctx.rect(ox, oy, W * k, H * k); ctx.clip();
      if (p < .55) drawFrags(ctx, fromC, p / .55, k, ox, oy, false);
      if (p > .45) drawFrags(ctx, toC, (p - .45) / .55, k, ox, oy, true);
      if (p > .97) { ctx.globalAlpha = (p - .97) / .03; ctx.drawImage(toC, ox, oy, W * k, H * k); }
      ctx.restore();
    },
  };
}

// ---------------- public API ----------------
// env: { doc, from:{slide, canvas}, to:{slide, canvas}, transition, fromIndex, toIndex, perf }
// returns { draw(ctx, p, scale, ox, oy) }  — p is linear progress 0..1 (easing applied internally)
export function prepareTransition(env) {
  const tr = env.transition || { type: 'none' }, t = getT(tr.type);
  const params = { ...defaultParams(t.id), ...(tr.params || {}) };
  const easeF = Ease[tr.easing || 'easeInOut'] || Ease.easeInOut;
  const fromC = env.from.canvas, toC = env.to.canvas;
  const srcScale = fromC.width / env.doc.size.w;
  const E = { ...env, params, fromC, toC, srcScale, mode: t.mode };
  let impl;
  if (t.kind === 'none') impl = { draw: (ctx, p, s, ox, oy) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(p < 1 ? fromC : toC, ox, oy, env.doc.size.w * s, env.doc.size.h * s); ctx.restore(); } };
  else if (t.kind === 'morph') impl = morphEngine(E);
  else if (t.kind === 'quantum') impl = quantumEngine(E);
  else if (t.kind === 'magnetic') impl = assemblyEngine(E, 'magnetic');
  else if (t.kind === 'gravity') impl = assemblyEngine(E, 'gravity');
  else if (t.kind === 'pixel') impl = pixelEngine(E);
  else if (t.kind === 'shatter') impl = shatterEngine(E);
  else {
    const g = glRunner(), name = t.glsl || t.id;
    if (g.ok && G[name]) {
      const sc = env.perf ? .5 : 1, gw = Math.max(2, Math.round(fromC.width * sc)), gh = Math.max(2, Math.round(fromC.height * sc));
      const { Pv, Cv } = packParams(t, params);
      impl = { draw(ctx, p, s, ox, oy) { g.setSources(fromC, toC, gw, gh); g.draw(name, p, Pv, Cv); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(g.canvas, ox, oy, env.doc.size.w * s, env.doc.size.h * s); ctx.restore(); } };
      // upload sources once; re-upload only if canvases change size
      let uploaded = false; const d0 = impl.draw;
      impl.draw = (ctx, p, s, ox, oy) => { if (!uploaded) { g.setSources(fromC, toC, gw, gh); uploaded = true; } g.draw(name, p, Pv, Cv); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(g.canvas, ox, oy, env.doc.size.w * s, env.doc.size.h * s); ctx.restore(); };
      impl.reupload = () => { uploaded = false; }; void d0;
    } else {
      impl = { draw(ctx, p, s, ox, oy) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const w = env.doc.size.w * s, h = env.doc.size.h * s; ctx.drawImage(fromC, ox, oy, w, h); ctx.globalAlpha = p; ctx.drawImage(toC, ox, oy, w, h); ctx.restore(); }, fallback: true };
    }
  }
  return { draw: (ctx, p, s, ox = 0, oy = 0) => impl.draw(ctx, easeF(clamp(p, 0, 1)), s, ox, oy), impl, def: t, params };
}

// Synthesized transition sounds (Web Audio)
let actx = null;
export const SOUNDS = ['none', 'whoosh', 'swoosh', 'chime', 'click', 'pop', 'sparkle', 'boom', 'camera'];
export function playSound(name, dur = .8) {
  if (!name || name === 'none') return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const c = actx, t0 = c.currentTime, out = c.createGain(); out.connect(c.destination); out.gain.value = .35;
    const noise = (len) => { const b = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; return s; };
    if (name === 'whoosh' || name === 'swoosh') { const n = noise(dur), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.Q.value = name === 'whoosh' ? 1.2 : 3; f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(name === 'whoosh' ? 2400 : 5000, t0 + dur * .7); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + dur * .4); g.gain.linearRampToValueAtTime(0, t0 + dur); n.connect(f).connect(g).connect(out); n.start(t0); n.stop(t0 + dur); }
    else if (name === 'chime' || name === 'sparkle') { [880, 1320, 1760, 2637].forEach((fq, i) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = name === 'sparkle' ? fq * 1.5 : fq; const st = t0 + i * (name === 'sparkle' ? .05 : .09); g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(.3, st + .01); g.gain.exponentialRampToValueAtTime(.001, st + .9); o.connect(g).connect(out); o.start(st); o.stop(st + 1); }); }
    else if (name === 'click' || name === 'camera') { const n = noise(.05), g = c.createGain(); g.gain.setValueAtTime(1, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + .05); n.connect(g).connect(out); n.start(t0); if (name === 'camera') { const n2 = noise(.08), g2 = c.createGain(); g2.gain.setValueAtTime(.8, t0 + .12); g2.gain.exponentialRampToValueAtTime(.001, t0 + .2); n2.connect(g2).connect(out); n2.start(t0 + .12); } }
    else if (name === 'pop') { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(600, t0); o.frequency.exponentialRampToValueAtTime(120, t0 + .12); g.gain.setValueAtTime(.8, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + .15); o.connect(g).connect(out); o.start(t0); o.stop(t0 + .2); }
    else if (name === 'boom') { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(120, t0); o.frequency.exponentialRampToValueAtTime(30, t0 + .8); g.gain.setValueAtTime(1, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + 1); o.connect(g).connect(out); o.start(t0); o.stop(t0 + 1); }
  } catch (e) { /* audio unavailable */ }
}

// PPTX compatibility mapping (pptx transition names) used by the exporter/importer
export const PPTX_MAP = { fade: 'fade', smoothFade: 'fade', crossfade: 'fade', fadeBlack: 'fade', dissolve: 'dissolve', cut: 'cut', pushLeft: 'push', pushRight: 'push', pushUp: 'push', pushDown: 'push', cover: 'cover', uncover: 'pull', wipeLeft: 'wipe', wipeRight: 'wipe', wipeUp: 'wipe', wipeDown: 'wipe', splitH: 'split', splitV: 'split', randomBars: 'randomBar', checkerboard: 'checker', blinds: 'blinds', circleOut: 'circle', diamondOut: 'diamond', boxOut: 'zoom', flash: 'flash' };
