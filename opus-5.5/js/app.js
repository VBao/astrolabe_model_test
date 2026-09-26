// Viewer: scene, lighting, ring dragging, parts panel, arrangements.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { buildAstrolabe } from './model.js';
import { oklch } from './engrave.js';

const $ = (s, r = document) => r.querySelector(s);
const rad = THREE.MathUtils.degToRad;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const IDS = ['frame', 'ring1', 'ring2', 'ring3', 'globe'];
const NAMES = { frame: 'Frame & throne', ring1: 'Ring I · Months', ring2: 'Ring II · Planets', ring3: 'Ring III · Quarters', globe: 'Globe' };
const PRESETS = {
  flat: { ring1: 0, ring2: 0, ring3: 0, globe: 0 },
  fanned: { ring1: 24, ring2: 48, ring3: 72, globe: 0 },
  crossed: { ring1: 90, ring2: 45, ring3: -45, globe: 0 },
};
const SPEEDS = { ring1: 7, ring2: -10, ring3: 14, globe: 18 }; // °/s while "Turn rings" is on
const DRAG_DEG_PER_PX = 0.45;
const TWEEN_MS = reduceMotion ? 0 : 480;
const TARGET = new THREE.Vector3(0, 0.3, 0);
const HOME = { az: rad(-22), el: rad(9) };

const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const fmt = (d) => { const v = Math.round(wrap(d)); return (v < 0 ? '−' : '') + Math.abs(v) + '°'; };
const col = (L, C, h) => new THREE.Color().setRGB(...oklch(L, C, h), THREE.SRGBColorSpace);
const css = (L, C, h) => `rgb(${oklch(L, C, h).map((v) => Math.round(v * 255)).join(',')})`;

function cubicBezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = dsx(t);
      if (Math.abs(d) < 1e-6) break;
      t = Math.min(1, Math.max(0, t - (sx(t) - x) / d));
    }
    return sy(t);
  };
}
const ease = cubicBezier(0.2, 0, 0, 1);

/* ---------- DOM ---------- */
const canvas = $('#stage');
const loader = $('#loader'), loadBar = $('#load-bar'), loadStep = $('#load-step');
const panel = $('.panel'), toolbar = $('.toolbar'), tip = $('#pick-tip'), fpsEl = $('#fps');
const btnOrbit = $('#btn-orbit'), btnTurn = $('#btn-turn'), btnView = $('#btn-view'), btnRef = $('#btn-ref');
const refCard = $('#reference');
const presetBtns = [...document.querySelectorAll('[data-preset]')];
const rows = Object.fromEntries(IDS.map((id) => {
  const el = $(`[data-part="${id}"]`);
  return [id, { el, btn: $('.part-select', el), slider: $('input', el), out: $('output', el), reset: $('.reset', el) }];
}));

const setProgress = (f, label) => {
  loadBar.style.width = `${Math.round(f * 100)}%`;
  if (label) loadStep.textContent = label;
};

function fail(err) {
  console.error(err);
  loader.hidden = true;
  $('#fallback').hidden = false;
}

async function main() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    fail(err);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  /* ---------- scene ---------- */
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 1.1;

  const key = new THREE.DirectionalLight(col(0.97, 0.025, 80), 2.8);
  key.position.set(-2.2, 3.4, 3.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.8, right: 1.8, top: 1.8, bottom: -1.8, near: 1, far: 12 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  key.target.position.copy(TARGET);
  const rim = new THREE.DirectionalLight(col(0.9, 0.04, 220), 1.1);
  rim.position.set(2.8, 1.2, -3.2);
  scene.add(key, key.target, rim);

  let bgTex = null;
  function paintBackground(fx, fy, aspect) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = Math.max(2, Math.round(512 / aspect));
    const g = c.getContext('2d');
    const r = Math.max(c.width, c.height) * 0.8;
    const gr = g.createRadialGradient(fx * c.width, fy * c.height, 0, fx * c.width, fy * c.height, r);
    gr.addColorStop(0, css(0.245, 0.016, 235));
    gr.addColorStop(0.55, css(0.17, 0.012, 235));
    gr.addColorStop(1, css(0.115, 0.01, 235));
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t;
    if (bgTex) bgTex.dispose();
    bgTex = t;
  }

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);

  /* ---------- build ---------- */
  setProgress(0.02, 'Loading typefaces');
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 64px Amiri', 'الحمل أسطرلاب'),
        document.fonts.load('500 64px "Cormorant Garamond"'),
      ]),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch (err) {
    console.warn('Font loading failed; falling back to system Arabic type.', err);
  }

  let model;
  try {
    const compact = window.innerWidth < 820 || Math.min(window.innerWidth, window.innerHeight) < 600;
    model = await buildAstrolabe({ renderer, density: compact ? 950 : 1400, onProgress: setProgress });
  } catch (err) {
    fail(err);
    return;
  }
  scene.add(model.root);

  /* ---------- state ---------- */
  const state = {
    angles: { frame: 0, ...PRESETS.fanned },
    selected: null,
    hover: null,
    turning: false,
    autoOrbit: !reduceMotion,
  };
  const tweens = new Map();
  const uiDirty = new Set(IDS);
  let drag = null, orbiting = false, pendingHover = null, downAt = null, camTween = null;

  function setAngle(id, deg) {
    state.angles[id] = deg;
    model.parts[id].group.rotation.y = rad(deg);
    uiDirty.add(id);
  }

  function tweenAngle(id, to) {
    const from = state.angles[id];
    if (!TWEEN_MS) { setAngle(id, to); return; }
    tweens.set(id, { from, to: from + wrap(to - from), t0: performance.now() });
  }

  function syncRow(id) {
    const r = rows[id], d = wrap(state.angles[id]), v = Math.round(d);
    const pct = ((v + 180) / 360) * 100;
    r.slider.value = String(v);
    r.slider.style.setProperty('--lo', `${Math.min(50, pct)}%`);
    r.slider.style.setProperty('--hi', `${Math.max(50, pct)}%`);
    r.slider.setAttribute('aria-valuetext', `${v} degrees`);
    r.out.textContent = fmt(d);
    r.reset.disabled = v === 0;
  }

  function updateHalos() {
    for (const id of IDS) {
      const h = model.parts[id].halo;
      const o = id === state.selected ? 0.95 : id === state.hover ? 0.5 : 0;
      h.material.opacity = o;
      h.visible = o > 0;
    }
  }

  function select(id) {
    state.selected = id;
    for (const k of IDS) {
      rows[k].el.classList.toggle('is-selected', k === id);
      rows[k].btn.setAttribute('aria-pressed', String(k === id));
    }
    updateHalos();
  }

  function setHover(id) {
    if (state.hover === id) return;
    state.hover = id;
    canvas.classList.toggle('is-grab', !!id);
    updateHalos();
  }

  function setPresetUI(name) {
    for (const b of presetBtns) b.setAttribute('aria-pressed', String(b.dataset.preset === name));
  }

  function setAutoOrbit(on) {
    state.autoOrbit = on;
    controls.autoRotate = on;
    btnOrbit.setAttribute('aria-pressed', String(on));
  }

  function setTurning(on) {
    state.turning = on;
    btnTurn.setAttribute('aria-pressed', String(on));
    if (on) setPresetUI(null);
  }

  function setReference(open) {
    refCard.hidden = !open;
    btnRef.setAttribute('aria-pressed', String(open));
  }

  function showTip(x, y, id, withAngle) {
    const small = document.createElement('small');
    small.textContent = withAngle ? fmt(state.angles[id]) : 'Drag to turn';
    tip.replaceChildren(document.createTextNode(NAMES[id]), small);
    tip.classList.add('is-on');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const tx = x + 16 + w > window.innerWidth - 8 ? x - 16 - w : x + 16;
    const ty = y + 18 + h > window.innerHeight - 8 ? y - 18 - h : y + 18;
    tip.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`;
  }
  const hideTip = () => tip.classList.remove('is-on');

  /* ---------- picking & dragging (registered before OrbitControls so it wins) ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(model.pickables, false)[0];
    return hit ? { id: hit.object.userData.part, point: hit.point } : null;
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || !ev.isPrimary) return;
    const hit = pick(ev.clientX, ev.clientY);
    if (!hit) { downAt = { x: ev.clientX, y: ev.clientY }; return; }
    controls.enabled = false;
    setAutoOrbit(false);
    select(hit.id);
    tweens.delete(hit.id);
    setPresetUI(null);
    // the axle is world Y through the origin: grabbing the near side turns with the cursor
    const c = camera.position;
    const sign = hit.point.x * c.x + hit.point.z * c.z >= 0 ? 1 : -1;
    drag = { id: hit.id, x0: ev.clientX, a0: state.angles[hit.id], sign, pid: ev.pointerId };
    canvas.setPointerCapture(ev.pointerId);
    canvas.classList.add('is-grabbing');
    showTip(ev.clientX, ev.clientY, hit.id, true);
    ev.preventDefault();
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (drag && ev.pointerId === drag.pid) {
      setAngle(drag.id, drag.a0 + drag.sign * (ev.clientX - drag.x0) * DRAG_DEG_PER_PX);
      showTip(ev.clientX, ev.clientY, drag.id, true);
      return;
    }
    if (ev.pointerType === 'mouse' && !orbiting) pendingHover = { x: ev.clientX, y: ev.clientY };
  });

  const endPointer = (ev) => {
    if (drag && ev.pointerId === drag.pid) {
      setAngle(drag.id, wrap(state.angles[drag.id]));
      drag = null;
      controls.enabled = true;
      canvas.classList.remove('is-grabbing');
      if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
      hideTip();
      return;
    }
    if (downAt && ev.type === 'pointerup' && Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) < 4) select(null);
    downAt = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => {
    if (drag) return;
    pendingHover = null;
    setHover(null);
    hideTip();
  });

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.8;
  controls.autoRotateSpeed = 0.6;
  controls.minPolarAngle = 0.22;
  controls.maxPolarAngle = Math.PI - 0.22;
  controls.addEventListener('start', () => {
    orbiting = true;
    camTween = null;
    setAutoOrbit(false);
    setHover(null);
    hideTip();
  });
  controls.addEventListener('end', () => { orbiting = false; });

  /* ---------- layout: keep the instrument centred in the free stage ---------- */
  let fitDist = 4, laidOut = false;
  const homePosition = (d) => new THREE.Vector3(
    Math.sin(HOME.az) * Math.cos(HOME.el),
    Math.sin(HOME.el),
    Math.cos(HOME.az) * Math.cos(HOME.el),
  ).multiplyScalar(d).add(TARGET);

  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    const pr = panel.getBoundingClientRect(), tb = toolbar.getBoundingClientRect();
    const side = pr.left > w * 0.5;
    const fx1 = side ? pr.left - 12 : w;
    const fy0 = side ? 0 : 72;
    const fy1 = (side ? Math.min(h, tb.top) : Math.min(pr.top, tb.top)) - 8;
    const cx = fx1 / 2, cy = (fy0 + fy1) / 2;
    const sx = w / 2 - cx, sy = h / 2 - cy;
    const fw = w + 2 * Math.abs(sx), fh = h + 2 * Math.abs(sy);
    camera.aspect = fw / fh;
    camera.setViewOffset(fw, fh, sx > 0 ? 2 * sx : 0, sy > 0 ? 2 * sy : 0, w, h);
    camera.updateProjectionMatrix();
    const ppu = Math.min(((fy1 - fy0) * 0.88) / 2.7, (fx1 * 0.86) / 2.15);
    const prev = fitDist;
    fitDist = fh / 2 / (ppu * Math.tan(rad(camera.fov / 2)));
    controls.minDistance = fitDist * 0.32;
    controls.maxDistance = fitDist * 1.9;
    if (!laidOut) {
      camera.position.copy(homePosition(fitDist));
      laidOut = true;
    } else {
      const off = camera.position.clone().sub(TARGET);
      camera.position.copy(TARGET).add(off.setLength((off.length() * fitDist) / prev));
    }
    controls.update();
    paintBackground(cx / w, cy / h, w / h);
  }

  function resetView() {
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(TARGET));
    const to = new THREE.Spherical().setFromVector3(homePosition(fitDist).sub(TARGET));
    if (!TWEEN_MS) {
      camera.position.setFromSpherical(to).add(TARGET);
      controls.update();
      return;
    }
    const dTheta = Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
    camTween = { from, to, dTheta, t0: performance.now() };
  }

  /* ---------- wiring ---------- */
  for (const id of IDS) {
    const r = rows[id];
    r.btn.addEventListener('click', () => select(state.selected === id ? null : id));
    r.slider.addEventListener('input', () => {
      tweens.delete(id);
      setAngle(id, Number(r.slider.value));
      if (id !== 'frame') setPresetUI(null);
      if (state.selected !== id) select(id);
    });
    r.reset.addEventListener('click', () => {
      tweenAngle(id, 0);
      if (id !== 'frame') setPresetUI(null);
    });
    r.el.addEventListener('pointerenter', () => setHover(id));
    r.el.addEventListener('pointerleave', () => setHover(null));
  }
  for (const b of presetBtns) {
    b.addEventListener('click', () => {
      setTurning(false);
      for (const [id, to] of Object.entries(PRESETS[b.dataset.preset])) tweenAngle(id, to);
      setPresetUI(b.dataset.preset);
    });
  }
  btnOrbit.addEventListener('click', () => setAutoOrbit(!state.autoOrbit));
  btnTurn.addEventListener('click', () => setTurning(!state.turning));
  btnView.addEventListener('click', resetView);
  btnRef.addEventListener('click', () => setReference(refCard.hidden));
  $('#ref-close').addEventListener('click', () => { setReference(false); btnRef.focus(); });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !refCard.hidden) setReference(false);
  });
  window.addEventListener('resize', layout);

  for (const id of IDS) setAngle(id, state.angles[id]);
  setPresetUI('fanned');
  setAutoOrbit(state.autoOrbit);
  layout();

  /* ---------- loop ---------- */
  let last = performance.now(), uiClock = 0, frames = 0, fpsClock = 0, firstFrame = true;
  renderer.setAnimationLoop((now) => {
    const dtMs = Math.min(100, Math.max(0, now - last));
    last = now;
    const dt = dtMs / 1000;

    for (const [id, tw] of tweens) {
      const p = Math.min(1, (now - tw.t0) / TWEEN_MS);
      setAngle(id, tw.from + (tw.to - tw.from) * ease(p));
      if (p >= 1) { setAngle(id, wrap(tw.to)); tweens.delete(id); }
    }
    if (state.turning) {
      for (const [id, speed] of Object.entries(SPEEDS)) {
        if (tweens.has(id) || (drag && drag.id === id)) continue;
        setAngle(id, wrap(state.angles[id] + speed * dt));
      }
    }
    if (camTween) {
      const p = Math.min(1, (now - camTween.t0) / TWEEN_MS), e = ease(p);
      const { from, to, dTheta } = camTween;
      const s = new THREE.Spherical(
        from.radius + (to.radius - from.radius) * e,
        from.phi + (to.phi - from.phi) * e,
        from.theta + dTheta * e,
      );
      camera.position.setFromSpherical(s).add(TARGET);
      if (p >= 1) camTween = null;
    }
    if (pendingHover && !drag && !orbiting) {
      const hit = pick(pendingHover.x, pendingHover.y);
      setHover(hit ? hit.id : null);
      if (hit) showTip(pendingHover.x, pendingHover.y, hit.id, false);
      else hideTip();
      pendingHover = null;
    }

    controls.update(dt);
    renderer.render(scene, camera);

    uiClock += dtMs;
    if (uiDirty.size && (uiClock > 80 || drag)) {
      uiDirty.forEach(syncRow);
      uiDirty.clear();
      uiClock = 0;
    }
    frames++;
    fpsClock += dtMs;
    if (fpsClock >= 500) {
      fpsEl.textContent = `WebGL2 · ${Math.round((frames * 1000) / fpsClock)} fps`;
      frames = 0;
      fpsClock = 0;
    }
    if (firstFrame) {
      firstFrame = false;
      const gl = renderer.getContext();
      const err = gl.getError();
      if (err !== gl.NO_ERROR) console.warn('WebGL error after first frame:', err);
      loader.classList.add('is-done');
      setTimeout(() => { loader.hidden = true; }, 300);
    }
  });
}

main().catch(fail);
