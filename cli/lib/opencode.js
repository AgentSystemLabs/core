import { readFileSync, writeFileSync } from 'node:fs';
import { splitFrontmatter, readScalar, truncateDescription } from './codex.js';

export { normalizeCodexSkill as normalizeOpencodeSkill } from './codex.js';

export function convertAgentToOpencodeMd(agentMdFile, outMdFile, fallbackName) {
  const content = readFileSync(agentMdFile, 'utf-8');
  const parsed = splitFrontmatter(content);

  let description = `AgentSystem subagent: ${fallbackName}`;
  let body = content;

  if (parsed) {
    description = truncateDescription(
      readScalar(parsed.frontmatterLines, 'description') ||
        `AgentSystem subagent: ${fallbackName}`
    );
    body = parsed.body.replace(/^\n+/, '');
  }

  const frontmatter = [
    '---',
    `description: ${JSON.stringify(description)}`,
    'mode: subagent',
    'permission:',
    '  edit: deny',
    '  bash: allow',
    '---',
    '',
  ].join('\n');

  writeFileSync(outMdFile, frontmatter + body, 'utf-8');
}
