// Procedural engraving for the astrolabe.
// Every surface is first drawn as a relief mask — white is raised brass,
// black is the chased ground — then baked into colour, normal and ORM maps
// with turquoise patina settling into the recesses.

const TAU = Math.PI * 2;

/* ---------- colour ---------- */
export function oklch(L, C, h) {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => {
    c = Math.min(1, Math.max(0, c));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  });
}

const rgb255 = (c) => c.map((v) => v * 255);

export const PALETTES = {
  brass: {
    hi: rgb255(oklch(0.91, 0.105, 92)),
    mid: rgb255(oklch(0.81, 0.11, 86)),
    low: rgb255(oklch(0.66, 0.095, 78)),
    patina: rgb255(oklch(0.7, 0.1, 188)),
    patinaPale: rgb255(oklch(0.82, 0.07, 180)),
    grime: rgb255(oklch(0.32, 0.035, 70)),
    patinaAmount: 1,
  },
  bronze: {
    hi: rgb255(oklch(0.76, 0.095, 66)),
    mid: rgb255(oklch(0.62, 0.095, 58)),
    low: rgb255(oklch(0.45, 0.075, 52)),
    patina: rgb255(oklch(0.62, 0.085, 188)),
    patinaPale: rgb255(oklch(0.74, 0.06, 182)),
    grime: rgb255(oklch(0.25, 0.03, 55)),
    patinaAmount: 0.7,
  },
};

/* ---------- noise ---------- */
function makeNoise(seed) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const perm = new Uint8Array(512), val = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = rnd(); }
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  // value noise, optionally periodic in x so strips wrap without a seam
  function noise(x, y, px) {
    let xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    let x1 = xi + 1;
    if (px) { xi = ((xi % px) + px) % px; x1 = (xi + 1) % px; }
    const r0 = perm[(yi & 255)], r1 = perm[((yi + 1) & 255)];
    const a = val[perm[(xi & 255) + r0]], b = val[perm[(x1 & 255) + r0]];
    const c = val[perm[(xi & 255) + r1]], d = val[perm[(x1 & 255) + r1]];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  return { noise, rnd };
}

/* ---------- canvas helpers ---------- */
function ctx2d(W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return c.getContext('2d', { willReadFrequently: true });
}

function disc(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

function ring(g, x, y, r, lw, color) {
  g.strokeStyle = color; g.lineWidth = lw;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
}

function hline(g, W, y, lw) {
  g.fillStyle = 'black';
  g.fillRect(0, y - lw / 2, W, lw);
}

function punch(g, x0, y0, w, h, rnd, density) {
  g.fillStyle = 'white';
  const n = Math.round(w * h * density);
  for (let k = 0; k < n; k++) g.fillRect(x0 + rnd() * w, y0 + rnd() * h, 1.7, 1.7);
}

// Calligraphy fitted inside a box, centred on its ink rather than its em box.
function fitText(g, text, cx, cy, maxW, maxH, color = 'white', minSquash = 0.62) {
  g.font = '700 100px Amiri, "Noto Naskh Arabic", serif';
  g.direction = 'rtl';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const m = g.measureText(text);
  const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || 100;
  const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight || m.width;
  let k = maxH / inkH, sx = 1;
  if (inkW * k > maxW) {
    sx = maxW / (inkW * k);
    if (sx < minSquash) { k *= sx / minSquash; sx = minSquash; }
  }
  g.save();
  g.translate(cx, cy);
  g.scale(sx * k, k);
  g.fillStyle = color;
  g.fillText(
    text,
    (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2,
    (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2,
  );
  g.restore();
}

function label(g, text, x, y, size, color = 'black') {
  g.font = `700 ${size}px Amiri, "Noto Naskh Arabic", serif`;
  g.direction = 'rtl';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, x, y);
}

/* ---------- ornament ---------- */
function curl(g, sx, sy, cx, cy, turns, dir, lw) {
  const r0 = Math.hypot(sx - cx, sy - cy), a0 = Math.atan2(sy - cy, sx - cx);
  g.lineWidth = lw;
  g.beginPath(); g.moveTo(sx, sy);
  let ex = sx, ey = sy;
  for (let i = 1; i <= 36; i++) {
    const t = i / 36, a = a0 + dir * t * turns * TAU, r = r0 * (1 - 0.74 * t);
    ex = cx + Math.cos(a) * r; ey = cy + Math.sin(a) * r;
    g.lineTo(ex, ey);
  }
  g.stroke();
  disc(g, ex, ey, lw * 0.95, g.strokeStyle);
}

function leaf(g, x, y, ang, len) {
  const w = len * 0.36;
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  const mx = (x + ex) / 2, my = (y + ey) / 2;
  const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(mx + nx, my + ny, ex, ey);
  g.quadraticCurveTo(mx - nx, my - ny, x, y);
  g.fill();
}

// Continuous arabesque scroll running under the cartouches.
function vine(g, W, y0, h) {
  const n = Math.max(4, Math.round(W / (h * 1.5))), lam = W / n;
  const yc = y0 + h / 2, A = h * 0.2;
  const stem = (x) => yc + A * Math.sin((TAU * x) / lam);
  g.strokeStyle = 'white'; g.fillStyle = 'white';
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = h * 0.05;
  g.beginPath();
  for (let x = 0; x <= W + 3; x += 3) (x ? g.lineTo(x, stem(x)) : g.moveTo(x, stem(x)));
  g.stroke();
  for (let i = 0; i < 2 * n; i++) {
    const s = i % 2 ? -1 : 1;
    const xc = ((i + 0.5) * lam) / 2;
    const sx = xc + lam * 0.1;
    g.strokeStyle = 'white';
    curl(g, sx, stem(sx), xc + lam * 0.03, yc - s * h * 0.03, 1.15, -s, h * 0.034);
    g.fillStyle = 'white';
    leaf(g, xc - lam * 0.1, stem(xc - lam * 0.1), s > 0 ? Math.PI / 2 + 0.75 : -Math.PI / 2 - 0.75, h * 0.26);
    disc(g, xc - lam * 0.2, yc - s * h * 0.3, h * 0.03, 'white');
  }
}

function beads(g, W, y0, h) {
  g.fillStyle = 'black';
  g.fillRect(0, y0, W, h);
  const n = Math.round(W / (h * 0.95)), step = W / n;
  for (let i = 0; i < n; i++) disc(g, (i + 0.5) * step, y0 + h / 2, h * 0.3, 'white');
}

function arches(g, W, y0, h) {
  g.fillStyle = 'black';
  g.fillRect(0, y0, W, h);
  const n = Math.round(W / (h * 1.25)), step = W / n;
  g.strokeStyle = 'white'; g.lineWidth = h * 0.11;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * step;
    g.beginPath(); g.arc(x, y0 + h, h * 0.62, Math.PI, TAU); g.stroke();
    disc(g, x, y0 + h * 0.72, h * 0.12, 'white');
  }
}

/* ---------- cartouches & roundels ---------- */
function ogeePath(g, x, y, w, h) {
  const e = Math.min(h * 0.6, w * 0.3), yc = y + h / 2;
  g.beginPath();
  g.moveTo(x + e, y);
  g.lineTo(x + w - e, y);
  g.bezierCurveTo(x + w - e * 0.35, y, x + w - e * 0.55, yc, x + w, yc);
  g.bezierCurveTo(x + w - e * 0.55, yc, x + w - e * 0.35, y + h, x + w - e, y + h);
  g.lineTo(x + e, y + h);
  g.bezierCurveTo(x + e * 0.35, y + h, x + e * 0.55, yc, x, yc);
  g.bezierCurveTo(x + e * 0.55, yc, x + e * 0.35, y, x + e, y);
  g.closePath();
}

function pillPath(g, x, y, w, h) {
  const r = h / 2;
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(x + r, y + h);
  g.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2);
  g.closePath();
}

function cartouche(g, x, y, w, h, text, st) {
  const shape = st.cartouche === 'pill' ? pillPath : ogeePath;
  const b = h * 0.085;
  g.fillStyle = 'white'; shape(g, x, y, w, h); g.fill();
  g.fillStyle = 'black'; shape(g, x + b, y + b, w - 2 * b, h - 2 * b); g.fill();
  g.strokeStyle = 'black'; g.lineWidth = b * 0.3;
  shape(g, x + b * 0.42, y + b * 0.42, w - b * 0.84, h - b * 0.84); g.stroke();
  const inner = h - 2 * b;
  fitText(g, text, x + w / 2, y + h / 2, w - 2 * b - inner * 0.9, inner * (st.font ?? 0.8));
}

function star8Path(g, cx, cy, R, rot = 0) {
  const r = R * 0.7654;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = rot + (i * Math.PI) / 8 - Math.PI / 2, rr = i % 2 ? r : R;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}

function star5(g, cx, cy, R) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? R * 0.42 : R;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

const MOTIFS = {
  sun(g, cx, cy, m) {
    g.fillStyle = 'white';
    g.beginPath();
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 0.5) / n) * TAU, a2 = ((i + 1) / n) * TAU;
      const ro = i % 2 ? m * 0.98 : m * 0.8, ri = m * 0.52;
      g.lineTo(cx + Math.cos(a0) * ri, cy + Math.sin(a0) * ri);
      g.quadraticCurveTo(
        cx + Math.cos(a0 + 0.12) * ro * 0.86, cy + Math.sin(a0 + 0.12) * ro * 0.86,
        cx + Math.cos(a1) * ro, cy + Math.sin(a1) * ro,
      );
      g.lineTo(cx + Math.cos(a2) * ri, cy + Math.sin(a2) * ri);
    }
    g.closePath(); g.fill();
    disc(g, cx, cy, m * 0.5, 'black');
    disc(g, cx, cy, m * 0.43, 'white');
    g.fillStyle = 'black';
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(cx + s * m * 0.16, cy - m * 0.07, m * 0.075, m * 0.04, 0, 0, TAU); g.fill();
    }
    g.strokeStyle = 'black'; g.lineWidth = m * 0.045; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy + m * 0.04, m * 0.18, 0.22 * Math.PI, 0.78 * Math.PI); g.stroke();
    g.beginPath(); g.moveTo(cx, cy - m * 0.04); g.lineTo(cx - m * 0.03, cy + m * 0.08); g.stroke();
  },
  moon(g, cx, cy, m) {
    disc(g, cx - m * 0.08, cy, m * 0.74, 'white');
    disc(g, cx + m * 0.2, cy - m * 0.1, m * 0.62, 'black');
    g.fillStyle = 'white';
    star5(g, cx + m * 0.34, cy + m * 0.06, m * 0.24);
  },
  star(g, cx, cy, m) {
    g.fillStyle = 'white'; star8Path(g, cx, cy, m * 0.98); g.fill();
    g.fillStyle = 'black'; star8Path(g, cx, cy, m * 0.74); g.fill();
    g.fillStyle = 'white'; star8Path(g, cx, cy, m * 0.56, Math.PI / 8); g.fill();
    disc(g, cx, cy, m * 0.17, 'black');
  },
  globe(g, cx, cy, m) {
    const R = m * 0.92;
    disc(g, cx, cy, R, 'white');
    disc(g, cx, cy, R - m * 0.1, 'black');
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
    g.strokeStyle = 'white'; g.lineWidth = m * 0.065;
    for (const k of [0.34, 0.7]) { g.beginPath(); g.ellipse(cx, cy, R * k, R, 0, 0, TAU); g.stroke(); }
    g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    for (const k of [-0.62, -0.31, 0, 0.31, 0.62]) {
      g.beginPath(); g.moveTo(cx - R, cy + k * R); g.lineTo(cx + R, cy + k * R); g.stroke();
    }
    g.restore();
  },
  rosette(g, cx, cy, m) {
    g.fillStyle = 'white';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * m * 0.52, cy + Math.sin(a) * m * 0.52, m * 0.42, m * 0.17, a, 0, TAU);
      g.fill();
    }
    g.strokeStyle = 'black'; g.lineWidth = m * 0.04;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * m * 0.3, cy + Math.sin(a) * m * 0.3);
      g.lineTo(cx + Math.cos(a) * m * 0.78, cy + Math.sin(a) * m * 0.78);
      g.stroke();
    }
    disc(g, cx, cy, m * 0.26, 'black');
    disc(g, cx, cy, m * 0.15, 'white');
  },
};

function roundel(g, cx, cy, r, motif) {
  disc(g, cx, cy, r, 'white');
  disc(g, cx, cy, r * 0.85, 'black');
  ring(g, cx, cy, r * 0.925, r * 0.035, 'black');
  MOTIFS[motif](g, cx, cy, r * 0.72);
}

function pivotZone(g, x, y0, h) {
  const w = h * 0.62;
  g.fillStyle = 'white'; g.fillRect(x - w / 2, y0, w, h);
  g.fillStyle = 'black';
  const lw = h * 0.03;
  g.fillRect(x - w / 2 + h * 0.05, y0, lw, h);
  g.fillRect(x + w / 2 - h * 0.05 - lw, y0, lw, h);
}

/* ---------- surfaces ---------- */
// A flat band unrolled into a strip: x runs clockwise from the top pivot,
// canvas top is the band's outer edge.
export function paintBand({ W, H, halves, style = {}, seed = 1 }) {
  const g = ctx2d(W, H);
  const { rnd } = makeNoise(seed);
  const fy0 = H * (style.bead ? 0.2 : 0.13);
  const fy1 = H * (style.scallop ? 0.74 : 0.87);
  const fh = fy1 - fy0;

  g.fillStyle = 'white'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'black'; g.fillRect(0, fy0, W, fh);
  const lw = Math.max(1.5, H * 0.014);
  hline(g, W, H * 0.055, lw);
  hline(g, W, H * 0.95, lw);
  if (style.bead) beads(g, W, H * 0.085, H * 0.085);
  if (style.scallop) arches(g, W, fy1 + H * 0.035, H * 0.13);

  punch(g, 0, fy0, W, fh, rnd, 1 / 42);
  vine(g, W, fy0, fh);

  const half = W / 2, cy = fy0 + fh / 2;
  const pw = fh * 0.62, gap = fh * (style.gap ?? 0.3), rd = fh * 0.94, ch = fh * 0.86;
  halves.forEach((seq, k) => {
    const nR = seq.filter((s) => s.motif).length, nC = seq.length - nR;
    const cw = (half - pw - gap * (seq.length + 1) - nR * rd) / nC;
    let x = k * half + pw / 2 + gap;
    for (const it of seq) {
      if (it.motif) { roundel(g, x + rd / 2, cy, rd / 2, it.motif); x += rd + gap; }
      else { cartouche(g, x, cy - ch / 2, cw, ch, it.text, style); x += cw + gap; }
    }
  });
  for (const x of [0, half, W]) pivotZone(g, x, fy0, fh);
  return g;
}

// The kursi (throne) plate, drawn in instrument coordinates.
export function paintKursi({ outline, bounds, D, text, seed = 5 }) {
  const { x0, x1, y0, y1 } = bounds;
  const W = Math.round((x1 - x0) * D), H = Math.round((y1 - y0) * D);
  const g = ctx2d(W, H);
  const { rnd } = makeNoise(seed);
  const X = (x) => (x - x0) * D, Y = (y) => (y1 - y) * D, S = (v) => v * D;
  const path = new Path2D();
  outline.forEach((p, i) => (i ? path.lineTo(X(p.x), Y(p.y)) : path.moveTo(X(p.x), Y(p.y))));
  path.closePath();

  g.fillStyle = 'black'; g.fillRect(0, 0, W, H);
  g.save();
  g.clip(path);
  punch(g, 0, 0, W, H, rnd, 1 / 42);

  g.strokeStyle = 'white'; g.fillStyle = 'white';
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = S(0.011);
  g.beginPath(); g.moveTo(X(0), Y(1.0)); g.lineTo(X(0), Y(1.32)); g.stroke();
  const scrolls = [
    { y: 1.035, x: 0.3, r: 0.046 },
    { y: 1.24, x: 0.15, r: 0.04 },
    { y: 1.3, x: 0.088, r: 0.026 },
  ];
  for (const side of [-1, 1]) {
    for (const s of scrolls) {
      const cx = side * s.x, sx = cx + side * s.r;
      g.lineWidth = S(0.009);
      g.beginPath();
      g.moveTo(X(0), Y(s.y - 0.03));
      g.quadraticCurveTo(X(side * s.x * 0.45), Y(s.y - 0.055), X(sx), Y(s.y));
      g.stroke();
      curl(g, X(sx), Y(s.y), X(cx), Y(s.y + 0.004), 1.2, -side, S(0.008));
      leaf(g, X(side * s.x * 0.5), Y(s.y - 0.045), side > 0 ? -0.9 : Math.PI + 0.9, S(s.r * 1.1));
      leaf(g, X(cx + side * s.r * 0.2), Y(s.y + s.r * 1.1), side > 0 ? -1.9 : -1.24, S(s.r * 0.9));
    }
  }
  // inscription cartouche
  cartouche(g, X(-0.17), Y(1.175), S(0.34), S(0.08), text, { cartouche: 'ogee', font: 0.78 });
  // suspension boss
  disc(g, X(0), Y(1.354), S(0.03), 'white');
  ring(g, X(0), Y(1.354), S(0.022), S(0.004), 'black');
  disc(g, X(0), Y(1.354), S(0.013), 'black');

  // raised rim, incised groove, inner fillet — stroked on the clipped outline
  const b1 = S(0.011), b2 = S(0.004), b3 = S(0.006);
  g.lineJoin = 'round';
  g.strokeStyle = 'white'; g.lineWidth = 2 * (b1 + b2 + b3); g.stroke(path);
  g.strokeStyle = 'black'; g.lineWidth = 2 * (b1 + b2); g.stroke(path);
  g.strokeStyle = 'white'; g.lineWidth = 2 * b1; g.stroke(path);
  g.restore();
  return g;
}

// Equirectangular globe: engraved coastlines, graticule, equator and ecliptic.
export function paintGlobe({ W, H, land, labels, seed = 9 }) {
  const g = ctx2d(W, H);
  const { rnd } = makeNoise(seed);
  const X = (lon) => ((lon + 180) / 360) * W, Y = (lat) => ((90 - lat) / 180) * H;
  const k = W / 2048;
  g.fillStyle = 'white'; g.fillRect(0, 0, W, H);
  g.lineCap = 'round'; g.lineJoin = 'round';

  const landPath = new Path2D();
  for (const poly of land) {
    poly.forEach(([lo, la], i) => (i ? landPath.lineTo(X(lo), Y(la)) : landPath.moveTo(X(lo), Y(la))));
    landPath.closePath();
  }
  // stippled land
  g.save();
  g.clip(landPath, 'evenodd');
  g.fillStyle = 'black';
  const n = Math.round((W * H) / 70);
  for (let i = 0; i < n; i++) g.fillRect(rnd() * W, rnd() * H, 1.8 * k, 1.8 * k);
  g.restore();
  // waves in open water
  g.strokeStyle = 'black'; g.lineWidth = 1.5 * k;
  for (let i = 0; i < 1100; i++) {
    const x = rnd() * W, y = H * (0.12 + rnd() * 0.72);
    if (g.isPointInPath(landPath, x, y, 'evenodd')) continue;
    const s = 7 * k;
    g.beginPath();
    g.moveTo(x - s, y);
    g.quadraticCurveTo(x - s / 2, y - s * 0.6, x, y);
    g.quadraticCurveTo(x + s / 2, y + s * 0.6, x + s, y);
    g.stroke();
  }
  // graticule
  g.lineWidth = 1.6 * k;
  for (let lon = -180; lon <= 180; lon += 30) { g.beginPath(); g.moveTo(X(lon), 0); g.lineTo(X(lon), H); g.stroke(); }
  for (let lat = -60; lat <= 60; lat += 30) { g.beginPath(); g.moveTo(0, Y(lat)); g.lineTo(W, Y(lat)); g.stroke(); }
  // tropics and polar circles
  g.setLineDash([10 * k, 8 * k]);
  for (const lat of [23.44, -23.44, 66.56, -66.56]) { g.beginPath(); g.moveTo(0, Y(lat)); g.lineTo(W, Y(lat)); g.stroke(); }
  g.setLineDash([]);
  // equator: graduated double line
  g.lineWidth = 2.4 * k;
  for (const d of [-5, 5]) { g.beginPath(); g.moveTo(0, Y(0) + d * k); g.lineTo(W, Y(0) + d * k); g.stroke(); }
  g.lineWidth = 1.4 * k;
  for (let lon = -180; lon < 180; lon += 5) {
    const x = X(lon), t = lon % 30 === 0 ? 10 : 5;
    g.beginPath(); g.moveTo(x, Y(0) - t * k); g.lineTo(x, Y(0) + t * k); g.stroke();
  }
  // ecliptic band
  const ecl = (lon) => Y(23.44 * Math.sin((lon * Math.PI) / 180));
  g.lineWidth = 2.2 * k;
  for (const d of [-7, 7]) {
    g.beginPath();
    for (let lon = -180; lon <= 180; lon += 2) (lon === -180 ? g.moveTo(X(lon), ecl(lon) + d * k) : g.lineTo(X(lon), ecl(lon) + d * k));
    g.stroke();
  }
  g.lineWidth = 1.3 * k;
  for (let lon = -180; lon < 180; lon += 10) {
    g.beginPath(); g.moveTo(X(lon), ecl(lon) - 7 * k); g.lineTo(X(lon), ecl(lon) + 7 * k); g.stroke();
  }
  // coastlines, cut twice for an engraved edge
  g.lineWidth = 3.4 * k; g.stroke(landPath);
  // names
  for (const l of labels) label(g, l.text, X(l.lon), Y(l.lat), l.size * k);
  return g;
}

/* ---------- bake ---------- */
function blur(src, W, H, wrapX) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const r = y * W;
    for (let x = 0; x < W; x++) {
      const xl = x > 0 ? x - 1 : wrapX ? W - 1 : 0;
      const xr = x < W - 1 ? x + 1 : wrapX ? 0 : W - 1;
      tmp[r + x] = (src[r + xl] + 2 * src[r + x] + src[r + xr]) * 0.25;
    }
  }
  for (let y = 0; y < H; y++) {
    const ru = (y > 0 ? y - 1 : 0) * W, r = y * W, rd = (y < H - 1 ? y + 1 : H - 1) * W;
    for (let x = 0; x < W; x++) out[r + x] = (tmp[ru + x] + 2 * tmp[r + x] + tmp[rd + x]) * 0.25;
  }
  return out;
}

// Returns RGBA byte arrays ordered bottom row first (ready for DataTexture).
export function bake(g, pal, { wrapX = true, strength = 3.2, seed = 3, grain = 90 } = {}) {
  const { width: W, height: H } = g.canvas;
  const src = g.getImageData(0, 0, W, H).data;
  const N = W * H;
  let h = new Float32Array(N);
  for (let i = 0; i < N; i++) h[i] = src[i * 4] / 255;
  h = blur(blur(h, W, H, wrapX), W, H, wrapX);

  const color = new Uint8Array(N * 4), normal = new Uint8Array(N * 4), orm = new Uint8Array(N * 4);
  const { noise } = makeNoise(seed);
  const cells = Math.max(1, Math.round(W / grain)), f = cells / W;
  const P = pal.patinaAmount;
  const { hi, mid, low, patina, patinaPale, grime } = pal;

  for (let y = 0; y < H; y++) {
    const ru = (y > 0 ? y - 1 : 0) * W, r = y * W, rd = (y < H - 1 ? y + 1 : H - 1) * W;
    const orow = (H - 1 - y) * W;
    for (let x = 0; x < W; x++) {
      const xl = x > 0 ? x - 1 : wrapX ? W - 1 : 0;
      const xr = x < W - 1 ? x + 1 : wrapX ? 0 : W - 1;
      const hv = h[r + x];
      const dx = (h[r + xr] - h[r + xl]) * 0.5;
      const dy = (h[rd + x] - h[ru + x]) * 0.5;
      let nx = -dx * strength, ny = dy * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = (orow + x) * 4;
      normal[o] = (nx * inv * 0.5 + 0.5) * 255;
      normal[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      normal[o + 2] = (inv * 0.5 + 0.5) * 255;
      normal[o + 3] = 255;

      const n1 = noise(x * f, y * f, cells) * 0.62 + noise(x * f * 2.3, y * f * 2.3, 0) * 0.38;
      const n2 = noise(x * f * 9, y * f * 9, 0);
      const n3 = noise(x * f * 0.6, y * f * 24, 0);
      let t = (hv - 0.3) / 0.4;
      t = t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);

      // polished brass: mostly bright, a little duller where it has oxidised
      let a = 0.45 + (n1 - 0.5) * 1.1; a = a < 0 ? 0 : a > 1 ? 1 : a;
      let b = n2 * 0.5 + (n1 - 0.5) * 0.5 + 0.2; b = b < 0 ? 0 : b > 1 ? 1 : b;
      // chased ground: patina fills most of it, grime pools in patches
      let p = (0.66 + (n1 - 0.5) * 1.2 + (n2 - 0.5) * 0.45) * P; p = p < 0 ? 0 : p > 1 ? 1 : p;
      let q = (n2 - 0.58) * 3; q = (q < 0 ? 0 : q > 1 ? 1 : q) * p;
      // a dark cut line wherever the relief steps down, so every letter reads
      let e = Math.sqrt(dx * dx + dy * dy) * 5; e = e > 1 ? 1 : e;
      const cut = 1 - 0.55 * e * (1 - t);
      for (let c = 0; c < 3; c++) {
        let br = low[c] + (mid[c] - low[c]) * a;
        br += (hi[c] - br) * b;
        let gr = grime[c] + (patina[c] - grime[c]) * p;
        gr += (patinaPale[c] - gr) * q;
        color[o + c] = (gr + (br - gr) * t) * cut;
      }
      color[o + 3] = 255;

      const rough = 0.9 + (0.32 + n2 * 0.12 + (n3 - 0.5) * 0.1 - 0.9) * t;
      const metal = 0.12 + 0.88 * t;
      orm[o] = 255;
      orm[o + 1] = rough * 255;
      orm[o + 2] = metal * 255;
      orm[o + 3] = 255;
    }
  }
  return { W, H, color, normal, orm };
}
