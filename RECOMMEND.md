# Recommended Handoff Skills

This repo already has a strong handoff spine: `write-tests`, `simplify`, `realign`, `harden-types`, TanStack route/layer enforcement, observability, and the read-only reviewer-* subagent fleet (contracts, data-integrity, concurrency, error-boundaries, perf, security-regression).

The next highest-leverage handoff skills should target production failure modes that users feel directly: broken contracts, unsafe data changes, weak failure handling, security regressions, and race conditions.

## Top Priorities

### 1. `code-check-contracts`

Audit API, client, server, and route contracts after changes.

Catch:

- Frontend expects field `x`, backend returns `y`.
- Route params changed but links, loaders, or forms still use the old shape.
- Zod schema differs from the database schema or returned DTO.
- OpenAPI, tRPC, server-fn, or generated client callers drift from implementation.

Why: contract drift is one of the most common "looks fine locally, breaks at runtime" bug classes.

### 2. `code-check-data-integrity`

Run when migrations, schema, persistence, imports, deletes, or background jobs change.

Catch:

- Nullable column introduced without a backfill or default.
- Delete path leaves orphaned rows, files, cache entries, or external resources.
- Uniqueness assumptions are not enforced by constraints.
- Migration is unsafe for existing production data.
- Seed and test data no longer match the schema.

Why: data bugs are expensive to repair after release and often survive normal happy-path tests.

### 3. `code-check-security-regression`

Run after backend, auth, payments, file upload, webhook, secret, or external API changes.

Catch:

- Secret logged or exposed to the client bundle.
- Webhook lacks signature verification.
- User-controlled URL creates SSRF risk.
- File upload path, extension, size, or content-type handling is unsafe.
- Abuse-prone endpoint lacks rate limiting.
- Dangerous HTML rendering or unsafe redirect introduced.

Why: `audit-authz` covers authorization; this should cover broader application security regressions.

### 4. `code-check-error-boundaries`

Audit failure paths after a feature lands.

Catch:

- Promise rejection leaks to a blank screen.
- Server error becomes a generic toast with no retry path.
- Form submit can double-submit after failure.
- Loader error lacks an error component or boundary.
- Background failure has no user-visible recovery or durable record.

Why: resilient failure handling directly improves user trust.

### 5. `code-check-concurrency`

Audit race conditions, retries, and idempotency after mutations, jobs, and webhooks.

Catch:

- Double-click creates duplicate records.
- Webhook retry processes twice.
- Background job is not idempotent.
- Read-modify-write path races under parallel requests.
- Multi-step write is missing a transaction.
- Stale async response overwrites newer client state.

Why: concurrency bugs are under-tested locally and show up as duplicate, missing, or corrupted user-visible state.

## Additional Strong Candidates

### `code-check-loading-states`

Audit async UX consistency.

Catch:

- Submit button is not disabled while submitting.
- Spinner is used where sibling flows use skeletons.
- Optimistic update has no rollback.
- Route pending state is missing.
- Empty, loading, and error states are inconsistent.

Why: this complements `add-skeleton-loaders` and empty/error state skills with a general post-change async-state audit.

### `code-check-accessibility-regression`

Run a changed-files-only accessibility audit after UI mutation.

Catch:

- Icon button missing an accessible name.
- Dialog focus trap or initial focus is missing.
- Custom clickable `div` introduced.
- Form errors are not associated with fields.
- Keyboard path is broken.

Why: a scoped handoff variant of `audit-a11y` can run automatically without producing whole-app noise.

### `code-check-client-bundle`

Audit accidental client-side bloat and server-only leakage.

Catch:

- Server library imported into a client route or component.
- Large dependency added to first-load bundle.
- Image or video asset ships unoptimized.
- Environment or server config reaches the browser bundle.
- Rarely used editor, chart, or admin code should be dynamically imported.

Why: this pairs with `audit-perf` but is more concrete for web bundle regressions.

### `code-check-observability-coverage`

Run a read-only observability audit after critical-path changes.

Catch:

- New critical path has no structured log.
- Errors are swallowed without context.
- Job or webhook lacks a correlation id.
- Latency and failure metrics are missing.
- Logs include PII.

Why: `add-observability` can add instrumentation; this should report coverage gaps without automatically inserting logs.

### `check-release-risk`

Final pre-publish handoff that summarizes what changed and what could break.

Report:

- Public API changes.
- Persistence shape changes.
- Auth, payment, or permission changes.
- New environment variables or operational setup.
- Manual QA needed.
- Docs, changelog, or migration notes needed.
- Rollback concerns.

Why: this would feed `/commit-and-push`, `/open-pr`, and `/release` workflows with a clear risk summary before publishing.
