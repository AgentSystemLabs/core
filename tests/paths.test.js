import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveAgentsDest,
  resolveDest,
  resolveHarness,
  supportedHarnesses,
} from '../cli/lib/paths.js';

const EXPECTED_HARNESSES = ['claude', 'codex', 'cursor', 'opencode'];

const ALIAS_CASES = [
  ['claude', 'claude'],
  ['claude-code', 'claude'],
  ['claudecode', 'claude'],
  ['codex', 'codex'],
  ['cursor', 'cursor'],
  ['cursor-cli', 'cursor'],
  ['cursorcli', 'cursor'],
  ['opencode', 'opencode'],
  ['open-code', 'opencode'],
];

const PROJECT_PATHS = {
  claude: {
    skills: ['.claude', 'skills'],
    agents: ['.claude', 'agents'],
  },
  codex: {
    skills: ['.codex', 'skills'],
    agents: ['.codex', 'agents'],
  },
  cursor: {
    skills: ['.cursor', 'skills'],
    agents: ['.cursor', 'agents'],
  },
  opencode: {
    skills: ['.opencode', 'skills'],
    agents: ['.opencode', 'agents'],
  },
};

describe('harness path resolution', () => {
  test('supportedHarnesses lists every first-class harness', () => {
    assert.deepEqual(supportedHarnesses(), EXPECTED_HARNESSES);
  });

  for (const [alias, expectedId] of ALIAS_CASES) {
    test(`resolveHarness("${alias}") -> ${expectedId}`, () => {
      assert.equal(resolveHarness(alias).id, expectedId);
    });
  }

  test('resolveHarness rejects unknown harness names', () => {
    assert.throws(
      () => resolveHarness('unknown-harness'),
      /Unknown harness: unknown-harness/
    );
  });

  for (const harness of EXPECTED_HARNESSES) {
    test(`${harness} project destinations`, () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'agentsystem-paths-'));
      const previousCwd = process.cwd();

      try {
        process.chdir(tmpDir);
        const resolvedTmpDir = realpathSync('.');

        const skillsDest = resolveDest({ harness, global: false });
        const agentsDest = resolveAgentsDest({ harness, global: false });

        assert.equal(
          skillsDest,
          join(resolvedTmpDir, ...PROJECT_PATHS[harness].skills)
        );
        assert.equal(
          agentsDest,
          join(resolvedTmpDir, ...PROJECT_PATHS[harness].agents)
        );
      } finally {
        process.chdir(previousCwd);
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  }

  test('opencode global destinations use ~/.config/opencode/', () => {
    const skillsDest = resolveDest({ harness: 'opencode', global: true });
    const agentsDest = resolveAgentsDest({ harness: 'opencode', global: true });

    assert.match(skillsDest, /\.config[/\\]opencode[/\\]skills$/);
    assert.match(agentsDest, /\.config[/\\]opencode[/\\]agents$/);
  });
});
