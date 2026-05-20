import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

const pluginsRoot = 'plugins';

function walkSkillFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkSkillFiles(path));
    if (entry.isFile() && entry.name === 'SKILL.md') files.push(path);
  }
  return files;
}

function frontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match?.[1] ?? '';
}

function field(fm, name) {
  const match = fm.match(new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\n[a-zA-Z][\\w-]*:|$)`, 'm'));
  return (match?.[1] ?? '').replace(/\n\s+/g, ' ').trim();
}

function normalizeName(raw) {
  return raw
    .trim()
    .replace(/^(and|or)\s+/i, '')
    .replace(/^the\s+/i, '')
    .replace(/\s+skills?$/i, '')
    .replace(/^\/+/, '')
    .replace(/`/g, '');
}

function descriptionCallers(description) {
  const match = description.match(/\binvoked by\s+(.+?)(?:\s+when|\s+after|\s+before|\s+to\s+|\s+as\s+|\.\s|$)/i);
  if (!match) return [];

  return match[1]
    .split(/\s*,\s*|\s+\band\b\s+|\s+\bor\b\s+/)
    .map(normalizeName)
    .filter(Boolean)
    .filter(name => !['other mutation', 'other mutation skills'].includes(name))
    .filter(name => !name.startsWith('etc'));
}

function callerMentionsCallee(callerContent, calleeKey, calleeName) {
  return [
    calleeKey,
    `/${calleeName}`,
    `\`${calleeName}\``,
    `:${calleeName}`,
  ].some(token => callerContent.includes(token));
}

if (!existsSync(pluginsRoot) || !statSync(pluginsRoot).isDirectory()) {
  console.error('No plugins directory found.');
  process.exit(1);
}

const skills = new Map();

for (const file of walkSkillFiles(pluginsRoot).sort()) {
  const parts = file.split(sep);
  const plugin = parts[1];
  const dirName = parts[3];
  const content = readFileSync(file, 'utf8');
  const fm = frontmatter(content);
  const name = field(fm, 'name') || dirName;
  const description = field(fm, 'description');
  const key = `${plugin}:${name}`;
  skills.set(key, { key, plugin, name, file, content, description });
}

const byName = new Map();
for (const skill of skills.values()) byName.set(skill.name, skill);

const aliases = new Map([
  ['debug', byName.get('fix-bug')],
  ['release', skills.get('agentsystem-core:release')],
]);

const missing = [];

for (const callee of skills.values()) {
  for (const callerName of descriptionCallers(callee.description)) {
    const caller = aliases.get(callerName) ?? byName.get(callerName);
    if (!caller) {
      missing.push(`${callee.key} declares unknown caller "${callerName}"`);
      continue;
    }
    if (!callerMentionsCallee(caller.content, callee.key, callee.name)) {
      missing.push(`${caller.key} should explicitly route ${callee.key}`);
    }
  }
}

if (missing.length > 0) {
  console.error('Skill routing drift detected:');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Skill routing check passed (${skills.size} skills).`);
