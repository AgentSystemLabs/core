import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

// ── New single-skill architecture ──────────────────────────────────────────
// The agentsystem-core plugin registers exactly ONE skill, `ship`. Every
// workflow and reviewer lives *inside* it as a bundled file:
//   skills/ship/SKILL.md                      — the one registered skill
//   skills/ship/playbooks/<name>/PLAYBOOK.md  — bundled workflows / sub-skills
//   skills/ship/subagents/<name>.md           — bundled reviewer subagents
//   skills/ship/references/<file>.md          — shared reference docs
// Dispatch is by bundled file path (`playbooks/<n>/PLAYBOOK.md`,
// `subagents/<n>.md`), not by `subagent_type=` / the `Skill` tool.

const SHIP_DIR = 'plugins/agentsystem-core/skills/ship';
const PLAYBOOKS_DIR = join(SHIP_DIR, 'playbooks');
const SUBAGENTS_DIR = join(SHIP_DIR, 'subagents');
const REFERENCES_DIR = join(SHIP_DIR, 'references');

const SHARED_REFERENCES = new Set(['risk-signals.md', 'run-ledger.md', 'residue-sweep.md']);
const CORE_WORKFLOWS = ['add-feature', 'modify-feature', 'fix-bug', 'remove-feature', 'audit', 'polish-ui'];

function frontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match?.[1] ?? '';
}

function field(fm, name) {
  const match = fm.match(new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\n[a-zA-Z][\\w-]*:|$)`, 'm'));
  return (match?.[1] ?? '').replace(/\n\s+/g, ' ').trim();
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

if (!existsSync(join(SHIP_DIR, 'SKILL.md'))) {
  console.error(`The single ship skill was not found at ${SHIP_DIR}/SKILL.md`);
  process.exit(1);
}

// ── Catalogs ────────────────────────────────────────────────────────────────
const shipContent = readFileSync(join(SHIP_DIR, 'SKILL.md'), 'utf8');
const shipDescription = field(frontmatter(shipContent), 'description');

const workflows = new Map(); // name -> { name, dir, file, content, description }
for (const entry of readdirSync(PLAYBOOKS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = join(PLAYBOOKS_DIR, entry.name, 'PLAYBOOK.md');
  if (!existsSync(file)) continue;
  const content = readFileSync(file, 'utf8');
  workflows.set(entry.name, {
    name: entry.name,
    dir: join(PLAYBOOKS_DIR, entry.name),
    file,
    content,
    description: field(frontmatter(content), 'description'),
  });
}

const agents = new Map(); // name -> { name, file, content, description }
if (existsSync(SUBAGENTS_DIR)) {
  for (const f of readdirSync(SUBAGENTS_DIR).sort()) {
    if (!f.endsWith('.md')) continue;
    const content = readFileSync(join(SUBAGENTS_DIR, f), 'utf8');
    const name = f.replace(/\.md$/, '');
    agents.set(name, {
      name,
      file: join(SUBAGENTS_DIR, f),
      content,
      description: field(frontmatter(content), 'description'),
    });
  }
}

// Every markdown file under the ship skill, for reference scanning.
const allFiles = walk(SHIP_DIR).map(path => ({ path, content: readFileSync(path, 'utf8') }));

const errors = [];

// ── Check 1 — every bundled playbook/subagent path reference resolves ───────
for (const { path, content } of allFiles) {
  for (const m of content.matchAll(/\bplaybooks\/([a-z0-9-]+)\/PLAYBOOK\.md/g)) {
    if (!workflows.has(m[1])) errors.push(`${path}: references unknown playbook "${m[1]}"`);
  }
  for (const m of content.matchAll(/\bsubagents\/([a-z0-9-]+)\.md/g)) {
    if (!agents.has(m[1])) errors.push(`${path}: references unknown subagent "${m[1]}"`);
  }
}

// ── Check 2 — no stale old-architecture dispatch tokens ─────────────────────
// The only permitted mention is ship's resolution-rule example that teaches
// translation of the OLD syntax (uses the literal placeholder `Y`).
for (const { path, content } of allFiles) {
  for (const m of content.matchAll(/subagent_type=agentsystem-core:([a-z0-9-]+)/g)) {
    if (m[1] === 'Y') continue;
    errors.push(`${path}: stale dispatch token "subagent_type=agentsystem-core:${m[1]}" — use subagents/${m[1]}.md`);
  }
}

// ── Check 3 — every references/*.md markdown link resolves ───────────────────
// Local playbook/ship reference first; shared docs may live at ship-root.
for (const { path, content } of allFiles) {
  const dir = dirname(path);
  for (const m of content.matchAll(/\]\((references\/[A-Za-z0-9._/-]+\.md)(?:#[^)]*)?\)/g)) {
    const rel = m[1];
    if (existsSync(join(dir, rel))) continue;
    if (SHARED_REFERENCES.has(basename(rel)) && existsSync(join(REFERENCES_DIR, basename(rel)))) continue;
    errors.push(`${path}: broken reference link "${rel}"`);
  }
}

// ── Check 4 — frontmatter name matches location ─────────────────────────────
{
  const n = field(frontmatter(shipContent), 'name');
  if (n && n !== 'ship') errors.push(`ship/SKILL.md: frontmatter name "${n}" != "ship"`);
}
for (const wf of workflows.values()) {
  const n = field(frontmatter(wf.content), 'name');
  if (n && n !== wf.name) errors.push(`playbook ${wf.name}: frontmatter name "${n}" != directory "${wf.name}"`);
}
for (const a of agents.values()) {
  const n = field(frontmatter(a.content), 'name');
  if (n && n !== a.name) errors.push(`subagent ${a.name}: frontmatter name "${n}" != filename "${a.name}"`);
}

// ── Check 5 — user-question banner present in ship + core workflow playbooks ─
if (!shipContent.includes('User-question protocol')) {
  errors.push('ship: missing the User-question protocol banner');
}
for (const name of CORE_WORKFLOWS) {
  const wf = workflows.get(name);
  if (wf && !wf.content.includes('User-question protocol')) {
    errors.push(`playbook ${name}: missing the User-question protocol banner`);
  }
}

// ── Check 6 — command lint (broken ripgrep patterns) ────────────────────────
for (const { path, content } of allFiles) {
  content.split('\n').forEach((line, i) => {
    const at = `${path}:${i + 1}`;
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

// ── Check 7 — reviewer report-contract lint ─────────────────────────────────
for (const a of agents.values()) {
  if (!a.name.startsWith('reviewer-')) continue;
  if (!a.content.includes('auto-fixable')) {
    errors.push(`subagent ${a.name}: reviewer must define an \`auto-fixable\` field (findings contract)`);
  }
  if (!/\b(CRITICAL|HIGH|MEDIUM|LOW)\b/.test(a.content)) {
    errors.push(`subagent ${a.name}: reviewer must use the CRITICAL/HIGH/MEDIUM/LOW severity scale`);
  }
}

// ── Check 8 — core routes advertise their accepted args ─────────────────────
if (!/\bmode=/.test(shipDescription)) {
  errors.push('ship: core route description must advertise `mode=`');
}
for (const name of CORE_WORKFLOWS) {
  const wf = workflows.get(name);
  if (!wf) continue;
  if (!/\bmode=/.test(wf.description)) {
    errors.push(`playbook ${name}: core route description must advertise \`mode=\``);
  }
  if (!/include=/.test(wf.description) || !/skip=/.test(wf.description)) {
    errors.push(`playbook ${name}: core route description must advertise \`include=\` / \`skip=\``);
  }
}

// ── Check 9 — reliability-orchestration contracts remain wired ──────────────
const addFeature = workflows.get('add-feature');
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
      errors.push(`playbook add-feature: incomplete review/final-gate mode matrix; missing "${token}"`);
    }
  }
}

for (const name of ['add-feature', 'modify-feature', 'fix-bug', 'remove-feature', 'polish-ui']) {
  const wf = workflows.get(name);
  if (!wf) continue;
  if (!wf.content.includes('Final candidate gate')) {
    errors.push(`playbook ${name}: missing final post-mutation candidate gate`);
  }
  if (!wf.content.includes('hardcoded-secret sweep')) {
    errors.push(`playbook ${name}: final gate must run the canonical hardcoded-secret sweep`);
  }
}

const auditWf = workflows.get('audit');
if (auditWf && (
  !auditWf.content.includes('Phase 7 — Re-verify and report')
  || !auditWf.content.includes('hardcoded-secret sweep')
)) {
  errors.push('playbook audit: final audit apply gate must reverify and run the secret sweep');
}

for (const name of CORE_WORKFLOWS) {
  const wf = workflows.get(name);
  if (!wf) continue;
  if (!wf.content.includes('run-id=') || !wf.content.includes('run-ledger=')) {
    errors.push(`playbook ${name}: must accept and update the /ship run ledger`);
  }
}

const reliabilityAgents = {
  'plan-red-team': ['add-feature', 'modify-feature'],
  'findings-reconciler': ['add-feature', 'modify-feature', 'fix-bug', 'audit'],
  'integration-verifier': ['add-feature', 'modify-feature', 'fix-bug'],
};
for (const [agentName, callers] of Object.entries(reliabilityAgents)) {
  if (!agents.has(agentName)) {
    errors.push(`missing reliability agent "${agentName}"`);
    continue;
  }
  for (const callerName of callers) {
    const caller = workflows.get(callerName);
    if (!caller?.content.includes(`subagents/${agentName}.md`)) {
      errors.push(`playbook ${callerName}: must dispatch ${agentName}`);
    }
  }
}

for (const token of [
  'references/run-ledger.md',
  'run-id=<id>',
  'run-ledger=<absolute path>',
  'diagnosed',
  'locally-verified',
  'partial',
  'blocked',
]) {
  if (!shipContent.includes(token)) {
    errors.push(`ship: missing run-ledger/terminal-state token "${token}"`);
  }
}
if (shipContent.includes('Code is production-ready')) {
  errors.push('ship: must not claim an unconditional production-ready terminal state');
}

// ── Report ──────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error('Skill routing drift detected:');
  for (const item of errors) console.error(`- ${item}`);
  process.exit(1);
}

console.log(
  `Skill routing check passed (1 ship skill, ${workflows.size} playbooks, ${agents.size} subagents).`,
);
