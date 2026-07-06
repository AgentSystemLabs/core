import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from '../cli/lib/paths.js';

const SHIP = join(
  packageRoot,
  'plugins/agentsystem-core/skills/ship/SKILL.md',
);
const FIXTURES = join(packageRoot, 'evals/ship-routing.fixtures.json');
const SKILLS_DIR = join(packageRoot, 'plugins/agentsystem-core/skills');

const VALID_MODES = new Set(['fast', 'balanced', 'production']);
const TABLE_INTENTS = new Set(['CREATE', 'EVOLVE', 'POLISH', 'REMOVE', 'FIX', 'AUDIT']);

const shipContent = readFileSync(SHIP, 'utf-8');
const fixtures = JSON.parse(readFileSync(FIXTURES, 'utf-8'));

// Parse ship's Step 1 intent table: rows shaped `… | <INTENT> | `<route>` |`.
const intentToRoute = new Map();
for (const m of shipContent.matchAll(
  /\|\s*(CREATE|EVOLVE|POLISH|REMOVE|FIX|AUDIT)\s*\|\s*`([a-z0-9-]+)`\s*\|/g,
)) {
  intentToRoute.set(m[1], m[2]);
}

describe('ship routing fixtures', () => {
  test('ship intent table parsed all six intents', () => {
    for (const intent of TABLE_INTENTS) {
      assert.ok(
        intentToRoute.has(intent),
        `ship/SKILL.md intent table is missing a row for ${intent}`,
      );
    }
  });

  for (const fx of fixtures) {
    test(`"${fx.prompt}" → ${fx.route} (${fx.mode})`, () => {
      assert.ok(
        VALID_MODES.has(fx.mode),
        `invalid mode "${fx.mode}" for prompt "${fx.prompt}"`,
      );
      assert.ok(
        existsSync(join(SKILLS_DIR, fx.route)),
        `route "${fx.route}" is not a real skill directory`,
      );

      if (TABLE_INTENTS.has(fx.intent)) {
        assert.equal(
          intentToRoute.get(fx.intent),
          fx.route,
          `ship intent table maps ${fx.intent} → ${intentToRoute.get(fx.intent)}, fixture expects ${fx.route}`,
        );
      } else {
        // REFACTOR / TEST are handled by ship's refactor/test pointer section, not the table.
        assert.match(
          shipContent,
          new RegExp(`\\b${fx.route}\\b`),
          `ship/SKILL.md never names route "${fx.route}" for out-of-table intent ${fx.intent}`,
        );
      }
    });
  }
});
