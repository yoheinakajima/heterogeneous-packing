# Notes for AI agents working in this repository

Mirror of when-hardening-helps house rules, adapted for heterogeneous packing.

- **Never edit results.** `campaigns/*/runs*.jsonl` are append-only; `ledger/` is written only by `packing/ledger.py`.
- **Plan before running.** A new experiment is a new folder `campaigns/Hxx-name/plan.json` (question, hypothesis, instances, methods, budgets, seeds, decision rule), committed before its first run. Amendments go in the plan's `amendments` list; do not rewrite.
- **The engine is new.** Heterogeneous support (per-piece geometry, per-piece morph, heterogeneous collision) lives in `engine/`. Do not break the congruent-piece path — it is regression-tested. See `ARCHITECTURE.md`.
- **Industrial constraints need a partner.** H04 is scoped but blocked until industry data/constraints are provided. Do not invent fake industrial constraints; use public benchmarks (H03).
- **No personal email.** Before the first commit in a clone, set `git config user.email "<noreply>"` (name `Yohei Nakajima`).
