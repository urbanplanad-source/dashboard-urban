import process from 'node:process';

const DEFAULT_API_URL =
  'https://script.google.com/macros/s/AKfycbwUsy5dDEG-t4FszWRCj-f0-FLIOY4SPMatiNsm55xM7bFXzaAEFS6McQdvmXT85dT0/exec';

const API_URL =
  process.env.REPORT_CONTEXT_API_URL ||
  process.env.REVIEW_MONITOR_API_URL ||
  DEFAULT_API_URL;

const CLIENT_ALIASES = new Map([
  ['bellemont', 'belrmon'],
  ['eyeclinic', 'eyecare'],
  ['igo', 'igochi'],
]);

const DEFAULT_CLIENTS = ['btskin', 'belrmon'];

function usage() {
  return [
    'Usage:',
    '  node scripts/check-consults-api.mjs --month YYYY-MM --client btskin,belrmon',
    '  node scripts/check-consults-api.mjs --month YYYY-MM',
    '',
    'Options:',
    '  --month YYYY-MM  Report month. Defaults to the current KST month.',
    '  --client LIST    Comma-separated client IDs. Defaults to btskin,belrmon.',
    '  --api-url URL    Apps Script endpoint. Default: REPORT_CONTEXT_API_URL or project endpoint.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    apiUrl: API_URL,
    clients: DEFAULT_CLIENTS,
    month: currentKstMonth(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      i += 1;
      return value;
    };

    if (arg === '--month') args.month = next();
    else if (arg === '--client') args.clients = next().split(',').map(canonicalClientId).filter(Boolean);
    else if (arg === '--api-url') args.apiUrl = next();
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

function canonicalClientId(value) {
  const id = String(value || '').trim();
  return CLIENT_ALIASES.get(id) || id;
}

function currentKstMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function buildUrl(apiUrl, params) {
  const url = new URL(apiUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
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

async function checkClient({ apiUrl, clientId, month }) {
  const url = buildUrl(apiUrl, { action: 'consultsList', clientId, month });
  const json = await fetchJson(url);
  if (!json.success) throw new Error(json.error || 'consultsList returned success=false');

  const records = json.data?.consults || json.consults || [];
  if (!Array.isArray(records)) throw new Error('consultsList did not return an array');

  const active = records.filter((item) => String(item.status || 'active').toLowerCase() !== 'deleted');
  const byChannel = active.reduce((acc, item) => {
    const key = item.channel || '기타';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return { total: active.length, byChannel };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!/^\d{4}-\d{2}$/.test(args.month || '')) {
    throw new Error('--month must be YYYY-MM');
  }
  if (!args.clients.length) throw new Error('No clients selected');

  console.log(`Consults API check for ${args.month}`);
  let failed = false;
  for (const clientId of args.clients) {
    try {
      const result = await checkClient({ apiUrl: args.apiUrl, clientId, month: args.month });
      const channels = Object.entries(result.byChannel)
        .map(([channel, count]) => `${channel} ${count}`)
        .join(', ');
      console.log(`- ${clientId}: ok, ${result.total} records${channels ? ` (${channels})` : ''}`);
    } catch (error) {
      failed = true;
      console.error(`- ${clientId}: failed (${error.message || error})`);
    }
  }

  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
