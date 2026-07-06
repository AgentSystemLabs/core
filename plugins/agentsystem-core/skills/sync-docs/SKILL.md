---
name: sync-docs
description: Updates existing project documentation in-place after code changes — bug fixes, new features, tech stack swaps, UX/API changes, env var additions, dependency updates. Edits Swagger/OpenAPI specs, README, ADRs, .env.example, setup guides, and inline doc comments to match current code; defers all CHANGELOG writes to update-changelog. NEVER creates new doc files; only modifies existing ones and reports gaps. Use when a commit/PR just landed, when the user says "update docs", "sync documentation", "docs are stale", "update the swagger", "update the readme", or after changing API endpoints, request/response shapes, CLI flags, env vars, or dependencies.
---

> **User-question protocol:** Whenever this skill needs the user to pick between options, confirm an action, or answer a multiple-choice prompt, you MUST call the `AskUserQuestion` tool to render a proper interactive picker. Do NOT print numbered options as plain text and wait for the user to type a number — that produces a degraded UX. Free-form questions (open-ended typing) may be asked in prose, but any time you would write "1) … 2) … 3) …", use `AskUserQuestion` instead.

> **Mode-less.** This skill takes no `mode=` — callers gate *whether* to invoke it, not how deep it runs. If you are tempted to add a mode table here, that depth decision belongs to the calling skill.


# sync-docs

Keep existing documentation in lockstep with code that just changed. Edit only — never create.

---

## Phase 1 — Identify the change

Determine *what changed* before touching any doc. Sources, in order:

1. If the user named a specific change ("I just renamed `/users` to `/accounts`"), use that.
2. Otherwise run `git diff HEAD~1` (or `git diff <base>...HEAD` for a branch) and `git log -1 --stat`.
3. If `git diff` returns nothing, the working tree is dirty with no commit yet, or history is shallow (single-commit clone), **stop and ask the user to describe the change** — do not guess from filenames or partial state.
4. Classify the change into one or more types:
   - API surface (routes, request/response shape, status codes, auth)
   - CLI / public function signatures
   - Environment variables / config keys
   - Dependencies / runtime / tech stack
   - Behavior / bug fix (same surface, different result)
   - UX copy, flows, or screens

**Exit condition:** you can name each change in one sentence and tag it with at least one type above. If you cannot, ask the user — do not guess.

---

## Phase 2 — Inventory existing docs

**MANDATORY READ** [`references/doc-surfaces.md`](references/doc-surfaces.md) — maps each change type to the doc files that typically reference it. Load this now.

Then search the repo for those doc surfaces. Use ripgrep, not assumptions:

```
rg -l --iglob '!node_modules' -e 'openapi|swagger' -g '*.{yaml,yml,json}'
rg -l -g 'README*' -g 'CHANGELOG*' -g 'docs/**' -g '*.md'
rg -l -g '.env.example' -g '.env.sample'
```

For each candidate file, also grep for the *specific symbol* that changed (old route path, old function name, removed env var). A doc that doesn't mention the changed surface is not stale — leave it alone.

**Exit condition:** you have a list of `(file, lines, why-it's-stale)`. If the list is empty, skip to Phase 5 and report "no existing docs reference this change."

---

## Phase 3 — Read before editing

For each file in the list, Read it fully (or the surrounding section for large files). Confirm:

- The doc actually describes the *changed* behavior (not a similarly-named unrelated thing).
- The doc is hand-maintained, not generated. If the file header says "AUTO-GENERATED — DO NOT EDIT" or it lives next to a codegen config (`openapi-generator`, `swagger-codegen`, `typedoc`, etc.), do not edit it. Note it for the report and find the *source* spec to edit instead.

**Exit condition:** every file in your list is confirmed hand-maintained and genuinely stale. Drop the rest.

---

## Phase 4 — Update in place

Edit with the smallest diff that makes the doc accurate. Format-specific care:

- **OpenAPI / Swagger** (`openapi.yaml`, `swagger.json`): update `paths`, `parameters`, `requestBody`, `responses`, and `components/schemas` to match the new shape exactly. Keep example payloads consistent with the schema. Strict rules:

  ```
  PRESERVE unless that identifier is itself what changed:
    - $ref targets and the component names they point to
    - operationId values (clients generate function names from these)
    - schema component names under components/schemas
    - tag names and the operations grouped under them
  NEVER:
    - Inline a $ref into a literal schema (breaks codegen reuse)
    - Rename a schema component as a side effect of editing one endpoint
    - Drop a response status code without confirming the code no longer returns it
  ```
- **README install/usage**: update commands and code blocks verbatim from the new code; do not paraphrase flag names.
- **CHANGELOG**: do **not** edit it here. Defer all CHANGELOG writes to `agentsystem-core:update-changelog` — recommend or invoke it so the changelog is written once, by the skill that owns its format and inherits the file's existing structure. sync-docs owns every *other* doc surface; the changelog has a single owner.
- **`.env.example`**: add new required vars with a comment; remove vars no longer read by code; preserve ordering and existing comments.
- **ADRs**: do not rewrite a decided ADR. If a tech-stack swap supersedes one, append a "Superseded by …" note or add a new ADR *only if a docs/adr directory already exists and the user asks*.
- **Inline doc comments** (JSDoc, docstrings, rustdoc): update parameter names, types, and return shape; remove `@deprecated` lines for things that are now gone.

**Exit condition:** every staged edit is justified by a specific code change you can point to.

---

## Phase 5 — Verify and report

1. Spot-check each edit against the code it describes — they must match exactly.
2. If the project has a doc validator (`swagger-cli validate`, `redocly lint`, `vale`, `markdownlint`), run it on the edited files only.
3. Report to the user:
   - **Updated:** `file:lines` — what was synced
   - **Skipped (generated):** files you didn't touch and where the source lives
   - **Gaps:** changes with no existing doc surface — name the change and suggest which existing doc *could* hold it, but do not create the file

---

## NEVER

- **NEVER create a new documentation file**
  **Instead:** Report the gap in Phase 5 and let the user decide. If they ask you to create one, that is a separate task outside this skill.
  **Why:** This skill exists because doc bloat and orphaned docs are worse than missing ones — a new file with no owner rots faster than a known gap.

- **NEVER edit a generated doc file**
  **Instead:** Find the source spec (OpenAPI YAML, code annotations, schema file) and edit that; rerun the generator if you can.
  **Why:** Edits to generated output are silently destroyed on the next codegen run, and the drift looks like a bug to the next reader.

- **NEVER edit a doc without reading the surrounding section first**
  **Instead:** Read enough context to confirm the doc describes *this* change, not a similarly-named unrelated one.
  **Why:** Targeted Edits on partial reads have wiped correct sections that happened to share a string with the stale one.

- **NEVER fabricate example payloads, version numbers, or dates to fill a doc**
  **Instead:** Copy real values from the code, tests, or `package.json` / lockfile. If no ground truth exists, leave a `TODO(sync-docs): <what's missing>` and surface it in the report.
  **Why:** A plausible-looking fake example is worse than a missing one — readers trust it and ship broken integrations.

- **NEVER bulk-rewrite a doc when a targeted Edit suffices**
  **Instead:** One Edit per stale fact. Keep prose, ordering, and voice intact.
  **Why:** Rewrites destroy human-authored nuance (caveats, links, historical notes) that the diff didn't require touching.

- **NEVER write `CHANGELOG.md` yourself**
  **Instead:** Defer to `agentsystem-core:update-changelog` — recommend or invoke it. That skill owns the changelog format, inherits the file's existing structure, and applies the "is this changelog-worthy?" filter (skipping internal refactors with no user-visible effect).
  **Why:** Two skills writing the same file in two formats mangle it — a Keep-a-Changelog file gets flattened, or a flat log gets scaffolded. One owner keeps the format coherent.

---

## Trigger question before any write

> "If a future reader follows this doc literally, will the system behave the way the doc says?"

If you cannot answer yes, you are not done editing. If you cannot answer at all, you have not finished Phase 3.
