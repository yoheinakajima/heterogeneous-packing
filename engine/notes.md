# hetero2d.js — design notes (H00)

## What it is

A heterogeneous 2D packing engine: n rectangles of **varying** sizes packed in a
minimal square. Extends the congruent-piece engine
(`when-hardening-helps/engine/engine2d.js`) without modifying it. Self-contained
single file; the SAT routine is copied, not imported.

## Design

**Per-piece geometry.** `makeHeteroPieces([{w,h}...])` builds per-piece
`{w, h, rho, R, area, g}` where `rho = min(w,h)/2` (inscribed-disk radius about
the centroid), `R = hypot(w,h)/2` (circumradius), `g` = 4 CCW corners.
`genPieces({n, w:[lo,hi], h:[lo,hi]}, seed)` deterministically generates
instances from a size distribution (the future runner's instance definition).

**Shape state is global (γ, τ), synchronized across pieces** — same as the parent:
```
piece_i(γ, τ) = γ · [ (1−τ)·Rect_i  ⊕  τ·ρ_i·D ]
```
At τ=1 every piece is its inscribed disk (radius γ·ρ_i); at τ=0 the exact
rectangle. The morph is a (core-scale, rounding-radius) interpolation:
core verts scaled by `s = γ(1−τ)`, collision rounding radius `r_i = γ·τ·ρ_i`.
Per-piece differences enter only through ρ_i, R_i, and core shape — the schedule
is shared, so all pieces harden together.

**Energy** (per-piece rounding):
```
E = Σ_pairs (r_i + r_j − sd(cores))_+² + Σ_vertices (wall violation)_+² + μL
```
`sd` is the rect–rect SAT signed distance on scaled cores (copied from parent,
operates on the per-piece vertex cache `VW = n×8`). Gradients mirror the parent
exactly, with `r_i + r_j` replacing `2r`. Torque is zeroed at τ≈1 (disks).

**Container.** Square only for H00; same normals/beta/tightness logic as parent.

**Schedule** (same as parent): compress (2500·B, τ=τ₀, μ·3 pressure, decaying
noise) → morph (7500·B, τ: τ₀→0) → settle (1500·B, τ=0, decaying μ).
Methods: `harden` {τ₀=1}, `rigid` {τ₀=0}; τ₀-overridable for future ablations.

**Scale-aware numerics.** Noise is scaled by `sizeS = sqrt(totalArea/n)` (rms
linear piece size; =1 for the parent's unit-square case). Velocity cap uses
`maxR`. Init container `L = sqrt(fill·Σarea / C.area)`; per-piece wall clearance
with `R_i`.

**Legalization.** Identical in spirit to parent: scale centers apart about the
mean until `hRigidSd ≥ −1e-12` for all pairs, then exact tight square.

## Interface

```js
run({pieces:[{w,h}...], container:'square', method:'harden'|'rigid', seed, budget, ...})
// → {L, Lsoft, poses:[[x,y,t]...], frames, evals, steps, pieces}
```

## Smoke test (scripts/smoke-hetero.js)

5 rectangles, w,h ~ U(0.5,1.5), seed 42; harden and rigid at budget 0.5, verified
by **independent** SAT code (not the engine's collision):

| method | L | worst penetration | verdict |
|---|---|---|---|
| harden | 3.0613 | 1.0e-12 | OK |
| rigid | 3.0441 | 1.0e-12 | OK |

Stress: 6 more runs (n=8, w,h ~ U(0.3,2.0), 3 seeds × 2 methods) — all OK,
worst sd at the 1e-12 legalize tolerance, no wall breaches.

Note: during development the independent verifier initially flagged false
overlaps (it took max instead of min over SAT axes for penetration depth);
the engine was correct throughout. The verifier now reports penetration depth
properly.

## For H01 (not started)

The runner pattern: instances defined by `{n, w:[lo,hi], h:[lo,hi], pseed}` →
`genPieces` → `run({pieces, method, seed})`. Scaffold fidelity needs the
compress-end frame poses (in `frames`) and the best-known final poses — both
available from `run()` output.
