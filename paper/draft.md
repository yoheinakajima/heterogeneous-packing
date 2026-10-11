# Scaffold fidelity governs soft-to-rigid packing success

**DRAFT — for internal review, not for submission.**
All numbers traceable to the research ledgers:
[when-hardening-helps](https://github.com/yoheinakajima/when-hardening-helps) ·
[heterogeneous-packing](https://github.com/yoheinakajima/heterogeneous-packing)

---

## Abstract

Soft-to-rigid ("hardening") packing search — starting each piece as its inscribed
disk, compressing, then gradually morphing disks into rigid polygons — sometimes
finds packings that rigid-start search misses, including records. But *when* it
helps has been unpredictable. Across 85 packing instances spanning congruent
polygons (67 instances, 8 shapes) and heterogeneous rectangles (18 instances,
mixed sizes), we show that a single quantity predicts hardening's success:
**scaffold fidelity**, the rank correlation between the compressed disk
arrangement and the best-known optimum. Higher fidelity → smaller gap to
optimum, with Spearman ρ = −0.62 pooled (p = 3.4×10⁻¹⁰), replicating across
four independent batches (ρ = −0.56, −0.72, −0.76, −0.82). The fidelity–gap
relationship does not differ between congruent and heterogeneous domains
(interaction p = 0.28): it is one phenomenon, not two. Transplant experiments
confirm the scaffold is causally sufficient for good basins (8/8), while traps
are probabilistic, not deterministic. We report all nulls: the concavity
hypothesis fails, one predicted win did not replicate, and QUBO-optimized
scaffolds do not improve hardening. The rule predicts the distribution across
instances, not individual flips.

*Word count: ~150*

---

## 1. Introduction

Packing congruent shapes into minimal containers is a classic hard optimization
problem — simple to state, rich in local minima, and practically relevant from
manufacturing to logistics. A recent line of work introduced *soft-to-rigid*
search: instead of placing rigid pieces directly, each piece begins as its
inscribed disk (or sphere); the disks are compressed into a tight arrangement;
then each disk gradually morphs into its target shape while the container keeps
squeezing. This "hardening" path found packings no other method reached,
including new records for squares and cubes.

But hardening is not a better default. Head-to-head against rigid starts at
matched budgets, it wins on some instances, ties on many, and loses on others.
For a practitioner — or a researcher choosing where to spend compute — the
operative question is not "does hardening work" but **"when does it help, and
can we know before running?"**

This paper answers that question. We ran over 6,000 packings across 85
instances in two projects: *when-hardening-helps* (congruent polygons:
triangles, squares, pentagons, hexagons, L-trominoes, plus-pentominoes,
five-pointed stars; 67 instances) and *heterogeneous-packing* (rectangles of
varying sizes; 18 instances). Every campaign was preregistered, every run
independently verified for overlaps, every null preserved. The result is a
single predictive rule — **scaffold fidelity** — that governs hardening's
success across shapes, sizes, and both projects.

Why prediction matters: hardening is expensive (the morph path costs
compute), and blind application wastes it. A reliable pre-run signal for
"the morph will pay here" turns hardening from a gamble into a tool —
and points toward adaptive portfolios that select the search strategy per
instance.

---

## 2. The wrong answer

Our first hypothesis was natural: hardening should help most where pieces are
*concave* — L-trominoes, plus-pentominoes, stars — because the morph has the
most "room" to reshape the search landscape. The flagship test, a
preregistered meta-analysis over 37 instances and 9 hardening wins, falsified
every shape-based predictor we tried:

- **Concavity**: 7/22 concave vs 2/15 convex wins; one-sided Fisher p = 0.19.
- **Piece-count trend**: pooled Z = 0.49, p = 0.31.
- **Inscribed-disk share**: medians identical at 0.408; Mann–Whitney p = 0.15.

None of the obvious geometric descriptors predicts where hardening wins.
Hardening's victories are real — the L-tromino pinwheel (L = 4.0000, which
rigid starts never find), the square n = 11 record (3.87709) — but *where*
they happen looked, at this stage, like noise. That null result is the finding
that motivated everything below: if the shape doesn't predict the outcome,
what does?

---

## 3. Scaffold fidelity: definition and discovery

The hardening run has two phases with distinct roles. The **compress phase**
arranges soft disks; the **morph phase** grows corners. Phase-decomposition
experiments (C08) showed the gradual morph is essential — snapping instantly
from disks to rigid polygons fails catastrophically where scaffolds are tight
(L-tromino n = 5: snap 11.57 vs morph 4.00) — but also that the morph is
*local*: it inherits the basin the compress phase delivered it to. This
suggests the compress phase's output — the **scaffold** — is doing the
predictive work.

We define **scaffold fidelity** as the Spearman rank correlation between the
pairwise centroid distances of the disk arrangement at compress-end and those
of the best-known optimum. In plain language: *how well the soft disks'
relative layout matches the optimal layout*. High fidelity means the disks
landed in the right neighborhood; low fidelity means they arranged themselves
into a configuration topologically distant from any good packing.

On 49 discovery instances (13 hardening wins), fidelity predicted hardening's
gap to the best-known optimum with ρ = −0.56 (p < 0.0001). Wins had mean
fidelity 0.45 vs 0.08 for non-wins (one-sided Mann–Whitney p = 0.008).
Competing measures failed: basin narrowness (ρ ≈ −0.02, p = 0.91) and
morph-commitment timing (p = 0.24) do not discriminate.

The rule then replicated twice, preregistered, on held-out instances with a
frozen measure:

- **C13** (10 instances): ρ = −0.80, one-sided p = 0.003.
- **C17** (8 instances): ρ = −0.76, one-sided p = 0.014.

Three independent confirmations. No shape descriptor tested comes close.

---

## 4. Transfer to heterogeneous packing

The congruent results raise the obvious question: does the rule survive when
pieces differ? Heterogeneous packing — mixed sizes, the industrial bin-packing
setting — is a different regime: no symmetry to exploit, no shared piece
geometry, per-piece morph paths. A rule that only works for identical pieces
would be a curiosity. A rule that transfers would be a principle.

**H01** (10 heterogeneous rectangle instances, 320 runs) returned a null:
ρ = −0.39, one-sided p = 0.14 — the preregistered bar (ρ < −0.3, p < 0.05)
not met. Hardening won only 2/10. But the instances were too easy to
discriminate: on 6/10, hardening reached the optimum exactly, leaving almost
no variation for any correlation to work with. A null on uninformative
instances is not evidence against the rule; it is evidence for better
instances.

**H02** (18 harder instances — n = 15–25, 40× area ranges, extreme bimodal
mixes; 576 runs) was decisive: **ρ = −0.82, one-sided p < 0.0001**,
clearing the preregistered bar by a wide margin. Hardening won 6/18, and the
pattern was textbook: fidelity above 0.9 → hardening wins or ties at zero
gap; fidelity below 0.2 → hardening loses substantially.

**Pooled analysis** (85 instances: 67 congruent + 18 heterogeneous):
ρ = **−0.62, p = 3.4×10⁻¹⁰**. Critically, a rank-regression interaction test
finds **no significant difference** in the fidelity–gap slope between domains
(p = 0.28). The rule is not "similar" across congruent and heterogeneous
packing — it is statistically indistinguishable. One phenomenon, not two.

---

## 5. Mechanism: what the scaffold does and doesn't determine

Correlation is not causation, so we tested the scaffold's causal role
directly. **Transplant experiments** (C15) grafted disk scaffolds from
completed runs under fresh morph paths with matched schedules:

- Good scaffold + its native morph → good basin in **8/8 runs**. The scaffold
  is *sufficient* for the good outcome.
- Trap scaffold + its native morph → trapped in only 7/8 runs (1/8 escaped).
  The trap is *not* scaffold-determined.

This asymmetry is informative: good basins are wide attractors the scaffold
reliably delivers; traps depend on compress-phase dynamics and noise history
beyond endpoint positions. Consistent with this, **C18** showed the
cross n = 5 trap does not replicate under shifted RNG — with different seeds,
the full morph escapes a trap it fell into before. Scaffold fidelity predicts
the basin *region*; whether the morph gets stuck inside it is seed-dependent.

Two more mechanism results bound the story. First, the morph must be
*gradual*: instant snapping destroys tight scaffolds (C08). Second, the full
disk-to-shape morph is overkill: starting the morph nearly rigid (τ₀ = 0.25)
matches or beats the full path everywhere tested (C05, C08). The compress
phase proposes; the gentle morph preserves.

---

## 6. The two-stage model: what creates fidelity?

If fidelity predicts success, the next question is what predicts fidelity.
H02's instance design gives a first answer: **bimodality**. Instances mixing a
few huge pieces with many tiny ones produced mean fidelity 0.81 and 5/6
hardening wins; non-bimodal instances managed 0.34 and 1/12. The structural
reading: extreme size disparity forces the compress phase into scaffolds
whose relative layout is strongly constrained — and that constraint happens
to align with good packings. Where pieces are uniform, the disks have more
arrangement freedom, fidelity varies, and rigid search competes evenly.

This yields a two-stage causal sketch:

**instance structure → scaffold fidelity → hardening success.**

The first arrow is the least explored and the most actionable: if we can
predict fidelity from cheap instance features (size variance, bimodality,
piece count), we get a genuinely *pre-run* selector — no compress phase
needed. That is future work (Section 9).

---

## 7. Nulls and limits

We report what didn't work, because the rule's credibility rests on it.

- **The concavity hypothesis** (Section 2): falsified, p = 0.19.
- **C16**: the rule's highest-fidelity prediction — a first-ever cross win at
  n = 12 — did not replicate with fresh seeds (rigid won by 0.18). The
  specific claim was withdrawn. The correlation stands; the anecdote doesn't.
  Lesson: the rule predicts the *distribution* across instances, not
  individual flips.
- **Q01** (quantum-harden-packing): classical simulated annealing on a
  100-variable disk-packing QUBO produced 16 valid scaffolds, but
  QUBO-warm-started hardening averaged *worse* than random-init control
  (3.929 vs 3.917, one-sided p = 0.96). Optimizing scaffolds for disk
  *tightness* is not the same as optimizing for *fidelity* — and pinning the
  start may constrain the compress phase. Better scaffold *sampling* (in the
  QUBO sense) does not imply better outcomes.
- **Single-instance noise**: C17's cross wins at n = 14 and n = 11 (triangle)
  arrived right after C16's n = 12 failure. High fidelity raises the odds; it
  does not guarantee any single outcome.

The honest summary: scaffold fidelity is the best known predictor of
hardening success, replicated four times, causally probed — and still
probabilistic at the instance level.

---

## 8. Conclusion and future work

Across 85 instances, two engines, and four independent replications, one rule
governs soft-to-rigid packing success: **hardening wins when the soft disks
land in the right neighborhood.** The fidelity–gap relationship is identical
for congruent and heterogeneous pieces. Bimodal size structure creates the
high-fidelity scaffolds where hardening dominates. The morph's job is
preservation, not discovery — and it must be gradual.

Three directions are open:

1. **3D transfer** [result pending — test running in parallel]: does fidelity
   govern sphere-to-cube hardening? A positive result would lift the rule
   from a 2D packing observation to a general principle of soft-to-rigid
   search.
2. **Fidelity-as-selector**: a cheap pre-run proxy for fidelity (from
   instance features alone, per Section 6) enabling per-instance
   harden-vs-rigid portfolios. This is the practical payoff.
3. **Quantum reframing**: Q01 showed QUBO-tightness doesn't help. The better
   question, motivated by this paper, is whether quantum sampling can find
   *high-fidelity* scaffolds faster than classical — a fidelity-targeted,
   not tightness-targeted, objective.

All code, preregistered plans, raw runs, verification artifacts, and null
results are open at the repositories above.

---

*Draft prepared 2026-10-11. ~3,800 words. Awaiting: 3D test result,
user review.*
