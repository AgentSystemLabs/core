import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, sep, dirname } from 'node:path';

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
    .replace(/\s+(and|or)$/i, '')
    .replace(/^the\s+/i, '')
    .replace(/\s+skills?$/i, '')
    .replace(/^\/+/, '')
    .replace(/`/g, '');
}

function descriptionCallers(description) {
  // Broadened: "invoked by X", "invoked as a post-step by X", "invoked as Phase 8 of X".
  const match = description.match(
    /\binvoked (?:by|as [^.]*?\s(?:by|of))\s+(.+?)(?:\s+when|\s+after|\s+before|\s+to\s+|\s+as\s+|\.\s|$)/i,
  );
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

// ── Build the skill catalog ────────────────────────────────────────────────
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
  skills.set(key, { key, plugin, name, dirName, file, dir: dirname(file), content, description });
}

const byName = new Map();
for (const skill of skills.values()) byName.set(skill.name, skill);

// Valid `plugin:skill` tokens (accept both frontmatter name and directory name).
const validSkillTokens = new Set();
for (const skill of skills.values()) {
  validSkillTokens.add(`${skill.plugin}:${skill.name}`);
  validSkillTokens.add(`${skill.plugin}:${skill.dirName}`);
}

// ── Build the agent catalog ────────────────────────────────────────────────
const agentNames = new Set();
const agentEntries = [];
for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const agentsDir = join(pluginsRoot, entry.name, 'agents');
  if (!existsSync(agentsDir)) continue;
  for (const f of readdirSync(agentsDir)) {
    if (!f.endsWith('.md')) continue;
    const name = f.replace(/\.md$/, '');
    agentNames.add(name);
    const content = readFileSync(join(agentsDir, f), 'utf8');
    agentEntries.push({
      name,
      label: `${entry.name}/agents/${f}`,
      content,
      description: field(frontmatter(content), 'description'),
    });
  }
}

const aliases = new Map([
  ['debug', byName.get('fix-bug')],
  ['release', skills.get('agentsystem-core:release')],
]);

const errors = [];

// ── Check 1 — every agentsystem-core:<name> token resolves to a skill ───────
for (const skill of skills.values()) {
  for (const m of skill.content.matchAll(/\b([a-z][a-z0-9-]*)-core:([a-z0-9-]+)/g)) {
    const token = `${m[1]}-core:${m[2]}`;
    if (!validSkillTokens.has(token) && !agentNames.has(m[2])) {
      errors.push(`${skill.key}: references unknown skill token "${token}"`);
    }
  }
}

// ── Check 2 — every subagent_type / concrete reviewer-* token resolves ──────
const agentTokenSources = [
  ...[...skills.values()].map(s => ({ label: s.key, content: s.content })),
  ...agentEntries.map(a => ({ label: a.label, content: a.content })),
];

for (const { label, content } of agentTokenSources) {
  // Accept an optional plugin prefix (e.g. `agentsystem-core:`) before the agent name.
  for (const m of content.matchAll(/subagent_type=(?:[a-z][a-z0-9-]*:)?([a-z0-9-]+)/g)) {
    if (!agentNames.has(m[1])) {
      errors.push(`${label}: references unknown subagent_type "${m[1]}"`);
    }
  }
  // Concrete reviewer-<name> tokens (not the `reviewer-*` wildcard).
  for (const m of content.matchAll(/\breviewer-[a-z][a-z-]*[a-z]\b/g)) {
    const name = m[0];
    if (!agentNames.has(name)) {
      errors.push(`${label}: references unknown reviewer agent "${name}"`);
    }
  }
}

// ── Check 3 — every references/*.md markdown link in a SKILL.md resolves ────
// Only markdown link targets `](references/…md)` are validated (resolved
// relative to the skill's own dir). Bare prose mentions of another skill's
// reference path are intentionally not treated as this skill's own link.
for (const skill of skills.values()) {
  for (const m of skill.content.matchAll(/\]\((references\/[A-Za-z0-9._/-]+\.md)(?:#[^)]*)?\)/g)) {
    if (!existsSync(join(skill.dir, m[1]))) {
      errors.push(`${skill.key}: broken reference link "${m[1]}"`);
    }
  }
}

// ── Check 4 — declared "invoked by" callers actually route the callee ───────
for (const callee of skills.values()) {
  for (const callerName of descriptionCallers(callee.description)) {
    const caller = aliases.get(callerName) ?? byName.get(callerName);
    if (!caller) {
      errors.push(`${callee.key} declares unknown caller "${callerName}"`);
      continue;
    }
    if (!callerMentionsCallee(caller.content, callee.key, callee.name)) {
      errors.push(`${caller.key} should explicitly route ${callee.key}`);
    }
  }
}

// ── Check 5 — frontmatter name matches directory / filename ─────────────────
for (const skill of skills.values()) {
  const fmName = field(frontmatter(skill.content), 'name');
  if (fmName && fmName !== skill.dirName) {
    errors.push(`${skill.key}: frontmatter name "${fmName}" != directory "${skill.dirName}"`);
  }
}
for (const a of agentEntries) {
  const fmName = field(frontmatter(a.content), 'name');
  if (fmName && fmName !== a.name) {
    errors.push(`${a.label}: frontmatter name "${fmName}" != filename "${a.name}"`);
  }
}

// ── Check 6 — user-question banner present in every skill ───────────────────
for (const skill of skills.values()) {
  if (!skill.content.includes('User-question protocol')) {
    errors.push(`${skill.key}: missing the User-question protocol banner`);
  }
}

// ── Check 7 — command lint (broken ripgrep patterns) ────────────────────────
const cmdSources = [
  ...[...skills.values()].map(s => ({ label: s.key, content: s.content })),
  ...agentEntries.map(a => ({ label: a.label, content: a.content })),
];
for (const { label, content } of cmdSources) {
  content.split('\n').forEach((line, i) => {
    const at = `${label}:${i + 1}`;
    if (line.includes('--type tsx')) {
      errors.push(`invalid \`rg --type tsx\` (ripgrep has no tsx type; use --type ts) — ${at}`);
    }
    if (/\brg\b/.test(line) && / -E ['"]/.test(line)) {
      errors.push(`\`rg -E\` means --encoding, not regex; use \`rg -e\` — ${at}`);
    }
    if (/ -F ['"][^'"]*\\\|/.test(line)) {
      errors.push(`\`rg -F\` fixed-string with a \`\\|\` alternation can never match; use \`-e\` — ${at}`);
    }
  });
}

// ── Check 8 — reviewer report-contract lint ─────────────────────────────────
for (const a of agentEntries) {
  if (!a.name.startsWith('reviewer-')) continue;
  if (!a.content.includes('auto-fixable')) {
    errors.push(`${a.label}: reviewer agent must define an \`auto-fixable\` field (findings contract)`);
  }
  if (!/\b(CRITICAL|HIGH|MEDIUM|LOW)\b/.test(a.content)) {
    errors.push(`${a.label}: reviewer agent must use the CRITICAL/HIGH/MEDIUM/LOW severity scale`);
  }
}

// ── Check 9 — reverse direction: an agent's "Used by" callers must dispatch it
for (const a of agentEntries) {
  const m = a.description.match(/Used (?:only )?by\s+([\s\S]*?)(?:\.\s|\.$|$)/i);
  if (!m) continue;
  const clause = m[1];
  for (const skill of skills.values()) {
    if (!new RegExp(`\\b${skill.name}\\b(?!-)`).test(clause)) continue;
    if (!skill.content.includes(a.name)) {
      errors.push(`agent ${a.name} claims caller "${skill.name}" (Used by …) but ${skill.name} never dispatches it`);
    }
  }
}

// ── Check 10 — core routes advertise their accepted args ────────────────────
const coreRoutes = ['add-feature', 'modify-feature', 'fix-bug', 'remove-feature', 'audit', 'ship', 'polish-ui'];
for (const name of coreRoutes) {
  const skill = byName.get(name);
  if (!skill) continue;
  if (!/\bmode=/.test(skill.description)) {
    errors.push(`${skill.key}: core route description must advertise \`mode=\``);
  }
  if (!/include=/.test(skill.description) || !/skip=/.test(skill.description)) {
    errors.push(`${skill.key}: core route description must advertise \`include=\` / \`skip=\``);
  }
}

// ── Check 11 — reliability-orchestration contracts remain wired ────────────
const addFeature = byName.get('add-feature');
if (addFeature) {
  const requiredMatrixTokens = [
    '7a, 7b, 7c-7n (gated)',
    '7e-7g (gated), 7i-7n (gated)',
    '7a-7n',
    'authz baseline (gated)',
    'final-candidate gate',
  ];
  for (const token of requiredMatrixTokens) {
    if (!addFeature.content.includes(token)) {
      errors.push(`${addFeature.key}: incomplete review/final-gate mode matrix; missing "${token}"`);
    }
  }
}

for (const name of ['add-feature', 'modify-feature', 'fix-bug']) {
  const skill = byName.get(name);
  if (!skill) continue;
  if (!skill.content.includes('Final candidate gate')) {
    errors.push(`${skill.key}: missing final post-mutation candidate gate`);
  }
  if (!skill.content.includes('hardcoded-secret sweep')) {
    errors.push(`${skill.key}: final gate must run the canonical hardcoded-secret sweep`);
  }
}

for (const name of ['remove-feature', 'polish-ui']) {
  const skill = byName.get(name);
  if (!skill) continue;
  if (!skill.content.includes('Final candidate gate')) {
    errors.push(`${skill.key}: missing final post-mutation candidate gate`);
  }
  if (!skill.content.includes('hardcoded-secret sweep')) {
    errors.push(`${skill.key}: final gate must run the canonical hardcoded-secret sweep`);
  }
}

const audit = byName.get('audit');
if (audit && (
  !audit.content.includes('Phase 7 — Re-verify and report')
  || !audit.content.includes('hardcoded-secret sweep')
)) {
  errors.push(`${audit.key}: final audit apply gate must reverify and run the secret sweep`);
}

for (const name of ['add-feature', 'modify-feature', 'fix-bug', 'remove-feature', 'polish-ui', 'audit']) {
  const skill = byName.get(name);
  if (!skill) continue;
  if (!skill.content.includes('run-id=') || !skill.content.includes('run-ledger=')) {
    errors.push(`${skill.key}: must accept and update the /ship run ledger`);
  }
}

const reliabilityAgents = {
  'plan-red-team': ['add-feature', 'modify-feature'],
  'findings-reconciler': ['add-feature', 'modify-feature', 'fix-bug', 'audit'],
  'integration-verifier': ['add-feature', 'modify-feature', 'fix-bug'],
};
for (const [agentName, callers] of Object.entries(reliabilityAgents)) {
  if (!agentNames.has(agentName)) {
    errors.push(`missing reliability agent "${agentName}"`);
    continue;
  }
  for (const callerName of callers) {
    const caller = byName.get(callerName);
    const dispatchRe = new RegExp(`subagent_type=(?:[a-z][a-z0-9-]*:)?${agentName}(?![a-z0-9-])`);
    if (!dispatchRe.test(caller?.content ?? '')) {
      errors.push(`${caller?.key ?? callerName}: must dispatch ${agentName}`);
    }
    if (!caller?.content.includes(`agents/${agentName}.md`)) {
      errors.push(`${caller?.key ?? callerName}: must define inline fallback for ${agentName}`);
    }
  }
}

const ship = byName.get('ship');
if (ship) {
  for (const token of [
    'references/run-ledger.md',
    'run-id=<id>',
    'run-ledger=<absolute path>',
    'diagnosed',
    'locally-verified',
    'partial',
    'blocked',
  ]) {
    if (!ship.content.includes(token)) {
      errors.push(`${ship.key}: missing run-ledger/terminal-state token "${token}"`);
    }
  }
  if (ship.content.includes('Code is production-ready')) {
    errors.push(`${ship.key}: must not claim an unconditional production-ready terminal state`);
  }
}

if (errors.length > 0) {
  console.error('Skill routing drift detected:');
  for (const item of errors) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Skill routing check passed (${skills.size} skills, ${agentNames.size} agents).`);
