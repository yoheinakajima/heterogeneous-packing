// run-hetero.js — campaign runner for heterogeneous-packing.
// Reads campaigns/<C>/plan.json, runs engine/hetero2d.js across
// instances x methods x seeds, appends to campaigns/<C>/runs-w0.jsonl.
// Append-only; skips run_ids already present (resumable, safe to re-run).
// Usage: node scripts/run-hetero.js campaigns/H01-fidelity-transfer/plan.json [--verify N]
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../engine/hetero2d.js');

const ROOT = path.dirname(path.dirname(path.resolve(__filename)));

function genInstancePieces(inst) {
  if (inst.type === 'uniform') {
    return H.genPieces({ n: inst.n, w: inst.w, h: inst.h }, inst.pseed);
  }
  if (inst.type === 'bimodal') {
    const large = H.genPieces({ n: inst.n_large, w: inst.large, h: inst.large }, inst.pseed);
    const small = H.genPieces({ n: inst.n_small, w: inst.small, h: inst.small }, inst.pseed + 1000);
    return large.concat(small);
  }
  throw new Error('unknown instance type ' + inst.type);
}

function compressEndPoses(frames) {
  const cs = frames.filter(f => f.ph === 'compress');
  if (!cs.length) return null;
  const p = cs[cs.length - 1].p; // flat [x0,y0,t0,...]
  const out = [];
  for (let i = 0; i < p.length; i += 3) out.push([p[i], p[i + 1], p[i + 2]]);
  return out;
}

function main() {
  const planPath = process.argv[2];
  if (!planPath) { console.error('usage: node scripts/run-hetero.js <plan.json> [--verify N]'); process.exit(2); }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const campDir = path.dirname(path.resolve(planPath));
  const outPath = path.join(campDir, 'runs-w0.jsonl');

  const verifyN = process.argv.includes('--verify')
    ? parseInt(process.argv[process.argv.indexOf('--verify') + 1] || '0', 10) : 0;

  // load existing run_ids (resumable)
  const done = new Set();
  if (fs.existsSync(outPath)) {
    for (const line of fs.readFileSync(outPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { done.add(JSON.parse(line).run_id); } catch (e) { /* ignore */ }
    }
  }

  const jobs = [];
  for (const inst of plan.instances)
    for (const method of plan.methods)
      for (const seed of plan.seeds)
        for (const budget of plan.budgets) {
          const run_id = `${plan.id}-${inst.id}-${method}-s${String(seed).padStart(2, '0')}-b${budget}`;
          if (!done.has(run_id)) jobs.push({ inst, method, seed, budget, run_id });
        }

  console.log(`plan ${plan.id}: ${jobs.length} pending (${done.size} already done)`);
  const out = fs.createWriteStream(outPath, { flags: 'a' });
  let n = 0, verified = 0, vfail = 0;
  const t0 = Date.now();
  for (const j of jobs) {
    const pieces = genInstancePieces(j.inst);
    const r = H.run({ pieces, container: 'square', method: j.method, seed: j.seed, budget: j.budget });
    const rec = {
      run_id: j.run_id, campaign: plan.id, instance_id: j.inst.id,
      method: j.method, seed: j.seed, budget: j.budget,
      L: r.L, Lsoft: r.Lsoft, evals: r.evals, ms: r.ms,
      compress_end_poses: compressEndPoses(r.frames),
      final_poses: r.poses,
      pieces,
    };
    out.write(JSON.stringify(rec) + '\n');
    n++;
    if (verifyN > 0 && verified < verifyN) {
      const v = quickVerify(pieces, r.poses, r.L);
      verified++;
      if (v.code !== 0) { vfail++; console.error(`VERIFY FAIL ${j.run_id}: code=${v.code} worst=${v.worst}`); }
    }
    if (n % 40 === 0) console.log(`  ${n}/${jobs.length} ... ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  out.end();
  console.log(`done: ${n} runs in ${((Date.now() - t0) / 1000).toFixed(1)}s` +
    (verifyN ? `, verified ${verified}, failures ${vfail}` : ''));
  if (vfail) process.exitCode = 1;
}

// standalone verifier (same logic as scripts/smoke-hetero.js, duplicated to keep runner self-contained)
function quickVerify(pieces, poses, L) {
  const cs = pieces.map((p, i) => {
    const c = Math.cos(poses[i][2]), s = Math.sin(poses[i][2]), a = p.w / 2, b = p.h / 2, out = [];
    for (const [gx, gy] of [[-a, -b], [a, -b], [a, b], [-a, b]])
      out.push([poses[i][0] + gx * c - gy * s, poses[i][1] + gx * s + gy * c]);
    return out;
  });
  let worst = 0;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const pen = satPen(cs[i], cs[j]);
    if (pen > worst) worst = pen;
  }
  let code = worst > 1e-7 ? 1 : 0;
  for (const c of cs) for (const [x, y] of c)
    if (Math.abs(x) > L / 2 + 1e-7 || Math.abs(y) > L / 2 + 1e-7) code = 2;
  return { code, worst };
}
function satPen(P, Q) {
  let pen = Infinity;
  for (const poly of [P, Q]) for (let e = 0; e < poly.length; e++) {
    const f = (e + 1) % poly.length;
    let nx = poly[f][1] - poly[e][1], ny = -(poly[f][0] - poly[e][0]);
    const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
    let mnP = Infinity, mxP = -Infinity, mnQ = Infinity, mxQ = -Infinity;
    for (const p of P) { const d = p[0] * nx + p[1] * ny; if (d < mnP) mnP = d; if (d > mxP) mxP = d; }
    for (const p of Q) { const d = p[0] * nx + p[1] * ny; if (d < mnQ) mnQ = d; if (d > mxQ) mxQ = d; }
    const gap = Math.min(mxP - mnQ, mxQ - mnP);
    if (gap < 0) return 0;
    if (gap < pen) pen = gap;
  }
  return pen;
}

main();
