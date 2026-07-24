import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const expectedPaths = [
  'AGENTS.md',
  'README.md',
  'index.html',
  'docs/apps-script-api.md',
  'apps-script/contracts_patch.gs',
  'apps-script/expenses_drafts_patch_v12.gs',
  'apps-script/review_monitor_patch_v13.gs',
  'apps-script/consults_patch_v14.gs',
  'apps-script/monthly_reset_patch_v16.gs',
  'scripts/check-consults-api.mjs',
  'scripts/naver-review-monitor.mjs',
  'scripts/fetch-report-context.mjs',
  'test/draft-approval-routing.test.mjs',
  '.github/workflows/naver-review-monitor.yml',
  'review-monitor.config.example.json',
  'credentials.local.example.js',
];

const obsoleteRootFiles = [
  ['오픈', '클로_API_가이드.md'].join(''),
  ['apps_script', '_contracts.gs'].join(''),
  ['apps_script', '_patch.gs'].join(''),
  ['apps_script', '_patch_v13.gs'].join(''),
];

const forbiddenTerms = [
  ['오픈', '클로'].join(''),
  ['키미', '클로'].join(''),
  ['Open', 'Clo'].join(''),
  ['Open', 'Claw'].join(''),
  ['open', 'clo'].join(''),
  ['Claude', ' Pro'].join(''),
];

const textExtensions = new Set([
  '.html',
  '.js',
  '.mjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.gs',
  '.gitignore',
]);

for (const rel of expectedPaths) {
  await expectExists(rel);
}

for (const rel of obsoleteRootFiles) {
  if (await exists(path.join(root, rel))) {
    errors.push(`obsolete root file remains: ${rel}`);
  }
}

await parseJson('package.json');
await parseJson('review-monitor.config.example.json');
await checkDashboardReportFiles();
await checkNoHardcodedCredentials();
await checkDraftClientRouting();
await checkNaverWriterBridge();
await checkTextFiles(root);
await checkScriptSyntax();

if (errors.length > 0) {
  console.error('Operational check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Operational check passed.');

async function expectExists(rel) {
  if (!(await exists(path.join(root, rel)))) {
    errors.push(`missing expected file: ${rel}`);
  }
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function parseJson(rel) {
  const file = path.join(root, rel);
  try {
    JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    errors.push(`${rel}: invalid JSON (${error.message})`);
  }
}

async function checkDashboardReportFiles() {
  const rel = 'index.html';
  const file = path.join(root, rel);
  let text = '';
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    errors.push(`${rel}: cannot read dashboard (${error.message})`);
    return;
  }

  const matches = [...text.matchAll(/reportFile\s*:\s*['"]([^'"]+)['"]/g)];
  if (matches.length === 0) {
    errors.push(`${rel}: no reportFile entries found`);
    return;
  }

  const seen = new Set();
  for (const [, reportFile] of matches) {
    if (seen.has(reportFile)) continue;
    seen.add(reportFile);

    if (!/^[\w.-]+\.html$/.test(reportFile)) {
      errors.push(`${rel}: reportFile must be a root-relative HTML filename, got "${reportFile}"`);
      continue;
    }

    if (!(await exists(path.join(root, reportFile)))) {
      errors.push(`${rel}: reportFile target does not exist: ${reportFile}`);
    }
  }
}

async function checkTextFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await checkTextFiles(fullPath);
      continue;
    }

    if (!isTextFile(entry.name)) continue;

    const rel = path.relative(root, fullPath).replaceAll(path.sep, '/');
    const text = await fs.readFile(fullPath, 'utf8');

    for (const term of forbiddenTerms) {
      if (text.includes(term)) {
        errors.push(`${rel}: contains deprecated AI tool wording`);
      }
    }

    if (isSourceFile(rel) && /toISOString\(\)\.slice\(0,\s*10\)/.test(text)) {
      errors.push(`${rel}: uses UTC date slicing; use localDateString()/today() for date-only values`);
    }
  }
}

async function checkNoHardcodedCredentials() {
  const rel = 'index.html';
  const file = path.join(root, rel);
  let text = '';
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    errors.push(`${rel}: cannot read credential guard target (${error.message})`);
    return;
  }

  const passwordLiteral = /password\s*:\s*['"]([^'"]{2,})['"]/g;
  const suspicious = [...text.matchAll(passwordLiteral)]
    .map((match) => match[1])
    .filter((value) => !/^[•*\s]+$/.test(value));
  if (suspicious.length > 0) {
    errors.push(`${rel}: contains hard-coded credential password literal; use credentials.local.js or localStorage`);
  }
}

async function checkDraftClientRouting() {
  const rel = 'index.html';
  let dashboard = '';
  try {
    dashboard = await fs.readFile(path.join(root, rel), 'utf8');
  } catch (error) {
    errors.push(`${rel}: cannot read draft client routing (${error.message})`);
    return;
  }

  const requiredRoutes = [
    ["kyunghee:'365경희부부한의원 피부클리닉'", 'kyunghee'],
    ["hwabuk:'365경희부부한의원 화북점'", 'hwabuk'],
    ["jocheon:'경희부부한의원 조천점'", 'jocheon'],
  ];
  for (const [marker, clientId] of requiredRoutes) {
    if (!dashboard.includes(marker)) {
      errors.push(`${rel}: missing draft client route (${clientId})`);
    }
  }
}

async function checkNaverWriterBridge() {
  const indexRel = 'index.html';
  const handoffRel = 'CODEX_HANDOFF.md';
  let dashboard = '';
  let handoff = '';
  try {
    [dashboard, handoff] = await Promise.all([
      fs.readFile(path.join(root, indexRel), 'utf8'),
      fs.readFile(path.join(root, handoffRel), 'utf8'),
    ]);
  } catch (error) {
    errors.push(`naver-writer bridge check: cannot read required files (${error.message})`);
    return;
  }

  const requiredDashboardInvariants = [
    ['safe draft ID validation', 'const SAFE_DRAFT_ID_PATTERN ='],
    ['blog-channel gate', 'const isNaverBlogChannel ='],
    ['homepage-channel gate', 'const isHomepageChannel ='],
    ['blog-only approval routing', 'const shouldShowApproveButton ='],
    ['case-insensitive compliance gate', "const needsComplianceReview = (draft) => String(draft?.memo || '').toLowerCase().includes('needs_compliance_review');"],
    ['update response draft correlation', 'const assertUpdateDraftResponse = (result, expectedDraftId) =>'],
    ['per-row status state gate', 'const [statusSavingIds, setStatusSavingIds] = useState([]);'],
    ['per-row status synchronous gate', 'const statusSavingRef = useRef(new Set());'],
    ['compare-and-set status hint', 'expectedStatus: prevStatus'],
    ['server-confirmed status response', "const result = await readApiJson(response, 'updateDraft');"],
    ['top-level status response support', '?? result.status;'],
    ['missing status fail-closed guard', 'confirmedStatusValue === undefined || confirmedStatusValue === null'],
    ['strict confirmed status validation', 'DRAFT_STATUSES.includes(confirmedStatus)'],
    ['post-write list/detail verification', 'verifiedSnapshot = await readDraftStatusSnapshot(draftId);'],
    ['approval button blog-only routing', 'const showApprove = shouldShowApproveButton(draft);'],
    ['approved blog-only bulk list', 'const approvedBlogFiltered = filtered.filter(d => isNaverCommandEligible(d)'],
    ['selected click-order preservation', 'selectedDraftIds.map(id => approvedBlogById.get(id)).filter(Boolean)'],
    ['single-line individual command', ' && npm.cmd run draft:dashboard -- --draft-id "${safeId}"'],
    ['single-line bulk command', ' && npm.cmd run drafts:dashboard -- --draft-ids "${safeIds.join(\',\')}"'],
    ['verified clipboard fallback', "document.execCommand('copy') !== true"],
    ['selected-copy feedback', 'setSelectedCommandCopied'],
    ['all-copy feedback', 'setAllCommandCopied'],
    ['post-run refresh hint', 'CMD 실행 후 새로고침하면 임시저장 성공으로 삭제된 원본이 반영됩니다.'],
  ];

  for (const [label, marker] of requiredDashboardInvariants) {
    if (!dashboard.includes(marker)) {
      errors.push(`${indexRel}: missing Naver writer invariant (${label})`);
    }
  }

  if (dashboard.includes('bulkCommandCopied')) {
    errors.push(`${indexRel}: selected/all CMD feedback must not share bulkCommandCopied state`);
  }

  const statusStart = dashboard.indexOf('async function changeDraftStatus');
  const statusEnd = dashboard.indexOf('async function copyDraftText', statusStart);
  const statusSource = statusStart >= 0 && statusEnd > statusStart
    ? dashboard.slice(statusStart, statusEnd)
    : '';
  const confirmationAt = statusSource.indexOf("const result = await readApiJson(response, 'updateDraft');");
  const verificationAt = statusSource.indexOf('verifiedSnapshot = await readDraftStatusSnapshot(draftId);');
  const statusMutationAt = statusSource.indexOf('applyDraftStatusSnapshot(verifiedSnapshot);');
  if (!statusSource || confirmationAt < 0 || verificationAt < confirmationAt || statusMutationAt < verificationAt) {
    errors.push(`${indexRel}: draft status must update only after updateDraft plus draftsList/draftDetail verification`);
  }
  if (!statusSource.includes("(next === 'approved' || next === 'published') && needsComplianceReview(draft)")) {
    errors.push(`${indexRel}: compliance-marked drafts must be blocked before approval/published POST`);
  }
  if (!statusSource.includes('assertUpdateDraftResponse(result, draftId);')) {
    errors.push(`${indexRel}: status update response must confirm the requested draftId`);
  }
  if (statusSource.includes('?? next')) {
    errors.push(`${indexRel}: status response must not fall back to the requested value`);
  }
  if (!statusSource.includes('?? result.status;')) {
    errors.push(`${indexRel}: status response must accept the Apps Script top-level status field`);
  }

  const readbackStart = dashboard.indexOf('async function readDraftStatusSnapshot');
  const readbackEnd = dashboard.indexOf('function applyDraftStatusSnapshot', readbackStart);
  const readbackSource = readbackStart >= 0 && readbackEnd > readbackStart
    ? dashboard.slice(readbackStart, readbackEnd)
    : '';
  if (!readbackSource.includes('await fetchDraftListSnapshot()')
      || !readbackSource.includes('await fetchDraftDetailSnapshot(expectedDraftId)')) {
    errors.push(`${indexRel}: status verification must re-read draftsList and draftDetail for the same draftId`);
  }

  const commandStart = dashboard.indexOf('function buildNaverTempSaveCommand');
  const commandEnd = dashboard.indexOf('async function copyCommandText', commandStart);
  const commandSource = commandStart >= 0 && commandEnd > commandStart
    ? dashboard.slice(commandStart, commandEnd)
    : '';
  if (!commandSource || commandSource.includes(".join('\\r\\n')")) {
    errors.push(`${indexRel}: copied Naver commands must remain single-line CMD commands`);
  }

  const publishStart = dashboard.indexOf('function openPublishModal');
  const publishEnd = dashboard.indexOf('const iS =', publishStart);
  const publishSource = publishStart >= 0 && publishEnd > publishStart
    ? dashboard.slice(publishStart, publishEnd)
    : '';
  if (!publishSource.includes('if (needsComplianceReview(draft))')
      || !publishSource.includes('if (needsComplianceReview(publishDraft))')) {
    errors.push(`${indexRel}: manual publish registration must block compliance-marked drafts`);
  }
  if (!publishSource.includes('assertUpdateDraftResponse(draftResult, publishDraft.draftId);')) {
    errors.push(`${indexRel}: publish status response must confirm the requested draftId`);
  }

  const requiredHandoffMarkers = [
    '`C:\\Users\\user\\Desktop\\dashboard-urban`',
    'server-confirmed `approved` blog drafts',
    'deletes that exact source `draftId`',
    'one line (`cd /d ... && npm.cmd ...`)',
  ];
  for (const marker of requiredHandoffMarkers) {
    if (!handoff.includes(marker)) {
      errors.push(`${handoffRel}: Naver writer handoff is missing "${marker}"`);
    }
  }
  if (/successful temp-save it writes back `staged`/i.test(handoff)) {
    errors.push(`${handoffRel}: documents obsolete automatic staged writeback`);
  }
}

function isTextFile(name) {
  if (name === '.gitignore') return true;
  return textExtensions.has(path.extname(name));
}

function isSourceFile(rel) {
  return ['.html', '.js', '.mjs', '.gs'].includes(path.extname(rel));
}

async function checkScriptSyntax() {
  await checkNodeSyntax('scripts/naver-review-monitor.mjs');
  await checkNodeSyntax('scripts/fetch-report-context.mjs');
  await checkNodeSyntax('scripts/check-consults-api.mjs');
  await checkNodeSyntax('test/draft-approval-routing.test.mjs');
}

async function checkNodeSyntax(rel) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, rel)], {
      stdio: 'pipe',
    });
  } catch (error) {
    const output = [error.stdout, error.stderr].filter(Boolean).join('\n').trim();
    errors.push(`${rel}: syntax check failed${output ? `\n${output}` : ''}`);
  }
}
