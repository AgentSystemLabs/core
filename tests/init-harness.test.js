import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initCommand } from '../cli/commands/init.js';
import { supportedHarnesses } from '../cli/lib/paths.js';
import { packageRoot } from '../cli/lib/paths.js';

// The plugin now registers exactly one skill, `ship`, with its workflow
// playbooks and reviewer subagents bundled inside it. Installing must copy
// that whole subtree and register no separate agents.
const SKILL = 'ship';
const BUNDLED_PLAYBOOK = 'add-feature';
const BUNDLED_SUBAGENT = 'utility-finder';

function readText(path) {
  return readFileSync(path, 'utf-8');
}

function assertJsonQuotedFrontmatter(content, field) {
  const match = content.match(new RegExp(`^${field}: "(.+)"`, 'm'));
  assert.ok(match, `expected ${field} to be JSON-quoted in frontmatter`);
  assert.ok(match[1].length > 0, `expected ${field} to be non-empty`);
}

const HARNESS_ASSERTIONS = {
  claude: {
    assertSkill(content) {
      assert.match(content, /^---\nname: ship/m);
      assert.doesNotMatch(content, /^name: "ship"/m);
    },
  },
  codex: {
    assertSkill(content) {
      assertJsonQuotedFrontmatter(content, 'name');
      assertJsonQuotedFrontmatter(content, 'description');
    },
  },
  cursor: {
    assertSkill(content) {
      assert.match(content, /^---\nname: ship/m);
    },
  },
  opencode: {
    assertSkill(content) {
      assertJsonQuotedFrontmatter(content, 'name');
      assertJsonQuotedFrontmatter(content, 'description');
    },
  },
};

describe('init harness installs', () => {
  test('init imports resolve for every supported harness module', () => {
    const requiredModules = [
      'cli/commands/init.js',
      'cli/lib/codex.js',
      'cli/lib/opencode.js',
      'cli/lib/paths.js',
      'cli/lib/skills.js',
    ];

    for (const relativePath of requiredModules) {
      assert.ok(
        existsSync(join(packageRoot, relativePath)),
        `missing required CLI module: ${relativePath}`
      );
    }
  });

  for (const harness of supportedHarnesses()) {
    describe(`--harness ${harness}`, () => {
      /** @type {string} */
      let tmpDir;
      /** @type {string} */
      let skillsDest;
      /** @type {string} */
      let agentsDest;

      before(() => {
        tmpDir = mkdtempSync(join(tmpdir(), `agentsystem-init-${harness}-`));
        skillsDest = join(tmpDir, 'skills');
        agentsDest = join(tmpDir, 'agents');
      });

      after(() => {
        rmSync(tmpDir, { recursive: true, force: true });
      });

      test('installs the single ship skill with its bundled playbooks and subagents', async () => {
        await initCommand({
          harness,
          dest: skillsDest,
          agentsDest,
          plugin: ['core'],
          force: true,
          global: false,
          skipAgents: false,
        });

        // The one registered skill installs, with harness-specific SKILL.md formatting.
        const shipDir = join(skillsDest, SKILL);
        const shipFile = join(shipDir, 'SKILL.md');
        assert.ok(existsSync(shipFile), `expected ${shipFile} to exist`);
        HARNESS_ASSERTIONS[harness].assertSkill(readText(shipFile));

        // The bundled tree is copied recursively alongside SKILL.md.
        assert.ok(
          existsSync(join(shipDir, 'playbooks', BUNDLED_PLAYBOOK, 'PLAYBOOK.md')),
          'bundled workflow playbook must install inside the ship skill'
        );
        assert.ok(
          existsSync(join(shipDir, 'subagents', `${BUNDLED_SUBAGENT}.md`)),
          'bundled reviewer subagent must install inside the ship skill'
        );

        // Exactly one skill installs; no separately-registered agents
        // (subagents are bundled, dispatched by ship at runtime).
        const installedSkills = readdirSync(skillsDest).filter(entry =>
          statSync(join(skillsDest, entry)).isDirectory()
        );
        assert.deepEqual(
          installedSkills.sort(),
          ['ship'],
          'only the single ship skill should install'
        );
        assert.ok(
          !existsSync(agentsDest),
          'no separate agents directory is created — subagents ship bundled under ship/'
        );
      });
    });
  }
});
