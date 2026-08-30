import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const resultPath = 'btskin-aug-live-verify.json';
const finalPath = 'btskin-aug-final-verified.ok';
const failPath = 'btskin-aug-final-verify.failed';

for (const path of [finalPath, failPath]) {
  if (fs.existsSync(path)) fs.rmSync(path);
}

let result;
try {
  result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
} catch (error) {
  fs.writeFileSync(failPath, `result-read-failed: ${error.message}\n`, 'utf8');
  process.exit(2);
}

const missing = Array.isArray(result.missing) ? result.missing : [];
const liveOk = Boolean(result.ok) && missing.length === 0 && Number(result.wechatCount) >= 24 && Number(result.totalCount) >= 25;
if (!liveOk) {
  fs.writeFileSync(
    failPath,
    JSON.stringify({ reason: 'live-count-mismatch', result }, null, 2),
    'utf8',
  );
  process.exit(3);
}

const check = spawnSync(
  'npm.cmd',
  ['run', 'report:consults:check', '--', '--month', '2026-08', '--client', 'btskin'],
  { encoding: 'utf8', shell: true },
);

if (check.status !== 0) {
  fs.writeFileSync(
    failPath,
    JSON.stringify({
      reason: 'standard-check-failed',
      status: check.status,
      stdout: check.stdout,
      stderr: check.stderr,
    }, null, 2),
    'utf8',
  );
  process.exit(4);
}

fs.writeFileSync(
  finalPath,
  [
    'clientId=btskin',
    'month=2026-08',
    `wechatCount=${result.wechatCount}`,
    `totalCount=${result.totalCount}`,
    'missing=0',
    'standardCheck=passed',
  ].join('\n') + '\n',
  'utf8',
);
