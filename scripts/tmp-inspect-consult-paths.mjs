import fs from 'node:fs';

const files = [
  'scripts/tmp-resave-btskin-aug-consults.mjs',
  'scripts/tmp-verify-btskin-aug-resave.mjs',
  'index.html',
  'docs/apps-script-api.md',
  'C:/Users/user/.codex/memories/MEMORY.md',
];

const patterns = /channelconsult|consultation|consult|상담|addconsult|saveconsult|action\s*[:=]/i;
const lines = [];

for (const file of files) {
  lines.push(`FILE ${file}`);
  if (!fs.existsSync(file)) {
    lines.push('  MISSING');
    continue;
  }
  const content = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let found = 0;
  for (let i = 0; i < content.length; i += 1) {
    if (!patterns.test(content[i])) continue;
    const start = Math.max(0, i - 2);
    const end = Math.min(content.length, i + 3);
    for (let j = start; j < end; j += 1) {
      lines.push(`${String(j + 1).padStart(5)} ${content[j]}`);
    }
    lines.push('  ---');
    found += 1;
    if (found >= (file.endsWith('MEMORY.md') ? 15 : 30)) break;
  }
  if (!found) lines.push('  NO MATCH');
}

const escaped = lines
  .map((line) => line.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]))
  .map((line, i) => `<text x="12" y="${24 + i * 16}" font-family="Consolas, monospace" font-size="12">${line.slice(0, 220)}</text>`)
  .join('\n');

const height = Math.max(200, 40 + lines.length * 16);
fs.writeFileSync('consult-paths.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="${height}"><rect width="100%" height="100%" fill="white"/>${escaped}</svg>`);
