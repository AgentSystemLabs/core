import { discoverAgents, discoverPlugins, discoverSkills } from '../lib/skills.js';

export async function listCommand() {
  const plugins = discoverPlugins();
  let totalSkills = 0;
  let totalAgents = 0;
  for (const plugin of plugins) {
    const skills = discoverSkills([plugin]);
    const agents = discoverAgents([plugin]);
    if (skills.length === 0 && agents.length === 0) continue;
    console.log(`${plugin}  (${skills.length} skill${skills.length === 1 ? '' : 's'}, ${agents.length} subagent${agents.length === 1 ? '' : 's'})`);
    for (const { skill } of skills) {
      console.log(`  - skill  ${skill}`);
    }
    for (const { agent } of agents) {
      console.log(`  - agent  ${agent}`);
    }
    console.log('');
    totalSkills += skills.length;
    totalAgents += agents.length;
  }
  console.log(
    `${totalSkills} skill${totalSkills === 1 ? '' : 's'} and ${totalAgents} subagent${totalAgents === 1 ? '' : 's'} across ${plugins.length} plugin${plugins.length === 1 ? '' : 's'}.`
  );
}
