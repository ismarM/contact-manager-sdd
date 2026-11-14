// Prepoved utišanja brez razloga (konstitucija VII).
// Utišanje opozorila ali izklop testa je dovoljen samo s komentarjem "utišanje: <razlog>" v isti ali predhodni
// vrstici; .only ni dovoljen nikoli.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ts = createRequire(path.join(repoRoot, 'frontend/package.json'))('typescript');

const TEST_FUNCTIONS = new Set(['it', 'test', 'describe']);
const DISABLED_TESTS = new Set(['xit', 'xdescribe', 'xtest']);

/** Komentar z razlogom: "utišanje: <vsaj nekaj besedila>". */
const REASON = /utišanje:[ \t]*\S.{4,}/i;

function typescriptFindings(file, content) {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, kind);
  const findings = [];
  const add = (position, found) => findings.push({ line: source.getLineAndCharacterOfPosition(position).line + 1, kind: found });

  const seenComments = new Set();
  const comment = (range) => {
    if (seenComments.has(range.pos)) return;
    seenComments.add(range.pos);
    const text = content.slice(range.pos, range.end);
    if (/^\/[/*]\s*eslint-disable/.test(text)) add(range.pos, 'eslint-disable');
    const directive = text.match(/^\/[/*]\s*@ts-(ignore|expect-error|nocheck)\b/);
    if (directive) add(range.pos, `@ts-${directive[1]}`);
  };
  const comments = (position, reader) => (reader(content, position) ?? []).forEach(comment);

  const rootName = (expression) => {
    while (ts.isPropertyAccessExpression(expression)) expression = expression.expression;
    return ts.isIdentifier(expression) ? expression.text : undefined;
  };

  const visit = (node) => {
    comments(node.pos, ts.getLeadingCommentRanges);
    comments(node.end, ts.getTrailingCommentRanges);
    if (node.kind === ts.SyntaxKind.AnyKeyword) add(node.getStart(source), 'any');
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee) && TEST_FUNCTIONS.has(rootName(callee) ?? '')) {
        const name = callee.name.text;
        if (name === 'only' || name === 'skip' || name === 'fixme') add(node.getStart(source), `.${name}`);
      }
      if (ts.isIdentifier(callee) && DISABLED_TESTS.has(callee.text)) add(node.getStart(source), callee.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  comments(source.endOfFileToken.pos, ts.getLeadingCommentRanges);
  return findings;
}

/** Java brez komentarjev in nizov (zamenjani s presledki, prelomi ostanejo). */
function javaCode(content) {
  return content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, (match) =>
    match.replace(/[^\n]/g, ' '),
  );
}

function javaFindings(content) {
  const findings = [];
  javaCode(content)
    .split('\n')
    .forEach((text, index) => {
      if (/@SuppressWarnings\b/.test(text)) findings.push({ line: index + 1, kind: '@SuppressWarnings' });
      if (/@Disabled\w*\b/.test(text)) findings.push({ line: index + 1, kind: '@Disabled' });
    });
  return findings;
}

/**
 * @param {{ path: string, content: string }[]} files
 * @returns {{ file: string, line: number, kind: string, message: string }[]}
 */
export function findSuppressions(files) {
  const results = [];
  for (const { path: file, content } of files) {
    let found;
    if (/\.(tsx?|[cm]?js)$/.test(file)) found = typescriptFindings(file, content);
    else if (file.endsWith('.java')) found = javaFindings(content);
    else continue;

    const lines = content.split('\n');
    for (const { line, kind } of found.sort((a, b) => a.line - b.line)) {
      if (kind === '.only') {
        results.push({ file, line, kind, message: '.only ni dovoljen' });
        continue;
      }
      const nearby = `${lines[line - 2] ?? ''}\n${lines[line - 1] ?? ''}`;
      if (!REASON.test(nearby)) {
        results.push({ file, line, kind, message: 'manjka komentar »utišanje: <razlog>«' });
      }
    }
  }
  return results;
}

// CLI: node suppressions.mjs [--root <koren repozitorija>]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--root');
  const root = index >= 0 ? path.resolve(process.argv[index + 1]) : repoRoot;
  const listed = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'backend/src', 'frontend/src', 'e2e', 'scripts', '*.config.*'],
    { cwd: root, encoding: 'utf8' },
  );
  const files = [...new Set(listed.split('\n').filter(Boolean))].map((file) => ({
    path: file,
    content: readFileSync(path.join(root, file), 'utf8'),
  }));
  const findings = findSuppressions(files);
  for (const { file, line, kind, message } of findings) console.log(`${file}:${line}  ${kind}  ${message}`);
  process.exit(findings.length > 0 ? 1 : 0);
}
