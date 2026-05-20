import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pluginsRoot } from './paths.js';

export function discoverPlugins() {
  if (!existsSync(pluginsRoot)) return [];
  return readdirSync(pluginsRoot)
    .filter(name => statSync(join(pluginsRoot, name)).isDirectory())
    .sort();
}

export function discoverSkills(pluginNames) {
  const plugins = pluginNames && pluginNames.length > 0 ? pluginNames : discoverPlugins();
  const skills = [];
  for (const plugin of plugins) {
    const skillsDir = join(pluginsRoot, plugin, 'skills');
    if (!existsSync(skillsDir)) continue;
    for (const skill of readdirSync(skillsDir).sort()) {
      const dir = join(skillsDir, skill);
      if (!statSync(dir).isDirectory()) continue;
      if (!existsSync(join(dir, 'SKILL.md'))) continue;
      skills.push({ plugin, skill, dir });
    }
  }
  return skills;
}

export function discoverAgents(pluginNames) {
  const plugins = pluginNames && pluginNames.length > 0 ? pluginNames : discoverPlugins();
  const agents = [];
  for (const plugin of plugins) {
    const agentsDir = join(pluginsRoot, plugin, 'agents');
    if (!existsSync(agentsDir)) continue;
    for (const entry of readdirSync(agentsDir).sort()) {
      if (!entry.endsWith('.md')) continue;
      const file = join(agentsDir, entry);
      if (!statSync(file).isFile()) continue;
      const agent = entry.slice(0, -3);
      agents.push({ plugin, agent, file });
    }
  }
  return agents;
}

const PLUGIN_PREFIX = 'agentsystem-';

// Commander collector: supports both `--plugin a,b` and repeated `--plugin a --plugin b`.
export function collectPlugin(value, previous = []) {
  const parts = value.split(',').map(s => s.trim()).filter(Boolean);
  return previous.concat(parts);
}

export function parsePluginFilter(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.length > 0 ? raw : null;
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : null;
}

// Accept short names: `core` → `agentsystem-core`. Returns resolved canonical names.
export function resolvePluginFilter(filter) {
  if (!filter) return null;
  const known = new Set(discoverPlugins());
  const resolved = [];
  const unknown = [];
  for (const name of filter) {
    if (known.has(name)) {
      resolved.push(name);
    } else if (known.has(PLUGIN_PREFIX + name)) {
      resolved.push(PLUGIN_PREFIX + name);
    } else {
      unknown.push(name);
    }
  }
  if (unknown.length > 0) {
    const list = [...known].map(n => `${n} (or ${n.replace(PLUGIN_PREFIX, '')})`).join(', ');
    throw new Error(`Unknown plugin(s): ${unknown.join(', ')}\nAvailable: ${list}`);
  }
  return resolved;
}
