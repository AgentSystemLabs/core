import { readFileSync, writeFileSync } from 'node:fs';
import { splitFrontmatter, readScalar, truncateDescription } from './codex.js';

export { normalizeCodexSkill as normalizeOpencodeSkill } from './codex.js';

export function convertAgentToOpencodeMd(agentMdFile, outMdFile, fallbackName) {
  const content = readFileSync(agentMdFile, 'utf-8');
  const parsed = splitFrontmatter(content);

  let description = `AgentSystem subagent: ${fallbackName}`;
  let body = content;
  let toolsRaw = '';

  if (parsed) {
    description = truncateDescription(
      readScalar(parsed.frontmatterLines, 'description') ||
        `AgentSystem subagent: ${fallbackName}`
    );
    toolsRaw = readScalar(parsed.frontmatterLines, 'tools') || '';
    body = parsed.body.replace(/^\n+/, '');
  }

  // Derive OpenCode permissions from the agent's declared `tools:` rather than
  // hardcoding — a read-only reviewer gets edit:deny/bash:allow, but an editing
  // agent (e.g. pr-comment-resolver) must get edit:allow or it can't do its job.
  const tools = toolsRaw
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
  const canEdit = tools.includes('edit') || tools.includes('write');
  const canBash = tools.includes('bash');

  const frontmatter = [
    '---',
    `description: ${JSON.stringify(description)}`,
    'mode: subagent',
    'permission:',
    `  edit: ${canEdit ? 'allow' : 'deny'}`,
    `  bash: ${canBash ? 'allow' : 'deny'}`,
    '---',
    '',
  ].join('\n');

  writeFileSync(outMdFile, frontmatter + body, 'utf-8');
}
