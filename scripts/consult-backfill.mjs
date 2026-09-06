import fs from 'node:fs/promises';
import process from 'node:process';

// 상담내역 보강 도구 (tmp-retry-btskin-aug-consults.mjs 대체)
//
// 설계 원칙:
// - 상담 원문과 닉네임을 이 파일에 하드코딩하지 않는다. 항상 --input 파일에서 읽는다.
// - 운영 endpoint를 하드코딩하지 않는다. --api-url 또는 환경변수로만 받는다.
// - 기본 동작은 dry-run이다. --apply 없이는 어떤 POST도 보내지 않는다.
// - 원격에 이미 있는 consultId는 보내지 않는다.
// - 로그에 닉네임/상담 원문을 출력하지 않는다. 건수와 consultId만 남긴다.
// - 순차 전송한다. 동시 POST는 Apps Script 동시 실행 한도와 addConsult의
//   read-then-append 경합을 유발한다.

const REQUEST_TIMEOUT_MS = 20000;
const POST_INTERVAL_MS = 350;

const CLIENT_ALIASES = new Map([
  ['bellemont', 'belrmon'],
  ['eyeclinic', 'eyecare'],
  ['igo', 'igochi'],
]);

function usage() {
  return [
    'Usage:',
    '  node scripts/consult-backfill.mjs --client btskin --month 2026-08 --input .local-consults.json',
    '  node scripts/consult-backfill.mjs --client btskin --month 2026-08 --input .local-consults.json --apply',
    '',
    'Options:',
    '  --client ID      대상 clientId (필수)',
    '  --month YYYY-MM  대상 운영월 (필수)',
    '  --input FILE     상담 레코드 JSON 배열 파일 (필수). .gitignore 대상 경로를 사용한다.',
    '  --api-url URL    Apps Script endpoint. 미지정 시 DASHBOARD_API_URL을 사용한다.',
    '  --apply          실제 addConsult POST를 전송한다. 없으면 dry-run.',
    '',
    'Input file format (JSON array):',
    '  [{ "consultId": "cs-...", "date": "2026-08-01", "channel": "위챗",',
    '     "nickname": "...", "content": "...", "createdAt": "..." }]',
    '  consultId를 생략하면 date+channel+nickname 기반으로 안정적 ID를 만든다.',
    '',
    '보안: --input 파일에는 환자 개인정보가 들어간다. 저장소에 커밋하지 않는다.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    apiUrl: process.env.DASHBOARD_API_URL || '',
    apiKey: process.env.DASHBOARD_API_KEY || '',
    apply: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      i += 1;
      return value;
    };

    if (arg === '--client') args.client = canonicalClientId(next());
    else if (arg === '--month') args.month = next();
    else if (arg === '--input') args.input = next();
    else if (arg === '--api-url') args.apiUrl = next();
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

function canonicalClientId(value) {
  const id = String(value || '').trim();
  return CLIENT_ALIASES.get(id) || id;
}

function normalizeMonth(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function normalizeDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

// 닉네임/본문을 로그로 흘리지 않기 위한 안정적 ID. 같은 입력이면 같은 ID가 나오므로
// 재실행해도 addConsult upsert가 중복 행을 만들지 않는다.
function stableConsultId(clientId, record) {
  const seed = [clientId, record.date, record.channel, record.nickname].join('|');
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `cs-bf-${hash.toString(36)}`;
}

function buildUrl(apiUrl, params) {
  const url = new URL(apiUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  return url;
}

async function requestJson(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: 'follow', ...init, signal: controller.signal });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response: ${text.slice(0, 160)}`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(json).slice(0, 160)}`);
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRemoteIds(apiUrl, apiKey, clientId, month) {
  const json = await requestJson(buildUrl(apiUrl, { action: 'consultsList', clientId, month, apiKey }), {
    method: 'GET',
  });
  if (!json.success) throw new Error(json.error || 'consultsList returned success=false');
  const records = json.data?.consults || json.consults || [];
  if (!Array.isArray(records)) throw new Error('consultsList did not return an array');
  return new Set(
    records
      .filter((item) => String(item.status || 'active').toLowerCase() !== 'deleted')
      .map((item) => String(item.consultId || item.id || ''))
      .filter(Boolean),
  );
}

async function loadRecords(file, clientId, month) {
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`--input 파일을 읽지 못했습니다: ${error.message || error}`);
  }
  if (!Array.isArray(parsed)) throw new Error('--input 파일은 JSON 배열이어야 합니다');

  const skipped = { badDate: 0, otherMonth: 0, missingFields: 0 };
  const records = [];

  for (const raw of parsed) {
    const date = normalizeDate(raw?.date);
    if (!date) {
      skipped.badDate += 1;
      continue;
    }
    const recordMonth = normalizeMonth(raw?.month || date);
    if (recordMonth !== month) {
      skipped.otherMonth += 1;
      continue;
    }
    if (!String(raw?.channel || '').trim() || !String(raw?.nickname || '').trim()) {
      skipped.missingFields += 1;
      continue;
    }
    const record = {
      date,
      month: recordMonth,
      channel: String(raw.channel).trim(),
      nickname: String(raw.nickname),
      content: String(raw.content || ''),
      createdAt: raw.createdAt || new Date().toISOString(),
    };
    record.consultId = String(raw.consultId || raw.id || '').trim() || stableConsultId(clientId, record);
    records.push(record);
  }

  return { records, skipped };
}

async function postConsult(apiUrl, apiKey, clientId, record) {
  const json = await requestJson(apiUrl, {
    method: 'POST',
    body: JSON.stringify({ action: 'addConsult', apiKey, clientId, ...record }),
  });
  if (!json.success) throw new Error(json.error || 'addConsult returned success=false');
  return json;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  if (!args.client) throw new Error('--client is required');
  if (!/^\d{4}-\d{2}$/.test(args.month || '')) throw new Error('--month must be YYYY-MM');
  if (!args.input) throw new Error('--input is required');
  if (!args.apiUrl) {
    throw new Error(
      'API endpoint가 없습니다. --api-url 을 지정하거나 DASHBOARD_API_URL 환경변수를 설정하세요.',
    );
  }
  if (!args.apiKey) throw new Error('DASHBOARD_API_KEY 환경변수를 설정하세요.');

  const { records, skipped } = await loadRecords(args.input, args.client, args.month);
  console.log(`consult-backfill ${args.client} ${args.month}`);
  console.log(`- 입력 유효 레코드: ${records.length}건`);
  if (skipped.badDate || skipped.otherMonth || skipped.missingFields) {
    console.log(
      `- 제외: 날짜 오류 ${skipped.badDate}, 다른 월 ${skipped.otherMonth}, 필수값 누락 ${skipped.missingFields}`,
    );
  }
  if (!records.length) return;

  const remoteIds = await fetchRemoteIds(args.apiUrl, args.apiKey, args.client, args.month);
  console.log(`- 원격 기존 레코드: ${remoteIds.size}건`);

  const missing = records.filter((record) => !remoteIds.has(record.consultId));
  console.log(`- 전송 대상(원격 미존재): ${missing.length}건`);

  if (!missing.length) {
    console.log('보강할 항목이 없습니다.');
    return;
  }

  if (!args.apply) {
    console.log('');
    console.log('[dry-run] --apply 가 없으므로 POST를 보내지 않았습니다. 전송 예정 consultId:');
    missing.forEach((record) => console.log(`  ${record.consultId}  ${record.date}  ${record.channel}`));
    console.log('');
    console.log('실제 전송하려면 동일한 명령에 --apply 를 추가하세요.');
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const record of missing) {
    try {
      await postConsult(args.apiUrl, args.apiKey, args.client, record);
      sent += 1;
      console.log(`  sent ${record.consultId}`);
    } catch (error) {
      failed += 1;
      console.error(`  failed ${record.consultId}: ${error.message || error}`);
    }
    await sleep(POST_INTERVAL_MS);
  }

  console.log('');
  console.log(`전송 완료: 성공 ${sent}건, 실패 ${failed}건`);
  console.log('npm run report:consults:check 로 최종 건수를 확인하세요.');
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
