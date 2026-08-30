import fs from 'node:fs';

const endpoint = 'https://script.google.com/macros/s/AKfycbwUsy5dDEG-t4FszWRCj-f0-FLIOY4SPMatiNsm55xM7bFXzaAEFS6McQdvmXT85dT0/exec?action=summary';
const names = ['Peggy.L', 'wang yang', 'michelle', 'Nu:Yoah', 'Honey玮', '你说ღ', '叶xx', 'Zzzzzzzz', '鸣鸣', '一海千寻', '小宁', '牙牙'];

let ok = false;
try {
  const response = await fetch(endpoint, { redirect: 'follow' });
  const body = await response.text();
  ok = response.ok && names.every((name) => body.includes(name));
} catch {}

const width = 16;
const height = 16;
const rowSize = Math.ceil((width * 3) / 4) * 4;
const pixelBytes = rowSize * height;
const bmp = Buffer.alloc(54 + pixelBytes);
bmp.write('BM', 0);
bmp.writeUInt32LE(bmp.length, 2);
bmp.writeUInt32LE(54, 10);
bmp.writeUInt32LE(40, 14);
bmp.writeInt32LE(width, 18);
bmp.writeInt32LE(height, 22);
bmp.writeUInt16LE(1, 26);
bmp.writeUInt16LE(24, 28);
bmp.writeUInt32LE(pixelBytes, 34);
const color = ok ? [0, 210, 0] : [0, 0, 230];
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = 54 + y * rowSize + x * 3;
    bmp[offset] = color[0];
    bmp[offset + 1] = color[1];
    bmp[offset + 2] = color[2];
  }
}
fs.writeFileSync('tmp-btskin-aug-status.bmp', bmp);
process.exitCode = ok ? 0 : 1;
