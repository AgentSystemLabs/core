# `/ship` — Diagrams for Teaching

A visual companion to `core/plugins/agentsystem-core/skills/ship/SKILL.md` and the routed core skills it hands off to. Use these to walk through how `/ship` classifies a request, picks a depth mode, and delegates to the matching core skill — and how each routed skill spawns its sub-skills and reviewer subagents.

> Source files referenced:
> - `core/plugins/agentsystem-core/skills/ship/SKILL.md`
> - `core/plugins/agentsystem-core/skills/{add-feature,modify-feature,remove-feature,fix-bug,audit,polish-ui}/SKILL.md`
> - `core/plugins/agentsystem-core/agents/*.md`

---

## 1. `/ship` orchestrator — top-level routing

`/ship` is a router. It (1) classifies intent, (2) infers a depth mode, (3) announces the plan, (4) delegates to **one** core skill, (5) reports — and stops before git.

```mermaid
flowchart TD
    U([User goal]) --> S1[/"Step 1: Classify intent"/]

    S1 -->|"add / build / implement / scaffold"| CREATE[CREATE]
    S1 -->|"update / extend / change / also do X<br/>(cosmetic tweaks → EVOLVE mode=fast)"| EVOLVE[EVOLVE]
    S1 -->|"polish this / UX pass / run the checklist"| POLISH[POLISH]
    S1 -->|"remove / delete / rip out / kill"| REMOVE[REMOVE]
    S1 -->|"broken / didn't trigger / silent failure"| FIX[FIX]
    S1 -->|"audit / tech-debt sweep / production-readiness"| AUDIT[AUDIT]
    S1 -->|"ambiguous"| ASK1["AskUserQuestion: pick intent"]
    ASK1 --> S1

    CREATE --> S2
    EVOLVE --> S2
    POLISH --> S2
    REMOVE --> S2
    FIX --> S2
    AUDIT --> S2

    S2[/"Step 2: Infer depth mode"/]
    S2 -->|"auth, payments, migrations, jobs, webhooks, cross-subsystem"| PROD["mode = production"]
    S2 -->|"single file, cosmetic, no data, no API"| FAST["mode = fast"]
    S2 -->|"default"| BAL["mode = balanced"]
    S2 -->|"user-specified mode= override"| OVR["honor override<br/>(unless conflicts with high-risk signal)"]

    PROD --> S3
    FAST --> S3
    BAL --> S3
    OVR --> S3

    S3[/"Step 3: Announce plan<br/>(Detected / Risk / Mode / Pipeline)"/]
    S3 -->|"production: AskUserQuestion 'Proceed?'"| GATE{Approved?}
    S3 -->|"balanced: print + proceed"| S4
    S3 -->|"fast: one-line preamble + go"| S4
    GATE -->|yes| S4
    GATE -->|no| STOP1([Stop])

    S4[/"Step 4: Skill(routed_core, args)"/]
    S4 --> R2["add-feature"]
    S4 --> R3["modify-feature"]
    S4 --> R5["polish-ui"]
    S4 --> R6["remove-feature"]
    S4 --> R7["fix-bug"]
    S4 --> R8["audit"]

    R2 --> S5
    R3 --> S5
    R5 --> S5
    R6 --> S5
    R7 --> S5
    R8 --> S5

    S5[/"Step 5: Pipeline summary + Findings<br/>NEVER commits, pushes, or opens PRs"/]
    S5 --> HANDOFF[["Hand off to user:<br/>/commit · /commit-and-push · /open-pr"]]
```

**Teaching points**

- Intent table is the contract — when in doubt, ship asks **one** disambiguating `AskUserQuestion`, never guesses.
- Mode is announced in every run, even `fast`. "It just worked" is indistinguishable from "it did the wrong thing silently" — visibility is the differentiator.
- One core skill per `/ship` run. Multi-intent prompts (`add X and remove Y`) are run as **sequential** `/ship` invocations.
- `/ship` never commits — Step 5 always hands off to a separate publish skill.
- Cosmetic single-element tweaks route to EVOLVE with `mode=fast` (via `modify-feature`), not a dedicated tweak intent.

---

## 2. CREATE → `add-feature` (production mode, full pipeline)

The richest pipeline. Eight phases plus post-steps. Reviews and adjuncts are **gated** — only the ones whose gates the diff trips actually fire.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant Ship as /ship
    participant AF as add-feature
    participant Sub as Subagents
    participant Stack as Stack adjuncts
    participant Tests as Test skills

    U->>Ship: "add stripe webhook handler"
    Ship->>Ship: classify=CREATE, mode=production, announce
    Ship->>AF: Skill(add-feature, mode=production)

    rect rgb(245,245,255)
    Note over AF: Phase 1 — Clarify
    AF->>U: AskUserQuestion (scope, UX, data, API,<br/>integration, CRUD surfaces, edges, non-goals, done)
    AF->>Sub: Agent(crud-surface-mapper)
    Sub-->>AF: surface inventory w/ file:line
    U-->>AF: confirm restated goal
    end

    rect rgb(245,255,245)
    Note over AF: Phase 2 — Explore
    AF->>Sub: Agent(ui-pattern-inspector) [if recurring UI]
    AF->>Sub: Agent(utility-finder) [per helper]
    AF->>Sub: Agent(Explore) [parallel fan-out if wide]
    Sub-->>AF: reuse / extend / write-new verdicts
    Note right of AF: Realignment boundary check —<br/>route to realign if rename
    end

    rect rgb(255,255,240)
    Note over AF: Phase 3 — Design
    AF->>AF: persistence decision · data · API · structure ·<br/>reuse · UI parity · tests · rollout · risks
    AF->>Sub: Agent(runtime-contract-tracer) [integration-first lane]
    end

    rect rgb(255,245,245)
    Note over AF: Phase 4 — Plan-Approval Gate (MANDATORY)
    AF->>U: ExitPlanMode / present plan
    U-->>AF: approve / revise / quit
    end

    rect rgb(240,250,255)
    Note over AF: Phase 5 — Implement
    AF->>AF: data → server → API → UI → wiring
    AF->>Sub: Agent(parallel) [only if independent]
    end

    rect rgb(250,250,250)
    Note over AF: Phase 6 — Verify
    AF->>AF: typecheck · lint · build · execute new code path
    end

    rect rgb(255,250,240)
    Note over AF: Phase 7 — Gated Reviews (parallel fan-out)
    AF->>Sub: reviewer-duplication (always)
    AF->>Sub: reviewer-security-regression / reviewer-authz
    AF->>Sub: reviewer-perf
    AF->>Sub: reviewer-contracts
    AF->>Sub: reviewer-concurrency
    AF->>Sub: reviewer-observability-coverage
    AF->>Sub: reviewer-data-integrity
    AF->>Sub: reviewer-error-boundaries
    AF->>Sub: reviewer-loading-states
    AF->>Sub: reviewer-accessibility-regression
    AF->>Sub: reviewer-client-bundle
    Sub-->>AF: severity-ranked findings
    AF->>AF: apply auto-fixable; surface rest

    AF->>Stack: code-enforce-route-data / code-enforce-layers (TanStack)
    AF->>Stack: add-migration (backend)
    AF->>Stack: add-form / add-skeleton-loaders / add-empty-error-states (UI)
    end

    rect rgb(245,245,255)
    Note over AF: Phase 8 — Tests
    AF->>Tests: write-tests
    AF->>Tests: add-e2e-test [if user-facing flow + Playwright]
    end

    rect rgb(240,255,240)
    Note over AF: Post-steps
    AF->>AF: simplify (always)
    AF->>AF: polish-ui (UI files only)
    end

    AF-->>Ship: pipeline summary + findings
    Ship-->>U: Step 5 report; hand off to git
```

**Teaching points**

- Phase 4 (plan approval) is the **single most important gate** — production mode never bypasses it.
- Reviewers run **read-only** and return severity-ranked findings. The skill applies `auto-fixable: true` items mechanically and **surfaces** the rest — it does not silently fix.
- The four "investigation" subagents (`crud-surface-mapper`, `ui-pattern-inspector`, `utility-finder`, `runtime-contract-tracer`) all run in fresh contexts to keep search noise out of the parent.
- `balanced` mode skips the Plan-approval gate, security/perf/data-integrity reviews unless gates trigger; `fast` mode runs **only** Phase 5 + 6.

---

## 3. EVOLVE → `modify-feature` (balanced mode)

Lighter than `add-feature` (no plan-approval gate), but still maps which contracts shift before editing. Also handles cosmetic single-element changes when invoked with `mode=fast`.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant Ship as /ship
    participant MF as modify-feature
    participant Sub as Subagents
    participant Tests as Tests
    participant Backend as Backend skills

    U->>Ship: "make this list also show last-active timestamp"
    Ship->>MF: Skill(modify-feature, mode=balanced)

    rect rgb(255,250,245)
    Note over MF: Pre-flight — Four questions
    MF->>MF: Q1 Is the user's seam best?<br/>Q2 What contracts shift?<br/>Q3 Where's the boundary? (3+ modules → recommend realign)<br/>Q4 What edge cases does framing miss?
    Note right of MF: Production mode adds explicit<br/>scope-confirm gate if Q2 ≥ 5 sites
    end

    alt Logic-first lane (parser/validator/rule/transform/contract)
        MF->>Tests: write expected-behavior test BEFORE editing
    end

    alt Integration-first lane (HTTP/queue/job/IPC/file/cron/external API)
        MF->>Sub: Agent(runtime-contract-tracer)
        Sub-->>MF: trigger → dispatch → receive → observe
    end

    rect rgb(245,250,255)
    Note over MF: Edit
    MF->>MF: implement minimum extension
    MF->>MF: verify changed code path runs
    end

    rect rgb(255,255,240)
    Note over MF: After-edit gated reviews (parallel)
    MF->>Sub: reviewer-contracts [client/server/IPC/DTO]
    MF->>Sub: reviewer-concurrency [mutations/jobs/webhooks]
    MF->>Sub: reviewer-observability-coverage [async/error/integration]
    MF->>Sub: reviewer-data-integrity [migrations/persistence/deletes]
    MF->>Sub: reviewer-security-regression / reviewer-authz
    MF->>Sub: reviewer-error-boundaries [user-facing async]
    MF->>Sub: reviewer-loading-states [async UI]
    MF->>Sub: reviewer-accessibility-regression [interactive UI]
    MF->>Sub: reviewer-client-bundle [client routes/deps]
    end

    rect rgb(240,255,245)
    Note over MF: Stack-conditional
    MF->>Backend: add-migration → add-observability
    MF->>Backend: add-form / add-skeleton-loaders / add-empty-error-states (TanStack)
    end

    rect rgb(255,245,245)
    Note over MF: Tests
    MF->>Tests: write-tests [logic / data / permissions / contracts]
    MF->>Tests: add-e2e-test [if user-facing + Playwright]
    end

    rect rgb(245,255,255)
    Note over MF: Post
    MF->>MF: simplify
    MF->>MF: polish-ui (UI changes only)
    end

    MF-->>Ship: report (a) contract shifted, (b) alternatives rejected, (c) edges handled / deferred
    Ship-->>U: pipeline summary
```

**Teaching points**

- The four pre-flight questions exist because a small extension is the most dangerous size of change — large enough to shift contracts, small enough to skip the thinking.
- Q2 explicitly mandates an **audit order**: types → API → persisted rows → UI states → runtime/lifecycle state → tests → docs → peer consumers → live-update wiring.
- `mode=fast` skips the four pre-flight questions and the gated reviews — use it for cosmetic single-element changes the user has explicitly scoped.

---

## 4. FIX → `fix-bug` (balanced default; 7-step workflow)

Designed for **silent integration failures** — code that runs without error but the side effect never happens. NOT for crashes with stack traces.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant Ship as /ship
    participant FB as fix-bug
    participant Sub as Subagents
    participant Adj as Adjunct skills

    U->>Ship: "the webhook never fires after I click submit"
    Ship->>FB: Skill(fix-bug, mode=balanced)

    rect rgb(255,250,245)
    Note over FB: Step 1 — Trace integration with file:line refs
    FB->>FB: action → dispatch → transport → receiver → observed state
    end

    rect rgb(245,250,255)
    Note over FB: Step 2 — Surface runtime contract UPFRONT
    FB-->>U: endpoint · auth · env vars · on-disk artifacts ·<br/>log locations · expected payload shape
    end

    rect rgb(255,255,240)
    Note over FB: Step 3 — Identify silent-failure points
    FB->>FB: rg for `\|\| true`, empty catch, `>/dev/null`,<br/>fail-soft `.catch(()=>undefined)`
    end

    rect rgb(255,245,245)
    Note over FB: Step 4 — Ask for ONE disambiguating evidence
    FB-->>U: single fastest diagnostic (tail log / `/hooks` /<br/>`echo $VAR` / cat config / queue depth / ...)
    U-->>FB: paste output / screenshot
    end

    rect rgb(245,255,250)
    Note over FB: Step 5 — Rank hypotheses with confidence flags
    FB->>FB: ✅ confirmed · 🟡 likely · ⚪ possible
    end

    rect rgb(250,250,255)
    Note over FB: Step 6 — Read evidence literally
    FB->>FB: bug usually visible in pasted text<br/>(shell-quoting · 401 · missing env · typo)
    end

    rect rgb(255,250,255)
    Note over FB: Step 7 — Propose fix
    FB->>FB: edit + 1-sentence "why it looked plausible"
    end

    rect rgb(240,255,240)
    Note over FB: Post-fix adjunct routing (gated)
    FB->>Sub: reviewer-contracts / reviewer-concurrency /<br/>reviewer-observability-coverage / reviewer-error-boundaries
    FB->>Adj: add-migration → reviewer-data-integrity (if corrective migration)
    FB->>Adj: realign (if domain-model mismatch)
    FB->>Adj: add-regression-test (production mode default)
    FB->>Adj: polish-ui (if UI files touched, non-copy)
    FB->>Adj: simplify
    end

    FB-->>Ship: trace + fix + adjunct findings
    Ship-->>U: pipeline summary
```

**Teaching points**

- Step 2 is the differentiator — the user shouldn't need to ask "what endpoint?" or "what env var?". Surface the runtime contract **in the first message**.
- Step 4's "ONE observation that splits hypothesis space in half" is the cost-saver — don't ask the user to run three diagnostics in parallel.
- Step 6 is the most-violated rule in practice: when the user pastes runtime output, the bug is usually verbatim in the output, not in the hypothesis list.

---

## 5. REMOVE → `remove-feature` (balanced default; 6 phases)

Deletion is destructive and asymmetric — a missed reference breaks the build, a missed dead helper rots silently for months. Both are tracked.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant Ship as /ship
    participant RF as remove-feature
    participant Sub as Subagents
    participant Adj as Adjuncts

    U->>Ship: "rip out the legacy invitation system"
    Ship->>RF: Skill(remove-feature, mode=balanced)

    rect rgb(255,250,245)
    Note over RF: Phase 1 — Define boundary
    RF->>U: AskUserQuestion (in-scope vs adjacent)
    U-->>RF: confirm scope
    end

    rect rgb(245,250,255)
    Note over RF: Phase 2 — Map references (grep + dynamic)
    RF->>RF: imports · symbol refs · string keys · routes ·<br/>i18n · env vars · feature flags · DB columns ·<br/>nav links · analytics events · docs
    Note right of RF: Mode safety override:<br/>external/public contract refs<br/>force ≥ balanced
    end

    rect rgb(255,255,240)
    Note over RF: Phase 3 — Classify each reference
    RF->>RF: feature-only? shared? external contract?
    end

    rect rgb(255,245,245)
    Note over RF: Phase 4 — Delete leaf-first
    RF->>RF: delete leaves before parents to avoid<br/>"can't compile because import still exists"
    end

    rect rgb(245,255,250)
    Note over RF: Phase 5 — Re-sweep newly-orphaned code
    loop Until graph stable
        RF->>RF: find new orphans · delete · re-check
    end
    end

    rect rgb(250,250,255)
    Note over RF: Phase 6 — Verify
    RF->>RF: typecheck · build · tests · run dev server
    end

    rect rgb(240,255,240)
    Note over RF: Adjunct skill routing
    RF->>Adj: add-migration (drop columns/tables)
    RF->>Sub: reviewer-data-integrity (orphan rows, FK)
    RF->>Sub: reviewer-contracts (consumer fallout)
    RF->>Adj: simplify (post-step)
    end

    RF-->>Ship: deletion report + orphan re-sweep stats
    Ship-->>U: pipeline summary
```

**Teaching points**

- Phase 2's hardest case is **string/dynamic** references — i18n keys, `route('feature-name')` lookups, analytics event names, env vars referenced via `process.env[varName]`. Pure grep on the symbol misses these.
- Phase 5 (re-sweep) is the difference between a clean removal and rot. After deleting a feature, helpers it owned become dead too — and the helpers' helpers, recursively.
- `mode=fast` skips Phase 1 (boundary confirm) and Phase 5 (re-sweep). External-contract references **always** force ≥ balanced.

---

## 6. AUDIT → `audit` (whole-codebase tech-debt sweep)

Heavier than `simplify`, slower than any single `code-check-*`. Maps architecture first, then orchestrates the full reviewer battery.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant Ship as /ship
    participant A as audit
    participant Sub as Reviewer subagents
    participant Cleanup as Cleanup skills

    U->>Ship: "production-readiness pass on the whole repo"
    Ship->>A: Skill(audit, mode=production)

    rect rgb(255,250,245)
    Note over A: Phase 1 — Scope & confirm
    A->>U: AskUserQuestion (stash / audit current / quit)
    A->>U: AskUserQuestion (narrow scope if > 2000 files)
    A-->>U: announce battery so user can skip=
    end

    rect rgb(245,250,255)
    Note over A: Phase 2 — Architecture & data-flow map
    A->>Sub: Agent(Explore) parallel fan-out
    Sub-->>A: layers · entry points · data flows
    end

    rect rgb(255,255,240)
    Note over A: Phase 3 — Baseline gates
    A->>A: typecheck · lint · build · tests
    end

    rect rgb(255,245,245)
    Note over A: Phase 4 — Parallel audit fan-out (whole repo)
    par Parallel reviewer subagents
        A->>Sub: reviewer-duplication
    and
        A->>Sub: reviewer-security-regression
    and
        A->>Sub: reviewer-perf
    and
        A->>Sub: reviewer-contracts
    and
        A->>Sub: reviewer-concurrency
    and
        A->>Sub: reviewer-data-integrity
    and
        A->>Sub: reviewer-error-boundaries
    and
        A->>Sub: reviewer-loading-states
    and
        A->>Sub: reviewer-accessibility-regression
    and
        A->>Sub: reviewer-observability-coverage
    and
        A->>Sub: reviewer-client-bundle
    and
        A->>Cleanup: harden-types · audit-perf · audit-a11y ·<br/>audit-responsive · audit-seo-meta · audit-analytics
    end
    Sub-->>A: severity-ranked findings (deduped)
    end

    rect rgb(245,255,250)
    Note over A: Phase 5 — Consolidate findings
    A->>A: dedupe · group by area · severity · refactor strategy
    end

    rect rgb(250,250,255)
    Note over A: Phase 6 — Apply (gated)
    A->>U: per-item approve (structural) · auto (mechanical)
    A->>Cleanup: simplify
    end

    rect rgb(240,255,240)
    Note over A: Phase 7 — Re-verify and report
    A->>A: typecheck · lint · tests · architecture diff
    end

    A-->>Ship: consolidated report
    Ship-->>U: pipeline summary + findings
```

**Teaching points**

- `mode=fast` runs only `simplify` + duplication + typecheck/lint. `balanced` adds the high-leverage audits. `production` runs everything.
- Mechanical fixes auto-apply; structural ones gate per-item.
- The dirty-tree check at Phase 1 prevents tangling WIP with audit findings.

---

## 7. POLISH → `polish-ui`

Intentionally narrow — applies the UX checklist to existing UI without changing behavior. Does not fan out to scaffolding or audits.

```mermaid
flowchart LR
    P1[Detect surface: button / modal / dialog / form] --> P2[Run UX checklist]
    P2 --> P3a[Kbd hints on hotkey buttons]
    P2 --> P3b[Modal Esc / autofocus / focus trap]
    P2 --> P3c[Loading & disabled states]
    P2 --> P3d[Footer / chrome consistency]
    P3a --> P4[Auto-fix mechanical gaps]
    P3b --> P4
    P3c --> P4
    P3d --> P4
    P4 --> P5[Surface non-mechanical gaps]
```

**Teaching points**

- POLISH = "apply the checklist, no specific change named". If the user names what to change, route EVOLVE instead (`modify-feature` with `mode=fast` for cosmetic single-element changes).
- `polish-ui` is the only routed core skill that *doesn't* fan out — the work *is* the checklist.

---

## 8. Subagents at a glance

The investigation/review subagents `/ship` skills delegate to. All run in **fresh contexts** — they keep search noise out of the parent skill.

```mermaid
flowchart TB
    subgraph INV["Investigation subagents (gather facts)"]
        I1[crud-surface-mapper<br/>every create/edit surface for an artifact]
        I2[ui-pattern-inspector<br/>sibling conventions for recurring UI]
        I3[utility-finder<br/>existing equivalents before writing new]
        I4[runtime-contract-tracer<br/>trigger → dispatch → receive → observe]
        I5[pr-comment-resolver<br/>address-pr-comments helper]
    end

    subgraph REV["Reviewer subagents (severity-ranked findings)"]
        R1[reviewer-duplication]
        R2[reviewer-security-regression]
        R3[reviewer-authz]
        R4[reviewer-perf]
        R5[reviewer-contracts]
        R6[reviewer-concurrency]
        R7[reviewer-data-integrity]
        R8[reviewer-observability-coverage]
        R9[reviewer-error-boundaries]
        R10[reviewer-loading-states]
        R11[reviewer-accessibility-regression]
        R12[reviewer-client-bundle]
    end

    subgraph CALLERS["Who calls them"]
        AF[add-feature]
        MF[modify-feature]
        FB[fix-bug]
        RF[remove-feature]
        AU[audit]
    end

    AF --> I1
    AF --> I2
    AF --> I3
    AF --> I4
    MF --> I4
    FB --> I4

    AF --> R1 & R2 & R3 & R4 & R5 & R6 & R7 & R8 & R9 & R10 & R11 & R12
    MF --> R5 & R6 & R7 & R8 & R2 & R3 & R9 & R10 & R11 & R12
    FB --> R5 & R6 & R8 & R9
    RF --> R5 & R7
    AU --> R1 & R2 & R4 & R5 & R6 & R7 & R8 & R9 & R10 & R11 & R12
```

**Teaching points**

- Reviewers are **read-only**. They report; the parent skill applies `auto-fixable: true` items mechanically and surfaces structural ones to the user.
- Investigation subagents return **structured inventories**, not advice — the parent skill makes the decision.
- The same subagent (e.g. `runtime-contract-tracer`) is called by `add-feature`, `modify-feature`, and `fix-bug` because the underlying need (trace an integration) is the same.

---

## 9. Mode behavior comparison

```mermaid
flowchart LR
    subgraph FAST["mode=fast"]
        F1["add-feature: only Phases 5-6"]
        F2["modify-feature: skip 4 pre-flight Qs"]
        F3["fix-bug: workflow trimmed"]
        F4["remove-feature: skip Phase 1 + 5"]
        F5["audit: simplify + duplication + lint only"]
    end

    subgraph BAL["mode=balanced (default for most)"]
        B1["add-feature: skip Phase 4 gate, perf, security, data-integrity"]
        B2["modify-feature: full pre-flight + gated reviews"]
        B3["fix-bug: full 7-step workflow"]
        B4["remove-feature: full 6-phase pipeline"]
        B5["audit: high-leverage audits"]
    end

    subgraph PROD["mode=production"]
        P1["add-feature: full 8-phase pipeline + post-steps"]
        P2["modify-feature: + scope-confirm gate at 5+ sites"]
        P3["fix-bug: + add-regression-test"]
        P4["remove-feature: + adjacent-feature smoke check"]
        P5["audit: every code-check-* skill"]
    end

    SAFETY["Mode-safety override:<br/>fast + (auth · payments · migrations ·<br/>jobs · webhooks · destructive deletes)<br/>→ AskUserQuestion confirm"]

    FAST -.->|conflict on high-risk signal| SAFETY
```

**Teaching points**

- Defaults differ by skill: `add-feature` defaults to `production`, `modify-feature`/`fix-bug`/`remove-feature` default to `balanced`, `audit` defaults to `balanced`.
- The mode-safety override is universal — even when the user explicitly types `mode=fast`, high-risk signals force a confirmation prompt instead of silent honor.
