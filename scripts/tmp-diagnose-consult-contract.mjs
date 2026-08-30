import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  path.join(root, 'index.html'),
  path.join(root, 'docs', 'apps-script-api.md'),
  path.join('C:\\Users\\user\\.codex\\memories', 'MEMORY.md'),
];

const appDir = path.join(root, 'apps-script');
if (fs.existsSync(appDir)) {
  for (const name of fs.readdirSync(appDir)) {
    if (name.endsWith('.gs')) files.push(path.join(appDir, name));
  }
}

const hits = [];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/consult|상담|channel.{0,12}(history|consult)|addChannel|saveChannel/i.test(line)) {
      hits.push({ file, line: i + 1, text: line.trim().replace(/\s+/g, ' ').slice(0, 280) });
    }
  }
}

const relevant = hits.filter((h) =>
  /action|fetch|post|consult|상담|payload|channel/i.test(h.text)
).slice(0, 80);

const esc = (s) => String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const rows = relevant.map((h, idx) => {
  const short = h.file.replace(root + path.sep, '').replace('C:\\Users\\user\\.codex\\memories\\', 'MEMORY/');
  return `<text x="24" y="${74 + idx * 19}" font-size="13" fill="#18212f">${esc(`${short}:${h.line} ${h.text}`)}</text>`;
}).join('\n');

const height = Math.max(160, 105 + relevant.length * 19);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1900" height="${height}" viewBox="0 0 1900 ${height}">
<rect width="100%" height="100%" fill="#f7f8fb"/>
<text x="24" y="34" font-size="24" font-family="Segoe UI, sans-serif" font-weight="700" fill="#111827">Consult storage contract evidence</text>
<text x="24" y="57" font-size="14" font-family="Segoe UI, sans-serif" fill="#4b5563">Current repo + memory matches, bounded to 80 lines</text>
<g font-family="Consolas, monospace">${rows}</g>
</svg>`;

fs.writeFileSync(path.join(root, 'consult-contract-debug.svg'), svg, 'utf8');
