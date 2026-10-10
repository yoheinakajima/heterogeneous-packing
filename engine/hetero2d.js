// hetero2d.js — heterogeneous 2D packing: n rectangles of VARYING sizes in a minimal square.
//
// Each piece i is a rectangle (w_i, h_i) with inscribed-disk radius rho_i = min(w_i,h_i)/2.
// Shape state is GLOBAL (γ, τ), synchronized across pieces (as in the parent engine):
//   piece_i(γ, τ) = γ · [ (1−τ)·Rect_i  ⊕  τ·ρ_i·D ]
// At τ=1 every piece is its inscribed disk; at τ=0 the exact rectangle.
// Collision is rect–rect separating-axis tests on the scaled cores, with per-piece
// rounding radii r_i = γ·τ·ρ_i. Energy:
//   E = Σ_pairs (r_i + r_j − sd(cores))_+² + Σ_vertices (wall violation)_+² + μ L.
// Mirrors when-hardening-helps/engine/engine2d.js structure (H00). The congruent-piece
// path there is untouched; this file is self-contained (SAT copied, not imported).
//
// Methods are paths through (γ, τ):
//   harden : γ = 1, τ : 1 → 0   (per-piece inscribed disks → rectangles)
//   rigid  : γ = 1, τ = 0       (full rectangles from the start; same schedule)
// cfg = { pieces: [{w,h}...], container: 'square', method, seed, budget, ... }
'use strict';

// ---------- random (from parent engine) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }

// ---------- pieces ----------
// Per-piece geometry: rectangle half-extents about the centroid.
function makeHeteroPieces(specs) {
  return specs.map(s => {
    const a = s.w / 2, b = s.h / 2;
    return {
      w: s.w, h: s.h,
      rho: Math.min(a, b),          // inscribed-disk radius about centroid
      R: Math.hypot(a, b),          // circumradius
      area: s.w * s.h,
      g: [-a, -b, a, -b, a, b, -a, b], // CCW corners
    };
  });
}
// Deterministic instance generator: spec = {n, w:[lo,hi], h:[lo,hi]}
function genPieces(spec, seed) {
  const rng = mulberry32(seed * 7919 + 17), out = [];
  for (let i = 0; i < spec.n; i++) {
    out.push({
      w: spec.w[0] + rng() * (spec.w[1] - spec.w[0]),
      h: spec.h[0] + rng() * (spec.h[1] - spec.h[0]),
    });
  }
  return out;
}

// ---------- container (square only for H00) ----------
function makeContainer(type) {
  if (type === 'square') return { type, normals: [1, 0, 0, 1, -1, 0, 0, -1], beta: [0.5, 0.5, 0.5, 0.5], area: 1 };
  throw new Error('unknown container ' + type);
}

// ---------- state ----------
function HState(PS, cont, seed) {
  const n = PS.length;
  this.n = n; this.PS = PS; this.C = cont; this.rng = mulberry32(seed * 7919 + 13);
  this.X = new Float64Array(n); this.Y = new Float64Array(n); this.T = new Float64Array(n);
  this.VX = new Float64Array(n); this.VY = new Float64Array(n); this.VT = new Float64Array(n);
  this.GX = new Float64Array(n); this.GY = new Float64Array(n); this.GT = new Float64Array(n);
  this.VW = new Float64Array(n * 8); // 4 core verts × 2 per piece
  this.L = 1; this.vL = 0; this.gam = 1; this.tau = 0; this.step = 0; this.evals = 0;
  this.maxR = 0; this.totalArea = 0;
  for (const p of PS) { if (p.R > this.maxR) this.maxR = p.R; this.totalArea += p.area; }
  this.sizeS = Math.sqrt(this.totalArea / n); // rms linear piece size (noise scaling)
}
const h_core = (st) => st.gam * (1 - st.tau);            // core scale
const h_ri = (st, i) => st.gam * st.tau * st.PS[i].rho;  // per-piece rounding radius
function hPlaceAll(st) {
  const s = h_core(st), V = st.VW;
  for (let i = 0; i < st.n; i++) {
    const c = Math.cos(st.T[i]) * s, d = Math.sin(st.T[i]) * s;
    const x = st.X[i], y = st.Y[i], base = i * 8, g = st.PS[i].g;
    for (let m = 0; m < 4; m++) {
      const gx = g[2 * m], gy = g[2 * m + 1];
      V[base + 2 * m] = x + gx * c - gy * d;
      V[base + 2 * m + 1] = y + gx * d + gy * c;
    }
  }
}

// ---------- signed distance between two convex cores, with gradient (from parent) ----------
// G = d sd / d(x_i, y_i, t_i, x_j, y_j, t_j)
const G = new Float64Array(6);
function sdConvex(V, oa, ka, ob, kb, xi, yi, xj, yj) {
  let minO = Infinity, sep = false, bux = 0, buy = 0, own = 0, bA = 0, bB = 0, bc = 0;
  for (let w = 0; w < 2 && !sep; w++) {
    const o = w === 0 ? oa : ob, kk = w === 0 ? ka : kb;
    for (let e = 0; e < kk; e++) {
      const f = (e + 1) % kk, ex = V[o + 2 * f] - V[o + 2 * e], ey = V[o + 2 * f + 1] - V[o + 2 * e + 1], el = Math.hypot(ex, ey);
      const ux = ey / el, uy = -ex / el;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, ia0 = 0, ia1 = 0, ib0 = 0, ib1 = 0;
      for (let m = 0; m < ka; m++) {
        const pa = V[oa + 2 * m] * ux + V[oa + 2 * m + 1] * uy;
        if (pa < a0) { a0 = pa; ia0 = m; } if (pa > a1) { a1 = pa; ia1 = m; }
      }
      for (let m = 0; m < kb; m++) {
        const pb = V[ob + 2 * m] * ux + V[ob + 2 * m + 1] * uy;
        if (pb < b0) { b0 = pb; ib0 = m; } if (pb > b1) { b1 = pb; ib1 = m; }
      }
      const oA = a1 - b0, oB = b1 - a0, ov = Math.min(oA, oB);
      if (ov < 0) { sep = true; break; }
      if (ov < minO) { minO = ov; bux = ux; buy = uy; own = w; if (oA <= oB) { bc = 1; bA = ia1; bB = ib0; } else { bc = -1; bA = ia0; bB = ib1; } }
    }
  }
  if (!sep) {
    const pax = V[oa + 2 * bA], pay = V[oa + 2 * bA + 1], pbx = V[ob + 2 * bB], pby = V[ob + 2 * bB + 1];
    const g0 = bc * bux, g1 = bc * buy;
    let g2 = bc * (bux * (-(pay - yi)) + buy * (pax - xi));
    let g5 = -bc * (bux * (-(pby - yj)) + buy * (pbx - xj));
    const du = bc * ((-buy) * (pax - pbx) + bux * (pay - pby));
    if (own === 0) g2 += du; else g5 += du;
    G[0] = -g0; G[1] = -g1; G[2] = -g2; G[3] = g0; G[4] = g1; G[5] = -g5;
    return -minO;
  }
  let d2 = Infinity, pAx = 0, pAy = 0, pBx = 0, pBy = 0;
  for (let w = 0; w < 2; w++) {
    const ov = w === 0 ? oa : ob, oe = w === 0 ? ob : oa, kv = w === 0 ? ka : kb, ke = w === 0 ? kb : ka;
    for (let m = 0; m < kv; m++) {
      const vx = V[ov + 2 * m], vy = V[ov + 2 * m + 1];
      for (let e = 0; e < ke; e++) {
        const f = (e + 1) % ke, ax = V[oe + 2 * e], ay = V[oe + 2 * e + 1], dx = V[oe + 2 * f] - ax, dy = V[oe + 2 * f + 1] - ay;
        let u = ((vx - ax) * dx + (vy - ay) * dy) / (dx * dx + dy * dy); u = u < 0 ? 0 : u > 1 ? 1 : u;
        const cx = ax + u * dx, cy = ay + u * dy, q = (vx - cx) * (vx - cx) + (vy - cy) * (vy - cy);
        if (q < d2) { d2 = q; if (w === 0) { pAx = vx; pAy = vy; pBx = cx; pBy = cy; } else { pAx = cx; pAy = cy; pBx = vx; pBy = vy; } }
      }
    }
  }
  const d = Math.sqrt(d2) || 1e-300, nx = (pAx - pBx) / d, ny = (pAy - pBy) / d;
  G[0] = nx; G[1] = ny; G[2] = nx * (-(pAy - yi)) + ny * (pAx - xi);
  G[3] = -nx; G[4] = -ny; G[5] = -(nx * (-(pBy - yj)) + ny * (pBx - xj));
  return Math.sqrt(d2);
}
const hG = new Float64Array(6);
function sdPairH(st, i, j) {
  const X = st.X, Y = st.Y;
  if (h_core(st) <= 0) { // pure disks: center distance
    st.evals++;
    const dx = X[i] - X[j], dy = Y[i] - Y[j], d = Math.hypot(dx, dy) || 1e-300;
    hG[0] = dx / d; hG[1] = dy / d; hG[2] = 0; hG[3] = -dx / d; hG[4] = -dy / d; hG[5] = 0;
    return d;
  }
  st.evals++;
  const sd = sdConvex(st.VW, i * 8, 4, j * 8, 4, X[i], Y[i], X[j], Y[j]);
  hG.set(G);
  return sd;
}

// ---------- energy gradient ----------
function hGradient(st) {
  const n = st.n, s = h_core(st), cut = 2 * st.gam * st.maxR + 1e-9;
  st.GX.fill(0); st.GY.fill(0); st.GT.fill(0);
  hPlaceAll(st);
  let maxO = 0, gL = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dx = st.X[j] - st.X[i], dy = st.Y[j] - st.Y[i];
    if (dx * dx + dy * dy > cut * cut) continue;
    const sd = sdPairH(st, i, j), o = (h_ri(st, i) + h_ri(st, j)) - sd;
    if (o <= 0) continue;
    if (o > maxO) maxO = o;
    const c = -2 * o;
    st.GX[i] += c * hG[0]; st.GY[i] += c * hG[1]; st.GT[i] += c * hG[2];
    st.GX[j] += c * hG[3]; st.GY[j] += c * hG[4]; st.GT[j] += c * hG[5];
  }
  // walls: core vertices (or centre when disks)
  const C = st.C, V = st.VW, L = st.L, pts = s <= 0 ? 1 : 4;
  for (let i = 0; i < n; i++) {
    const r = h_ri(st, i);
    for (let m = 0; m < pts; m++) {
      const vx = pts === 1 ? st.X[i] : V[i * 8 + m * 2], vy = pts === 1 ? st.Y[i] : V[i * 8 + m * 2 + 1];
      const px = -(vy - st.Y[i]), py = vx - st.X[i];
      for (let w = 0; w < C.beta.length; w++) {
        const ax = C.normals[2 * w], ay = C.normals[2 * w + 1];
        const q = ax * vx + ay * vy + r - C.beta[w] * L;
        if (q > 0) {
          st.GX[i] += 2 * q * ax; st.GY[i] += 2 * q * ay; st.GT[i] += 2 * q * (ax * px + ay * py);
          gL -= 2 * q * C.beta[w]; if (q > maxO) maxO = q;
        }
      }
    }
  }
  if (st.tau >= 0.9999) st.GT.fill(0); // disks: no torque
  return { gL, maxO };
}

// one momentum step; container size L is dynamic under pressure mu when moveL
function hStep(st, mu, noise, noiseT, moveL, lr) {
  const beta = 0.85, cap = 0.03 * st.maxR / 0.7071;
  lr = lr || 0.04;
  const { gL } = hGradient(st);
  for (let i = 0; i < st.n; i++) {
    st.VX[i] = beta * st.VX[i] - lr * st.GX[i];
    st.VY[i] = beta * st.VY[i] - lr * st.GY[i];
    st.VT[i] = beta * st.VT[i] - lr * st.GT[i];
    const vm = Math.hypot(st.VX[i], st.VY[i]);
    if (vm > cap) { st.VX[i] *= cap / vm; st.VY[i] *= cap / vm; }
    if (Math.abs(st.VT[i]) > 0.03) st.VT[i] = Math.sign(st.VT[i]) * 0.03;
    st.X[i] += st.VX[i]; st.Y[i] += st.VY[i]; st.T[i] += st.VT[i];
    if (noise > 0) { st.X[i] += noise * gauss(st.rng); st.Y[i] += noise * gauss(st.rng); }
    if (noiseT > 0) st.T[i] += noiseT * gauss(st.rng);
  }
  if (moveL) {
    st.vL = beta * st.vL - 0.02 * (mu + gL);
    if (Math.abs(st.vL) > cap) st.vL = Math.sign(st.vL) * cap;
    st.L += st.vL;
  }
  st.step++;
}

// ---------- exact-ish final measurement (rigid rectangles, γ=1, τ=0) ----------
const _wv = new Float64Array(16);
function hWorldVerts(p, x, y, t, out, o) {
  const c = Math.cos(t), d = Math.sin(t), g = p.g;
  for (let m = 0; m < 4; m++) {
    const gx = g[2 * m], gy = g[2 * m + 1];
    out[o + 2 * m] = x + gx * c - gy * d; out[o + 2 * m + 1] = y + gx * d + gy * c;
  }
}
function hRigidSd(PS, i, a, j, b) { // a,b = [x,y,t]; exact rect–rect signed distance
  hWorldVerts(PS[i], a[0], a[1], a[2], _wv, 0);
  hWorldVerts(PS[j], b[0], b[1], b[2], _wv, 8);
  return sdConvex(_wv, 0, 4, 8, 4, a[0], a[1], b[0], b[1]);
}
function hTightContainer(PS, poses) { // square, origin-centred search frame
  const h = [-Infinity, -Infinity, -Infinity, -Infinity], N = [1, 0, 0, 1, -1, 0, 0, -1];
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i], c = Math.cos(p[2]), d = Math.sin(p[2]), g = PS[i].g;
    for (let m = 0; m < 4; m++) {
      const vx = p[0] + g[2 * m] * c - g[2 * m + 1] * d, vy = p[1] + g[2 * m] * d + g[2 * m + 1] * c;
      for (let w = 0; w < 4; w++) h[w] = Math.max(h[w], N[2 * w] * vx + N[2 * w + 1] * vy);
    }
  }
  const L = Math.max(h[0] + h[2], h[1] + h[3]);
  return { L, cx: (h[0] - h[2]) / 2, cy: (h[1] - h[3]) / 2 };
}
function hLegalize(PS, X, Y, T) {
  const n = X.length;
  let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += X[i]; my += Y[i]; } mx /= n; my /= n;
  let maxR = 0; for (const p of PS) maxR = Math.max(maxR, p.R);
  const cut = 2 * maxR + 1e-9;
  const ok = (s) => {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = [mx + s * (X[i] - mx), my + s * (Y[i] - my), T[i]];
      const b = [mx + s * (X[j] - mx), my + s * (Y[j] - my), T[j]];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > cut) continue;
      if (hRigidSd(PS, i, a, j, b) < -1e-12) return false;
    }
    return true;
  };
  let lo = 1, hi = 1;
  if (!ok(1)) { hi = 1.0001; while (!ok(hi)) hi = 1 + (hi - 1) * 2; for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; } }
  const poses = [];
  for (let i = 0; i < n; i++) poses.push([mx + hi * (X[i] - mx), my + hi * (Y[i] - my), T[i]]);
  const tc = hTightContainer(PS, poses);
  return { L: tc.L, scale: hi, poses: poses.map(p => [p[0] - tc.cx, p[1] - tc.cy, p[2]]) };
}

// ---------- frames ----------
function hSnap(st, frames, ph) {
  const p = [];
  for (let i = 0; i < st.n; i++) p.push(+st.X[i].toFixed(4), +st.Y[i].toFixed(4), +st.T[i].toFixed(4));
  frames.push({ ph, s: st.step, g: +st.gam.toFixed(4), u: +st.tau.toFixed(4), L: +st.L.toFixed(5), p });
}

// ---------- gradient-path methods ----------
function hInitState(cfg, PS, C) {
  const st = new HState(PS, C, cfg.seed);
  st.L = Math.sqrt(cfg.fill * st.totalArea / C.area);
  for (let i = 0; i < st.n; i++) {
    const Ri = PS[i].R;
    for (let tries = 0; tries < 1000; tries++) {
      const x = (st.rng() - 0.5) * st.L * 2, y = (st.rng() - 0.5) * st.L * 2;
      let inside = true;
      for (let w = 0; w < C.beta.length; w++) if (C.normals[2 * w] * x + C.normals[2 * w + 1] * y > C.beta[w] * st.L - Ri) inside = false;
      if (inside) { st.X[i] = x; st.Y[i] = y; break; }
    }
    st.T[i] = st.rng() * 2 * Math.PI;
  }
  return st;
}
function runPathH(cfg, PS) {
  const C = makeContainer(cfg.container);
  const st = hInitState(cfg, PS, C), frames = [], B = cfg.budget;
  const nC = Math.round(cfg.compress * B), nM = Math.round(cfg.morph * B), nS = Math.round(cfg.settle * B);
  const total = nC + nM + nS, every = Math.max(1, Math.floor(total / cfg.frames));
  const path = cfg.path, sizeS = st.sizeS;
  const shapeAt = (u) => { st.gam = path.gamma0 + (1 - path.gamma0) * u; st.tau = path.tau0 * (1 - u); };
  const noisePos = (u, ph) => {
    const base = ph === 'compress' ? cfg.noise * (1 - u) : cfg.noiseMorph * (1 - u);
    return base * sizeS;
  };
  shapeAt(0); hSnap(st, frames, 'start');
  for (let s = 0; s < nC; s++) {
    const u = s / nC, nz = noisePos(u, 'compress');
    hStep(st, cfg.mu * 3, nz, nz * 1.5, true); if (st.step % every === 0) hSnap(st, frames, 'compress');
  }
  for (let s = 0; s < nM; s++) {
    const u = s / nM; shapeAt(u);
    const nz = noisePos(u, 'morph');
    hStep(st, cfg.mu, nz, nz * 1.5, true); if (st.step % every === 0) hSnap(st, frames, 'morph');
  }
  shapeAt(1);
  for (let s = 0; s < nS; s++) {
    const mu = cfg.mu * Math.pow(1e-4, s / nS);
    hStep(st, mu, 0, 0, true); if (st.step % every === 0) hSnap(st, frames, 'settle');
  }
  hSnap(st, frames, 'settle');
  return hFinish(st, PS, C, frames);
}
function hFinish(st, PS, C, frames) {
  const leg = hLegalize(PS, st.X, st.Y, st.T);
  frames.push({ ph: 'legal', s: st.step, g: 1, u: 0, L: +leg.L.toFixed(6), p: leg.poses.flatMap(p => [+p[0].toFixed(5), +p[1].toFixed(5), +p[2].toFixed(5)]) });
  return { L: leg.L, Lsoft: st.L, scale: leg.scale, poses: leg.poses, frames, evals: st.evals, steps: st.step };
}

// ---------- entry ----------
const H_DEFAULTS = {
  seed: 1, container: 'square', method: 'harden', budget: 1,
  compress: 2500, morph: 7500, settle: 1500, mu: 0.02, fill: 3.2, frames: 150,
  noise: 0.015, noiseMorph: 0.004, noiseScale: 1,
};
const H_METHOD_PATHS = {
  harden: { gamma0: 1, tau0: 1 },  // per-piece inscribed disks → rectangles
  rigid: { gamma0: 1, tau0: 0 },   // full rectangles throughout
};
function run(cfg) {
  const c = Object.assign({}, H_DEFAULTS, cfg);
  if (!c.pieces || !c.pieces.length) throw new Error('run needs cfg.pieces = [{w,h}...]');
  const PS = makeHeteroPieces(c.pieces);
  c.noise *= c.noiseScale; c.noiseMorph *= c.noiseScale;
  const t0 = Date.now();
  const base = c.method;
  if (!H_METHOD_PATHS[base]) throw new Error('unknown method ' + c.method);
  c.path = Object.assign({}, H_METHOD_PATHS[base]);
  if (c.tau0 !== undefined) c.path.tau0 = c.tau0;
  if (c.gamma0 !== undefined) c.path.gamma0 = c.gamma0;
  const res = runPathH(c, PS);
  res.ms = Date.now() - t0;
  res.cfg = { method: c.method, seed: c.seed, budget: c.budget, n: PS.length };
  res.pieces = c.pieces;
  return res;
}

module.exports = { run, makeHeteroPieces, genPieces, makeContainer, hLegalize, hRigidSd, hTightContainer, H_METHOD_PATHS, H_DEFAULTS };
