import fs from 'node:fs';

const files = ['docs/apps-script-api.md', 'index.html'];
const hits = [];
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/consult|상담/i.test(lines[i])) {
      for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 7); j++) {
        hits.push(`${file}:${j + 1}: ${lines[j]}`);
      }
      hits.push('---');
    }
  }
}
const unique = [...new Set(hits)].slice(0, 180);
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const width = 2400;
const lineHeight = 24;
const height = Math.max(300, unique.length * lineHeight + 40);
const text = unique.map((line, i) => `<text x="20" y="${30 + i * lineHeight}" font-family="Consolas, Malgun Gothic" font-size="16">${esc(line.slice(0, 260))}</text>`).join('\n');
fs.writeFileSync('.tmp-consult-contract.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/>${text}</svg>`);
