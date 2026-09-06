import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const appsPatch = await fs.readFile(path.join(root, 'apps-script/internal_api_security_patch_v23.gs'), 'utf8');
const reports = [
  'btskin.html', 'belrmon.html', 'gyunghee.html', 'eyecare.html',
  'igochi.html', 'echi.html', 'seoulup.html', 'jejuexpress.html',
];

test('대시보드는 로컬 인증 설정과 중앙 API 래퍼만 사용한다', () => {
  assert.match(dashboard, /URBANPLANAD_LOCAL_CONFIG/);
  assert.match(dashboard, /if \(!API_CONFIGURED\) throw/);
  assert.match(dashboard, /url\.searchParams\.set\('apiKey', API_KEY\)/);
  assert.match(dashboard, /body: JSON\.stringify\(\{ \.\.\.body, apiKey:API_KEY \}\)/);
  assert.doesNotMatch(dashboard, /script\.google\.com\/macros\/s\/AKfy/);
  assert.doesNotMatch(dashboard, /window\.dashboardAPI|window\.dashboardData/);
});

test('설정이 없으면 대시보드 대신 안내 화면을 렌더링한다', () => {
  assert.match(dashboard, /return API_CONFIGURED \? <DashboardApp \/> : <SetupRequired \/>/);
  assert.match(dashboard, /설정 전에는 서버 요청을 보내지 않습니다/);
});

test('상담 저장 재진입과 같은 consultId 재시도를 유지한다', () => {
  assert.match(dashboard, /const consultSaving = useRef\(false\)/);
  assert.equal((dashboard.match(/if \(consultSaving\.current\) return;/g) || []).length, 3);
  const retry = dashboard.slice(
    dashboard.indexOf('async function retryConsultSync(entry)'),
    dashboard.indexOf('async function deleteConsult(id)'),
  );
  assert.match(retry, /await sendConsult\(entry\)/);
  assert.doesNotMatch(retry, /Date\.now\(\)/);
});

test('summary 상담 원문과 리뷰 모니터 데이터에 의존하지 않는다', () => {
  assert.doesNotMatch(dashboard, /consults:\s*\(d\.consults/);
  assert.doesNotMatch(dashboard, /reviewTargets|savedVisitorReviewCount/);
});

test('공개 보고서 8개에는 네트워크 및 내부 API 참조가 없다', async () => {
  for (const file of reports) {
    const html = await fs.readFile(path.join(root, file), 'utf8');
    for (const forbidden of ['script.google.com/macros', 'fetch(', 'action=summary', 'postLogs', 'consultsList']) {
      assert.ok(!html.includes(forbidden), file + ' contains ' + forbidden);
    }
  }
});

test('Apps Script 수동 패치는 인증과 안전한 mutation을 요구한다', () => {
  assert.match(appsPatch, /DASHBOARD_API_KEY/);
  assert.match(appsPatch, /function dashboardApiAuthorized_/);
  assert.match(appsPatch, /error: 'unauthorized'/);
  assert.match(appsPatch, /function monthlyReset\(ss, body\)/);
  assert.match(appsPatch, /function addConsult\(body\)/);
  assert.ok((appsPatch.match(/LockService\.getScriptLock\(\)/g) || []).length >= 2);
  assert.match(appsPatch, /복제 시트에서만/);
});
