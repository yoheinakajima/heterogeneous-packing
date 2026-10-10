# Heterogeneous Soft-to-Rigid Packing

A separate parallel research project extending [soft-to-rigid](https://yoheinakajima.github.io/soft-to-rigid/)
and [when-hardening-helps](https://yoheinakajima.github.io/when-hardening-helps/) to **heterogeneous**
instances: mixed sizes, mixed shapes, and 3D bin packing.

## Core questions

1. Does the **scaffold-fidelity rule** transfer to heterogeneous instances?
   (When all pieces differ, does the disk scaffold still predict hardening's outcome?)
2. Does hardening beat rigid/SA on **3D bin packing** of irregular/near-cubic items —
   the industrial packaging problem?
3. Which heterogeneity (size variance? shape variance?) drives the advantage?

## Why industrial packaging is in scope

Industrial 3D bin packing *is* heterogeneous packing with extra constraints.
The geometric core (arrange varied boxes in a bin) needs no industry partner —
public benchmarks exist (see Q00 in quantum-harden-packing for the 3D BPP
literature). Industry constraints (weight distribution, fragility, LIFO loading
order) are later extensions, not blockers. This repo starts from the clean
geometric problem and the industrial relevance follows from the benchmarks.

## Research phases (preregistered)

- **H00**: engine — heterogeneous 2D rectangles (varying sizes); per-piece
  morph (each piece: inscribed disk → its rectangle); heterogeneous collision.
- **H01**: does the fidelity rule transfer? (2D heterogeneous; scaffold =
  disk arrangement, optimum = rectangle arrangement)
- **H02**: 3D extension — heterogeneous boxes; hardening with spheres → boxes.
- **H03**: public 3D bin-packing benchmarks vs classical heuristics.
- **H04**: industrial constraints (weight, fragility, LIFO) — needs partner/data;
  scoped but not started.

## Tracking

Same standards: preregistered campaigns, ActiveGraph event ledger
(`packing/ledger.py`), null results preserved, GitHub + Pages.

## Status

See `JOURNAL.md` (generated) and the site.
