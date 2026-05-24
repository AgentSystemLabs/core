# AgentSystem

**Website:** [agentsystem.dev](https://agentsystem.dev) · **Mission Control Pro:** [agentsystem.dev](https://agentsystem.dev)

```bash
npx @agentsystemlabs/core init --harness claude
```

A Claude Code plugin marketplace providing **agentsystem-core** — 37 skills focused on forcing AI to ship production-ready code: feature delivery, debugging, code-quality enforcement, audits, release management. The core plugin also ships 16 read-only reviewer subagents that the skills fan out to for security, perf, contracts, concurrency, data-integrity, accessibility, and bundle audits.

## Install

### Claude Code (plugin marketplace)

```
/plugin marketplace add https://github.com/AgentSystemLabs/core
/plugin install agentsystem-core@agentsystem
```

To update later: `/plugin marketplace update agentsystem`. To remove: `/plugin uninstall agentsystem-core@agentsystem`.

### Manual install (any tool that reads `SKILL.md`)

For users not on Claude Code — Claude Agent SDK, Cursor, custom agents, or anything that loads Anthropic-format skills from disk — install via the npm CLI:

```bash
# One-shot via npx
npx @agentsystemlabs/core init                                    # → ./.claude/{skills,agents}/
npx @agentsystemlabs/core init --harness codex                    # → ./.codex/{skills,agents}/
npx @agentsystemlabs/core init --harness cursor                   # → ./.cursor/{skills,agents}/
npx @agentsystemlabs/core init --harness opencode                 # → ./.opencode/{skills,agents}/
npx @agentsystemlabs/core init --global                           # → ~/.claude/{skills,agents}/
npx @agentsystemlabs/core init --harness codex --global           # → ~/.codex/{skills,agents}/
npx @agentsystemlabs/core init --harness cursor --global          # → ~/.cursor/{skills,agents}/
npx @agentsystemlabs/core init --harness opencode --global        # → ~/.config/opencode/{skills,agents}/
npx @agentsystemlabs/core init --plugin core                      # subset (short name)
npx @agentsystemlabs/core init --dest ./my-skills                 # custom skills path
npx @agentsystemlabs/core init --skip-agents                      # skills only, no subagents
npx @agentsystemlabs/core list                                    # show available skills + subagents
npx @agentsystemlabs/core uninstall                               # remove installed skills + subagents

# Or install globally
npm install -g @agentsystemlabs/core
agentsystem init
```

Each skill lands as `<harness-root>/skills/<skill-name>/SKILL.md` (with its `references/` folder if present), so any agent that reads SKILL.md format picks them up directly. Subagents land in parallel at `<harness-root>/agents/<agent-name>.<ext>` — `.md` for Claude Code and Cursor (which read the same format), `.toml` for Codex (auto-converted from the source `.md` with descriptions truncated to Codex's 1024-char limit), and OpenCode-native `.md` for OpenCode (adds `mode: subagent` and read-only permissions). The supported harnesses are `claude` (alias: `claude-code`), `codex`, `cursor` (alias: `cursor-cli`), and `opencode`; `--dest` overrides the skills path and `--agents-dest` overrides the subagents path. By default `init` skips files that already exist — pass `--force` to overwrite. The `--plugin` flag accepts short names (e.g., `core` for `agentsystem-core`), can be repeated, or comma-separated. Pass `--skip-agents` to install only the skills.

### OpenCode

[OpenCode](https://opencode.ai) can run alongside Codex, Copilot, and OpenCode Go plan in the same project. Install AgentSystem skills and subagents into OpenCode's native layout:

```bash
npx @agentsystemlabs/core init --harness opencode                 # project: .opencode/{skills,agents}/
npx @agentsystemlabs/core init --harness opencode --global          # global: ~/.config/opencode/{skills,agents}/
```

Skills are discovered from `.opencode/skills/*/SKILL.md` and loaded on demand via OpenCode's `skill` tool. Subagents are written as markdown agents with `mode: subagent` so primary agents (Build, Plan) can invoke them via `@mention` or the Task tool. See the [OpenCode agents](https://opencode.ai/docs/agents/), [skills](https://opencode.ai/docs/skills/), and [plugins](https://opencode.ai/docs/plugins/) docs for configuration beyond the install step.

## Autopilot — start here

```
/ship <describe your goal>
```

`/ship` is the front door. Hand it any engineering goal and it does three things you'd otherwise have to do yourself:

1. **Classifies intent** — CREATE / EVOLVE / POLISH / REMOVE / FIX / AUDIT — from your phrasing.
2. **Picks a depth mode** — `fast` / `balanced` / `production` — from risk and complexity signals (auth, payments, migrations, destructive deletions, jobs/webhooks, external APIs, cache invalidation, concurrency-sensitive mutations, and multi-subsystem changes auto-bump to production).
3. **Routes** to the matching core skill (`add-feature`, `modify-feature`, `polish-ui`, `remove-feature`, `fix-bug`, `audit`) with the resolved mode, announces the pipeline, and runs it.

It deliberately stops at "code is production-ready" — never commits, pushes, or opens PRs. After it finishes, choose how to publish: `/commit` (grouped commits only), `/commit-and-push`, or `/open-pr`.

```
# auto-infer everything
/ship "add stripe webhook handler"            # → CREATE + production (touches payments)
/ship "tweak the navbar color"                # → EVOLVE + fast (cosmetic)
/ship "the login button doesn't redirect"     # → FIX + balanced
/ship "delete the old beta-flags page"        # → REMOVE + balanced

# explicit overrides
/ship "scaffold a settings page" mode=fast
/ship "add OAuth flow" mode=production skip=7c

# call the underlying core skill directly when you don't want orchestration
/add-feature "scaffold a settings page" mode=fast
```

The core skills (`add-feature`, `modify-feature`, `fix-bug`, `remove-feature`) all accept `mode=fast|balanced|production` and `include=` / `skip=` overrides — `/ship` is sugar over them, not a replacement.

---

## Skills in `agentsystem-core`

### Workflow & Planning

- **`/ship`** — Autopilot orchestrator. Classifies intent, picks a depth mode, routes to the right core skill. Stops at code-ready.
- **`/add-feature`** — End-to-end feature delivery in an existing codebase: clarify → explore → design → plan-approval gate → implement → verify → gated reviews → tests. Enforces UI-convention parity (modals/forms/drawers/dialogs must match siblings).
- **`/modify-feature`** — Adds a small extension to an existing feature. Pre-flight interrogates the proposed shape, surfaces alternative seams, audits shifted contracts, then runs gated checks.
- **`/remove-feature`** — Leaf-first deletion with persisted-data awareness (existing rows holding values from removed enums/columns are first-class concerns). Honors `mode=fast|balanced|production`.
- **`/testing-plan`** — Produce a concrete manual-QA testing plan (actor / route / expected result) for a branch or feature. Refuses to invent credentials; append-not-overwrite.

### Debugging & Fixing

- **`/fix-bug`** — Diagnose silent integration failures by leading with the runtime contract before hypotheses. Trigger / dispatch / receive / observe trace. Modes: `fast` / `balanced` / `production`.
- **`/fix-pr-tests`** — Classify a failing PR test as real-bug / stale-test / flake (3× re-run rule), then fix the right side. Never edits CI config to make a test pass.
- **`/add-regression-test`** — Pin a bug fix with a test that fails without the fix and passes with it. Modes A/B/C/D for staged / committed / squashed states.
- **`/handoff-codex`** — Hand off a stalled task to the OpenAI Codex CLI for a second pass. Builds a handoff packet (original goal, what was tried, live diff), fires `codex exec` headless, verifies what changed.
- **`/resolve-conflict`** — Walk a merge/rebase conflict file by file. Identical/complementary/incompatible block typology, lockfile-regenerate vs hand-merge, never `--theirs` on a source file without reading both.

### Code Quality & Refactor

- **`/audit`** — Whole-codebase tech-debt sweep. Maps architecture + data flow, then orchestrates every `audit-*` skill and `reviewer-*` subagent across the repo. Gates mechanical vs structural fixes.
- **`/simplify`** — Diff-scoped refactor pass with parallel agent fan-out (Reuse / Quality / Efficiency). Magic numbers, naming, oversized files, parallel-enum drift, repeated literals. Per-fix safety-net rule.
- **`/realign`** — Update a code model (types, state machines, vocabulary, persisted data) to match changed business requirements. Migrates persisted-data values as a first-class step.
- **`/harden-types`** — Strip `any`, dangerous casts, missing return types, missing boundary validation. Mechanical / structural / legitimate classification.
- **`/add-migration`** — Schema migration with three-class taxonomy (additive / mutating / destructive), explicit multi-step rollout plan, `CONCURRENTLY` awareness, NOT-NULL-on-populated-table trap, `DEFAULT now()` per-row gotcha.
- **`/add-observability`** — Add structured logging, metrics, traces at the right boundaries. Replaces silent failure paths with explicit logs + telemetry.
- **`/audit-authz`** — Identity vs ownership separation, IDOR detection, webhook-signature awareness on every server-side entry point.
- **`/write-tests`** — Write tests for an existing code path. Smoke-test hard gate; real test DB over mocks; never mock the layer the bug lives in.
- **`/add-e2e-test`** — Playwright workflow with explicit smoke gate, selector preference order, 3× flake check.
- **`/reorganize-files`** — Reorganize a directory into a clear grouped layout, then update every reference (static imports, `?url`, `import.meta.glob`, CSS `url()`, OG metadata). Five reference styles tracked separately.

### UX & UI

- **`/polish-ui`** — Apply a UX polish checklist to existing UI without changing behavior. Auto-fixes mechanical gaps inline.
- **`/propagate-ui-pattern`** — Sibling sweep with per-instance APPLY/SKIP/ASK. Rule-of-three extraction gate; behavior+affordance pairing.
- **`/add-empty-error-states`** — Three-state UI model (loading / empty / error) with concrete tsx examples. Handles `useSuspenseQuery` error boundary correctly.
- **`/audit-a11y`** — Whole-app accessibility audit with WCAG thresholds. Sensible auto-fix vs structural split.
- **`/audit-responsive`** — Whole-app responsive audit. Inline failure-mode catalog with Tailwind snippets, 4 canonical viewports, `100vh` vs `100dvh` vs `100svh` distinction.
- **`/audit-perf`** — Whole-app performance audit. Evidence-anchored — no `potential` findings.
- **`/audit-seo-meta`** — Tag-by-tag SEO/meta severity table. Distinguishes per-route vs repo-level.
- **`/audit-analytics`** — Analytics-event coverage audit. SDK detection table, PII classification with severity, MUST/SHOULD/OK rubric.

### Release & Docs

- **`/commit`** — Split the working tree into one or more logically-grouped commits (schema → backend → frontend; deps before consumers; types before usages). Detects conventional-commits style; never pushes.
- **`/commit-and-push`** — Run `/commit`, then push the current branch to its remote (sets upstream with `-u` when missing). Never force-pushes.
- **`/open-pr`** — Open a GitHub PR from an already-committed branch. Three-dot diff, draft detection, mandatory confirmation gate, integrates release-risk briefing.
- **`/release`** — Cut a versioned release. Multi-manifest detection (`package.json`, `pyproject.toml`, `Cargo.toml`, `VERSION`), plugin-marketplace diff-driven bump, dirty-tree refusal, push-confirm gate.
- **`/check-pr-readiness`** — Fail-fast gauntlet before pushing: typecheck, lint, format-only auto-fix, lockfile-aware residue sweep on added lines only.
- **`/check-release-risk`** — Pre-publish risk briefing invoked by `/commit-and-push`, `/open-pr`, `/release`. Seven categorizers (public API, persistence, auth, env vars, manual QA, doc/changelog drift, rollback). Informs; never blocks.
- **`/address-pr-comments`** — Resolve unresolved GitHub PR review threads end-to-end. Fans out one `pr-comment-resolver` subagent per thread; sequential commits (one per thread); replies + resolves via the GitHub API.
- **`/update-changelog`** — Append a categorized entry to `CHANGELOG.md`. Canonical emoji set; dedup check; "would a user a year from now care".
- **`/sync-docs`** — Update existing project documentation in-place after code changes (Swagger/OpenAPI, README, ADRs, `.env.example`, setup guides). Never creates new doc files.

---

## Reviewer subagents (read-only, in `agentsystem-core/agents/`)

The skills above fan out to these read-only subagents for diff-scoped audits. They never edit files; they return severity-ranked findings with file:line refs and concrete fix snippets. They are invoked indirectly by the orchestrating skills (`add-feature`, `modify-feature`, `fix-bug`, `audit`, etc.); you generally don't call them directly.

| Subagent | What it catches |
|---|---|
| `reviewer-authz` | Missing/wrong access checks on server entry points; IDOR; role-without-scope; unsigned webhooks. |
| `reviewer-security-regression` | Logged/leaked secrets, SSRF, unsafe uploads, dangerous HTML, open redirects, missing rate limits. |
| `reviewer-data-integrity` | NOT NULL without backfill, orphan-creating deletes, missing DB constraints, unsafe migrations, stale fixtures. |
| `reviewer-contracts` | Producer/consumer drift — server fn ↔ client, zod ↔ DB, route params ↔ links, stale generated clients. |
| `reviewer-concurrency` | Double-submit duplicates, missing idempotency on webhooks, read-modify-write races, missing transactions, stale async writes. |
| `reviewer-error-boundaries` | Promise rejections leaking to blank screens, server errors becoming generic toasts, double-submit on failure, loader without `errorComponent`. |
| `reviewer-loading-states` | Submit buttons not disabled, spinner-vs-skeleton inconsistency, optimistic updates without rollback, missing `pendingComponent`. |
| `reviewer-accessibility-regression` | Icon buttons missing names, dialogs missing focus trap, custom clickable divs, unbound labels, missing alt. (Changed-files only — `/audit-a11y` is the whole-app sibling.) |
| `reviewer-client-bundle` | Server-only modules in client bundles, non-public env vars in client files, heavy deps added to first-load, lodash full-imports, oversized assets. |
| `reviewer-observability-coverage` | Critical paths without structured logs, swallowed errors, missing correlation ids on jobs/webhooks, PII in log lines. |
| `reviewer-perf` | N+1 queries, missing indexes, oversized SELECT *, sequential awaits, unmemoized hot paths, unbounded fetches, missing virtualization. |
| `runtime-contract-tracer` | Trace an integration end-to-end: trigger → dispatch → receive → observe — with file:line refs. Used by `/fix-bug` to map silent integration failures. |
| `crud-surface-mapper` | Inventory every place the user creates / edits / configures / imports / duplicates an artifact (Task, Project, etc.) so new fields ship to every CRUD touchpoint. |
| `ui-pattern-inspector` | Returns a sibling-instance inventory for recurring UI surfaces (Modal, Dialog, Drawer, Form, Card, Toast) with convention summary (hotkeys, focus, footer chrome). |
| `utility-finder` | Pre-write lookup for existing helpers — returns ranked candidates with reuse/extend/write-new verdict. Prevents duplicate utilities at the source. |
| `pr-comment-resolver` | Per-thread subagent used by `/address-pr-comments`. Reads, classifies, applies the fix, replies via the GitHub API, resolves the thread. |

---

## Notes on conventions

Every skill in this marketplace follows a few shared conventions:

- **`AskUserQuestion` protocol** — Skills never print numbered options for the user to type a number; they invoke the `AskUserQuestion` tool for an interactive picker. Free-form questions stay in prose.
- **NEVER sections** — Each skill ends with a `NEVER` section. Every entry follows the pattern `**NEVER X** / **Instead:** Y / **Why:** Z` so the model can judge edge cases, not just follow rules.
- **Mode tiers** — Core delivery skills (`add-feature`, `modify-feature`, `fix-bug`, `remove-feature`, `audit`, `ship`) accept `mode=fast|balanced|production` plus `include=` / `skip=` overrides.
- **Subagent dispatch** — Where reviewers exist as both a skill (whole-repo) and a subagent (diff-only), the skill is the user-invocable entry; the subagent is the read-only report-only variant the skills fan out to.

---

## License

See `LICENSE` in the repository root.
