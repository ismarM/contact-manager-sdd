#!/usr/bin/env node
// Poraba žetonov seje Claude Code iz lokalnih dnevnikov (konstitucija §2.7) – brez ocenjevanja in brez modela.
//
//   node scripts/token-report.mjs                 zadnja seja tega repozitorija
//   node scripts/token-report.mjs <id-seje>       določena seja (zadošča začetek ID-ja)
//   node scripts/token-report.mjs --list          seje tega repozitorija, najnovejša prva
//
// Izpiše vrstice Markdown za ai-log/token-report-<ime>.md: glavna seja, vsak podagent in skupaj.
// Vsak odgovor API se šteje enkrat (dnevnik isti ID sporočila zapiše večkrat; velja zadnji zapis).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Mapa dnevnikov projekta: ~/.claude/projects/<pot, kjer je vsak znak razen črk in števk zamenjan z "-">. */
export function projectDir(cwd, home = homedir()) {
  return path.join(home, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
}

/** Sešteje porabo ene datoteke .jsonl. */
export function usageOf(jsonl) {
  const byMessage = new Map();
  let userMessages = 0;
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // nedokončana zadnja vrstica med pisanjem
    }
    if (entry.type === 'user' && typeof entry.message?.content === 'string') userMessages += 1;
    const usage = entry.type === 'assistant' ? entry.message?.usage : undefined;
    if (usage && entry.message.id) byMessage.set(entry.message.id, { usage, model: entry.message.model });
  }
  const total = { responses: byMessage.size, userMessages, input: 0, output: 0, cacheCreation: 0, cacheRead: 0, models: new Set() };
  for (const { usage, model } of byMessage.values()) {
    total.input += usage.input_tokens ?? 0;
    total.output += usage.output_tokens ?? 0;
    total.cacheCreation += usage.cache_creation_input_tokens ?? 0;
    total.cacheRead += usage.cache_read_input_tokens ?? 0;
    if (model && model !== '<synthetic>') total.models.add(model);
  }
  total.total = total.input + total.output + total.cacheCreation + total.cacheRead;
  return total;
}

const add = (a, b) => ({
  responses: a.responses + b.responses,
  userMessages: a.userMessages + b.userMessages,
  input: a.input + b.input,
  output: a.output + b.output,
  cacheCreation: a.cacheCreation + b.cacheCreation,
  cacheRead: a.cacheRead + b.cacheRead,
  total: a.total + b.total,
  models: new Set([...a.models, ...b.models]),
});

const number = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const row = (label, u) =>
  `| ${label} | ${[...u.models].join(', ') || '–'} | ${u.userMessages} / ${u.responses} | ${number(u.input)} | ${number(u.output)} | ${number(u.cacheCreation)} | ${number(u.cacheRead)} | ${number(u.total)} |`;

function sessions(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => ({ id: name.slice(0, -'.jsonl'.length), file: path.join(dir, name), modified: statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified);
}

function subagents(dir, sessionId) {
  const folder = path.join(dir, sessionId, 'subagents');
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => {
      const meta = path.join(folder, name.replace(/\.jsonl$/, '.meta.json'));
      let description = name.replace(/\.jsonl$/, '');
      let type = '';
      if (existsSync(meta)) {
        const parsed = JSON.parse(readFileSync(meta, 'utf8'));
        description = parsed.description ?? description;
        type = parsed.agentType ?? '';
      }
      return { description, type, usage: usageOf(readFileSync(path.join(folder, name), 'utf8')) };
    });
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = projectDir(repoRoot);
  const all = sessions(dir);
  const argument = process.argv[2];
  if (all.length === 0) {
    console.error(`Ni dnevnikov sej v ${dir}`);
    process.exit(1);
  }
  if (argument === '--list') {
    for (const s of all) console.log(`${s.id}  ${new Date(s.modified).toISOString().slice(0, 16).replace('T', ' ')}`);
    process.exit(0);
  }
  const session = argument ? all.find((s) => s.id.startsWith(argument)) : all[0];
  if (!session) {
    console.error(`Seja ${argument} ne obstaja (seznam: node scripts/token-report.mjs --list)`);
    process.exit(1);
  }

  const main = usageOf(readFileSync(session.file, 'utf8'));
  const agents = subagents(dir, session.id);
  let sum = main;
  console.log('| Seja / podagent | Model | Sporočila (uporabnik / odgovori) | Input | Output | Cache creation | Cache read | Skupaj |');
  console.log('|---|---|---|---|---|---|---|---|');
  console.log(row(`glavna seja \`${session.id.slice(0, 8)}\``, main));
  for (const agent of agents) {
    console.log(row(`└ ${agent.type ? `${agent.type}: ` : ''}${agent.description}`, agent.usage));
    sum = add(sum, agent.usage);
  }
  console.log(row('**Skupaj**', sum));
}
