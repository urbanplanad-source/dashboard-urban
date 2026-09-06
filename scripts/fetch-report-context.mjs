import fs from 'node:fs/promises';
import path from 'node:path';

const API_URL = process.env.DASHBOARD_API_URL || '';
const API_KEY = process.env.DASHBOARD_API_KEY || '';

const CLIENT_ALIASES = new Map([
  ['bellemont', 'belrmon'],
  ['eyeclinic', 'eyecare'],
  ['igo', 'igochi'],
]);

const KST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const KINDS = {
  required: '필수',
  sub: '서브',
  ranking: '순위',
};

function usage() {
  return [
    'Usage:',
    '  node scripts/fetch-report-context.mjs --month YYYY-MM --client btskin',
    '  node scripts/fetch-report-context.mjs --month YYYY-MM --client btskin,belrmon',
    '  node scripts/fetch-report-context.mjs --month YYYY-MM --all',
    '',
    'Options:',
    '  --out DIR      Output directory. Default: .report-context',
    '  --api-url URL  Apps Script endpoint. Default: DASHBOARD_API_URL',
    '  --dry-run      Fetch and summarize without writing files',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    all: false,
    apiUrl: API_URL,
    dryRun: false,
    outDir: '.report-context',
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
    else if (arg === '--client') args.client = next();
    else if (arg === '--all') args.all = true;
    else if (arg === '--out') args.outDir = next();
    else if (arg === '--api-url') args.apiUrl = next();
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function assertArgs(args) {
  if (args.help) return;
  if (!/^\d{4}-\d{2}$/.test(args.month || '')) {
    throw new Error('--month must be YYYY-MM');
  }
  if (!args.all && !args.client) {
    throw new Error('Use --client CLIENT_ID or --all');
  }
  if (args.all && args.client) {
    throw new Error('Use only one of --client or --all');
  }
}

function canonicalClientId(value) {
  const id = String(value || '').trim();
  return CLIENT_ALIASES.get(id) || id;
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

function formatKstDate(date) {
  return KST_DATE.format(date);
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return formatKstDate(value);

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.valueOf())) return formatKstDate(parsed);

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : raw;
}

function normalizeMonth(value) {
  const date = normalizeDate(value);
  const match = String(date || value || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function normalizePostLog(post) {
  const publishedAt = normalizeDate(post.publishedAt);
  return {
    ...post,
    clientId: canonicalClientId(post.clientId),
    publishedAt,
    month: normalizeMonth(post.month || publishedAt),
    channel: post.channel || post[''] || post.Channel || post['채널'] || '',
  };
}

function normalizeJob(job) {
  return {
    ...job,
    clientId: canonicalClientId(job.clientId),
    dueDate: normalizeDate(job.dueDate) || null,
    month: normalizeMonth(job.month),
    targetCount: numberOrNull(job.targetCount),
    currentCount: numberOrNull(job.currentCount),
  };
}

function normalizeExpense(expense) {
  return {
    ...expense,
    clientId: canonicalClientId(expense.clientId),
    date: normalizeDate(expense.date),
    month: normalizeMonth(expense.month || expense.date),
    amount: Number(expense.amount) || 0,
    isRecurring:
      expense.isRecurring === true ||
      expense.isRecurring === 'true' ||
      expense.isRecurring === 'TRUE' ||
      expense.isRecurring === '1',
  };
}

function normalizeLog(log) {
  return {
    ...log,
    clientId: canonicalClientId(log.clientId),
    createdAt: normalizeDate(log.createdAt),
    month: normalizeMonth(log.month || log.createdAt),
  };
}

function normalizeDraft(draft) {
  return {
    ...draft,
    clientId: canonicalClientId(draft.clientId),
    createdAt: normalizeDate(draft.createdAt),
    month: normalizeMonth(draft.month || draft.createdAt),
    content: undefined,
  };
}

function normalizeConsult(consult) {
  const id = consult.id || consult.consultId || consult.consult_id;
  return {
    ...consult,
    id,
    consultId: consult.consultId || id,
    clientId: canonicalClientId(consult.clientId),
    date: normalizeDate(consult.date),
    month: normalizeMonth(consult.month || consult.date),
    channel: consult.channel || '',
    nickname: consult.nickname || '',
    content: consult.content || '',
    createdAt: normalizeDate(consult.createdAt),
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isDoneJob(job) {
  const note = String(job.note || '');
  if (note.includes('완료')) return true;
  if (job.targetCount !== null && job.currentCount !== null) {
    return Number(job.currentCount) >= Number(job.targetCount);
  }
  return false;
}

function belongsToMonth(item, month, field = 'month') {
  const itemMonth = item[field] || normalizeMonth(item.date || item.publishedAt || item.createdAt);
  return !itemMonth || itemMonth === month;
}

function groupCount(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || '기타';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function sumAmount(items) {
  return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

async function fetchJson(url, { optional = false } = {}) {
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
      throw new Error(`Non-JSON response from ${url}`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(json).slice(0, 200)}`);
    return json;
  } catch (error) {
    if (optional) return { success: false, error: error.message || String(error) };
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSummary(apiUrl) {
  const url = buildUrl(apiUrl, { action: 'summary', draftMode: 'light', apiKey: API_KEY });
  const json = await fetchJson(url);
  if (!json.success) throw new Error(json.error || 'summary request failed');
  return json.data || {};
}

async function fetchConsults(apiUrl, clientId, month) {
  const url = buildUrl(apiUrl, { action: 'consultsList', clientId, month, apiKey: API_KEY });
  const json = await fetchJson(url, { optional: true });
  if (!json.success) {
    return {
      available: false,
      records: [],
      error: json.error || 'consultsList unavailable',
    };
  }

  const records = (json.data?.consults || json.consults || [])
    .map(normalizeConsult)
    .filter((consult) => consult.clientId === clientId)
    .filter((consult) => belongsToMonth(consult, month))
    .filter((consult) => consult.status !== 'deleted');

  return { available: true, records };
}

function normalizeSummaryData(data) {
  return {
    clients: (data.clients || []).map((client) => ({
      ...client,
      clientId: canonicalClientId(client.clientId),
    })),
    monthlyJobs: (data.monthlyJobs || []).map(normalizeJob),
    postLogs: (data.postLogs || []).map(normalizePostLog),
    expenses: (data.expenses || []).map(normalizeExpense),
    contracts: (data.contracts || []).map((contract) => ({
      ...contract,
      clientId: canonicalClientId(contract.clientId),
      monthlyFee: Number(contract.monthlyFee) || 0,
      contractStart: normalizeDate(contract.contractStart),
      contractRenew: normalizeDate(contract.contractRenew),
    })),
    logs: (data.logs || []).map(normalizeLog),
    drafts: (data.drafts || []).map(normalizeDraft),
    consults: (data.consults || []).map(normalizeConsult),
  };
}

async function buildClientContext({ data, apiUrl, month, clientId }) {
  const client = data.clients.find((item) => item.clientId === clientId) || null;
  const jobs = data.monthlyJobs
    .filter((job) => job.clientId === clientId)
    .filter((job) => belongsToMonth(job, month));
  const posts = data.postLogs
    .filter((post) => post.clientId === clientId)
    .filter((post) => post.month === month);
  const expenses = data.expenses
    .filter((expense) => expense.clientId === clientId)
    .filter((expense) => expense.month === month);
  const logs = data.logs
    .filter((log) => log.clientId === clientId)
    .filter((log) => belongsToMonth(log, month));
  const drafts = data.drafts
    .filter((draft) => draft.clientId === clientId)
    .filter((draft) => belongsToMonth(draft, month));
  const contract = data.contracts.find((item) => item.clientId === clientId) || null;

  const summaryConsults = data.consults
    .filter((consult) => consult.clientId === clientId)
    .filter((consult) => belongsToMonth(consult, month));
  const apiConsults = await fetchConsults(apiUrl, clientId, month);
  const consultRecords = apiConsults.available ? apiConsults.records : summaryConsults;

  const completedJobs = jobs.filter(isDoneJob);
  const openJobs = jobs.filter((job) => !isDoneJob(job));
  const requiredJobs = jobs.filter((job) => job.kind === KINDS.required);
  const subJobs = jobs.filter((job) => job.kind === KINDS.sub);
  const rankingJobs = jobs.filter((job) => job.kind === KINDS.ranking);

  const dataGaps = [];
  if (!client) dataGaps.push(`Clients row not found for ${clientId}`);
  if (!apiConsults.available && summaryConsults.length === 0 && ['btskin', 'belrmon'].includes(clientId)) {
    dataGaps.push('상담내역 API가 아직 배포되지 않았거나 현재 브라우저 localStorage에만 있습니다.');
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    month,
    clientId,
    clientName: client?.clientName || clientId,
    source: {
      apiUrl,
      summaryAction: 'summary',
      consultsAction: 'consultsList',
      draftMode: 'light',
      readOnly: true,
    },
    sensitiveFieldsExcluded: ['credentials', 'password'],
    client,
    jobs: {
      all: jobs,
      required: requiredJobs,
      sub: subJobs,
      ranking: rankingJobs,
      completed: completedJobs,
      open: openJobs,
      summary: {
        total: jobs.length,
        required: requiredJobs.length,
        sub: subJobs.length,
        ranking: rankingJobs.length,
        completed: completedJobs.length,
        open: openJobs.length,
      },
    },
    posts: {
      all: posts,
      byChannel: groupCount(posts, 'channel'),
      summary: {
        total: posts.length,
      },
    },
    expenses: {
      all: expenses,
      summary: {
        total: expenses.length,
        totalAmount: sumAmount(expenses),
        recurringAmount: sumAmount(expenses.filter((expense) => expense.isRecurring)),
        oneTimeAmount: sumAmount(expenses.filter((expense) => !expense.isRecurring)),
      },
    },
    contract,
    logs,
    drafts,
    consults: {
      available: apiConsults.available || summaryConsults.length > 0,
      source: apiConsults.available ? 'consultsList' : summaryConsults.length > 0 ? 'summary' : 'unavailable',
      records: consultRecords,
      byChannel: groupCount(consultRecords, 'channel'),
      summary: {
        total: consultRecords.length,
      },
    },
    dataGaps,
  };
}

function selectedClientIds(args, data) {
  if (args.all) {
    return data.clients
      .map((client) => client.clientId)
      .filter(Boolean);
  }
  return args.client
    .split(',')
    .map(canonicalClientId)
    .filter(Boolean);
}

async function writeContext({ context, outDir }) {
  const dir = path.join(outDir, context.month);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${context.clientId}.json`);
  await fs.writeFile(file, `${JSON.stringify(context, null, 2)}\n`, 'utf8');
  return file;
}

function printSummary(context, file) {
  const fileText = file ? ` -> ${file}` : '';
  const consultText = context.consults.available
    ? `consults ${context.consults.summary.total}`
    : 'consults unavailable';
  console.log(
    [
      `- ${context.clientId}:`,
      `jobs ${context.jobs.summary.total}`,
      `posts ${context.posts.summary.total}`,
      consultText,
      `gaps ${context.dataGaps.length}`,
      fileText,
    ].join(' '),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  assertArgs(args);
  if (!args.apiUrl || !API_KEY) throw new Error('DASHBOARD_API_URL과 DASHBOARD_API_KEY를 설정하세요.');

  const summary = await fetchSummary(args.apiUrl);
  const data = normalizeSummaryData(summary);
  const clientIds = selectedClientIds(args, data);
  if (clientIds.length === 0) throw new Error('No clients selected');

  console.log(`Report context ${args.dryRun ? 'dry run' : 'export'} for ${args.month}`);
  for (const clientId of clientIds) {
    const context = await buildClientContext({
      data,
      apiUrl: args.apiUrl,
      month: args.month,
      clientId,
    });
    const file = args.dryRun ? '' : await writeContext({ context, outDir: args.outDir });
    printSummary(context, file);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  console.error('');
  console.error(usage());
  process.exitCode = 1;
});
