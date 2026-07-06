# evals — routing assertions

Fixture-driven checks that `/ship`'s **documented** routing contract stays coherent. These are
structural assertions (run in CI via `npm test` → `tests/ship-routing.test.js`), not live model
runs — they catch drift between the fixtures' expected classification and what `ship/SKILL.md`
actually encodes, so a change to the intent table or the refactor/test pointers can't silently
repoint a route.

## `ship-routing.fixtures.json`

Each fixture is `{ prompt, intent, route, mode, note? }`:

- `intent` — the six core intents (`CREATE / EVOLVE / POLISH / REMOVE / FIX / AUDIT`) or the two
  taxonomy-gap intents ship also handles (`REFACTOR → simplify`, `TEST → write-tests`).
- `route` — the skill `/ship` delegates to. Must be a real skill directory.
- `mode` — the inferred depth (`fast | balanced | production`).

`tests/ship-routing.test.js` asserts, for every fixture:

1. `route` resolves to a real `plugins/agentsystem-core/skills/<route>` directory.
2. `mode` is one of the three valid depths.
3. For the six table intents: `ship/SKILL.md`'s intent table maps `intent → route` exactly.
4. For `REFACTOR` / `TEST`: `ship/SKILL.md` routes the prompt's verb to `route` in its
   refactor/test pointer section.

To add coverage, append a fixture — no code change needed.
