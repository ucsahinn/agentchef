#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Read the actual parsers without importing or executing any CLI action.
// A parser shape change fails closed rather than silently dropping coverage.
export function readCommandContracts(root = ROOT) {
  const contracts = {};
  for (const [tool, file] of [['team-run', 'team-run.mjs'], ['coordination-board', 'coordination-board.mjs']]) {
    const source = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
    const body = /const COMMANDS = \{([\s\S]*?)\n\};/.exec(source)?.[1];
    if (!body) throw new Error(`Cannot read ${tool} command table.`);
    const commands = {};
    for (const match of body.matchAll(/(?:"([\w-]+)"|([\w-]+)):\s*\[([^\]]*)\]/g)) {
      const options = [...match[3].matchAll(/"([\w-]+)"/g)].map(m => m[1]);
      const command = match[1] || match[2];
      const globals = tool === 'coordination-board' ? ['help', 'strict-scope', ...(['brief-check', 'handoff-check'].includes(command) ? [] : ['state'])] : [];
      commands[command] = new Set([...options, 'json', ...globals]);
    }
    if (!Object.keys(commands).length || body.replace(/(?:"[\w-]+"|[\w-]+):\s*\[[^\]]*\]/g, '').replace(/[\s,]/g, '')) throw new Error(`Unrecognized ${tool} command table syntax.`);
    contracts[tool] = commands;
  }
  const chef = fs.readFileSync(path.join(root, 'scripts/chef-cli.mjs'), 'utf8');
  const actions = /const ACTION_FLAGS = new Map\(\[([\s\S]*?)\n\]\);/.exec(chef)?.[1];
  const parser = chef.slice(chef.indexOf('for (let index = 0; index < args.length;'), chef.indexOf('if (requestedActionFlags.length > 1)'));
  if (!actions || !parser.includes('Unknown option')) throw new Error('Cannot read chef option parser.');
  contracts.chef = new Set([...actions.matchAll(/\["--([\w-]+)"/g), ...parser.matchAll(/arg === "--([\w-]+)"/g)].map(m => m[1]));
  contracts.chefShort = new Set([...parser.matchAll(/arg === "(-[a-zA-Z])"/g)].map(m => m[1]));
  const review = fs.readFileSync(path.join(root, 'scripts/external-review-cli.mjs'), 'utf8');
  const reviewParser = /function parseOptions\(args\) \{([\s\S]*?)\nfunction print/.exec(review)?.[1];
  if (!reviewParser) throw new Error('Cannot read chef review parser.');
  contracts.review = {
    commands: new Set([...review.matchAll(/if \(command === "([\w-]+)"\)/g)].map(m => m[1])),
    flags: new Set([...reviewParser.matchAll(/"--([\w-]+)"/g)].map(m => m[1]))
  };
  return contracts;
}

function regions(text, file) {
  const result = [];
  if (/\.[cm]?js$/.test(file)) {
    // CLI hints occur in string literals and multiline templates. The closing
    // delimiter bounds the command; escaped quotes remain inside the literal.
    for (let i = 0; i < text.length; i++) {
      if (text.slice(i, i + 2) === '//') { const end = text.indexOf('\n', i); i = end < 0 ? text.length : end; continue; }
      if (text.slice(i, i + 2) === '/*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 1; continue; }
      if (!['"', "'", '`'].includes(text[i])) continue;
      const start = i, quote = text[i];
      while (++i < text.length) { if (text[i] === '\\') { i++; continue; } if (text[i] === quote) break; }
      result.push({ text: text.slice(start + 1, i).replace(/\\(["'`])/g, '$1'), offset: start });
    }
  } else {
    // Markdown inline code and fenced examples, including shell continuations.
    for (const match of text.matchAll(/```[^\n]*\n([\s\S]*?)```|`([^`\n]+)`/g)) result.push({ text: match[1] ?? match[2], offset: match.index });
  }
  return result;
}

export function validateCommandText(text, file, contracts = readCommandContracts()) {
  const errors = [];
  const prefix = /\b(?:(?:npm(?:\.cmd)?(?:\s+--prefix\s+\S+)?\s+run\s+(?:--silent\s+)?(chef|chefg|team:run|coordination:board)(?:\s+--)?)(?=\s|$)|(?:node\s+scripts\/)?(team-run(?:\.mjs)?|coordination-board(?:\.mjs)?|chef-cli\.mjs)(?=\s|$)|(chef|chefg)(?=\s+-))/g;
  const snippets = regions(text, file);
  const canonical = alias => ['chef', 'chefg', 'chef-cli'].includes(alias) ? 'chef' : alias === 'team:run' ? 'team-run' : alias === 'coordination:board' ? 'coordination-board' : alias;
  const contexts = new Set(snippets.flatMap(region => [...region.text.matchAll(prefix)].map(match => canonical((match[1] || match[2] || match[3]).replace(/\.mjs$/, '')))));
  for (const region of snippets) {
    let commandText = region.text.replace(/(?:\\|`)[ \t]*\r?\n/g, ' ');
    // A document about one CLI also contains abbreviated examples such as
    // `merge --as-patch` following a full invocation.
    if (contexts.size === 1 && !/\.mjs$/.test(file) && ![...commandText.matchAll(prefix)].length) {
      const tool = [...contexts][0], trimmed = commandText.trim();
      if (tool !== 'chef' && contracts[tool][trimmed.split(/\s/)[0]]) commandText = `${tool} ${trimmed}`;
    }
    const matches = [...commandText.matchAll(prefix)];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const alias = (match[1] || match[2] || match[3]).replace(/\.mjs$/, '');
      const tool = ['chef', 'chefg', 'chef-cli'].includes(alias) ? 'chef' : alias === 'team:run' ? 'team-run' : alias === 'coordination:board' ? 'coordination-board' : alias;
      const tail = commandText.slice(match.index + match[0].length, matches[i + 1]?.index).split(/\r?\n|&&|\|\||;|`/)[0];
      // Quoted values (for example --task "mention --flag") are single tokens.
      const tokens = tail.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g) || [];
      const line = text.slice(0, region.offset).split('\n').length + commandText.slice(0, match.index).split('\n').length - 1;
      const fail = message => errors.push(`${file}:${line}: ${tool} ${message}`);
      let accepted;
      if (tool === 'chef') {
        accepted = contracts.chef;
        if (tokens[0] === 'review') {
          tokens.shift(); const command = tokens.shift();
          if (command !== '…' && !/^<[^>]+>$/.test(command) && !contracts.review.commands.has(command)) { fail(`unknown review command ${command}`); continue; }
          accepted = contracts.review.flags;
        } else if (tokens[0] && !tokens[0].startsWith('-')) { fail(`unknown command ${tokens[0]}`); continue; }
      }
      else {
        const command = tokens.shift();
        if (!command || ['help', '--help'].includes(command)) continue;
        if (/^<[^>]+>$/.test(command)) accepted = new Set(Object.values(contracts[tool]).flatMap(set => [...set]));
        else if (!contracts[tool][command]) {
          // Plain prose inside CLI strings is not a runnable example.
          if (/\.mjs$/.test(file) && !tokens.some(token => token.startsWith('--'))) continue;
          fail(`unknown command ${command}`); continue;
        }
        else accepted = contracts[tool][command];
      }
      for (const token of tokens) {
        const option = token.replace(/^\[/, '');
        if (/^-[a-zA-Z]/.test(option)) {
          const flag = option.replace(/[\].,)"'`]+$/, '');
          if (tool !== 'chef' || accepted !== contracts.chef || !contracts.chefShort.has(flag)) fail(`does not accept ${flag}`);
          continue;
        }
        if (!option.startsWith('--')) continue;
        if (option.includes('=')) { fail(`does not accept equals syntax: ${option}`); continue; }
        const flag = option.slice(2).split('=')[0].replace(/[\].,)"'`]+$/, '');
        if (!accepted.has(flag)) fail(`does not accept --${flag}`);
      }
    }
  }
  return errors;
}

export function validateCommandHints(root = ROOT) {
  const contracts = readCommandContracts(root), errors = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) { if (!['node_modules', '.git', 'tests', 'agent-results', '.agent-notifications'].includes(entry.name)) walk(file); }
      else if (/\.md$/.test(file) || (dir.startsWith('scripts') && /\.mjs$/.test(file))) errors.push(...validateCommandText(fs.readFileSync(path.join(root, file), 'utf8'), file, contracts));
    }
  };
  for (const dir of ['docs', 'kb', 'plugins/agentchef/skills', 'templates', 'scripts']) walk(dir);
  for (const entry of fs.readdirSync(root)) if (/\.md$/.test(entry)) errors.push(...validateCommandText(fs.readFileSync(path.join(root, entry), 'utf8'), entry, contracts));
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const errors = validateCommandHints();
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log('Command hints match team-run, coordination-board and chef parsers.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
