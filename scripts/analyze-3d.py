#!/usr/bin/env python3
# H03 analysis: preregistered Spearman(fidelity, harden_gap) test + win rates.
# Fidelity = Spearman rank corr of pairwise centroid distances at compress-end
# (best harden run) vs best-known optimum final arrangement. Frozen from H01/H02.
import json, glob, math, sys
import numpy as np
from scipy import stats

CDIR = sys.argv[1] if len(sys.argv) > 1 else 'campaigns/H03-fidelity-3d'

def dist_matrix(centroids):
    xy = np.array(centroids)
    return np.linalg.norm(xy[:, None, :] - xy[None, :, :], axis=-1)

def spearman_dmat(a, b):
    n = a.shape[0]
    ua = a[np.triu_indices(n, 1)]; ub = b[np.triu_indices(n, 1)]
    r, _ = stats.spearmanr(ua, ub)
    return float(r)

runs = {}
for f in glob.glob(f'{CDIR}/runs-w*.jsonl'):
    for line in open(f):
        line = line.strip()
        if line:
            r = json.loads(line)
            runs[r['id']] = r
runs = {k: v for k, v in runs.items() if 'error' not in v}
insts = sorted({r['instance_id'] for r in runs.values()})
print(f'{len(runs)} good runs, {len(insts)} instances')

rows = []
for inst in insts:
    hr = [r for r in runs.values() if r['instance_id'] == inst and r['method'] == 'harden']
    rr = [r for r in runs.values() if r['instance_id'] == inst and r['method'] == 'rigid']
    if not hr or not rr:
        print(f'{inst}: MISSING ARM hr={len(hr)} rr={len(rr)}'); continue
    hL = min(r['L'] for r in hr); rL = min(r['L'] for r in rr)
    Y = 1 if hL + 1e-4 < rL else 0
    hb = min(hr, key=lambda r: r['L'])
    best = min(hr + rr, key=lambda r: r['L'])
    fid = spearman_dmat(dist_matrix(hb['compress_end_poses']), dist_matrix(best['final_poses']))
    gap = hL - best['L']
    rows.append((inst, Y, rL - hL, fid, gap, hr[0]['n']))
    print(f'{inst}: n={hr[0]["n"]:2} Y={Y} margin={rL-hL:+.4f} fidelity={fid:+.3f} gap={gap:.4f}')

fid = np.array([r[3] for r in rows]); gap = np.array([r[4] for r in rows])
ok = np.isfinite(fid) & np.isfinite(gap)
sp = stats.spearmanr(fid[ok], gap[ok])
print(f'\nH03 3D TRANSFER TEST (n={ok.sum()}): rho={sp.statistic:.3f}, one-sided p={sp.pvalue/2:.4f}')
verdict = 'TRANSFERS' if sp.statistic < -0.3 and sp.pvalue / 2 < 0.05 else 'DOES NOT TRANSFER'
print(f'-> {verdict} (bar: rho<-0.3, p<0.05)')
print(f'wins: {sum(r[1] for r in rows)}/{len(rows)}')
json.dump([{'instance': r[0], 'Y': r[1], 'margin': r[2], 'fidelity': r[3], 'gap': r[4], 'n': r[5]} for r in rows],
          open(f'{CDIR}/h03_results.json', 'w'), indent=1)
print(f'saved {CDIR}/h03_results.json')
