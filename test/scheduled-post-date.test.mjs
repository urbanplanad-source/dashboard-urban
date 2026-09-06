import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const patch = await fs.readFile(path.join(root, 'apps-script', 'internal_api_security_patch_v23.gs'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}') depth--;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} is incomplete`);
}

test('카드 발행 기록은 선택 날짜와 동일한 publishedAt을 전송한다', () => {
  const start = dashboard.indexOf('      function handleSubmitPost()');
  const end = dashboard.indexOf('\n      return (', start);
  const block = dashboard.slice(start, end);
  assert.match(block, /const pubDate\s*=\s*normalizeDate\(postDate\) \|\| today\(\)/);
  assert.match(block, /logId:tempId/);
  assert.match(block, /publishedAt:pubDate/);
  assert.match(dashboard, /발행·예약일/);
});

test('Apps Script 날짜 정규화는 유효한 미래 날짜를 오늘로 바꾸지 않는다', () => {
  const context = vm.createContext({
    Date,
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    Utilities: { formatDate: () => '2026-09-04' },
  });
  vm.runInContext(`${extractFunction(patch, 'normalizePostDate_')}; this.normalizePostDate_ = normalizePostDate_;`, context);

  assert.equal(context.normalizePostDate_('2026-09-05'), '2026-09-05');
  assert.equal(context.normalizePostDate_('2026-12-31'), '2026-12-31');
  assert.equal(context.normalizePostDate_('2026-02-30'), '2026-09-04');
  assert.equal(context.normalizePostDate_(''), '2026-09-04');
});

test('Apps Script addPost 교체 안내는 선택 날짜 저장 함수를 연결한다', () => {
  assert.match(patch, /case 'addPost':\s*\n\/\/\s+return jsonRes\(addPostWithSelectedDate_\(ss, body\)\);/);
  assert.match(patch, /publishedAt:\s*publishedAt/);
  assert.match(patch, /month:\s*month/);
});
