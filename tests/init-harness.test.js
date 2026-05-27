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

const SAMPLE_SKILL = 'commit';
const SAMPLE_AGENT = 'utility-finder';

function readText(path) {
  return readFileSync(path, 'utf-8');
}

function assertSkillInstalled(skillsDest) {
  const skillDir = join(skillsDest, SAMPLE_SKILL);
  const skillFile = join(skillDir, 'SKILL.md');

  assert.ok(existsSync(skillFile), `expected ${skillFile} to exist`);

  return readText(skillFile);
}

function assertAgentInstalled(agentsDest, extension) {
  const agentFile = join(agentsDest, `${SAMPLE_AGENT}${extension}`);

  assert.ok(existsSync(agentFile), `expected ${agentFile} to exist`);

  return readText(agentFile);
}

function assertJsonQuotedFrontmatter(content, field) {
  const match = content.match(new RegExp(`^${field}: "(.+)"`, 'm'));
  assert.ok(match, `expected ${field} to be JSON-quoted in frontmatter`);
  assert.ok(match[1].length > 0, `expected ${field} to be non-empty`);
}

const HARNESS_ASSERTIONS = {
  claude: {
    agentExtension: '.md',
    assertSkill(content) {
      assert.match(content, /^---\nname: commit/m);
      assert.doesNotMatch(content, /^name: "commit"/m);
    },
    assertAgent(content) {
      assert.match(content, /^---\nname: utility-finder/m);
      assert.doesNotMatch(content, /^mode: subagent/m);
    },
  },
  codex: {
    agentExtension: '.toml',
    assertSkill(content) {
      assertJsonQuotedFrontmatter(content, 'name');
      assertJsonQuotedFrontmatter(content, 'description');
    },
    assertAgent(content) {
      assert.match(content, /^name = "utility-finder"/m);
      assert.match(content, /^description = "/m);
      assert.match(content, /^developer_instructions = """/m);
    },
  },
  cursor: {
    agentExtension: '.md',
    assertSkill(content) {
      assert.match(content, /^---\nname: commit/m);
    },
    assertAgent(content) {
      assert.match(content, /^---\nname: utility-finder/m);
      assert.doesNotMatch(content, /^mode: subagent/m);
    },
  },
  opencode: {
    agentExtension: '.md',
    assertSkill(content) {
      assertJsonQuotedFrontmatter(content, 'name');
      assertJsonQuotedFrontmatter(content, 'description');
    },
    assertAgent(content) {
      assert.match(content, /^mode: subagent/m);
      assert.match(content, /^permission:/m);
      assert.match(content, /^\s+edit: deny/m);
      assert.match(content, /^\s+bash: allow/m);
      assert.match(content, /^# utility-finder/m);
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

      test('installs plugin skills and subagents with harness-specific formatting', async () => {
        await initCommand({
          harness,
          dest: skillsDest,
          agentsDest,
          plugin: ['core'],
          force: true,
          global: false,
          skipAgents: false,
        });

        const expectations = HARNESS_ASSERTIONS[harness];
        const skillContent = assertSkillInstalled(skillsDest);
        const agentContent = assertAgentInstalled(
          agentsDest,
          expectations.agentExtension
        );

        expectations.assertSkill(skillContent);
        expectations.assertAgent(agentContent);

        const installedSkills = readdirSync(skillsDest).filter(entry =>
          statSync(join(skillsDest, entry)).isDirectory()
        );
        const installedAgents = readdirSync(agentsDest).filter(entry =>
          statSync(join(agentsDest, entry)).isFile()
        );

        assert.ok(installedSkills.length > 1, 'expected multiple skills to install');
        assert.ok(installedAgents.length > 1, 'expected multiple agents to install');
      });
    });
  }
});
