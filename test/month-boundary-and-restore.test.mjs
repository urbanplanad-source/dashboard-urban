import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const docs = await fs.readFile(path.join(root, 'docs/apps-script-api.md'), 'utf8');

// 월 계산 헬퍼를 실제 소스에서 뽑아 실행한다.
function monthHelpers() {
  const start = dashboard.indexOf('  const pad2    =');
  const end = dashboard.indexOf('  const normalizeDate = (v) =>', start);
  assert.ok(start >= 0 && end > start, 'month helpers must precede normalizeDate');

  const context = vm.createContext({});
  vm.runInContext(`
    ${dashboard.slice(start, end)}
    ;globalThis.__m = { monthShift, recentMonths, localMonthString, localDateString, pad2, nowMonth, prevMonth };
  `, context);
  return context.__m;
}

function planHelper() {
  const start = dashboard.indexOf('  function planMonthlyReset({');
  const end = dashboard.indexOf('  // 순수 오케스트레이션', start);
  assert.ok(start >= 0 && end > start, 'planMonthlyReset must exist before runMonthlyReset');

  // 헬퍼는 복사하지 않고 실제 소스 구간을 그대로 실행한다.
  // 복사하면 MONTH_RE 같은 새 의존성이 생겼을 때 조용히 어긋난다.
  const hStart = dashboard.indexOf('  const pad2    =');
  const hEnd = dashboard.indexOf('  const normalizeDate = (v) =>', hStart);
  const context = vm.createContext({});
  vm.runInContext(`
    ${dashboard.slice(hStart, hEnd)}
    const fmtMonth = (m) => { const x = String(m||'').match(/^(\\d{4})-(\\d{2})$/); return x ? \`\${x[1]}년 \${Number(x[2])}월\` : ''; };
    ${dashboard.slice(start, end)}
    ;globalThis.__plan = planMonthlyReset;
  `, context);
  return context.__plan;
}

// ── 월 이동 ───────────────────────────────────────────────

test('monthShift는 연 경계를 넘어서도 KST 로컬 기준으로 계산한다', () => {
  const { monthShift } = monthHelpers();
  assert.equal(monthShift('2026-08', 1), '2026-09');
  assert.equal(monthShift('2026-12', 1), '2027-01');
  assert.equal(monthShift('2026-01', -1), '2025-12');
  assert.equal(monthShift('2026-09', -3), '2026-06');
  assert.equal(monthShift('bad', 1), '');
});

test('recentMonths는 기준월부터 최신순으로 준다', () => {
  const { recentMonths } = monthHelpers();
  assert.deepEqual(Array.from(recentMonths(4, '2026-02')), ['2026-02', '2026-01', '2025-12', '2025-11']);
});

// ── 마감월 계산: 8/31, 9/1, 9/2 ───────────────────────────

// production prevMonth()를 고정된 "오늘"로 실제 실행한다.
// prevMonth는 내부에서 new Date()를 쓰므로, vm 컨텍스트의 Date를 고정 날짜로
// 바꿔치기해 주입한다. 이렇게 해야 prevMonth가 망가졌을 때 테스트가 실패한다.
function prevMonthAt(year, month, day) {
  const start = dashboard.indexOf('  const pad2    =');
  const end = dashboard.indexOf('  const normalizeDate = (v) =>', start);
  const RealDate = Date;
  const fixed = new RealDate(year, month - 1, day, 12, 0, 0);

  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed.getTime());
      else super(...args);
    }
    static now() { return fixed.getTime(); }
  }

  const context = vm.createContext({ Date: FrozenDate });
  vm.runInContext(`
    ${dashboard.slice(start, end)}
    ;globalThis.__r = { prevMonth: prevMonth(), nowMonth: nowMonth() };
  `, context);
  return context.__r;
}

test('prevMonth가 실행일 기준 전월을 반환한다 (8/31, 9/1, 9/2)', () => {
  assert.equal(prevMonthAt(2026, 8, 31).prevMonth, '2026-07', '8월 31일에는 기본 마감월이 7월');
  assert.equal(prevMonthAt(2026, 9, 1).prevMonth, '2026-08', '9월 1일에는 기본 마감월이 8월');
  assert.equal(prevMonthAt(2026, 9, 2).prevMonth, '2026-08', '9월 2일에도 기본 마감월이 8월');
});

test('prevMonth가 1월에 전년 12월로 넘어간다', () => {
  const r = prevMonthAt(2027, 1, 15);
  assert.equal(r.prevMonth, '2026-12', '1월의 전월은 전년 12월이어야 한다');
  assert.equal(r.nowMonth, '2027-01');
});

test('prevMonth는 월말 31일에도 오버플로하지 않는다', () => {
  // new Date(y, m-1, 31)로 월을 빼면 2월 같은 짧은 달에서 날짜가 넘친다.
  assert.equal(prevMonthAt(2026, 3, 31).prevMonth, '2026-02', '3월 31일의 전월은 2월');
  assert.equal(prevMonthAt(2026, 5, 31).prevMonth, '2026-04', '5월 31일의 전월은 4월');
});

test('8월 31일에 8월을 마감하려 하면 진행 중이라고 경고한다', () => {
  const planMonthlyReset = planHelper();
  const plan = planMonthlyReset({ backupMonth: '2026-08', currentMonth: '2026-08', processedMonths: [] });

  assert.equal(plan.targetMonth, '2026-09');
  assert.equal(plan.blocked, false, '경고만 하고 막지는 않는다');
  assert.ok(plan.warnings.some(w => /아직 진행 중/.test(w)), plan.warnings.join('|'));
});

test('9월 1일에 8월을 마감하면 경고 없이 9월이 새 운영월이 된다', () => {
  const planMonthlyReset = planHelper();
  const plan = planMonthlyReset({ backupMonth: '2026-08', currentMonth: '2026-09', processedMonths: [] });

  assert.equal(plan.targetMonth, '2026-09');
  assert.equal(plan.blocked, false);
  assert.deepEqual(Array.from(plan.warnings), []);
});

test('미래 월 마감은 차단한다', () => {
  const planMonthlyReset = planHelper();
  const plan = planMonthlyReset({ backupMonth: '2026-10', currentMonth: '2026-09', processedMonths: [] });

  assert.equal(plan.blocked, true);
  assert.ok(plan.warnings.some(w => /아직 오지 않은 달/.test(w)));
});

test('이미 백업 이력이 있는 월은 중복 마감 경고를 낸다', () => {
  const planMonthlyReset = planHelper();
  const plan = planMonthlyReset({ backupMonth: '2026-08', currentMonth: '2026-09', processedMonths: ['2026-08'] });

  assert.equal(plan.blocked, false);
  assert.ok(plan.warnings.some(w => /이미 백업 이력/.test(w)));
});

test('연말 마감은 다음 해 1월을 새 운영월로 계산한다', () => {
  const planMonthlyReset = planHelper();
  const plan = planMonthlyReset({ backupMonth: '2026-12', currentMonth: '2027-01', processedMonths: [] });

  assert.equal(plan.targetMonth, '2027-01');
  assert.deepEqual(Array.from(plan.warnings), []);
});

test('형식이 잘못된 마감월은 차단한다', () => {
  const planMonthlyReset = planHelper();
  // '2026-13'과 '2026-00'은 \d{2} 정규식이던 시절 통과해서 Date 롤오버로
  // 조용히 엉뚱한 운영월을 만들었다. 반드시 차단되어야 한다.
  for (const bad of ['', '2026', '2026-13', '2026-00', '2026-1', '2026-13-01', null]) {
    const plan = planMonthlyReset({ backupMonth: bad, currentMonth: '2026-09', processedMonths: [] });
    assert.equal(plan.blocked, true, `${bad} must be blocked`);
  }
});

test('monthShift도 월 13이나 00을 거부한다', () => {
  const { monthShift } = monthHelpers();
  assert.equal(monthShift('2026-13', 1), '', '월 13은 롤오버되지 않고 거부되어야 한다');
  assert.equal(monthShift('2026-00', 1), '');
  assert.equal(monthShift('2026-12', 1), '2027-01', '정상 연말 이동은 유지');
});

// ── 소스 수준 보증 ─────────────────────────────────────────

test('loadData가 reviewTargets를 localStorage에서 복원한다', () => {
  const start = dashboard.indexOf('  function loadData() {');
  const end = dashboard.indexOf('  // ── 로컬 자동 백업 ──', start);
  assert.ok(start >= 0 && end > start, 'loadData must exist');
  const block = dashboard.slice(start, end);
  assert.match(block, /reviewTargets:\s*s\.reviewTargets\s*\?\?\s*\[\]/);
  assert.match(dashboard, /reviewTargets: \[\],/, 'DEFAULT_DATA must carry the key too');
});

test('상담 월 selector는 유효하지 않은 선택을 최신 월로 보정한다', () => {
  const start = dashboard.indexOf('    const consultMonths = [...new Set(consultList');
  const end = dashboard.indexOf('    const monthConsultList =', start);
  assert.ok(start >= 0 && end > start, 'consult month derivation must exist');
  const block = dashboard.slice(start, end);
  assert.match(block, /if \(!consultMonths\.length\) return;/);
  assert.match(block, /if \(consultMonths\.includes\(consultMonth\)\) return;/);
  assert.match(block, /setConsultMonth\(consultMonths\[0\]\)/);
});

test('자동 백업은 분 단위 세대 키를 쓰고 같은 달 스냅샷을 덮어쓰지 않는다', () => {
  const start = dashboard.indexOf('  const BACKUP_KEY_PREFIX =');
  const end = dashboard.indexOf('  function saveData(data) {', start);
  assert.ok(start >= 0 && end > start, 'backup helpers must exist');
  const block = dashboard.slice(start, end);

  // 예전 월 단위 키 생성이 되살아나면 안 된다.
  assert.doesNotMatch(dashboard, /BACKUP_KEY_PREFIX \+ nowMonth\(\)/);
  assert.doesNotMatch(dashboard, /'urbanplanad_backup_' \+ nowMonth\(\)/);

  assert.match(block, /const key = BACKUP_KEY_PREFIX \+ backupStamp\(\);/);
  assert.match(block, /pad2\(d\.getHours\(\)\)/);
  assert.match(block, /pad2\(d\.getMinutes\(\)\)/);
  assert.match(block, /slice\(BACKUP_KEEP\)\.forEach\(old => safeStorage\.removeItem\(old\)\)/);
});

test('backupStamp는 같은 날 다른 시각에 서로 다른 키를 만든다', () => {
  const helpers = monthHelpers();
  const start = dashboard.indexOf('  const backupStamp = (d = new Date()) =>');
  const end = dashboard.indexOf('  function listDashboardBackupKeys()', start);
  const context = vm.createContext({});
  vm.runInContext(`
    const pad2 = ${helpers.pad2.toString()};
    const localDateString = ${helpers.localDateString.toString()};
    ${dashboard.slice(start, end)}
    ;globalThis.__stamp = backupStamp;
  `, context);

  const a = context.__stamp(new Date(2026, 8, 2, 9, 5));
  const b = context.__stamp(new Date(2026, 8, 2, 14, 40));
  assert.equal(a, '2026-09-02_0905');
  assert.equal(b, '2026-09-02_1440');
  assert.notEqual(a, b, 'same-day syncs must not collide');
});

test('초기화 성공 후 발행 기록을 빈 배열로 지우지 않는다', () => {
  const start = dashboard.indexOf('      // ── 정상 완료: 서버 응답을 source of truth로 반영한다 ──');
  assert.ok(start >= 0);
  const block = dashboard.slice(start, start + 700);
  assert.doesNotMatch(block, /postLogs:\s*\[\]/, 'postLogs must not be wiped');
  assert.match(block, /postLogs: \(afterReset\.postLogs && afterReset\.postLogs\.length\)/);
});

test('App 레벨 data.expenses dead write를 제거했다', () => {
  assert.doesNotMatch(dashboard, /expenses:\s*safeArr\(sheetsData\.expenses/);
  assert.doesNotMatch(dashboard, /expenses: \(afterReset\.expenses/);
  // 손익 화면이 쓰는 경로는 유지되어야 한다.
  assert.match(dashboard, /mutRev\(prev=>\(\{ \.\.\.prev, expenses: sheetsData\.expenses \}\)\)/);
});

test('마감월은 미리보기에서 선택하고 실행 시 그대로 전달된다', () => {
  assert.match(dashboard, /aria-label="마감월 선택"/);
  assert.match(dashboard, /onConfirm=\{\(backupMonth\) => \{ setResetPreviewOpen\(false\); handleMonthlyReset\(backupMonth\); \}\}/);
  assert.match(dashboard, /async function handleMonthlyReset\(selectedBackupMonth\)/);
  assert.match(dashboard, /const targetMonth = plan\.targetMonth;/);
  assert.doesNotMatch(dashboard, /const targetMonth = nowMonth\(\);/, 'target month must derive from the chosen backup month');
});

test('consultHistories가 보조 이력임을 UI와 문서에 명시한다', () => {
  assert.match(dashboard, /이 브라우저에만 저장되는 보조 이력입니다/);
  assert.match(dashboard, /상담 원본은 Sheets의 Consults에 있으며/);
  assert.match(docs, /보조 이력/);
});
