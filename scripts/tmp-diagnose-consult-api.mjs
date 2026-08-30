import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const endpoint = 'https://script.google.com/macros/s/AKfycbwUsy5dDEG-t4FszWRCj-f0-FLIOY4SPMatiNsm55xM7bFXzaAEFS6McQdvmXT85dT0/exec';

const files = ['index.html', 'docs/apps-script-api.md'];
const appDir = path.join(root, 'apps-script');
if (fs.existsSync(appDir)) {
  for (const name of fs.readdirSync(appDir)) {
    if (name.endsWith('.gs')) files.push(path.join('apps-script', name));
  }
}

const sources = files
  .filter((name) => fs.existsSync(path.join(root, name)))
  .map((name) => ({ name, text: fs.readFileSync(path.join(root, name), 'utf8') }));

const actionHits = [];
for (const { name, text } of sources) {
  const re = /action\s*:\s*['"]([^'"]+)['"]/gi;
  for (const match of text.matchAll(re)) {
    const start = Math.max(0, match.index - 900);
    const end = Math.min(text.length, match.index + 1400);
    const context = text.slice(start, end);
    const score = ['consult', '상담', 'channel', 'nickname', 'inquiry', 'response', 'customer']
      .reduce((sum, word) => sum + (context.toLowerCase().includes(word.toLowerCase()) ? 1 : 0), 0);
    if (score >= 2) actionHits.push({ file: name, action: match[1], score, context: context.replace(/\s+/g, ' ').slice(0, 1800) });
  }
}

const response = await fetch(`${endpoint}?action=summary&draftMode=light`, { redirect: 'follow' });
const summary = await response.json();

function collectArrays(value, route = '$', out = []) {
  if (Array.isArray(value)) {
    out.push({ route, value });
    value.forEach((item, i) => collectArrays(item, `${route}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectArrays(item, `${route}.${key}`, out);
  }
  return out;
}

const currentNames = new Set(['Grape', '陈晨', 'mmz', '优可Yuki', 'TOMOR', '法琪']);
const arrays = collectArrays(summary).map(({ route, value }) => {
  const objects = value.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  const keys = [...new Set(objects.flatMap((item) => Object.keys(item)))];
  const matches = objects.filter((item) => Object.values(item).some((v) => currentNames.has(String(v)))).length;
  return { route, length: value.length, keys, matches, sample: objects.slice(0, 2) };
}).filter((item) => item.matches || item.keys.some((key) => /consult|channel|nick|message|date/i.test(key)));

const diagnostic = {
  fetchedAt: new Date().toISOString(),
  responseStatus: response.status,
  actionHits: actionHits.sort((a, b) => b.score - a.score),
  arrays: arrays.sort((a, b) => b.matches - a.matches),
};

fs.writeFileSync(path.join(root, 'consult-api-diagnostic.json'), JSON.stringify(diagnostic, null, 2));

const top = diagnostic.actionHits.slice(0, 8);
const arr = diagnostic.arrays.slice(0, 8);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const lines = [
  `status=${diagnostic.responseStatus}`,
  ...top.map((x) => `ACTION ${x.action} score=${x.score} file=${x.file}`),
  ...arr.map((x) => `ARRAY ${x.route} length=${x.length} matches=${x.matches} keys=${x.keys.join(',')}`),
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="${120 + lines.length * 42}" viewBox="0 0 1800 ${120 + lines.length * 42}"><rect width="100%" height="100%" fill="white"/><text x="30" y="50" font-family="Consolas, monospace" font-size="24" fill="#111">${lines.map((line, i) => `<tspan x="30" dy="${i ? 42 : 0}">${esc(line)}</tspan>`).join('')}</text></svg>`;
fs.writeFileSync(path.join(root, 'consult-api-diagnostic.svg'), svg);
console.log(lines.join('\n'));
