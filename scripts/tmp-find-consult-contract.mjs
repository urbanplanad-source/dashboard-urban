import fs from 'node:fs';

const files = ['index.html', 'docs/apps-script-api.md', 'package.json'];
const out = {};
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  out[file] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/consult|상담내역|상담 내역|channelConsult/i.test(lines[i])) {
      out[file].push({ line: i + 1, text: lines[i].trim().slice(0, 500) });
    }
    if (out[file].length >= 80) break;
  }
}
fs.writeFileSync('.tmp-find-consult-contract.json', JSON.stringify(out, null, 2));
