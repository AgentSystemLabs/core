import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const packageRoot = resolve(__dirname, '..', '..');
export const pluginsRoot = resolve(packageRoot, 'plugins');

const HARNESS_DEFINITIONS = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    aliases: ['claude', 'claude-code', 'claudecode'],
    skillsDir: ['.claude', 'skills'],
    agentsDir: ['.claude', 'agents'],
    agentFormat: 'md',
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    aliases: ['codex'],
    skillsDir: ['.codex', 'skills'],
    agentsDir: ['.codex', 'agents'],
    agentFormat: 'toml',
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor CLI',
    aliases: ['cursor', 'cursor-cli', 'cursorcli'],
    skillsDir: ['.cursor', 'skills'],
    agentsDir: ['.cursor', 'agents'],
    agentFormat: 'md',
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    aliases: ['opencode', 'open-code'],
    skillsDir: ['.opencode', 'skills'],
    agentsDir: ['.opencode', 'agents'],
    globalSkillsDir: ['.config', 'opencode', 'skills'],
    globalAgentsDir: ['.config', 'opencode', 'agents'],
    agentFormat: 'md',
  },
};

export function supportedHarnesses() {
  return Object.values(HARNESS_DEFINITIONS).map(harness => harness.aliases[0]);
}

export function resolveHarness(rawHarness = 'claude') {
  const requested = rawHarness.toLowerCase();
  const harness = Object.values(HARNESS_DEFINITIONS).find(definition =>
    definition.aliases.includes(requested)
  );

  if (!harness) {
    throw new Error(
      `Unknown harness: ${rawHarness}\nSupported harnesses: ${supportedHarnesses().join(', ')}`
    );
  }

  return harness;
}

function resolveHarnessPath({ global, customDest, harness, projectSegments, globalSegments }) {
  if (customDest) return resolve(process.cwd(), customDest);
  const resolvedHarness = resolveHarness(harness);
  const base = global ? homedir() : process.cwd();
  const segments = global
    ? resolvedHarness[globalSegments] ?? resolvedHarness[projectSegments]
    : resolvedHarness[projectSegments];
  return resolve(base, ...segments);
}

export function resolveDest({ global, dest, harness }) {
  return resolveHarnessPath({
    global,
    customDest: dest,
    harness,
    projectSegments: 'skillsDir',
    globalSegments: 'globalSkillsDir',
  });
}

export function resolveAgentsDest({ global, agentsDest, harness }) {
  return resolveHarnessPath({
    global,
    customDest: agentsDest,
    harness,
    projectSegments: 'agentsDir',
    globalSegments: 'globalAgentsDir',
  });
}
