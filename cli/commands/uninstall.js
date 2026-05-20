import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { resolveAgentsDest, resolveDest, resolveHarness } from '../lib/paths.js';
import {
  discoverAgents,
  discoverSkills,
  parsePluginFilter,
  resolvePluginFilter,
} from '../lib/skills.js';

export async function uninstallCommand(opts) {
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

  if (!existsSync(dest) && !existsSync(agentsDest)) {
    console.error(`Nothing to uninstall — neither ${dest} nor ${agentsDest} exists.`);
    process.exit(1);
  }

  const skills = discoverSkills(filter);
  const agents = opts.skipAgents ? [] : discoverAgents(filter);

  let skillsRemoved = 0;
  let skillsMissing = 0;
  if (existsSync(dest)) {
    for (const { skill } of skills) {
      const target = join(dest, skill);
      if (!existsSync(target)) {
        skillsMissing++;
        continue;
      }
      rmSync(target, { recursive: true, force: true });
      console.log(`  removed  skill ${skill}`);
      skillsRemoved++;
    }
  } else {
    skillsMissing = skills.length;
  }

  let agentsRemoved = 0;
  let agentsMissing = 0;
  if (agents.length > 0 && existsSync(agentsDest)) {
    const extension = harness.agentFormat === 'toml' ? '.toml' : '.md';
    for (const { agent } of agents) {
      const target = join(agentsDest, `${agent}${extension}`);
      if (!existsSync(target)) {
        agentsMissing++;
        continue;
      }
      rmSync(target, { force: true });
      console.log(`  removed  agent ${agent}`);
      agentsRemoved++;
    }
  } else if (agents.length > 0) {
    agentsMissing = agents.length;
  }

  console.log('');
  console.log(
    `Removed ${skillsRemoved} skill${skillsRemoved === 1 ? '' : 's'} from ${dest}`
  );
  if (skillsMissing > 0) console.log(`Skipped ${skillsMissing} skill${skillsMissing === 1 ? '' : 's'} (not present)`);
  if (agents.length > 0) {
    console.log(
      `Removed ${agentsRemoved} subagent${agentsRemoved === 1 ? '' : 's'} from ${agentsDest}`
    );
    if (agentsMissing > 0) console.log(`Skipped ${agentsMissing} subagent${agentsMissing === 1 ? '' : 's'} (not present)`);
  }
}
