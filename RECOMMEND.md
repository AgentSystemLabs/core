# Reliability Recommendations

The specialist reviewer fleet and its shared findings contract have shipped. Core now also
contains the high-leverage orchestration controls extracted from the Fleet experiment without
adding Fleet as a competing top-level workflow:

- `plan-red-team` challenges risky multi-subsystem plans before approval.
- `findings-reconciler` deduplicates parallel reports, resolves conflicts, records reviewer
  coverage, and tracks finding disposition.
- `integration-verifier` independently attacks final combined-tree seams after all mutations.
- `/ship` uses a unique resumable run ledger and honest terminal states.
- CREATE/EVOLVE/FIX run a final candidate gate after cleanup, generated tests, instrumentation,
  UI polish, and reviewer fixes.
- Parallel fan-out has a base-SHA, frozen-contract, one-writer-per-file, retry/fallback, and
  fail-closed mandatory-task contract.

These roles are gated by risk and complexity. They do not run as a fixed six-to-eight-agent tax on
ordinary prompts.

## Remaining opportunities

1. Machine-evaluated orchestration fixtures for gate selection and terminal outcomes.
2. Worktree-backed writer isolation and deterministic merges.
3. Flake detection and selective mutation testing for high-risk domains.
4. A separate CI/deploy workflow; `locally-verified` intentionally does not claim production health.
5. Stronger least-privilege enforcement as each supported harness exposes capability controls.

Do not import the global Fleet skill wholesale. Its generic research/spec/backlog/implementer chain
duplicates Core’s intent-aware workflows and specialist reviewers, while shared-checkout parallel
builders add race risk.

## Historical shipped backlog

The material below records earlier recommendations that have already shipped and remains for audit
history.

This repo has a mature handoff spine. The reviewer fleet proposed in earlier drafts of this
file has **shipped** — every `code-check-*` proposal is now a read-only `reviewer-*` subagent:

- `reviewer-contracts`, `reviewer-data-integrity`, `reviewer-security-regression`,
  `reviewer-authz`, `reviewer-error-boundaries`, `reviewer-concurrency`,
  `reviewer-loading-states`, `reviewer-accessibility-regression`, `reviewer-client-bundle`,
  `reviewer-observability-coverage`, `reviewer-perf`.
- `check-release-risk` shipped as the pre-publish risk briefing feeding
  `/commit-and-push`, `/open-pr`, and `/release`.

The sections below are the historical rationale for capabilities that are now present. See
`PLAN.md` Workstream 5 for the original audit context.

## Top Priorities

### 1. `reviewer-code` — fresh-context code review for gate 7a

Gate 7a (`add-feature` Phase 7) is the only always-on review and today it's performed by the
**same agent that wrote the code**. Self-review inherits the author's blind spots. Dispatch a
read-only general reviewer subagent carrying `references/code-review-checklist.md` with just the
diff + plan, and let `modify-feature` and `fix-bug` reuse it.

### 2. `reviewer-test-quality`

Phase 8's output (the generated tests) is the least-audited artifact in the pipeline; a
green-but-empty suite silently invalidates every other gate's "verified" claim.

Catch:

- Assertions that assert nothing (`expect(x).toBeDefined()` on a value that's always defined).
- Mock-everything tests that never execute the changed lines.
- Tests that don't cover the changed lines at all.
- Snapshot-only coverage of real logic.

### 3. `reviewer-boundary-validation`

Read-only sibling of `harden-types` (audit/apply split, like observability). Flags new
endpoints/handlers reading `req.body` / params with **no schema parse**. Unvalidated input is
the top real-world bug class and is currently un-gated — `reviewer-authz` checks *access*,
`reviewer-contracts` checks *drift*, neither checks whether *shape validation exists*.

### 4. `reviewer-dependencies`

Lockfile-diff gate when `package.json` changes:

- Advisories (`npm audit`), install scripts, maintenance signals, license flags.
- Hardcoded-secret-literal sweep (`sk_live_…`, `AKIA…`, `ghp_…`).

Today secrets are only scanned in `/commit` (i.e., *after* `/ship` stops) and only env-leaks
(not literals) are reviewed.

## Additional Nets

- **Verification nets for the auto-fix skills** — `propagate-ui-pattern`, `add-empty-error-states`,
  and `harden-types` each fan out edits with weak or no post-apply verification. Add typecheck +
  touched-test + re-grep gates (PLAN.md WS5.3).
- **Run-state artifact** — production `/ship` runs span many phases; on context compaction the
  announced pipeline is the first thing lost. Persist the Step 3 plan to a scratch file and check
  phases off as the routed skill completes them (PLAN.md WS5.4).
- **Model pins + least-privilege tools for agents** — pin the mechanical helpers to a cheaper tier
  and drop `Bash` from the read-only helpers so "read-only" is structurally enforced (PLAN.md WS5.4).
