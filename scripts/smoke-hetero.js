// Smoke test for hetero2d.js (H00). Packs 5 random rectangles with harden and rigid,
// then verifies with INDEPENDENT code (not the engine's collision routines):
//   1. no pairwise rect–rect overlap (standalone SAT)
//   2. every corner inside the reported container
// Usage: node scripts/smoke-hetero.js
'use strict';
const H = require('../engine/hetero2d.js');

// ---------- independent verifier (standalone, shares no code with the engine) ----------
function corners(w, h, x, y, t) {
  const c = Math.cos(t), s = Math.sin(t), a = w / 2, b = h / 2, out = [];
  for (const [gx, gy] of [[-a, -b], [a, -b], [a, b], [-a, b]])
    out.push([x + gx * c - gy * s, y + gx * s + gy * c]);
  return out;
}
function polysOverlap(P, Q) { // SAT on convex polygons P, Q (arrays of [x,y])
  // returns max penetration depth (>=0 means overlap); < 1e-7 is numerical noise.
  // Penetration = MINIMUM over axes of the projection overlap.
  let pen = Infinity;
  for (const poly of [P, Q]) {
    for (let e = 0; e < poly.length; e++) {
      const f = (e + 1) % poly.length;
      let nx = poly[f][1] - poly[e][1], ny = -(poly[f][0] - poly[e][0]);
      const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
      let mnP = Infinity, mxP = -Infinity, mnQ = Infinity, mxQ = -Infinity;
      for (const p of P) { const d = p[0] * nx + p[1] * ny; if (d < mnP) mnP = d; if (d > mxP) mxP = d; }
      for (const p of Q) { const d = p[0] * nx + p[1] * ny; if (d < mnQ) mnQ = d; if (d > mxQ) mxQ = d; }
      const gap = Math.min(mxP - mnQ, mxQ - mnP); // <0 separates
      if (gap < 0) return 0;
      if (gap < pen) pen = gap;
    }
  }
  return pen;
}
function verify(pieces, poses, L) {
  const cs = pieces.map((p, i) => corners(p.w, p.h, poses[i][0], poses[i][1], poses[i][2]));
  let worst = 0, code = 0;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const pen = polysOverlap(cs[i], cs[j]);
    if (pen > worst) { worst = pen; }
  }
  if (worst > 1e-7) code = 1;
  for (const c of cs) for (const [x, y] of c)
    if (Math.abs(x) > L / 2 + 1e-7 || Math.abs(y) > L / 2 + 1e-7) code = 2;
  return { code, worst };
}

// ---------- run ----------
const pieces = H.genPieces({ n: 5, w: [0.5, 1.5], h: [0.5, 1.5] }, 42);
console.log('pieces:', pieces.map(p => `${p.w.toFixed(2)}x${p.h.toFixed(2)}`).join(' '));
let fail = 0;
for (const method of ['harden', 'rigid']) {
  const r = H.run({ pieces, method, seed: 7, budget: 0.5 });
  const v = verify(pieces, r.poses, r.L);
  console.log(`${method}: L=${r.L.toFixed(4)} (soft ${r.Lsoft.toFixed(4)}) evals=${r.evals} ` +
    (v.code === 0 ? `VERIFY OK (worst pen ${v.worst.toExponential(1)})` : v.code === 1 ? `VERIFY FAIL: overlap pen=${v.worst}` : 'VERIFY FAIL: wall'));
  if (v.code !== 0) fail = 1;
}
process.exit(fail);
