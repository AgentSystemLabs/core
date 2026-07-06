# Reviewer findings contract

The canonical output contract for every `reviewer-*` subagent in this plugin. Parent skills
(`add-feature`, `modify-feature`, `fix-bug`, `remove-feature`, `audit`) apply `auto-fixable: true`
items mechanically and surface the rest — so this format is a **real API**, not cosmetic. Every
reviewer agent conforms to it instead of inventing its own layout. When the contract changes, edit
**this file** and reconcile the agents; the CI routing check lints that each reviewer declares the
severity scale and an `auto-fixable` field.

## Severity scale (pack-wide)

Exactly four levels, same meaning in every reviewer:

- **CRITICAL** — a shipped-as-is defect that leaks data, corrupts persisted state, or lets an
  unauthorized actor act. (Missing-auth/IDOR, logged secrets, destructive migration on populated
  data.)
- **HIGH** — breaks a real user path or a production invariant under normal use. (N+1 on a hot
  route, optimistic update with no rollback, unverified webhook, blank-screen error path.)
- **MEDIUM** — degrades correctness/UX/perf in a noticeable but non-catastrophic way, or is
  latent until scale/edge conditions hit.
- **LOW** — polish, consistency, or defense-in-depth. Safe to defer, worth recording.

Do **not** invent extra levels (`INFO`, `HIGH IMPACT`, `NIT`) — fold them into the four above.

## `auto-fixable` field (required on every finding)

Each finding ends with `auto-fixable: true` or `auto-fixable: false`.

- **`true`** — a mechanical, context-free edit the parent can apply without judgment
  (add `disabled={isPending}`, `lodash` → `lodash-es` named import, add an accessible name to an
  icon button, add `auto-fixable: false` seed-fixture rename).
- **`false`** — needs human/domain judgment or could make things worse if guessed
  (auth-check placement, `<Spinner>`↔`<Skeleton>` swap, optimistic-rollback shape, image
  conversion, any structural refactor). When in doubt, `false`.

A reviewer that has *no* mechanically-applicable findings still keeps the field on each line (all
`false`) — the parent must never have to guess whether a line is safe to apply.

## Report template (markdown)

```
## <reviewer-name> scan — <N> findings

### CRITICAL — <count>
1. **<one-line defect>** — `<file>:<line>`
   - <why it's wrong / what breaks>
   - Fix: <concrete fix, using the project's existing helpers>
   - auto-fixable: <true|false>

### HIGH — <count>
...

### MEDIUM — <count>
...

### LOW — <count>
...
```

Omit empty severity groups. Reply with **only** the report — no preamble.

## Zero-findings sentinel

When there are no findings, return exactly one line: `No <concern> issues detected.`
(e.g. `No authz issues detected.`, `No perf issues detected.`) so the parent can detect a clean
scan unambiguously.
