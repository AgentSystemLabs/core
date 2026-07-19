# AgentSystem

**Website:** [agentsystem.dev](https://agentsystem.dev)

AgentSystem is a skill pack for AI coding agents. It exists for one reason: **you describe a goal, the agent picks the right engineering workflow and depth, runs the checks that matter, and stops when the code is ready** — without you memorizing 37 skill names or guessing whether a change needs a quick tweak or a production gate.

You should almost never call individual skills yourself. Use **`/ship`**.

---

## Does it actually work? We benchmarked it.

Same 5 feature briefs, same production codebase, same model (Opus 4.8, xhigh) — three ways: a plain prompt, a *"think like a senior engineer"* prompt, and `/ship`. All 15 implementations blind-graded from raw diffs by a stronger model on a fixed rubric.

| | Plain prompt | "Senior engineer" prompt | **/ship** |
|---|---|---|---|
| Avg quality /50 | 43.2 | 41.0 | **47.0** |
| Features won | 0/5 | 0/5 | **5/5** |
| Crashes shipped | 0 | 1 branch (2 crash classes) | **0** |
| Invariant tests written | 1/5 branches | 0/5 | **5/5** |

**+9% vs plain prompting, +15% vs persona prompting, zero crashes, and a HIGH-severity authz hole caught by a review gate before it shipped.** The persona prefix actually *underperformed* the plain prompt. Cost of the pipeline: ~81% more tokens.

Every prompt, PR, score, cost, and — importantly — every limitation (sample size, LLM judge, conflict of interest) is documented so you can decide for yourself: **[read the full benchmark →](docs/experiments/2026-07-three-arm-benchmark.md)**

---

## Use it

```
/ship add stripe webhook handler
/ship the login button doesn't redirect
/ship delete the old beta-flags page
```

Or describe your goal normally and end with **"use ship skill"** (or attach the ship skill in Cursor).

That's the whole interface. `/ship` classifies what you want, picks how thorough to be, runs the right pipeline, and reports what it did. It **never** commits, pushes, or opens PRs — you choose that after reviewing the diff.

### Examples

| You say | `/ship` decides |
|---|---|
| "add a settings page" | CREATE → balanced depth |
| "make the navbar green" | EVOLVE → fast (cosmetic) |
| "add OAuth" | CREATE → production (auth) |
| "polish the dashboard" | POLISH → UX checklist pass |
| "audit the codebase for rot" | AUDIT → full sweep |

Optional overrides when you care: `mode=fast`, `mode=balanced`, `mode=production`, or `skip=` / `include=` phase hints.

### After `/ship` finishes

When you're happy with the working tree:

| Command | When |
|---|---|
| `/commit` | Group changes into logical commits (no push) |
| `/commit-and-push` | Commit, then push the branch |
| `/open-pr` | Open a GitHub PR |

These are the only other skills most people need to invoke directly — they're the publish step, not the engineering step.

---

## How it works

`/ship` is a router, not a monolith. You stay at the top; everything below is orchestrated for you.

```mermaid
flowchart TB
    U(["/ship your goal"])

    subgraph L1["① /ship — classify & route"]
        direction TB
        C["Classify intent<br/>CREATE · EVOLVE · POLISH · REMOVE · FIX · AUDIT"]
        M["Pick depth<br/>fast · balanced · production"]
        A["Announce pipeline"]
        C --> M --> A
    end

    U --> C
    A --> G{"production mode?"}
    G -->|confirm first| R
    G -->|balanced / fast| R

    subgraph L2["② Core workflow — one per run"]
        direction TB
        R{"Route by intent"}
        AF["add-feature"]
        MF["modify-feature"]
        PU["polish-ui"]
        RF["remove-feature"]
        FB["fix-bug"]
        AU["audit"]
        R -->|CREATE| AF
        R -->|EVOLVE| MF
        R -->|POLISH| PU
        R -->|REMOVE| RF
        R -->|FIX| FB
        R -->|AUDIT| AU
    end

    subgraph L3["③ Internal — auto-invoked, don't call these"]
        direction LR
        SK["Delivery skills<br/>migrations · tests · empty/error UI · observability …"]
        RV["Reviewer subagents<br/>security · contracts · perf · a11y · concurrency …"]
        SK --- RV
    end

    AF --> L3
    MF --> L3
    PU --> L3
    RF --> L3
    FB --> L3
    AU --> L3

    L3 --> REP["④ Report<br/>what ran · what was found · what's left"]
    REP --> READY(["Code ready<br/>never commits or opens PRs"])

    subgraph L4["⑤ You publish — after reviewing the diff"]
        direction LR
        CM["/commit"]
        CP["/commit-and-push"]
        PR["/open-pr"]
    end

    READY --> L4
```

**In plain terms:**

1. **Classify intent** — CREATE, EVOLVE, POLISH, REMOVE, FIX, or AUDIT — from how you phrase the request.
2. **Pick depth** — `fast` (tiny/cosmetic), `balanced` (default), or `production` (auth, payments, migrations, webhooks, jobs, multi-subsystem work).
3. **Route** to one core workflow and announce the pipeline before running.
4. **Fan out** to internal skills and read-only reviewers only when gates fire — migrations, tests, security/perf/contract audits, and more.
5. **Report and stop** — you choose `/commit`, `/commit-and-push`, or `/open-pr` when you're ready.

High-risk work (`production` mode) asks you to confirm before executing. `balanced` announces the plan and proceeds. `fast` just goes.

---

## Install

### Claude Code (plugin marketplace)

```
/plugin marketplace add https://github.com/AgentSystemLabs/core
/plugin install agentsystem-core@agentsystem
```

Update: `/plugin marketplace update agentsystem` · Uninstall: `/plugin uninstall agentsystem-core@agentsystem`

### Any agent that reads `SKILL.md` (Cursor, Codex, OpenCode, custom)

```bash
npx @agentsystemlabs/core init                  # → ./.claude/{skills,agents}/
npx @agentsystemlabs/core init --harness cursor # → ./.cursor/{skills,agents}/
npx @agentsystemlabs/core init --harness codex  # → ./.codex/{skills,agents}/
npx @agentsystemlabs/core init --global         # user-level install
npx @agentsystemlabs/core list                  # what's available
```

Harnesses: `claude`, `codex`, `cursor`, `opencode`. Pass `--force` to overwrite existing files, `--skip-agents` for skills only.

---

## Under the hood (you don't need to call these)

Everything below is **internal plumbing** — invoked by `/ship` (or by the core workflows it routes to). Listed here so you know what you're getting, not so you memorize slash commands.

### Core workflows (routed by `/ship`)

| Intent | Internal workflow | What it does |
|---|---|---|
| CREATE | `add-feature` | Clarify → explore → design → implement → verify → gated reviews → tests |
| EVOLVE | `modify-feature` | Extend existing behavior; audits shifted contracts |
| POLISH | `polish-ui` | UX checklist on existing UI — no behavior change |
| REMOVE | `remove-feature` | Safe deletion with persisted-data awareness |
| FIX | `fix-bug` | Runtime contract trace before hypotheses; regression test when fixed |
| AUDIT | `audit` | Whole-codebase tech-debt sweep |

### Internal skills (auto-invoked when gates fire)

Delivery helpers: `add-migration`, `write-tests`, `add-e2e-test`, `add-regression-test`, `add-empty-error-states`, `add-observability`, `simplify`, `propagate-ui-pattern`, `realign`, `harden-types`, `reorganize-files`, `sync-docs`, `update-changelog`, `testing-plan`, `check-pr-readiness`, `check-release-risk`

Scoped audits (diff or whole-app, depending on context): `audit-authz`, `audit-a11y`, `audit-perf`, `audit-responsive`, `audit-seo-meta`, `audit-analytics`

### Reviewer subagents (read-only, never edit files)

`reviewer-authz`, `reviewer-security-regression`, `reviewer-data-integrity`, `reviewer-contracts`, `reviewer-concurrency`, `reviewer-error-boundaries`, `reviewer-loading-states`, `reviewer-accessibility-regression`, `reviewer-client-bundle`, `reviewer-observability-coverage`, `reviewer-perf`, plus helpers like `crud-surface-mapper`, `ui-pattern-inspector`, `utility-finder`, `runtime-contract-tracer`, `pr-comment-resolver`.

**You should not `@` or slash-command these.** They exist so `/ship` can fan out parallel audits and return severity-ranked findings with file:line refs.

### Occasional direct use (outside `/ship`)

Only when the task isn't "engineer this goal":

| Skill | When |
|---|---|
| `/address-pr-comments` | Resolve GitHub PR review threads |
| `/fix-pr-tests` | CI is red on a PR |
| `/resolve-conflict` | Merge or rebase conflicts |
| `/release` | Cut a versioned release |
| `/handoff-codex` | Stalled task — second pass via Codex CLI |

For feature work, bugs, polish, removal, and codebase audits: **use `/ship`**.

---

## Deeper docs

- [`docs/ship-diagrams.md`](docs/ship-diagrams.md) — Mermaid diagrams of the full routing and gate fan-out (for teaching / contributors).

---

## License

See [`LICENSE`](LICENSE).
