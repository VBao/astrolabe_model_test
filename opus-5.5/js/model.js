// Geometry for the astrolabe: throne-crowned frame, three flat rings and a
// globe, all pivoting on one vertical axle. Every surface is engraved via
// engrave.js; each rotating part lives in its own group.
import * as THREE from 'three';
import { paintBand, paintKursi, paintGlobe, bake, PALETTES, oklch } from './engrave.js';
import { LAND, GLOBE_LABELS, ZODIAC, MONTHS, PLANETS, QUARTERS } from './geo-data.js';

const TAU = Math.PI * 2;

export const DIMS = {
  frame: { rIn: 0.845, rOut: 1.0, t: 0.022 },
  ring1: { rIn: 0.675, rOut: 0.825, t: 0.018 },
  ring2: { rIn: 0.52, rOut: 0.655, t: 0.018 },
  ring3: { rIn: 0.385, rOut: 0.5, t: 0.018 },
  globe: { r: 0.355 },
};

const weave = (texts, motifs) =>
  texts.flatMap((text, i) => (i < motifs.length ? [{ text }, { motif: motifs[i] }] : [{ text }]));

const BANDS = {
  frame: {
    style: { bead: true, gap: 0.32 }, seed: 11,
    halves: [
      weave(ZODIAC.slice(0, 6), ['sun', 'globe', 'moon', 'star', 'globe']),
      weave(ZODIAC.slice(6), ['star', 'moon', 'globe', 'sun', 'rosette']),
    ],
  },
  ring1: {
    style: { cartouche: 'pill', gap: 0.28 }, seed: 23,
    halves: [
      weave(MONTHS.slice(0, 6), ['globe', 'rosette', 'globe', 'rosette', 'globe']),
      weave(MONTHS.slice(6), ['rosette', 'globe', 'rosette', 'globe', 'rosette']),
    ],
  },
  ring2: {
    style: { gap: 0.8 }, seed: 37,
    halves: [
      weave(PLANETS.slice(0, 4), ['star', 'sun', 'moon']),
      weave(PLANETS.slice(4), ['star', 'globe', 'rosette']),
    ],
  },
  ring3: {
    style: { gap: 0.35, scallop: true, font: 0.86 }, seed: 41,
    halves: [
      weave(QUARTERS.slice(0, 4), ['rosette', 'star', 'rosette']),
      weave(QUARTERS.slice(4), ['sun', 'star', 'moon']),
    ],
  },
};

const KURSI_BOUNDS = { x0: -0.56, x1: 0.56, y0: 0.88, y1: 1.43 };

const col = (L, C, h) => new THREE.Color().setRGB(...oklch(L, C, h), THREE.SRGBColorSpace);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/* ---------- geometry ---------- */
// Flat annulus with polar UVs: u runs clockwise from the top pivot, v outward.
// The back face mirrors u so its inscriptions read correctly from behind.
function bandGeometry(rIn, rOut, t, segs) {
  const pos = [], nor = [], uv = [], idx = [];
  const z = t / 2;
  const ang = (i) => Math.PI / 2 - (i / segs) * TAU;
  const face = (front) => {
    const s = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = ang(i), c = Math.cos(a), sn = Math.sin(a), u = i / segs;
      for (const [r, v] of [[rIn, 0], [rOut, 1]]) {
        pos.push(r * c, r * sn, front ? z : -z);
        nor.push(0, 0, front ? 1 : -1);
        uv.push(front ? u : 1 - u, v);
      }
    }
    for (let i = 0; i < segs; i++) {
      const A = s + 2 * i, B = A + 1, C = A + 2, D = A + 3;
      if (front) idx.push(A, C, B, B, C, D);
      else idx.push(A, B, C, B, D, C);
    }
  };
  const wall = (r, outward) => {
    const s = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = ang(i), c = Math.cos(a), sn = Math.sin(a);
      for (const zz of [z, -z]) {
        pos.push(r * c, r * sn, zz);
        nor.push(outward ? c : -c, outward ? sn : -sn, 0);
        uv.push(i / segs, zz > 0 ? 1 : 0);
      }
    }
    for (let i = 0; i < segs; i++) {
      const P = s + 2 * i, Pm = P + 1, Q = P + 2, Qm = P + 3;
      if (outward) idx.push(P, Q, Pm, Q, Qm, Pm);
      else idx.push(P, Pm, Q, Q, Pm, Qm);
    }
  };
  face(true);
  face(false);
  const faceCount = idx.length;
  wall(rOut, true);
  wall(rIn, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.addGroup(0, faceCount, 0);
  geo.addGroup(faceCount, idx.length - faceCount, 1);
  return geo;
}

// Cusped throne plate rising from the top of the frame.
function kursiShape() {
  const A = THREE.MathUtils.degToRad(26);
  const P0 = [Math.sin(A), Math.cos(A)];
  const SEG = [
    [[0.5, 0.93], [0.535, 1.0], [0.47, 1.045]],
    [[0.43, 1.07], [0.37, 1.07], [0.37, 1.115]],
    [[0.4, 1.15], [0.39, 1.215], [0.31, 1.225]],
    [[0.25, 1.23], [0.215, 1.235], [0.215, 1.27]],
    [[0.235, 1.3], [0.2, 1.34], [0.13, 1.335]],
    [[0.085, 1.332], [0.065, 1.345], [0.062, 1.365]],
    [[0.06, 1.39], [0.03, 1.4], [0, 1.41]],
  ];
  const s = new THREE.Shape();
  s.moveTo(-P0[0], P0[1]);
  for (const [c1, c2, p] of SEG) s.bezierCurveTo(-c1[0], c1[1], -c2[0], c2[1], -p[0], p[1]);
  for (let k = SEG.length - 1; k >= 0; k--) {
    const [c1, c2] = SEG[k];
    const p = k ? SEG[k - 1][2] : P0;
    s.bezierCurveTo(c2[0], c2[1], c1[0], c1[1], p[0], p[1]);
  }
  s.absarc(0, 0, 1, Math.PI / 2 - A, Math.PI / 2 + A, false);
  return s;
}

/* ---------- materials ---------- */
function dataTex(data, W, H, srgb, wrap, aniso) {
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ---------- assembly ---------- */
export async function buildAstrolabe({ renderer, density = 1400, onProgress = () => {} }) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const maxTex = Math.min(8192, renderer.capabilities.maxTextureSize);
  const STEPS = [
    ['frame', 'Frame · zodiac band'],
    ['kursi', 'Throne plate'],
    ['ring1', 'Ring I · months'],
    ['ring2', 'Ring II · planets'],
    ['ring3', 'Ring III · quarters'],
    ['globe', 'Globe · world map'],
  ];
  let stepIndex = 0;
  const progress = async () => {
    onProgress(stepIndex / STEPS.length, STEPS[stepIndex][1]);
    stepIndex++;
    await nextFrame();
  };

  const accent = col(0.8, 0.105, 185);
  const edgeMat = new THREE.MeshStandardMaterial({ color: col(0.76, 0.1, 84), metalness: 1, roughness: 0.36 });
  const rodMat = new THREE.MeshStandardMaterial({ color: col(0.8, 0.1, 86), metalness: 1, roughness: 0.28 });
  const ironMat = new THREE.MeshStandardMaterial({ color: col(0.34, 0.03, 55), metalness: 0.8, roughness: 0.5, flatShading: true });

  const engraved = (b, wrap) => new THREE.MeshStandardMaterial({
    map: dataTex(b.color, b.W, b.H, true, wrap, aniso),
    normalMap: dataTex(b.normal, b.W, b.H, false, wrap, aniso),
    roughnessMap: dataTex(b.orm, b.W, b.H, false, wrap, aniso),
    metalness: 1,
    roughness: 1,
  });
  // the ORM texture carries roughness in G and metalness in B
  const withMetal = (m) => { m.metalnessMap = m.roughnessMap; return m; };

  const halo = (r) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.0055, 8, 320),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    m.visible = false;
    m.renderOrder = 2;
    return m;
  };

  const band = (id) => {
    const d = DIMS[id], spec = BANDS[id];
    const circ = TAU * ((d.rIn + d.rOut) / 2);
    let W = Math.min(maxTex, Math.round(circ * density));
    W -= W % 2;
    const H = Math.round((d.rOut - d.rIn) * (W / circ));
    const g = paintBand({ W, H, halves: spec.halves, style: spec.style, seed: spec.seed });
    const baked = bake(g, PALETTES.brass, { wrapX: true, seed: spec.seed + 1 });
    const mesh = new THREE.Mesh(bandGeometry(d.rIn, d.rOut, d.t, id === 'frame' ? 512 : 384), [withMetal(engraved(baked, true)), edgeMat]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.part = id;
    return mesh;
  };

  const root = new THREE.Group();
  root.name = 'astrolabe';
  const parts = {};

  // frame (the mater) — rotating it turns the whole instrument on its hanger
  await progress();
  const frameMesh = band('frame');
  root.add(frameMesh);

  await progress();
  const shape = kursiShape();
  const kGeo = new THREE.ExtrudeGeometry(shape, { depth: DIMS.frame.t, bevelEnabled: false, curveSegments: 20 });
  kGeo.translate(0, 0, -DIMS.frame.t / 2);
  {
    const B = KURSI_BOUNDS, pos = kGeo.attributes.position, uv = kGeo.attributes.uv;
    const cap = kGeo.groups.find((gr) => gr.materialIndex === 0);
    for (let i = cap.start; i < cap.start + cap.count; i++) {
      let u = (pos.getX(i) - B.x0) / (B.x1 - B.x0);
      if (pos.getZ(i) < 0) u = 1 - u;
      uv.setXY(i, u, (pos.getY(i) - B.y0) / (B.y1 - B.y0));
    }
  }
  const kD = Math.min(density, maxTex / (KURSI_BOUNDS.x1 - KURSI_BOUNDS.x0));
  const kPaint = paintKursi({ outline: shape.getPoints(24), bounds: KURSI_BOUNDS, D: kD, text: 'أسطرلاب' });
  const kursi = new THREE.Mesh(kGeo, [withMetal(engraved(bake(kPaint, PALETTES.brass, { wrapX: false, seed: 7 }), false)), edgeMat]);
  kursi.castShadow = kursi.receiveShadow = true;
  kursi.userData.part = 'frame';
  root.add(kursi);

  // suspension shackle and hanging ring
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.008, 14, 48), rodMat);
  shackle.rotation.y = Math.PI / 2;
  shackle.position.y = 1.39;
  const hanger = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.011, 16, 72), rodMat);
  hanger.position.y = 1.39 + 0.036 + 0.085;
  for (const m of [shackle, hanger]) { m.castShadow = true; m.userData.part = 'frame'; root.add(m); }

  // axle: rod through every band, hex nuts at each band edge
  const rodR = 0.0155;
  const rod = (y0, y1) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rodR, rodR, y1 - y0, 20), rodMat);
    m.position.y = (y0 + y1) / 2;
    m.castShadow = true;
    return m;
  };
  root.add(rod(DIMS.globe.r - 0.01, 1.06), rod(-1.035, -DIMS.globe.r + 0.01));
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(rodR, 16, 10), rodMat);
  capTop.position.y = 1.06;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.024, 20, 14), rodMat);
  finial.position.y = -1.045;
  root.add(capTop, finial);
  const nutGeo = new THREE.CylinderGeometry(0.023, 0.023, 0.007, 6);
  const nutY = [
    DIMS.globe.r + 0.0045,
    DIMS.ring3.rIn - 0.0045, DIMS.ring3.rOut + 0.0045,
    DIMS.ring2.rIn - 0.0045, DIMS.ring2.rOut + 0.0045,
    DIMS.ring1.rIn - 0.0045, DIMS.ring1.rOut + 0.0045,
    DIMS.frame.rIn - 0.0045,
  ];
  for (const y of nutY) for (const s of [1, -1]) {
    const n = new THREE.Mesh(nutGeo, ironMat);
    n.position.y = s * y;
    n.castShadow = true;
    root.add(n);
  }

  parts.frame = { group: root, halo: halo(DIMS.frame.rOut + 0.007), pick: [frameMesh, kursi, shackle, hanger] };
  root.add(parts.frame.halo);

  // the three rings
  for (const id of ['ring1', 'ring2', 'ring3']) {
    await progress();
    const group = new THREE.Group();
    const mesh = band(id);
    const h = halo(DIMS[id].rOut + 0.006);
    group.add(mesh, h);
    root.add(group);
    parts[id] = { group, halo: h, pick: [mesh] };
  }

  // globe
  await progress();
  const gW = Math.min(maxTex, density >= 1200 ? 2048 : 1024);
  const gPaint = paintGlobe({ W: gW, H: gW / 2, land: LAND, labels: GLOBE_LABELS });
  const globeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(DIMS.globe.r, 160, 96),
    withMetal(engraved(bake(gPaint, PALETTES.bronze, { wrapX: true, strength: 2.4, seed: 91, grain: 120 }), true)),
  );
  globeMesh.rotation.y = THREE.MathUtils.degToRad(-130); // Africa and the Indian Ocean face front at 0°
  globeMesh.castShadow = globeMesh.receiveShadow = true;
  globeMesh.userData.part = 'globe';
  const globeGroup = new THREE.Group();
  const gHalo = halo(DIMS.globe.r + 0.014);
  globeGroup.add(globeMesh, gHalo);
  root.add(globeGroup);
  parts.globe = { group: globeGroup, halo: gHalo, pick: [globeMesh] };

  onProgress(1, 'Polishing');
  const pickables = Object.values(parts).flatMap((p) => p.pick);
  return { root, parts, pickables };
}
