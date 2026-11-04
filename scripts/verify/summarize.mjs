// Zgoščen izpis padlih korakov verify.sh (FR-000-08, contracts/verify-cli.md – Izpis, research R-09).
// Vsaka napaka je ena vrstica: "<korak>  <datoteka:vrstica>  <pravilo>  <sporočilo>" ali "<korak>  <test>  <razlog>".
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_HINT = '(celoten izpis: .verify/last.log)';

const nonEmptyLines = (text) => text.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '');

/** Pot relativno na koren repozitorija; relativne poti orodij so relativne na mapo koraka. */
function relative(file, step, root) {
  const absolute = path.isAbsolute(file) ? file : path.join(root, step.cwd ?? '', file);
  return path.relative(root, absolute).split(path.sep).join('/');
}

function eslint(step, root) {
  const errors = [];
  let current = null;
  for (const line of nonEmptyLines(step.output)) {
    // Oblika unix: /pot/datoteka.tsx:3:5: sporočilo [Error/pravilo]
    const unix = line.match(/^(.+?):(\d+):\d+: (.*) \[(?:Error|Warning)\/(.+)\]$/);
    if (unix) {
      errors.push([relative(unix[1], step, root) + ':' + unix[2], unix[4], unix[3]]);
      continue;
    }
    // Oblika stylish: glava z datoteko, nato "  3:5  error  sporočilo  pravilo"
    if (!/^\s/.test(line) && (path.isAbsolute(line) || /\.[cm]?[jt]sx?$/.test(line))) {
      current = line.trim();
      continue;
    }
    const stylish = line.match(/^\s+(\d+):\d+\s+(?:error|warning)\s+(.*?)(?:\s{2,}(\S+))?$/);
    if (stylish && current) {
      errors.push([relative(current, step, root) + ':' + stylish[1], stylish[3] ?? 'eslint', stylish[2]]);
    }
  }
  return errors;
}

function tsc(step, root) {
  const errors = [];
  for (const line of nonEmptyLines(step.output)) {
    const match =
      line.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/) ??
      line.match(/^(.+?):(\d+):\d+ - error (TS\d+): (.*)$/);
    if (match) errors.push([relative(match[1], step, root) + ':' + match[2], match[3], match[4]]);
  }
  return errors;
}

function maven(step, root) {
  const errors = [];
  for (const line of nonEmptyLines(step.output)) {
    const match = line.match(/^\[(?:ERROR|WARNING)\] (\S+\.java):\[(\d+),\d+\] (?:\[([\w.-]+)\] )?(.*)$/);
    if (match) errors.push([relative(match[1], step, root) + ':' + match[2], match[3] ?? 'javac', match[4]]);
  }
  return errors;
}

function spotless(step, root) {
  const errors = [];
  for (const line of nonEmptyLines(step.output)) {
    const match = line.match(/^\[ERROR\]\s{4,}(\S+\.\w+)$/);
    if (match) errors.push([relative(match[1], step, root), 'spotless', 'datoteka ni formatirana']);
  }
  return errors;
}

function prettier(step, root) {
  const errors = [];
  for (const line of nonEmptyLines(step.output)) {
    const match = line.match(/^\[warn\] (\S+)$/);
    if (match) errors.push([relative(match[1], step, root), 'prettier', 'datoteka ni formatirana']);
  }
  return errors;
}

const decode = (text) =>
  text
    .replace(/&#10;/g, '\n')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? decode(match[1]) : undefined;
};

/** Ime razreda Java (si.x.RequestIdFilterTest) → zadnji del; pot datoteke → ime datoteke. */
function shortClass(classname) {
  if (classname === '' || classname === 'test') return ''; // node --test nima razreda
  if (/^[\w$]+(\.[\w$]+)+$/.test(classname)) {
    const last = classname.split('.').at(-1);
    if (/^[A-Z]/.test(last)) return last;
  }
  return classname.split(/[\\/]/).at(-1);
}

const firstLine = (text) => text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';

/** Prva vrstica razloga; node --test iz atributa message odstrani prelome, besedilo elementa jih ohrani. */
function reason(message, body) {
  const fromBody = firstLine(body.replace(/^\s*\[?\w*Error(?: \[\w+\])?: /, ''));
  if (!message.includes('\n') && fromBody && message.startsWith(fromBody)) return fromBody;
  return firstLine(message);
}

function junit(step) {
  const errors = [];
  const localHost = hostname();
  for (const xml of step.reports ?? []) {
    let project;
    const tokens = xml.matchAll(/<(\/?)(testsuite|testcase|failure|error)\b([^>]*?)(\/?)>/g);
    let testcase = null;
    for (const token of tokens) {
      const [whole, closing, tag, attrs, selfClosing] = token;
      if (tag === 'testsuite' && !closing) {
        const host = attribute(attrs, 'hostname');
        project = host && host !== localHost ? host : undefined;
      } else if (tag === 'testcase' && !closing) {
        testcase = selfClosing ? null : { name: attribute(attrs, 'name') ?? '', classname: attribute(attrs, 'classname') ?? '' };
      } else if (tag === 'testcase' && closing) {
        testcase = null;
      } else if ((tag === 'failure' || tag === 'error') && !closing && testcase && !testcase.reported) {
        testcase.reported = true;
        const owner = shortClass(testcase.classname);
        const label = project ? `[${project}] ${testcase.name}` : owner ? `${owner} › ${testcase.name}` : testcase.name;
        const start = token.index + whole.length;
        const body = selfClosing ? '' : decode(xml.slice(start, xml.indexOf(`</${tag}>`, start)));
        errors.push([label, reason(attribute(attrs, 'message') ?? attribute(attrs, 'type') ?? '', body)]);
      }
    }
  }
  return errors;
}

const parsers = { eslint, tsc, maven, spotless, prettier, junit };

function tail(step, count) {
  return nonEmptyLines(step.output).slice(-count).map((line) => `${step.name}  ${line.trim()}`);
}

/**
 * @param {{ name: string, kind: string, cwd?: string, output: string, reports?: string[] }[]} steps padli koraki v vrstnem redu
 * @param {{ root: string, limit: number }} options limit je največje število vrstic povzetka
 * @returns {string[]}
 */
export function summarize(steps, { root, limit }) {
  const tailBudget = Math.max(3, Math.floor(limit / Math.max(1, steps.length)));
  const lines = [];
  for (const step of steps) {
    const parsed = parsers[step.kind]?.(step, root) ?? [];
    if (parsed.length > 0) {
      for (const parts of parsed) lines.push([step.name, ...parts.filter((p) => p !== '')].join('  '));
    } else {
      lines.push(...tail(step, tailBudget));
    }
  }
  if (lines.length <= limit) return lines;
  const shown = lines.slice(0, limit - 1);
  return [...shown, `… in še ${lines.length - shown.length} ${LOG_HINT}`];
}

// CLI: node summarize.mjs --root <koren> --limit <n> <seznam.tsv>
// Vrstica seznama: ime \t vrsta \t cwd|- \t dnevnik koraka \t poročila JUnit, ločena z ":".
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 ? args.splice(index, 2)[1] : fallback;
  };
  const root = option('--root', process.cwd());
  const limit = Number(option('--limit', '19'));
  const steps = nonEmptyLines(readFileSync(args[0], 'utf8')).map((line) => {
    const [name, kind, cwd, log, reports] = line.split('\t');
    const read = (file) => {
      try {
        return readFileSync(file, 'utf8');
      } catch {
        return '';
      }
    };
    return {
      name,
      kind,
      cwd: cwd === '-' ? '' : cwd,
      output: read(log),
      reports: (reports ?? '').split(':').filter(Boolean).map(read).filter(Boolean),
    };
  });
  for (const line of summarize(steps, { root, limit })) console.log(line);
}
