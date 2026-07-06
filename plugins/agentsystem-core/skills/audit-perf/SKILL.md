---
name: audit-perf
description: Static performance audit of a route, page, server function, or module — finds N+1 query patterns, missing DB indexes for filtered/joined columns, oversized SELECT * fetches, blocking sequential awaits that could parallelize, unmemoized React hot-path computations, oversized client bundles from accidental server-only imports leaking to the client, and synchronous file/network reads inside request handlers. Reads files; does not run benchmarks. Reports findings ranked by likely impact with concrete fixes (add index on X, batch with dataloader, Promise.all these awaits, dynamic-import this dep, move this to the loader). Trigger phrases — "audit perf", "this page is slow", "why is this slow", "/audit-perf", "perf review", "find n+1", "check for performance issues", "audit query performance", "bundle size audit". Skip for — single-line tweaks, copy edits, infra-level perf (DB tuning, k8s sizing), and runtime profiling needs (recommend a real profiler).
---

> **User-question protocol:** Whenever this skill needs the user to pick between options, confirm an action, or answer a multiple-choice prompt, you MUST call the `AskUserQuestion` tool to render a proper interactive picker. Do NOT print numbered options as plain text and wait for the user to type a number — that produces a degraded UX. Free-form questions (open-ended typing) may be asked in prose, but any time you would write "1) … 2) … 3) …", use `AskUserQuestion` instead.


# Audit Perf

This skill is the **interactive wrapper** around the `reviewer-perf` subagent. The subagent owns the
pattern catalog and does the scan — one catalog, one owner — and this skill scopes the target,
dispatches the subagent, and walks the user through the findings. Static analysis only: every finding
has a `file:line` and a concrete fix; no "consider optimizing."

---

## Phase 1 — Scope

Default scope = a route, page, or module the user names. If the user says "the slow page", confirm
which route via `AskUserQuestion`. If they say "the codebase", narrow to one entry point — perf
audits across the whole repo produce noise, not signal.

Identify the entry point and the two-layers-deep import set (route file, colocated loader/server-fn,
data-access functions it calls). Do not chase the entire dependency graph.

**Exit:** the file set to scan is fixed (typically 3–10 files), stated back to the user.

---

## Phase 2 — Dispatch the perf scan

Dispatch the **`reviewer-perf`** subagent (`Agent(subagent_type=reviewer-perf)`) with the Phase 1
scope. It runs the full pattern sweep — N+1 queries, missing indexes, `SELECT *`, sequential awaits,
server-only bundle leakage, synchronous I/O in handlers, unbounded fetches, loader waterfalls,
unmemoized hot-path computations, unvirtualized lists — triages false positives, and returns a
severity-ranked markdown report (`## Perf scan — <N> findings`, every finding `auto-fixable: false`).
**The pattern catalog lives in the agent — this skill does not re-list it**, so the two can't drift.

**Host-portability fallback.** If the `Agent` tool isn't available (some non-Claude-Code hosts), read
`plugins/agentsystem-core/agents/reviewer-perf.md` and run its Step 1–4 workflow inline over the
Phase 1 scope, producing the same report. State the degradation to the user.

**Exit:** the reviewer's severity-ranked findings are in hand.

---

## Phase 3 — Present and decide

Surface the reviewer's findings to the user grouped by severity, top-to-bottom. Perf fixes are
**tradeoffs** (an index speeds reads but slows writes; memoization adds complexity), so this skill
does not auto-apply. If the user picks findings to apply, apply them **one at a time** with a
typecheck between each, and show the diff. Never bulk-apply.

End with the reviewer's one-line summary (counts by severity) and note that no fixes were applied
unless the user explicitly asked.

---

## NEVER

- **NEVER apply fixes without the user asking, and never bulk-apply.**
  **Instead:** report findings; apply only what the user picks, one at a time with a typecheck between.
  **Why:** perf fixes are tradeoffs (an index speeds reads but slows writes; memoization adds complexity). The user owns the decision, and one-at-a-time keeps the diff reviewable.

- **NEVER re-list the pattern catalog in this skill.**
  **Instead:** the catalog is owned by `reviewer-perf`; dispatch it. If you think a pattern is missing, add it to the agent, not here.
  **Why:** two copies of the catalog drift — the exact rot this consolidation removed.

- **NEVER report a finding without a file:line.**
  **Instead:** every finding cites the exact location (the reviewer already enforces this).
  **Why:** unsourced findings train the user to skim. A line number lets them verify in seconds.

- **NEVER conflate static-analysis findings with runtime profiling.**
  **Instead:** if the user wants to know what's actually slow in production, recommend a real profiler (browser devtools, server-side APM, EXPLAIN ANALYZE) and stop.
  **Why:** static patterns predict but don't measure. Pretending static = runtime misleads the user.

- **NEVER scan the whole repo by default.**
  **Instead:** narrow to one route / page / module; ask which entry point matters.
  **Why:** a full-repo perf scan produces hundreds of low-impact findings that drown the high-impact ones.
