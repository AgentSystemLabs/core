import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { packageRoot } from '../cli/lib/paths.js';

const CORE = join(packageRoot, 'plugins/agentsystem-core');
const skill = name => readFileSync(join(CORE, 'skills', name, 'SKILL.md'), 'utf8');
const agent = name => join(CORE, 'agents', `${name}.md`);

function modeRow(content, mode) {
  const row = content
    .split('\n')
    .find(line => line.startsWith(`| \`${mode}\``));
  assert.ok(row, `missing ${mode} mode row`);
  return row.split('|').slice(1, -1).map(cell => cell.trim());
}

function runRoutingWithMutation(relativePath, mutate) {
  const root = mkdtempSync(join(tmpdir(), 'agentsystem-routing-contract-'));
  cpSync(join(packageRoot, 'plugins'), join(root, 'plugins'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  cpSync(
    join(packageRoot, 'scripts/check-skill-routing.mjs'),
    join(root, 'scripts/check-skill-routing.mjs'),
  );

  const target = join(root, relativePath);
  const mutated = mutate(readFileSync(target, 'utf8'));
  if (mutated === null) rmSync(target);
  else writeFileSync(target, mutated);
  return spawnSync(process.execPath, ['scripts/check-skill-routing.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('Fleet reliability integration contracts', () => {
  test('adversarial roles are least-privilege and keep their defining contracts', () => {
    const required = {
      'plan-red-team': ['SURVIVES', 'AMEND', 'KILL', 'BLOCKED'],
      'findings-reconciler': [
        'Reviewer coverage',
        'FIX_REQUIRED',
        'FIXED_PENDING_REVERIFY',
        'CLOSED',
      ],
      'integration-verifier': ['PASS', 'FAIL', 'Fail closed', 'No fix authority'],
    };

    for (const name of ['plan-red-team', 'findings-reconciler', 'integration-verifier']) {
      const path = agent(name);
      assert.ok(existsSync(path), `missing ${name}`);
      const content = readFileSync(path, 'utf8');
      assert.match(content, /Read-only|read-only/i, `${name} must declare read-only authority`);
      const tools = content.match(/^tools:\s*(.+)$/m)?.[1] ?? '';
      assert.doesNotMatch(tools, /\b(Edit|Write)\b/, `${name} must not receive edit/write tools`);
      for (const token of required[name]) {
        assert.ok(content.includes(token), `${name} missing defining contract "${token}"`);
      }
    }
  });

  test('production plan challenge covers architecture and relevant failure modes', () => {
    const content = readFileSync(agent('plan-red-team'), 'utf8');
    const architectureChecks = [
      ['Scalability', /scalability/i],
      ['Reliability and failure isolation', /reliability\/failure-isolation/i],
      ['Performance and capacity', /performance\/capacity/i],
      ['Operability and observability', /operability\/observability/i],
      ['Data integrity and concurrency', /data-integrity\/concurrency/i],
      ['Security boundaries', /security-boundary/i],
      ['Deployment and rollback safety', /deployment\/rollback/i],
      ['Cost and complexity', /cost\/complexity/i],
    ];
    const matrixStart = content.indexOf('### Cross-cutting architecture checks');
    const matrixEnd = content.indexOf('### Relevant failure modes');
    const matrix = content.slice(matrixStart, matrixEnd);
    const statuses = '<SURVIVES | AMEND | BLOCKED | UNVERIFIED | N/A>';

    assert.ok(matrixStart >= 0 && matrixEnd > matrixStart, 'plan-red-team missing architecture matrix');
    for (const [label] of architectureChecks) {
      assert.ok(
        matrix.includes(`- ${label}: ${statuses}`),
        `plan-red-team missing enforced architecture check "${label}"`,
      );
    }
    assert.match(content, /Do not manufacture risks/i);
    assert.match(content, /Do not invent scale or reliability requirements/i);
    assert.match(content, /dependency timeout, outage, backlog, duplicate delivery/);
    assert.match(content, /may remain `UNVERIFIED` under `PASS` only when .* cannot change the chosen design or its safety/);

    for (const name of ['add-feature', 'modify-feature']) {
      const workflow = skill(name);
      assert.match(workflow, /subagent_type=agentsystem-core:plan-red-team/);
      for (const [label, pattern] of architectureChecks) {
        assert.match(workflow, pattern, `${name} does not require "${label}"`);
      }
    }
  });

  test('feature mode matrix covers every review gate', () => {
    const content = skill('add-feature');
    const production = modeRow(content, 'production');
    const balanced = modeRow(content, 'balanced');
    const fast = modeRow(content, 'fast');

    assert.equal(production.length, 3);
    assert.equal(balanced.length, 3);
    assert.equal(fast.length, 3);
    assert.match(production[0], /^`production` \(default\)$/);
    assert.equal(
      production[1],
      '1, 2, 3, 4, 5, 6, 7a, 7b, 7c-7n (gated), authz baseline (gated), 8, post-steps, final-candidate gate',
    );
    assert.equal(production[2], 'none — full pipeline');

    assert.equal(
      balanced[1],
      '1, 2, 3, 5, 6, 7a, 7b, 7e-7g (gated), 7i-7n (gated), authz baseline (gated), 8 (conditional), post-steps, final-candidate gate',
    );
    assert.equal(
      balanced[2],
      '4 (Plan-gate), 7c broad security (authz baseline still runs), 7d (Perf), 7h (Data Integrity) unless explicitly included',
    );

    assert.equal(fast[1], '5, 6, final-candidate gate');
    assert.equal(fast[2], '1, 2, 3, 4, 7a-7n, authz baseline, 8, post-steps');
  });

  test('mutating workflows finish with a post-mutation gate and secret sweep', () => {
    for (const name of ['add-feature', 'modify-feature', 'fix-bug']) {
      const content = skill(name);
      const postAt = content.lastIndexOf('Post-step:');
      const finalAt = content.indexOf('Final candidate gate — AFTER every mutation');
      assert.ok(postAt >= 0, `${name} must define mutating post-steps`);
      assert.ok(finalAt > postAt, `${name} final gate must follow post-steps`);
      const finalSection = content.slice(finalAt);
      assert.match(finalSection, /typecheck/);
      assert.match(finalSection, /actual changed code path|changed path again|original Step 4 diagnostic/);
      assert.match(finalSection, /canonical residue \+ hardcoded-secret sweep/);
      assert.match(
        finalSection,
        /If any final-gate fix changes code|If a repair changes code|Any code change made to repair/,
      );
      assert.match(finalSection, /integration-verifier/);
      assert.match(finalSection, /agents\/integration-verifier\.md/);
    }

    const removal = skill('remove-feature');
    const removalPost = removal.indexOf('Post-step:');
    const removalFinal = removal.indexOf('Final candidate gate');
    assert.ok(removalPost >= 0 && removalFinal > removalPost);
    assert.match(removal.slice(removalFinal), /canonical residue \+ hardcoded-secret sweep/);
    assert.match(removal.slice(removalFinal), /If a repair changes code, repeat/);

    const polish = skill('polish-ui');
    const polishVerify = polish.indexOf('## Verify');
    const polishFinal = polish.indexOf('Final candidate gate');
    assert.ok(polishVerify >= 0 && polishFinal > polishVerify);
    assert.match(polish.slice(polishFinal), /canonical residue \+ hardcoded-secret sweep/);
    assert.match(polish.slice(polishFinal), /If a repair changes code, repeat/);

    const audit = skill('audit');
    const auditApply = audit.indexOf('Phase 6 — Apply');
    const auditFinal = audit.indexOf('Phase 7 — Re-verify and report');
    assert.ok(auditApply >= 0 && auditFinal > auditApply);
    const auditSection = audit.slice(auditFinal);
    assert.match(auditSection, /canonical residue \+ hardcoded-secret sweep/);
    assert.match(auditSection, /exercise each changed behavior path/);
    assert.match(auditSection, /runtime smoke evidence/);
  });

  test('review workflows reconcile parallel findings', () => {
    for (const name of ['add-feature', 'modify-feature', 'fix-bug', 'audit']) {
      const content = skill(name);
      assert.match(content, /subagent_type=agentsystem-core:findings-reconciler/);
      assert.match(content, /agents\/findings-reconciler\.md/);
    }
  });

  test('ship propagates a durable ledger and defines honest terminal states', () => {
    const content = skill('ship');
    assert.match(content, /references\/run-ledger\.md/);
    const step4 = content.slice(
      content.indexOf('## Step 4 — Execute'),
      content.indexOf('## Step 5 — Report'),
    );
    assert.match(step4, /run-id=<id>.*run-ledger=<absolute path>/s);
    assert.match(step4, /routed skill must update its phase, subagent, reviewer, finding-disposition, and verification records/);
    const stateSection = content.slice(content.indexOf('Use exactly one terminal state:'));
    assert.match(stateSection, /\*\*`diagnosed`\*\*.*no code candidate/s);
    assert.match(stateSection, /\*\*`locally-verified`\*\*.*final post-mutation gate/s);
    assert.match(stateSection, /\*\*`partial`\*\*.*required local command or runtime observation/s);
    assert.match(stateSection, /\*\*`blocked`\*\*.*required gate failed/s);
    assert.match(
      stateSection,
      /Never print publication handoff commands for `diagnosed`, `partial`, or `blocked`/,
    );
    assert.ok(!content.includes('Code is production-ready'));

    for (const name of [
      'add-feature',
      'modify-feature',
      'fix-bug',
      'remove-feature',
      'polish-ui',
      'audit',
    ]) {
      const workflow = skill(name);
      const handoffAt = workflow.indexOf('Run-ledger handoff');
      const handoff = workflow.slice(handoffAt, handoffAt + 650);
      assert.ok(handoffAt >= 0, `${name} missing run-ledger handoff`);
      assert.match(handoff, /run-id=.*run-ledger=|run-id=` and `run-ledger=/);
      assert.match(handoff, /every .*transition/);
      assert.match(handoff, /finding dispositions/);
      assert.match(handoff, /verification evidence/);
    }

    const ledger = readFileSync(
      join(CORE, 'skills/ship/references/run-ledger.md'),
      'utf8',
    );
    assert.match(ledger, /<run-id>\.md/);
    assert.match(ledger, /Never use a fixed `.agentsystem\/ship-run\.md`/);
    for (const section of [
      'Locked decisions and assumptions',
      'Phase checklist',
      'Contract and ownership',
      'Subagent manifest',
      'Reviewer coverage',
      'Verification evidence',
      'Waivers and blockers',
      'Checkpoint and resume rules',
    ]) {
      assert.ok(ledger.includes(section), `run ledger missing ${section}`);
    }
    assert.match(ledger, /verify run ID, base SHA, current worktree status, and input hash/);
  });

  test('routing checker fails closed when reliability wiring drifts', () => {
    const cases = [
      {
        path: 'plugins/agentsystem-core/skills/add-feature/SKILL.md',
        mutate: content => content.replace('7a, 7b, 7c-7n (gated)', '7a, 7b, 7c-7h (gated)'),
        diagnostic: 'incomplete review/final-gate mode matrix',
      },
      {
        path: 'plugins/agentsystem-core/skills/add-feature/SKILL.md',
        mutate: content => content.replaceAll('agents/plan-red-team.md', 'agents/plan-fallback.md'),
        diagnostic: 'must define inline fallback for plan-red-team',
      },
      {
        path: 'plugins/agentsystem-core/skills/ship/SKILL.md',
        mutate: content => content.replaceAll('references/run-ledger.md', 'references/missing-ledger.md'),
        diagnostic: 'missing run-ledger/terminal-state token',
      },
      {
        path: 'plugins/agentsystem-core/skills/modify-feature/SKILL.md',
        mutate: content => content.replaceAll('Final candidate gate', 'Final output gate'),
        diagnostic: 'missing final post-mutation candidate gate',
      },
      {
        path: 'plugins/agentsystem-core/skills/fix-bug/SKILL.md',
        mutate: content => content.replaceAll('hardcoded-secret sweep', 'credential check'),
        diagnostic: 'final gate must run the canonical hardcoded-secret sweep',
      },
      {
        path: 'plugins/agentsystem-core/skills/remove-feature/SKILL.md',
        mutate: content => content.replaceAll('Final candidate gate', 'Final output gate'),
        diagnostic: 'missing final post-mutation candidate gate',
      },
      {
        path: 'plugins/agentsystem-core/skills/audit/SKILL.md',
        mutate: content => content.replace('Phase 7 — Re-verify and report', 'Phase 7 — Report'),
        diagnostic: 'final audit apply gate must reverify and run the secret sweep',
      },
      {
        path: 'plugins/agentsystem-core/skills/polish-ui/SKILL.md',
        mutate: content => content.replaceAll('run-ledger=', 'ledger-path='),
        diagnostic: 'must accept and update the /ship run ledger',
      },
      {
        path: 'plugins/agentsystem-core/skills/audit/SKILL.md',
        mutate: content => content.replaceAll(
          'subagent_type=agentsystem-core:findings-reconciler',
          'subagent_type=agentsystem-core:reviewer-code',
        ),
        diagnostic: 'must dispatch findings-reconciler',
      },
      {
        path: 'plugins/agentsystem-core/agents/plan-red-team.md',
        mutate: () => null,
        diagnostic: 'missing reliability agent "plan-red-team"',
      },
      {
        path: 'plugins/agentsystem-core/skills/ship/SKILL.md',
        mutate: content => `${content}\nCode is production-ready\n`,
        diagnostic: 'must not claim an unconditional production-ready terminal state',
      },
    ];

    for (const item of cases) {
      const result = runRoutingWithMutation(item.path, item.mutate);
      assert.equal(result.status, 1, `checker unexpectedly passed mutation for ${item.path}`);
      assert.match(result.stderr, new RegExp(item.diagnostic));
    }
  });
});
