import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const result = spawnSync(
  process.execPath,
  ['.\\scripts\\tmp-resave-btskin-aug-consults.mjs'],
  { cwd: process.cwd(), encoding: 'utf8', windowsHide: true }
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'resave failed');
  process.exit(result.status ?? 1);
}

writeFileSync(
  '.tmp-btskin-aug-resave-verified.txt',
  'BTSKIN_AUGUST_WECHAT_RESAVE_VERIFIED\n',
  'utf8'
);
