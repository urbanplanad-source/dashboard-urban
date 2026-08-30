import fs from 'node:fs';

const endpoint = 'https://script.google.com/macros/s/AKfycbwUsy5dDEG-t4FszWRCj-f0-FLIOY4SPMatiNsm55xM7bFXzaAEFS6McQdvmXT85dT0/exec';
const expected = [
  'Peggy.L', 'wang yang', 'michelle', 'Nu:Yoah', '杨m', 'Ange岛屿',
  'Honey玮', '你说ღ', '叶xx🍃', 'Zzzzzzzz 🎈 ee', '鸣鸣', '一海千寻',
  '小宁', '牙牙',
];

const response = await fetch(`${endpoint}?action=summary&draftMode=light`, { redirect: 'follow' });
const body = await response.text();
const missing = expected.filter((name) => !body.includes(name));
const ok = response.ok && missing.length === 0;
const color = ok ? '#16a34a' : '#dc2626';
const title = ok ? 'SERVER VERIFIED' : 'SERVER DATA MISSING';
const detail = ok
  ? 'All distinctive missing nicknames were returned by the live summary API.'
  : `Missing: ${missing.join(', ')}`;
const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

fs.writeFileSync('tmp-btskin-aug-verify.svg', `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="260" viewBox="0 0 1200 260">
  <rect width="1200" height="260" fill="${color}"/>
  <text x="50" y="90" font-family="Arial, sans-serif" font-size="52" font-weight="700" fill="white">${title}</text>
  <text x="50" y="155" font-family="Arial, sans-serif" font-size="28" fill="white">HTTP ${response.status} | found ${expected.length - missing.length}/${expected.length}</text>
  <text x="50" y="210" font-family="Arial, sans-serif" font-size="22" fill="white">${escapeXml(detail)}</text>
</svg>`, 'utf8');

fs.writeFileSync('tmp-btskin-aug-verify.json', JSON.stringify({ ok, status: response.status, missing }, null, 2), 'utf8');
if (!ok) process.exitCode = 1;
