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
  'scripts/naver-review-monitor.mjs',
  'scripts/fetch-report-context.mjs',
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
