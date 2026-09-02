import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_URL =
  process.env.REVIEW_MONITOR_API_URL ||
  'https://script.google.com/macros/s/AKfycbwUsy5dDEG-t4FszWRCj-f0-FLIOY4SPMatiNsm55xM7bFXzaAEFS6McQdvmXT85dT0/exec';

const TARGET_CLIENT_IDS = new Set(['btskin', 'belrmon', 'kyunghee']);
const RECENT_FINGERPRINT_LIMIT = 30;
const REQUEST_TIMEOUT_MS = 20000;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  'Chrome/124.0.0.0 Safari/537.36';

const argv = new Set(process.argv.slice(2));
const options = {
  dryRun: argv.has('--dry-run'),
  verbose: argv.has('--verbose'),
};

async function main() {
  const config = await loadConfig();
  const targets = await getReviewTargets(config.apiUrl || API_URL);
  const activeTargets = targets.filter((target) => TARGET_CLIENT_IDS.has(target.clientId));

  if (activeTargets.length === 0) {
    console.log('No active review targets found for btskin, belrmon, or kyunghee.');
    return;
  }

  const results = [];
  for (const target of activeTargets) {
    try {
      results.push(await processTarget(target, config));
    } catch (error) {
      results.push({
        clientId: target.clientId,
        clientName: target.clientName,
        status: 'runtime_failed',
        errorMessage: errorMessage(error),
      });
      console.error(`[${target.clientId}] runtime_failed: ${errorMessage(error)}`);
    }
  }

  printSummary(results);
}

async function processTarget(target, config) {
  const previous = toInt(target.savedVisitorReviewCount);
  const apiUrl = config.apiUrl || API_URL;

  let current;
  let reviews = [];
  let newRecentFingerprints = target.recentReviewFingerprintsJson || '[]';
  let pageError = '';

  try {
    const page = await fetchNaverVisitorPage(target.naverPlaceUrl);
    current = page.visitorReviewCount;
    reviews = page.reviews;
    newRecentFingerprints = JSON.stringify(
      reviews.slice(0, RECENT_FINGERPRINT_LIMIT).map((review) => review.fingerprint),
    );
  } catch (error) {
    pageError = errorMessage(error);
  }

  if (!Number.isInteger(current)) {
    const payload = {
      action: 'addReviewLog',
      clientId: target.clientId,
      previousVisitorReviewCount: previous,
      currentVisitorReviewCount: 0,
      diff: 0,
      status: 'check_failed',
      detectedReviewCount: 0,
      newReviewsSummary: '',
      newReviewsJson: '[]',
      errorMessage: pageError || '방문자 리뷰 수 확인 실패',
    };
    await postReviewLog(apiUrl, payload);
    return {
      clientId: target.clientId,
      clientName: target.clientName,
      previous,
      current: null,
      diff: null,
      status: 'check_failed',
      errorMessage: payload.errorMessage,
    };
  }

  const diff = current - previous;
  if (diff === 0) {
    return {
      clientId: target.clientId,
      clientName: target.clientName,
      previous,
      current,
      diff,
      status: 'unchanged',
    };
  }

  if (diff > 0) {
    return handleIncrease({
      apiUrl,
      config,
      target,
      previous,
      current,
      diff,
      reviews,
      newRecentFingerprints,
    });
  }

  return handleDecrease({
    apiUrl,
    target,
    previous,
    current,
    diff,
    newRecentFingerprints,
  });
}

async function handleIncrease({
  apiUrl,
  config,
  target,
  previous,
  current,
  diff,
  reviews,
  newRecentFingerprints,
}) {
  const previousFingerprints = parseFingerprintSet(target.recentReviewFingerprintsJson);
  const detectedReviews = pickNewReviews(reviews, previousFingerprints, diff);
  const hasAllNewReviews = detectedReviews.length >= diff;
  const status = hasAllNewReviews ? 'increased' : 'increased_but_blocked';
  const summary = hasAllNewReviews
    ? summarizeReviews(detectedReviews.slice(0, diff))
    : `방문자 리뷰가 ${diff}개 증가했으나 신규 리뷰 본문 확인 실패.\n사유: 네이버 접근 제한 또는 리뷰 목록 로딩 실패`;

  notifyReviewChange(
    buildNotice({
      clientName: target.clientName,
      previous,
      current,
      diff,
      status,
      summary,
    }),
  );
  const errorMessage = hasAllNewReviews ? '' : '네이버 접근 제한 또는 리뷰 목록 로딩 실패';

  await postReviewLog(apiUrl, {
    action: 'addReviewLog',
    clientId: target.clientId,
    previousVisitorReviewCount: previous,
    currentVisitorReviewCount: current,
    diff,
    status,
    detectedReviewCount: detectedReviews.length,
    newReviewsSummary: summary,
    newReviewsJson: JSON.stringify(detectedReviews.slice(0, diff)),
    errorMessage,
  });

  await updateReviewTarget(apiUrl, {
    action: 'updateReviewTarget',
    clientId: target.clientId,
    savedVisitorReviewCount: current,
    recentReviewFingerprintsJson: newRecentFingerprints,
  });

  return {
    clientId: target.clientId,
    clientName: target.clientName,
    previous,
    current,
    diff,
    status,
    detectedReviewCount: detectedReviews.length,
    errorMessage,
  };
}

async function handleDecrease({
  apiUrl,
  target,
  previous,
  current,
  diff,
  newRecentFingerprints,
}) {
  const summary = '삭제 또는 비공개 처리된 리뷰가 있을 수 있음.';
  notifyReviewChange(
    buildNotice({
      clientName: target.clientName,
      previous,
      current,
      diff,
      status: 'decreased',
      summary,
    }),
  );

  await postReviewLog(apiUrl, {
    action: 'addReviewLog',
    clientId: target.clientId,
    previousVisitorReviewCount: previous,
    currentVisitorReviewCount: current,
    diff,
    status: 'decreased',
    detectedReviewCount: 0,
    newReviewsSummary: summary,
    newReviewsJson: '[]',
    errorMessage: '',
  });

  await updateReviewTarget(apiUrl, {
    action: 'updateReviewTarget',
    clientId: target.clientId,
    savedVisitorReviewCount: current,
    recentReviewFingerprintsJson: newRecentFingerprints,
  });

  return {
    clientId: target.clientId,
    clientName: target.clientName,
    previous,
    current,
    diff,
    status: 'decreased',
    errorMessage: '',
  };
}

async function getReviewTargets(apiUrl) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'reviewTargets');
  const json = await fetchJson(url.toString());
  if (!json.success || !Array.isArray(json.data)) {
    throw new Error(`reviewTargets API failed: ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function fetchNaverVisitorPage(placeUrl) {
  const reviewUrl = toVisitorReviewUrl(placeUrl);
  const response = await fetchWithTimeout(reviewUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Naver returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const state = extractApolloState(html);
  const visitorReviewCount = extractVisitorReviewCount(html, state);
  if (!Number.isInteger(visitorReviewCount)) {
    throw new Error('visitorReviewsTotal not found');
  }

  return {
    reviewUrl,
    visitorReviewCount,
    reviews: extractVisitorReviews(state),
  };
}

function toVisitorReviewUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.search = '';
  url.hash = '';

  if (url.hostname === 'naver.me') {
    return rawUrl;
  }

  const trimmed = url.pathname.replace(/\/+$/, '');
  if (trimmed.endsWith('/review/visitor')) {
    url.pathname = trimmed;
  } else {
    url.pathname = trimmed.replace(/\/(home|information|photo|booking|review)$/, '') + '/review/visitor';
  }
  return url.toString();
}

function extractVisitorReviewCount(html, state) {
  if (state) {
    for (const value of Object.values(state)) {
      if (value && Number.isInteger(value.visitorReviewsTotal)) {
        return value.visitorReviewsTotal;
      }
    }
  }

  const jsonMatch = html.match(/"visitorReviewsTotal"\s*:\s*(\d+)/);
  if (jsonMatch) return Number(jsonMatch[1]);

  const text = decodeHtmlEntities(html);
  const textMatch = text.match(/방문자\s*리뷰\s*([0-9,]+)/);
  return textMatch ? Number(textMatch[1].replace(/,/g, '')) : null;
}

function extractApolloState(html) {
  const marker = 'window.__APOLLO_STATE__';
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;

  const equalsIndex = html.indexOf('=', markerIndex);
  if (equalsIndex < 0) return null;

  const jsonStart = html.indexOf('{', equalsIndex);
  if (jsonStart < 0) return null;

  const jsonEnd = findBalancedObjectEnd(html, jsonStart);
  if (jsonEnd < 0) return null;

  return JSON.parse(html.slice(jsonStart, jsonEnd + 1));
}

function findBalancedObjectEnd(input, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function extractVisitorReviews(state) {
  if (!state) return [];

  const listEntry = Object.entries(state).find(
    ([key, value]) =>
      key.startsWith('visitorReviews(') &&
      value &&
      value.__typename === 'VisitorReviewsResult' &&
      Array.isArray(value.items),
  );

  if (!listEntry) return [];

  const [, list] = listEntry;
  return list.items
    .map((item) => state[item.__ref])
    .filter((review) => review && review.__typename === 'VisitorReview')
    .map(normalizeReview)
    .filter((review) => review.fingerprint);
}

function normalizeReview(review) {
  const normalized = {
    reviewId: review.reviewId || '',
    created: cleanText(review.created || ''),
    visited: cleanText(review.visited || ''),
    body: cleanText(review.body || ''),
    tags: normalizeTags(review.tags),
    originType: cleanText(review.originType || ''),
    rating: review.rating ?? null,
  };
  normalized.fingerprint = fingerprintReview(normalized);
  return normalized;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => {
      if (typeof tag === 'string') return cleanText(tag);
      if (tag && typeof tag === 'object') {
        return cleanText(tag.label || tag.name || tag.text || tag.value || '');
      }
      return '';
    })
    .filter(Boolean);
}

function fingerprintReview(review) {
  if (review.reviewId) return `naver:${review.reviewId}`;
  const source = [review.created, review.visited, review.body, review.tags.join('|')].join('|');
  if (!source.replace(/\|/g, '')) return '';
  return `sha1:${crypto.createHash('sha1').update(source).digest('hex')}`;
}

function pickNewReviews(reviews, previousFingerprints, diff) {
  if (diff <= 0) return [];
  if (previousFingerprints.size === 0) {
    return reviews.slice(0, diff);
  }

  const fresh = [];
  for (const review of reviews) {
    if (previousFingerprints.has(review.fingerprint)) break;
    fresh.push(review);
    if (fresh.length >= diff) break;
  }

  if (fresh.length >= diff) return fresh;

  const fallback = reviews.filter((review) => !previousFingerprints.has(review.fingerprint));
  return fallback.slice(0, diff);
}

function summarizeReviews(reviews) {
  if (reviews.length === 0) return '신규 리뷰 본문 없음';

  const joined = reviews
    .map((review) => [review.body, ...review.tags].join(' '))
    .join(' ');

  const buckets = [
    { label: '친절한 상담/응대 언급', re: /친절|상담|응대|설명|안내/ },
    { label: '시술·치료 만족 언급', re: /만족|효과|치료|시술|진료|좋았|꼼꼼/ },
    { label: '대기시간·순서 관련 언급', re: /대기|기다|순서|차례|예약/ },
    { label: '비용·가격 관련 언급', re: /비용|가격|비싸|저렴|결제|금액/ },
    { label: '시설·위치·환경 언급', re: /시설|깨끗|청결|위치|주차|공간/ },
    { label: '불만 또는 개선 요청 언급', re: /불친절|무시|실망|불편|별로|최악|문제|화남/ },
  ];

  const lines = buckets.filter((bucket) => bucket.re.test(joined)).map((bucket) => `- ${bucket.label}`);
  if (lines.length > 0) return lines.join('\n');

  return reviews
    .slice(0, 3)
    .map((review) => `- ${truncate(review.body || review.tags.join(', ') || '본문 없는 방문자 리뷰', 40)}`)
    .join('\n');
}

function buildNotice({ clientName, previous, current, diff, status, summary }) {
  const sign = diff > 0 ? `+${diff}` : `${diff}`;
  const lines = [
    `[${clientName}] 방문자리뷰 ${sign}`,
    `이전: ${formatCount(previous)}개`,
    `현재: ${formatCount(current)}개`,
  ];

  if (status === 'increased') {
    lines.push('', '신규 리뷰 요약:', summary);
  } else if (status === 'increased_but_blocked') {
    lines.push('', summary);
  } else if (status === 'decreased') {
    lines.push('', summary);
  }

  return lines.join('\n');
}

// 리뷰 변동 알림은 콘솔 출력으로만 처리한다.
// 외부 메신저 연동은 2026-09에 제거했다. 알림 채널을 다시 붙일 경우
// 토큰은 반드시 환경변수로만 받고 저장소에 커밋하지 않는다.
function notifyReviewChange(text) {
  const prefix = options.dryRun ? '[dry-run]' : '[notice]';
  console.log(`${prefix} Review change detected:`);
  console.log(text);
}

async function postReviewLog(apiUrl, payload) {
  if (options.dryRun) {
    console.log('[dry-run] addReviewLog', JSON.stringify(payload));
    return { success: true, dryRun: true };
  }
  return postAppsScript(apiUrl, payload);
}

async function updateReviewTarget(apiUrl, payload) {
  if (options.dryRun) {
    console.log('[dry-run] updateReviewTarget', JSON.stringify(payload));
    return { success: true, dryRun: true };
  }
  return postAppsScript(apiUrl, payload);
}

async function postAppsScript(apiUrl, payload) {
  const json = await fetchJson(apiUrl, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify(payload),
  });
  if (!json.success) {
    throw new Error(`Apps Script POST failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function fetchJson(url, init = {}) {
  const response = await fetchWithTimeout(url, init);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${truncate(text, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${truncate(text, 200)}`);
  }
  return json;
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadConfig() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), 'review-monitor.config.json'),
    path.join(scriptDir, 'review-monitor.config.json'),
  ];

  for (const file of candidates) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Cannot read ${file}: ${error.message}`);
      }
    }
  }

  return {};
}

function parseFingerprintSet(json) {
  try {
    const parsed = JSON.parse(json || '[]');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value) => typeof value === 'string' && value));
  } catch {
    return new Set();
  }
}

function cleanText(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(html) {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCount(value) {
  return Number(value).toLocaleString('ko-KR');
}

function truncate(value, maxLength) {
  const text = cleanText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function printSummary(results) {
  console.log('');
  console.log('Naver visitor review monitor summary');
  for (const result of results) {
    const countText =
      result.current == null ? '' : ` previous=${result.previous} current=${result.current} diff=${result.diff}`;
    const errorText = result.errorMessage ? ` error="${result.errorMessage}"` : '';
    console.log(
      `- ${result.clientId} (${result.clientName || ''}): ${result.status}${countText}${errorText}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
