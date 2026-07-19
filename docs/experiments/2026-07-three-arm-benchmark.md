# Do skill pipelines beat prompting? A 3-arm controlled benchmark

**TL;DR:** The same 5 feature briefs were implemented on a real production codebase by identical headless Claude Code instances under three conditions: a plain prompt, a "think like a senior engineer" prompt, and the AgentSystem `/ship` skill pipeline. Graded blind by a stronger model on a fixed rubric, the ship arm scored **47.0/50 vs 43.2 (baseline) and 41.0 (persona prompt)** — winning all 5 features head-to-head, shipping **zero crashes** (the raw arms shipped a two-crash-class implementation), and writing feature-defining invariant tests in 5/5 branches vs 1/10 raw branches. The premium: **~81% more token spend**. The persona prefix *underperformed* the plain prompt.

This document exists so you can decide whether that claim is real or marketing. Everything is linked: the exact prompts, all 15 pull requests, the grading rubric, per-run token costs, and a limitations section that includes the strongest arguments *against* the result.

---

## 1. The question

Three common beliefs about getting better output from coding agents:

1. **"Just prompt better"** — add persona framing like *"think like a senior engineer."*
2. **"The model is already good"** — a frontier model with a clear brief doesn't need process.
3. **"Process beats prompting"** — structured pipelines (explore → implement → verify → adversarial review) produce measurably better code.

We tested all three at once.

## 2. Setup

### The codebase

[Fleet](https://github.com/AgentSystemLabs/fleet) — a real, production-grade Laravel 12 + Inertia v2 + React 19 app (agent sandbox runner: Daytona sandboxes, Stripe billing, GitHub App integration, multi-tenant workspaces, ~600-test Pest suite, Playwright e2e). Not a toy repo. All arms branched from the same base commit (`52ad779`).

### The features (5 one-paragraph briefs)

| Feature | Why it was chosen |
|---|---|
| Per-run estimated cost | Display-only derivation — tests product-semantics judgment |
| Runs search + status filter | Query handling — tests input hardening and state-space coverage |
| Email notification on run completion | Irreversible side effect — tests idempotency thinking |
| Run tags | Touches a **shared component with 5 consumers** — tests contract propagation |
| One-click rerun | Security-sensitive action path — tests guard and invariant discipline |

Briefs were deliberately high-level and implementation-agnostic. Each brief file was fed byte-identically to all three arms.

### The three arms

| Arm | Prompt | Skills |
|---|---|---|
| **Baseline** | "Implement the feature described below… follow conventions… add tests… verify with tsc + tests… do not commit. FEATURE: `<brief>`" | disabled (`--disable-slash-commands`) |
| **Senior prefix** | Identical, prepended with *"Think like a senior engineer."* | disabled |
| **Ship skills** | Identical body, prepended with *"Use the /ship skill… do not ask questions, use best judgement."* | enabled |

Every instance: `claude -p --model claude-opus-4-8 --effort xhigh`, its own isolated git worktree, headless (no human steering), one shot.

**Skill isolation was verified, not assumed:** post-hoc transcript audit of all 10 skills-off runs found zero `Skill` tool invocations and confirmed the skills listing never entered their context.

### Judging

- **Judge:** Claude Fable 5 (a strictly stronger model tier than the implementers).
- **Evidence:** the raw `git diff` of each branch against `main` — PR descriptions were not shown.
- **Rubric:** 5 dimensions × 10 points — correctness (edge cases, tenancy, races), codebase-convention fit, scope discipline (gold-plating penalized the same as under-delivery), test quality, clarity. Same calibrated scale across all rounds.
- The judge was additionally instructed to hunt each arm for defect classes found in the others (adversarial cross-checks), and to verify tenancy scoping on every branch.

## 3. Results

### Scores (all 15 implementations, blind-graded /50)

| Feature | Baseline | Senior prefix | Ship skills |
|---|---|---|---|
| Per-run cost | 42 | 41 | **46** |
| Search + filter | 43 | 44 | **46** |
| Notifications | 41 | 44 | **48** |
| Run tags | 44 | 34 💥 | **48** |
| One-click rerun | 46 | 42 | **47** |
| **Average** | **43.2** | **41.0** | **47.0** |

💥 = shipped runtime crashes (two classes: a TypeError on three pages from un-propagated shared-component contract, and a NULL-legacy-row crash on the main list).

Full per-dimension scores, per-branch verdicts, and every finding: see the pull requests below and the judge's findings summarized in §4.

### The marketable numbers, stated precisely

- **+8.8%** average quality score vs plain prompting (47.0 vs 43.2)
- **+14.6%** vs persona-prefix prompting (47.0 vs 41.0)
- **5/5 features won** head-to-head against the best competing arm
- **0/5 ship implementations shipped a crash**; 1/10 raw-prompt implementations shipped a page-crashing bug
- **5/5 ship branches wrote feature-defining invariant tests** (e.g. "the frozen plan wins over later profile edits", "email delivery is at-most-once") vs **1/10** raw branches
- The two **highest-scored branches of the entire benchmark** (48/50) are both ship branches
- 1 HIGH-severity authorization hole (source-elevation on rerun) was **caught and fixed by a ship review gate** before PR; the equivalent baseline branch knowingly shipped it
- **Cost of the pipeline: +81% token spend** vs baseline ($45.96 vs $25.38 at Opus 4.8 API list rates across the 5 features)

### The negative result (equally important)

*"Think like a senior engineer"* did **not** help: 41.0 vs baseline's 43.2. The persona arm produced both recognizably "senior-flavored" moves *and* the benchmark's only crashing implementation. On this sample, persona framing is noise; within-pair variance is dominated by run-to-run stochasticity.

### Costs (per feature, estimated at Opus 4.8 API list rates)

| Feature | Baseline | Senior | Ship |
|---|---|---|---|
| Per-run cost | $3.74 | $5.60 | $4.80 |
| Search + filter | $4.19 | $3.07 | $3.52 |
| Notifications | $4.64 | $5.42 | $11.72 |
| Run tags | $7.37 | $6.95 | $17.08 |
| One-click rerun | $5.44 | $3.33 | $8.85 |
| **Total** | **$25.38** | **$24.37** | **$45.96** |

Computed from per-message `usage` in the session transcripts (deduped by message id): $5/MTok input, $25/MTok output, $6.25/MTok cache write, $0.50/MTok cache read.

## 4. What actually made the difference

The judge's analysis attributes the gap to three mechanisms, not to "planning":

1. **Forced enumeration.** The tags feature touches a shared table component rendered by five pages. Adding a required field crashes every page whose controller doesn't supply it — invisible to TypeScript (Inertia props aren't compiler-checked against PHP producers) and to the test suite (no test rendered those pages). The ship pipeline's contracts gate forces enumeration of every consumer/producer of a changed shared contract, including unchanged files. Ship propagated all 5; the persona arm shipped the crash.
2. **Invariant-first tests.** The pipeline requires listing the 1–3 properties that *define* the feature and testing them before enumerating the surface. That's where "the frozen plan beats profile drift", "concurrency caps re-apply", and "delivery is at-most-once even under outbox redelivery" tests came from.
3. **Adversarial post-implementation review.** Reviewer subagents read the finished diff. On rerun, the authz reviewer found a HIGH source-elevation hole (replaying a frozen plan created by an elevated GitHub actor) and it was fixed pre-PR.

Notably, all three mechanisms operate *after or orthogonal to* planning. The baseline model already "plans" (it explored the codebase for dozens of tool calls before editing); the delta came from coverage mandates and review, not from having a plan.

### What the pipeline still missed (residual defects, disclosed)

- **Unescaped LIKE wildcards** in search (`"%{$search}%"` — searching "50%" over-matches). Shipped by 2 of 3 arms.
- **No server-side terminal-state guard** on rerun (a direct POST on a still-running run mints a duplicate; UI-only gating). Shipped by **all** arms.

Both are "absence-shaped" defects at a single code site. Review prompts — human-style reading — reliably miss them; they are lint-rule-shaped problems.

## 5. Verify it yourself

All 15 implementations are open PRs on the Fleet repo with full diffs and test plans:

| Feature | Baseline | Senior | Ship |
|---|---|---|---|
| Per-run cost | [#23](https://github.com/AgentSystemLabs/fleet/pull/23) | [#30](https://github.com/AgentSystemLabs/fleet/pull/30) | [#39](https://github.com/AgentSystemLabs/fleet/pull/39) |
| Search + filter | [#26](https://github.com/AgentSystemLabs/fleet/pull/26) | [#25](https://github.com/AgentSystemLabs/fleet/pull/25) | [#38](https://github.com/AgentSystemLabs/fleet/pull/38) |
| Notifications | [#28](https://github.com/AgentSystemLabs/fleet/pull/28) | [#29](https://github.com/AgentSystemLabs/fleet/pull/29) | [#41](https://github.com/AgentSystemLabs/fleet/pull/41) |
| Run tags | [#31](https://github.com/AgentSystemLabs/fleet/pull/31) | [#32](https://github.com/AgentSystemLabs/fleet/pull/32) | [#42](https://github.com/AgentSystemLabs/fleet/pull/42) |
| One-click rerun | [#27](https://github.com/AgentSystemLabs/fleet/pull/27) | [#24](https://github.com/AgentSystemLabs/fleet/pull/24) | [#40](https://github.com/AgentSystemLabs/fleet/pull/40) |

Reproduction shape:

```bash
# per feature × arm, in an isolated worktree off the same base commit:
claude -p "$(cat prompts/<feature>-<arm>.txt)" \
  --model claude-opus-4-8 --effort xhigh \
  [--disable-slash-commands]   # baseline + senior arms only
```

## 6. Limitations — read these before believing anything above

We think the result is real. Here is everything a skeptic should weigh:

1. **n = 1 run per cell.** 15 runs total. Run-to-run variance in LLM output is large — the baseline-vs-senior comparison itself demonstrates this (their extremes were both produced by randomness, not framing). The arm-level averages (5 runs each) are more stable than any single cell, but this is a benchmark, not a study. We would love to see someone run each cell 5×.
2. **LLM judge.** Fable 5 graded Claude output. LLM judges can prefer visible craft (comments, structure) over substance, and share model-family biases. Mitigations: raw-diff-only evidence, a fixed rubric, adversarial defect cross-checks, and the fact that the headline findings (crashes, missing guards, missing tests) are *binary, human-verifiable facts* in the linked PRs — not taste judgments. Check them yourself.
3. **Conflict of interest.** This benchmark was designed and run by the authors of the skills being benchmarked (via an orchestrating agent). The strongest bias control is §5: every artifact is public.
4. **Gate-tuning feedback loop.** The benchmarked skill version (v0.52.0) includes review gates added after an earlier round of this same experiment surfaced defect classes on these same briefs. That earlier ship round (on the older skills) scored 44.6 — still first place, but the 47.0 figure benefits from gates tuned with knowledge of these tasks. Treat 47.0 as an upper bound and 44.6 as the untuned floor; the fair claim is "the pipeline wins either way; tuned gates widen the gap." New-task generalization is untested.
5. **Cost confound.** The ship arm spent ~81% more tokens. Some of the quality gap may be attributable to "more compute" rather than "better process." (Counterpoint: the senior arm's variance shows undirected extra output doesn't buy quality — the tags-senior branch spent mid-pack and scored 34.)
6. **One codebase, one model, one harness.** Laravel/Inertia/React, Opus 4.8 at xhigh effort, Claude Code headless. Different stacks, models, or interactive use may differ.
7. **Headless-only.** No human in the loop in any arm. A human reviewing plans/diffs changes all three arms' effective quality.

## 7. Conclusion

On this benchmark: **persona prompting did nothing; the model alone was good; the pipeline made it measurably better** — entirely through forced enumeration, mandated invariant tests, and adversarial review of the finished diff. The honest pitch for AgentSystem skills is not "magic prompts": it's that the pipeline reliably does the unglamorous coverage work that even frontier models skip when nobody makes them.

---

*Experiment run 2026-07-18/19 · agentsystem-core v0.52.0 · questions/rebuttals welcome as issues on this repo.*
