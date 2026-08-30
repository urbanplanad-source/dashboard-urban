import fs from 'node:fs';
import path from 'node:path';

const roots = ['index.html', 'docs/apps-script-api.md', 'scripts', 'apps-script'];
const files = [];
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  const stat = fs.statSync(root);
  if (stat.isFile()) files.push(root);
  else for (const name of fs.readdirSync(root)) {
    const file = path.join(root, name);
    if (fs.statSync(file).isFile() && /\.(?:md|mjs|js|gs|html)$/i.test(file)) files.push(file);
  }
}

const hits = [];
const pattern = /consult|상담|wechat|위챗|addConsult|channelConsult/i;
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const selected = new Set();
  lines.forEach((line, index) => {
    if (pattern.test(line)) {
      for (let i = Math.max(0, index - 3); i <= Math.min(lines.length - 1, index + 5); i++) selected.add(i);
    }
  });
  if (!selected.size) continue;
  hits.push(`### ${file}`);
  for (const index of [...selected].sort((a, b) => a - b)) hits.push(`${String(index + 1).padStart(5)} | ${lines[index]}`);
}

const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const wrapped = [];
for (const line of hits.slice(0, 500)) {
  if (line.length <= 150) wrapped.push(line);
  else {
    for (let i = 0; i < line.length; i += 150) wrapped.push((i ? '      ' : '') + line.slice(i, i + 150));
  }
}
const height = Math.max(400, wrapped.length * 22 + 40);
const tspans = wrapped.map((line, index) => `<tspan x="18" y="${28 + index * 22}">${escape(line)}</tspan>`).join('');
fs.writeFileSync('.tmp-consult-contract.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="${height}" viewBox="0 0 1800 ${height}"><rect width="100%" height="100%" fill="white"/><text font-family="Consolas, monospace" font-size="15" fill="#111">${tspans}</text></svg>`);
