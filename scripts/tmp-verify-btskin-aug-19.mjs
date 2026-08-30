import fs from 'node:fs';

const endpoint = 'https://script.google.com/macros/s/AKfycbwUsy5dDEG-t4FszWRCj-f0-FLIOY4SPMatiNsm55xM7bFXzaAEFS6McQdvmXT85dT0/exec';
const expected = [
  'Peggy.L', 'wang yang', 'michelle', 'Nu:Yoah', 'Ange岛屿', 'Honey玮',
  '你说ღ', '叶xx🍃', 'Zzzzzzzz', '鸣鸣', '一海千寻', '小宁', '牙牙',
];
const flag = 'tmp-btskin-aug-verified.flag';

const response = await fetch(`${endpoint}?action=summary&draftMode=light&clientId=btskin`);
if (!response.ok) throw new Error(`summary HTTP ${response.status}`);
const text = await response.text();
const missing = expected.filter((name) => !text.includes(name));
const markers = ['眼部注射，超声刀', '塑造萃', '8月15日09:30', '黄金微针类祛痘项目', '2026年9月4号', '一支玻尿酸可以打鼻尖'];
const missingMarkers = markers.filter((value) => !text.includes(value));

if (missing.length || missingMarkers.length) {
  if (fs.existsSync(flag)) fs.unlinkSync(flag);
  process.exitCode = 1;
} else {
  fs.writeFileSync(flag, 'verified', 'utf8');
}
