import fs from 'node:fs';

const files = ['index.html', 'docs/apps-script-api.md'];
let matches = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/consult|상담내역|상담 내역|addConsult|channel/i.test(line)) {
      matches.push(`${file}:${i + 1} ${line.trim()}`);
    }
  });
}
matches = matches.slice(0, 80);
const escape = (s) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const wrapped = [];
for (const line of matches) {
  for (let i = 0; i < line.length; i += 115) wrapped.push(line.slice(i, i + 115));
}
const h = Math.max(400, 36 + wrapped.length * 18);
const body = wrapped.map((s, i) => `<text x="12" y="${28 + i * 18}" font-family="Consolas,monospace" font-size="13">${escape(s)}</text>`).join('\n');
fs.writeFileSync('.tmp-consult-inspect.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${h}" viewBox="0 0 1600 ${h}"><rect width="100%" height="100%" fill="white"/>${body}</svg>`);
