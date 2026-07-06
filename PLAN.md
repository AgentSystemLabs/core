# PLAN — Making /ship deliver on its promise

**Audit date:** 2026-07-04. Scope: `ship` orchestrator, all 37 skills, all 16 subagents, references, CLI, scripts, docs.

## The intent, restated

A user types `/ship <goal>` (or "use ship skill") and the system should behave like a senior engineer: clarify → plan → implement → verify → audit (security, perf, contracts, a11y, clean code) → test → report, at a depth proportional to risk, stopping at code-ready.

**Verdict:** the architecture is right and much of the writing is genuinely excellent — `add-feature`, `modify-feature`, `remove-feature`, and the diagnostic half of `fix-bug` encode real senior-engineer judgment. The system fails not on design but on **integrity and consistency**: phantom skill references the agent will try to invoke, contradictions between files that must agree, an unenforced findings contract across the reviewer fleet, ~250 lines of already-drifting duplicated content, broken `rg` commands in 10 of 16 agents, and several places where the pipeline claims verification it never performs. The CI routing check that should catch this class of rot validates almost nothing (3 of 37 skills).

The plan below is ordered by leverage: fix what's broken → make the promises true → standardize contracts → add missing capabilities → make CI enforce all of it so it can't rot again.

---

## Workstream 1 — Fix broken references and self-contradictions (P0, mechanical)

These are live routing instructions pointing at things that don't exist, or files that disagree with themselves. Highest certainty, lowest effort, do first.

### 1.1 Phantom skills referenced at runtime

| Phantom | Referenced from | Fix |
|---|---|---|
| `code-enforce-route-data`, `code-enforce-layers` | `ship/SKILL.md:186`, `audit/SKILL.md:86`, `agents/reviewer-client-bundle.md:3`, `docs/ship-diagrams.md:157` | Delete, or repoint to `reviewer-contracts` + `reviewer-client-bundle` |
| `add-skeleton-loaders` | `add-empty-error-states/SKILL.md:3,33`, `agents/reviewer-loading-states.md:3,13,129,143`, `docs/ship-diagrams.md:159,241` | Either build it (it fills a real gap: *introducing* loading primitives) or repoint to `polish-ui` |
| `add-seed-data` | `add-migration/SKILL.md:3` | Drop the referral |
| `file-modularity`, `rip-out` | `reorganize-files/SKILL.md:12,14,165` | Repoint to `simplify` and `remove-feature` |
| `reviewer-duplication`, `add-form`, stale `code-check-*` names | `docs/ship-diagrams.md:143,414,449,544,573,613` | Rewrite the diagram doc against current names |

### 1.2 Files that contradict themselves or their own references

- **`audit/SKILL.md:25` vs `:67-69`** — fast mode "runs only simplify + typecheck/lint" vs "simplify AND harden-types run in every mode". Pick one.
- **`add-regression-test/SKILL.md:49`** says staged-fix mode B → "use mode C"; its own mandatory reference `references/reproduction-modes.md:27-33` says unstage → mode A. Also mode E exists in the reference (`:80-90`) but is missing from the SKILL.md mode list (`:46-51`). This contradiction sits inside the skill's load-bearing red/green step.
- **`audit-authz/SKILL.md:3`** claims severities "critical/high/medium" while its body defines LOW at `:101-103`.
- **Alt-text policy conflict**: `audit-a11y/references/fixes.md:32` allows filename-derived alt as an auto-fix; `agents/reviewer-accessibility-regression.md:130` explicitly forbids exactly that. Adopt the reviewer's position (forbid) in both.
- **Two-dot vs three-dot git diff**: `open-pr/SKILL.md:172-174` (NEVER use two-dot) vs `check-release-risk/SKILL.md:43-105,186-189` (mandates two-dot exclusively). Three-dot is correct; fix check-release-risk.

### 1.3 Broken commands agents will execute

- `rg --type tsx` is not a valid ripgrep type — **55 occurrences across 10 agent files** (worst: reviewer-loading-states ×12, reviewer-accessibility-regression ×8, reviewer-error-boundaries ×8). Replace with `--type ts` or `-g '*.tsx'`.
- `rg -E '<pattern>'` — `-E` means `--encoding` in ripgrep, so these fail — **37 occurrences across 10 agent files** plus `check-release-risk/SKILL.md:72,103`. Replace with `rg -e` or `grep -E`.
- `rg -F 'a\|b'` fixed-string alternations can never match: `agents/runtime-contract-tracer.md:64,101-103`, `agents/reviewer-concurrency.md:82`.
- Why this matters: a reviewer whose grep errors out and treats empty output as "no matches" returns a clean scan that scanned nothing — the worst failure mode for an audit system.

### 1.4 Stale docs and version drift

- **`RECOMMEND.md` is a completed to-do list presented as a roadmap** — everything in it shipped as the `reviewer-*` fleet and `check-release-risk`. Delete or rewrite against the real gap list (see Workstream 5).
- **Three version streams disagree**: `package.json` 0.50.2, `.claude-plugin/marketplace.json` 0.48.2, `plugins/.../plugin.json` 0.33.0. Root cause is `release/SKILL.md:48-53`: manifest detection is first-match-wins with `package.json` first, so the marketplace flow is unreachable on this very repo — and a stale `plugin.json` makes releases invisible to Claude Code's updater, the exact failure the skill's own NEVER at `:224-226` warns about. Detect marketplace.json first (or run both flows), then re-sync the three versions.

---

## Workstream 2 — Make the six core routes keep their promises (P0–P1)

### 2.1 `fix-bug`: add a verify-the-fix step (the single biggest promise gap)

The skill's premise is "the side effect never happened" — yet Step 7 ends at "edit the file" (`fix-bug/SKILL.md:129-131`) and the post-fix section opens "after the fix is implemented **and verified**" (`:137`) without any step that verifies. Insert **Step 8 — Verify the fix**: re-run the Step 4 diagnostic (or the regression repro), confirm the observed link in the Step 1 trace now fires, state the evidence in the report. Also:

- Add a `reviewer-authz` dispatch when the patch touches ownership/authorization (`agents/reviewer-authz.md` already claims fix-bug as a caller; the skill never dispatches it).
- Decouple `reviewer-data-integrity` from the migration-only branch (`:144`) so persistence-logic fixes get it too.
- **Close the regression-mode dead end**: `references/regression-hunt.md:83-84` stops at root cause; when the user picks "patch forward," nothing routes back to Step 7 + `add-regression-test` — so the one path with a deterministic repro in hand is the one guaranteed not to get a regression test. Add the handoff clause, and make regression pinning at least `balanced`-tier, not production-only (`:35,147`) — `add-regression-test`'s own description says to invoke it automatically after any fix.

### 2.2 `polish-ui`: rebuild to route grade

At 74 lines with **two** checklist items, it's the weakest of the six front doors, and three callers advertise checks it doesn't contain (`add-feature:301-302`, `modify-feature:126-127`, `ship:198-199` all claim "focus management, loading/disabled states, footer/chrome consistency" — none of which exist in the checklist).

- Add checklist items 3–5: loading/disabled + double-submit on async actions; focus on open (autofocus/trap), not just on close; footer/chrome parity with siblings. Keep the rule/applies-when/fix triple per its growth contract (`:16`).
- Add a Modes section (fast = checklist on named surface; balanced = + `ui-pattern-inspector` sibling-convention pass; production = + `reviewer-accessibility-regression` and `reviewer-loading-states` on touched files) and advertise `mode=`/`include=`/`skip=` in frontmatter — it's the only route that breaks ship's pass-through promise.
- Split the two personas: a standalone-pass preamble (scope the surface via AskUserQuestion, inventory siblings, run checklist, **verify by exercising each fixed interaction**) vs. the current post-step voice (`:8`).
- Add the missing User-question protocol banner; drop the "in this project" leftover in frontmatter (`:3`).

### 2.3 `audit`: fix the battery

- **Add authz coverage** — a "production-readiness pass" currently runs `reviewer-security-regression` (which explicitly defers authorization) and never runs `reviewer-authz`/`audit-authz`. Missing-auth/IDOR is the highest-severity class a production audit can find, and it's structurally invisible today (`audit/SKILL.md:80`).
- Swap repo-wide a11y from `reviewer-accessibility-regression` (documented as changed-files-only, `:83`) to `audit-a11y`.
- Resolve the **audit→simplify scope deadlock**: `audit:68` orders repo-wide scope; `simplify:23` hard-stops at >50 files and its NEVER (`:102-104`) forbids expansion. Give simplify an explicit caller-passed `scope=` parameter and add audit to its invoker list (`simplify:6`).
- Replace the invented `mode=audit` argument (`:63`) with documented args, and fix the technically wrong "launch audit skills concurrently via the Skill tool" (Skill calls are sequential; only Agent dispatches parallelize).
- Add `include=` support (`:22-25,88` honor only `skip=`) and advertise accepted args in frontmatter like every sibling route.

### 2.4 `modify-feature`: close two review gaps, wire the promised subagents

- Add a **`reviewer-perf`** dispatch to the after-editing list (`:62-74`) — an extension adding a query/loop/N+1 currently gets no perf gate while add-feature would run one; `reviewer-perf`'s own doc names modify-feature as a caller.
- Add a 7a-equivalent code review (read add-feature's `references/code-review-checklist.md` against the diff) — `simplify` covers smells, not correctness.
- Wire `crud-surface-mapper`, `ui-pattern-inspector`, and `utility-finder` — all three agent docs claim modify-feature as a caller; the skill never dispatches them. A "add field X to entity Y" modify-run currently skips CRUD-surface enumeration, the exact "shipped to only one surface" failure add-feature's NEVER calls the most common incomplete-feature bug.

### 2.5 `remove-feature`: one gate and one ordering fix

- Add a `reviewer-security-regression` gate: deletions can silently remove security posture (auth middleware, rate limiting, webhook verification shared by surviving routes) — no routed reviewer covers that class today (`:127-135`).
- Fix adjunct ordering ambiguity at `:127` — reviewers should run **after** Phase 5's sweep stabilizes, not on a tree still containing orphans.
- Add a coverage-delta check to Phase 6: Phase 4 deletes tests first, so coverage of surviving paths can drop invisibly while the suite stays green.

### 2.6 `ship`: routing intelligence and appendix truth

- **Classify with one repo probe, not phrasing alone.** Step 1 maps verbs to intents; "add a settings page" in a repo that already has one is EVOLVE, not CREATE. Add a cheap pre-classification grep for the named artifact before locking intent.
- **Sync the appendix with reality**: the FIX section (`:201-204`) lists 2 adjuncts; fix-bug actually routes 7+. The AUDIT section (`:213`) lists four audit-* skills that audit never invokes.
- **Cover the taxonomy gaps**: "refactor this module" and "write tests for X" map to no intent and dead-end at the no-match rule (`:36`), despite `simplify` and `write-tests` existing. Add a REFACTOR route (→ simplify with caller-passed scope) and a TEST route (→ write-tests), or explicitly name them in the no-match pointer list.
- **Single-source the risk-signal list** — duplicated verbatim in `ship:44-50` and `add-feature:35` (and echoed in modify/remove). Extract to a shared reference (e.g. `skills/ship/references/risk-signals.md`) that all mode-safety overrides cite.

---

## Workstream 3 — Standardize the reviewer findings contract (P1)

Callers apply "`auto-fixable: true` items mechanically" (add-feature `:181,192,195,201,206,209,212,215`), so the findings format is a real API. Today it's 11 near-copies with visible generational drift:

1. **`reviewer-authz` and `reviewer-perf` never define `auto-fixable`** (`reviewer-authz.md:92-132`, `reviewer-perf.md:56-80`) — add explicit `auto-fixable: false` lines (the `reviewer-observability-coverage` pattern, `:137`, is the model).
2. **One severity scale.** Only authz has CRITICAL; security-regression tops out at HIGH — so an IDOR outranks a leaked secret in any aggregation. Decide the scale (recommend CRITICAL/HIGH/MEDIUM/LOW pack-wide), fold observability's stray INFO (`:90`) into LOW, and fix perf's "HIGH IMPACT" labels.
3. **One report template.** authz and perf use box-drawing; the other nine use markdown `## <name> scan — <N> findings`. Converge on markdown; extract the shared template + severity definitions into one reference file all 16 agents cite instead of 11 copies.
4. **Resolve intra-fleet duplicate checks**: 7i/7j co-fire on any form+mutation diff and both `reviewer-error-boundaries` Detector C (`:56-65`) and `reviewer-loading-states` Detector A (`:49-56`) flag the same missing `disabled={isPending}` — remove from one, add sibling pointers. Assign webhook-signature-verification to `reviewer-security-regression` unconditionally at HIGH, and make `reviewer-authz.md:78` always defer (its current "defer if both auditors run" is unsatisfiable — a one-shot subagent can't know what else was dispatched).
5. **State pair boundaries on both sides**: reviewer-authz↔audit-authz and reviewer-perf↔audit-perf are zero-sided today (only add-feature knows they're siblings); audit-a11y and add-empty-error-states never mention their reviewer counterparts.

---

## Workstream 4 — Kill the duplicated content before it drifts further (P1)

- **reviewer-perf ↔ audit-perf**: ~106 lines verbatim (`reviewer-perf.md:86-191` = `audit-perf/references/perf-patterns.md:7-128`) plus triage lists, report format, and 6/8 NEVERs. **reviewer-authz ↔ audit-authz**: ~110 lines (`reviewer-authz.md:23-132` = `audit-authz/SKILL.md:12-133`) plus matching NEVER lists. Drift has already happened three times (severity claims, webhook defer clause, alt-text policy). Recommended shape: make the `audit-*` skills thin interactive wrappers that **dispatch their reviewer agent for the scan** and keep only the confirm/apply phases — one catalog, one owner.
- **Residue sweep**: four definitions with four different lists (`commit:54-60`, `check-pr-readiness:88-98`, `open-pr:19`, `release:22`). Shipped consequence: `open-pr` production mode never checks merge markers while its own fast mode does. Canonicalize the full list (incl. merge markers **and secrets patterns**) in `check-pr-readiness` and have the other three reference it.
- **CHANGELOG ownership**: `sync-docs:79` edits it in-place, `update-changelog:92-103` scaffolds it in its own format (violating sync-docs' first NEVER) and would mangle a Keep-a-Changelog file; `remove-feature:134-135` invokes both. Rule: sync-docs defers all CHANGELOG writes to update-changelog; update-changelog inherits existing structure.
- **`simplify` Phase 3 "Code Reuse" agent** (`:48-52`) re-describes `utility-finder`'s exact job without naming it — dispatch the real agent.

---

## Workstream 5 — Add the missing capabilities (P2)

### 5.1 Fresh-context code review for gate 7a

7a is the only always-on review and the only one performed by the **same agent that wrote the code** (`add-feature:171-172`). Self-review inherits the author's blind spots. Dispatch a read-only general reviewer subagent (new `reviewer-code` agent carrying `references/code-review-checklist.md`) with just the diff + plan, and let modify-feature and fix-bug reuse it.

### 5.2 Three new reviewers (highest value given what exists)

1. **`reviewer-test-quality`** — Phase 8's output is the least-audited artifact in the pipeline; a green-but-empty suite silently invalidates every other gate's "verified" claim. Checks: assertions that assert nothing, mock-everything tests, tests that never execute the changed lines, snapshot-only coverage of logic.
2. **`reviewer-boundary-validation`** — read-only sibling of `harden-types` (the audit/apply split the pack already uses for observability): flags new endpoints/handlers reading `req.body`/params with no schema parse. Unvalidated input is the top real-world bug class and is currently un-gated (authz checks *access*, contracts check *drift*, neither checks *shape validation exists*).
3. **`reviewer-dependencies`** — lockfile-diff gate when `package.json` changes: advisories (`npm audit`), install scripts, maintenance signals, license flags, plus a hardcoded-secret-literal sweep (`sk_live_…`, `AKIA…`, `ghp_…`) — today secrets are only scanned in `/commit`, i.e., *after* /ship stops, and only env-leaks (not literals) are reviewed.

### 5.3 Verification nets for the auto-fix skills

- `propagate-ui-pattern`: add a Step 6 — typecheck + run touched components' tests + re-grep after the batch apply (`:112`). It's a multi-file fan-out editor with zero verification today.
- `add-empty-error-states`: add a typecheck gate to Phase 4 (`:114`) and fix the flagship example at `:66-68` — it reads `posts.length` while `data` is still `undefined`, violating its own NEVER at `:169-171`.
- `harden-types`: run the project test suite (not just `tsc`) after any `Schema.parse` boundary insertion (`:69-75`) — typecheck can't catch an over-strict runtime schema, which its own preamble (`:11`) names as the risk; replace hardcoded `origin/main` (`:17`) with merge-base detection.

### 5.4 Pipeline durability and cost

- **Run-state artifact**: production runs span many phases and subagent fan-outs; on context compaction the announced pipeline is the first thing lost. Have /ship write the Step 3 plan block to a scratch file and check phases off as the routed skill completes them — Step 5's report then reads from the record instead of memory.
- **Model pins + least-privilege tools for agents**: no agent specifies `model:` — 11 parallel reviewers inherit production-tier cost per feature. Pin the mechanical helpers (`utility-finder`, `crud-surface-mapper`, `ui-pattern-inspector`) to a cheaper tier; drop Bash from the four non-git helpers (their Bash use is only `rg`/`fd`, already covered by Grep/Glob) so "read-only" becomes structurally enforced rather than prompt-level.
- **include=/skip= canonical vocabulary**: ship promises pass-through but the tokens are undefined or mixed per skill (`modify-feature:27`, `fix-bug:38`, `remove-feature:25` mixes `p5` with `adjacent-smoke`). Enumerate the token set in each core skill's Modes section.
- **Document the mode-less contract**: none of the 14 delivery sub-skills accepts `mode=` — by design (callers gate *whether*, not *how deep*), but nothing says so. One line per skill ("mode-less; callers gate invocation") prevents a future author from adding a conflicting mode table.

---

## Workstream 6 — Harden the publish chain (P1)

- **Fix the strictness inversion**: `commit-and-push:21` runs the full gauntlet even in fast mode, while `open-pr:19-20` lets fast publish a PR with only a residue sweep. A PR is the more public artifact; align (recommend: open-pr fast ≥ commit-and-push fast).
- **`check-pr-readiness` range contract**: callers invoke it against ranges it doesn't define — `commit:69` (uncommitted tree), `release:67` (last-tag→HEAD) — while it hardcodes merge-base with `origin/HEAD` (`:19`) and its residue sweep only scans committed history (`:88`), structurally missing the working tree `/commit` claims it verifies. Document accepted parameters (base override, range, include-working-tree) and make Phase 5 sweep the tree when invoked pre-commit.
- **`address-pr-comments` and `fix-pr-tests` push with no gate** (`address-pr-comments:154-157`; fix-pr-tests Phase 5) — at minimum run the canonicalized residue+secrets sweep on the commits they create.
- **`handoff-codex` tmp collisions**: fixed `/tmp/codex-*.md` paths (`:37,86`) collide across sessions and a stale output file can be read as this run's result — use per-session names and a freshness check.
- **AskUserQuestion protocol compliance**: banner present in only 24/37 skills, and even bannered skills violate it in-body (`release:153,183` — no banner at all; `open-pr:112`; `check-pr-readiness:76-77`; `audit:128`; `add-observability:39`; `propagate-ui-pattern:49-61`). Add the banner uniformly and convert plain-text pickers.

---

## Workstream 7 — Make CI catch this class of rot (P1, cheap, do alongside WS1)

`scripts/check-skill-routing.mjs` currently validates only skills whose description matches the literal phrase `invoked by` — **3 of 37 skills** (`simplify`'s "invoked as a post-step by…" and `write-tests`' "invoked as Phase 8 of…" silently skip validation). That's why every phantom reference above passed CI. Extend it to enforce:

1. Every `agentsystem-core:<name>` token in any SKILL.md resolves to an existing skill directory.
2. Every `subagent_type=<name>` / `reviewer-*` token resolves to `plugins/agentsystem-core/agents/<name>.md`.
3. Broadened invoked-by regex: `invoked (?:by|as .*? (?:by|of))`; also validate the reverse direction (agent docs claiming callers that never dispatch them — this audit found four: crud-surface-mapper/ui-pattern-inspector/utility-finder→modify-feature, reviewer-authz→fix-bug).
4. Every `references/*.md` link in a SKILL.md resolves.
5. Reviewer report-contract lint: each reviewer agent defines the shared severity scale and an `auto-fixable` field.
6. Command lint: reject `rg --type tsx`, `rg -E`, and `\|` inside `rg -F` strings in skill/agent bodies.
7. User-question banner presence in every user-facing skill.
8. Frontmatter `name:` matches directory name; core routes advertise their accepted args (`mode=`, `include=`, `skip=`) in the description.

Also: add `check:routing` to `prepublishOnly` (`package.json:15`); fix the OpenCode converter's hardcoded `edit: deny` (`cli/lib/opencode.js:24-27`) which breaks `pr-comment-resolver` (an editing agent) — derive permissions from each agent's `tools:` frontmatter and update the assertion that locks the wrong behavior in (`tests/init-harness.test.js:88-91`); add an `update`/version-stamp path to `init` so harness copies don't silently go stale; grow the eval harness (`evals/`) into routing assertions — given fixture prompts, assert /ship's intent + mode classification.

---

## Suggested sequencing

| Phase | Contents | Effort |
|---|---|---|
| 1 | WS1 (phantoms, contradictions, rg bugs, version sync) + WS7 items 1–4 so CI locks it in | Small — mostly mechanical edits |
| 2 | WS2 (fix-bug verify, polish-ui rebuild, audit battery, modify-feature gaps, ship appendix/probe) | Medium — the user-visible quality jump |
| 3 | WS3 + WS4 (findings contract, dedupe catalogs, residue sweep canonicalization) | Medium — refactor, no new behavior |
| 4 | WS6 (publish chain) + WS7 remainder | Small–medium |
| 5 | WS5 (reviewer-code, reviewer-test-quality, reviewer-boundary-validation, reviewer-dependencies, run-state artifact, model pins) | Larger — new surface area |

**One test for every change**: after each phase, `npm test && npm run check:routing` must pass with the extended checks — the point of Workstream 7 is that the failures this audit found by hand become failures CI finds for free.
