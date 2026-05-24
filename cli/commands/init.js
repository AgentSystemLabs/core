import { mkdirSync, existsSync, cpSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { convertAgentToCodexToml, normalizeCodexSkill } from '../lib/codex.js';
import { convertAgentToOpencodeMd, normalizeOpencodeSkill } from '../lib/opencode.js';
import { resolveAgentsDest, resolveDest, resolveHarness } from '../lib/paths.js';
import {
  discoverAgents,
  discoverSkills,
  parsePluginFilter,
  resolvePluginFilter,
} from '../lib/skills.js';

export async function initCommand(opts) {
  let harness;
  let dest;
  let agentsDest;
  try {
    harness = resolveHarness(opts.harness);
    dest = resolveDest(opts);
    agentsDest = resolveAgentsDest(opts);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  let filter;
  try {
    filter = resolvePluginFilter(parsePluginFilter(opts.plugin));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const skills = discoverSkills(filter);
  const agents = opts.skipAgents ? [] : discoverAgents(filter);

  if (skills.length === 0 && agents.length === 0) {
    console.error('No skills or agents found to install.');
    if (filter) console.error(`Plugin filter: ${filter.join(', ')}`);
    process.exit(1);
  }

  mkdirSync(dest, { recursive: true });

  const targetLabel = opts.dest
    ? `custom destination for ${harness.name}`
    : `${opts.global ? 'global ' : ''}${harness.name}`;
  console.log(`Installing AgentSystem skills for ${targetLabel}: ${dest}`);
  console.log('');

  let skillsInstalled = 0;
  let skillsSkipped = 0;
  for (const { plugin, skill, dir } of skills) {
    const target = join(dest, skill);
    if (existsSync(target) && !opts.force) {
      console.log(`  skip   skill ${skill}  (exists — pass --force to overwrite)`);
      skillsSkipped++;
      continue;
    }
    cpSync(dir, target, { recursive: true, force: true });
    if (harness.id === 'codex') {
      normalizeCodexSkill(join(target, 'SKILL.md'), skill);
    } else if (harness.id === 'opencode') {
      normalizeOpencodeSkill(join(target, 'SKILL.md'), skill);
    }
    console.log(`  ok     skill ${plugin}:${skill}`);
    skillsInstalled++;
  }

  let agentsInstalled = 0;
  let agentsSkipped = 0;
  if (agents.length > 0) {
    mkdirSync(agentsDest, { recursive: true });
    console.log('');
    console.log(`Installing AgentSystem subagents to: ${agentsDest}`);
    console.log('');

    const extension = harness.agentFormat === 'toml' ? '.toml' : '.md';
    for (const { plugin, agent, file } of agents) {
      const target = join(agentsDest, `${agent}${extension}`);
      if (existsSync(target) && !opts.force) {
        console.log(`  skip   agent ${agent}  (exists — pass --force to overwrite)`);
        agentsSkipped++;
        continue;
      }
      if (harness.agentFormat === 'toml') {
        convertAgentToCodexToml(file, target, agent);
      } else if (harness.id === 'opencode') {
        convertAgentToOpencodeMd(file, target, agent);
      } else {
        copyFileSync(file, target);
      }
      console.log(`  ok     agent ${plugin}:${agent}`);
      agentsInstalled++;
    }
  }

  console.log('');
  console.log(
    `Installed ${skillsInstalled} skill${skillsInstalled === 1 ? '' : 's'} to ${dest}`
  );
  if (skillsSkipped > 0) console.log(`Skipped ${skillsSkipped} skill${skillsSkipped === 1 ? '' : 's'} (already present)`);
  if (agents.length > 0) {
    console.log(
      `Installed ${agentsInstalled} subagent${agentsInstalled === 1 ? '' : 's'} to ${agentsDest}`
    );
    if (agentsSkipped > 0) console.log(`Skipped ${agentsSkipped} subagent${agentsSkipped === 1 ? '' : 's'} (already present)`);
  } else if (opts.skipAgents) {
    console.log('Subagents skipped (--skip-agents).');
  }
}
