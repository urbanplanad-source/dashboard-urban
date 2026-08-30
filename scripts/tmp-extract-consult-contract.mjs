import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  'index.html',
  'docs/apps-script-api.md',
  'scripts/tmp-resave-btskin-aug-consults.mjs',
  'scripts/tmp-verify-btskin-aug-resave.mjs',
].filter((file) => fs.existsSync(path.join(root, file)));

const lines = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const sourceLines = text.split(/\r?\n/);
  const hits = [];
  sourceLines.forEach((line, index) => {
    if (/consult|상담|inquir|channel/i.test(line)) hits.push(index);
  });
  lines.push(`### ${file}`);
  const selected = new Set();
  for (const index of hits.slice(0, 24)) {
    for (let i = Math.max(0, index - 2); i <= Math.min(sourceLines.length - 1, index + 4); i++) selected.add(i);
  }
  for (const index of [...selected].sort((a, b) => a - b)) {
    lines.push(`${String(index + 1).padStart(5)} ${sourceLines[index]}`);
  }
  lines.push('');
}

const escaped = lines
  .slice(0, 220)
  .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
const width = 1800;
const lineHeight = 22;
const height = Math.max(600, escaped.length * lineHeight + 40);
const tspans = escaped.map((line, index) => `<tspan x="20" y="${30 + index * lineHeight}">${line}</tspan>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><text font-family="Consolas, monospace" font-size="15" fill="#111">${tspans}</text></svg>`;
fs.writeFileSync(path.join(root, 'consult-contract.svg'), svg, 'utf8');
console.log(`wrote consult-contract.svg with ${escaped.length} lines`);
