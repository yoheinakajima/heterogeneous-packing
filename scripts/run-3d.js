#!/usr/bin/env node
// H03 3D runner: cub-in-cub via the parent repo's engine3d.js (read-only).
// Usage: node scripts/run-3d.js campaigns/H03-fidelity-3d/plan.json --worker 0 --of 2
// Appends one JSON line per run to runs-w<k>.jsonl (skips finished by run id).
// Saves per-run compress_end_poses + final_poses (centroids only) for fidelity.
'use strict';
const fs = require('fs'), path = require('path');
const E3 = require('/home/hatch/workspace/research/soft-to-rigid/engine/engine3d.js');

const args = process.argv.slice(2);
const planPath = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const worker = +opt('worker', 0), of = +opt('of', 1), limit = +opt('limit', Infinity);
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const dir = path.dirname(planPath);

const jobs = [];
for (const inst of plan.instances) for (const n of inst.ns)
  for (const m of plan.methods) for (const seed of plan.seeds) {
    const id = `H03-${inst.family}-n${n}-${m}-s${seed}-B${plan.budget}`;
    jobs.push({ id, family: inst.family, n, method: m, seed });
  }

const done = new Set();
for (const f of fs.readdirSync(dir)) if (/^runs.*\.jsonl$/.test(f)) {
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n'))
    if (line.trim()) { try { done.add(JSON.parse(line).id); } catch (e) {} }
}
const mine = jobs.filter((j, i) => i % of === worker && !done.has(j.id));
console.error(`[H03 w${worker}/${of}] ${jobs.length} jobs, ${done.size} done, ${mine.length} to run`);

const outPath = path.join(dir, `runs-w${worker}.jsonl`);
const cent = (p) => { const c = []; for (let i = 0; i < p.length; i += 7) c.push([p[i], p[i + 1], p[i + 2]]); return c; };
const compressEnd = (frames) => { let f = null; for (const x of frames) if (x.ph === 'compress') f = x; return f; };

let count = 0;
for (const j of mine) {
  if (count >= limit) break;
  const cfg = Object.assign({}, plan.config[j.method] || {}, { n: j.n, method: j.method, seed: j.seed, budget: plan.budget, frames: 60 });
  let res = null, err = null;
  try { res = E3.run(cfg); } catch (e) { err = String(e && e.stack || e); }
  const row = { id: j.id, campaign: plan.id, instance_id: `${j.family}-n${j.n}`, family: j.family, n: j.n, method: j.method, budget: plan.budget, config: 'default', seed: j.seed, t: new Date().toISOString() };
  if (err) { row.error = err; }
  else {
    const ce = compressEnd(res.frames);
    const legal = res.frames[res.frames.length - 1];
    row.L = res.L; row.ms = res.ms; row.evals = res.evals;
    row.compress_end_poses = cent(ce.p);
    row.final_poses = cent(legal.p);
  }
  fs.appendFileSync(outPath, JSON.stringify(row) + '\n');
  count++;
  if (count % 8 === 0) console.error(`[H03 w${worker}] ${count}/${mine.length} last L=${row.L !== undefined ? row.L.toFixed(4) : 'ERR'}`);
}
console.error(`[H03 w${worker}] finished ${count}`);
