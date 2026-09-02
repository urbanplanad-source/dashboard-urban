import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = await fs.readFile(path.join(root, 'index.html'), 'utf8');

// runMonthlyReset을 React 없이 실행한다. 실제 운영 POST는 절대 나가지 않고
// 모든 요청은 아래 모의 함수로만 기록된다.
function resetHarness() {
  const start = dashboard.indexOf('  const MONTHLY_RESET_STAGE = {');
  const end = dashboard.indexOf('  const isWaitingJob = (job) =>', start);
  assert.ok(start >= 0 && end > start, 'monthly reset state machine must exist before isWaitingJob');

  const context = vm.createContext({ console });
  vm.runInContext(`
    const pad2 = (n) => String(n).padStart(2, '0');
    const localDateString = (d) => \`\${d.getFullYear()}-\${pad2(d.getMonth() + 1)}-\${pad2(d.getDate())}\`;
    const normalizeDate = (v) => {
      if (!v) return '';
      const s = String(v).trim();
      const m = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
      return m ? \`\${m[1]}-\${m[2]}-\${m[3]}\` : s;
    };
    const normalizeMonth = (v) => {
      const m = String(normalizeDate(v) || v || '').match(/^(\\d{4})-(\\d{2})/);
      return m ? \`\${m[1]}-\${m[2]}\` : '';
    };
    const normalizeConsult = (c) => {
      const id = c.id || c.consultId;
      return {
        ...c, id, consultId: c.consultId || id, clientId: c.clientId || '',
        date: normalizeDate(c.date), month: normalizeMonth(c.month || c.date),
        channel: c.channel || '', nickname: c.nickname || '',
        content: c.content || '', createdAt: c.createdAt || '',
      };
    };
    ${dashboard.slice(start, end)}
    ;globalThis.__reset = { runMonthlyReset, MONTHLY_RESET_STAGE, MONTHLY_RESET_MESSAGE };
  `, context);
  return context.__reset;
}

const CLIENTS = [
  { clientId: 'btskin', clientName: '노형아름다운피부과' },
  { clientId: 'belrmon', clientName: '벨르몬성형외과' },
];

function makeDeps(overrides = {}) {
  const calls = { consultsList: [], post: [], summary: 0 };

  const defaults = {
    consultsList: async (clientId) => ({
      success: true,
      data: {
        consults: [
          { consultId: `cs-${clientId}-1`, clientId, date: '2026-08-03', month: '2026-08', channel: '위챗', nickname: 'n1', content: 'c1' },
          { consultId: `cs-${clientId}-2`, clientId, date: '2026-08-11', month: '2026-08', channel: '라인', nickname: 'n2', content: 'c2' },
        ],
      },
    }),
    postJson: async () => ({ success: true }),
    fetchSummary: async () => ({
      monthlyJobs: [{ jobId: 'job-1', kind: '서브', title: '이월 업무', note: '' }],
      expenses: [{ expenseId: 'exp-1', amount: 1000 }],
      postLogs: [{ logId: 'pl-1' }],
    }),
  };

  // 기록은 항상 래퍼에서 한다. override가 기록을 빠뜨릴 수 없도록 분리했다.
  const consultsListImpl = overrides.consultsList || defaults.consultsList;
  const postJsonImpl = overrides.postJson || defaults.postJson;
  const fetchSummaryImpl = overrides.fetchSummary || defaults.fetchSummary;

  const deps = {
    backupMonth: '2026-08',
    targetMonth: '2026-09',
    consultTargets: ['btskin', 'belrmon'],
    clients: CLIENTS,
    consultsList: async (clientId, month) => {
      calls.consultsList.push({ clientId, month });
      return consultsListImpl(clientId, month);
    },
    postJson: async (body) => {
      calls.post.push(body);
      return postJsonImpl(body);
    },
    fetchSummary: async () => {
      calls.summary += 1;
      return fetchSummaryImpl();
    },
  };
  return { deps, calls };
}

test('정상 경로: monthlyReset POST 1회, 서버 monthlyJobs가 결과에 담긴다', async () => {
  const { runMonthlyReset, MONTHLY_RESET_STAGE } = resetHarness();
  const { deps, calls } = makeDeps();
  const stages = [];

  const out = await runMonthlyReset({ ...deps, onStage: (s) => stages.push(s) });

  assert.equal(out.stage, MONTHLY_RESET_STAGE.COMPLETE);
  assert.equal(out.serverResetSucceeded, true);
  assert.equal(calls.post.filter((b) => b.action === 'monthlyReset').length, 1, 'monthlyReset must post exactly once');
  assert.equal(calls.post.length, 1, 'no other mutation may be sent');
  assert.deepEqual(out.afterReset.monthlyJobs, [{ jobId: 'job-1', kind: '서브', title: '이월 업무', note: '' }]);
  assert.deepEqual(stages, [
    MONTHLY_RESET_STAGE.PREFLIGHT_LOADING,
    MONTHLY_RESET_STAGE.RESET_POSTING,
    MONTHLY_RESET_STAGE.RESET_APPLIED_REFRESHING,
    MONTHLY_RESET_STAGE.COMPLETE,
  ]);
});

test('preflight 실패: monthlyReset POST가 나가지 않고 서버 미반영', async () => {
  const { runMonthlyReset, MONTHLY_RESET_STAGE } = resetHarness();
  const { deps, calls } = makeDeps({
    consultsList: async () => ({ success: false, error: '상담 조회 실패' }),
  });

  const out = await runMonthlyReset(deps);

  assert.equal(out.stage, MONTHLY_RESET_STAGE.PREFLIGHT_FAILED);
  assert.equal(out.serverResetSucceeded, false);
  assert.equal(calls.post.length, 0, 'nothing may be posted when preflight fails');
});

test('두 거래처 중 하나만 실패해도 초기화를 시작하지 않는다', async () => {
  const { runMonthlyReset, MONTHLY_RESET_STAGE } = resetHarness();
  const { deps, calls } = makeDeps({
    consultsList: async (clientId) =>
      clientId === 'belrmon'
        ? { success: false, error: 'belrmon 조회 실패' }
        : { success: true, data: { consults: [] } },
  });

  const out = await runMonthlyReset(deps);

  assert.equal(out.stage, MONTHLY_RESET_STAGE.PREFLIGHT_FAILED);
  assert.equal(calls.post.length, 0);
});

test('monthlyReset POST 실패: 서버 미반영으로 보고한다', async () => {
  const { runMonthlyReset, MONTHLY_RESET_STAGE } = resetHarness();
  const { deps, calls } = makeDeps({
    postJson: async () => { throw new Error('monthlyReset 실패: API 오류'); },
  });

  const out = await runMonthlyReset(deps);

  assert.equal(out.stage, MONTHLY_RESET_STAGE.RESET_FAILED);
  assert.equal(out.serverResetSucceeded, false);
  assert.equal(calls.summary, 0, 'summary must not be fetched after a failed reset');
});

test('POST 성공 후 summary 실패: 서버 적용됨으로 남고 재초기화를 안내하지 않는다', async () => {
  const { runMonthlyReset, MONTHLY_RESET_STAGE, MONTHLY_RESET_MESSAGE } = resetHarness();
  const { deps } = makeDeps({
    fetchSummary: async () => { throw new Error('Failed to fetch'); },
  });

  const out = await runMonthlyReset(deps);

  assert.equal(out.stage, MONTHLY_RESET_STAGE.RESET_APPLIED_REFRESH_FAILED);
  assert.equal(out.serverResetSucceeded, true, 'server work must be reported as applied');

  const message = MONTHLY_RESET_MESSAGE[out.stage];
  assert.match(message, /Sheets 초기화는 완료/);
  assert.match(message, /다시 초기화하지 마세요/);
  assert.doesNotMatch(message, /다시 시도/);
});

test('summary가 비었거나 monthlyJobs가 없으면 addSubJob 자동 보강을 하지 않는다', async () => {
  const { runMonthlyReset, MONTHLY_RESET_STAGE } = resetHarness();

  for (const empty of [{ monthlyJobs: [] }, {}, null]) {
    const { deps, calls } = makeDeps({ fetchSummary: async () => empty });
    const out = await runMonthlyReset(deps);

    assert.equal(out.stage, MONTHLY_RESET_STAGE.RESET_APPLIED_REFRESH_FAILED);
    assert.equal(out.serverResetSucceeded, true);
    assert.equal(
      calls.post.filter((b) => b.action === 'addSubJob' || b.action === 'updateSubJob').length,
      0,
      'carryover jobs must never be recreated automatically',
    );
    assert.equal(calls.post.length, 1, 'only the monthlyReset post is allowed');
  }
});

test('백업 대상은 원격 전월 자료만 사용하고 다른 월은 제외한다', async () => {
  const { runMonthlyReset } = resetHarness();
  const { deps, calls } = makeDeps({
    consultsList: async (clientId) => ({
      success: true,
      data: {
        consults: [
          { consultId: `${clientId}-aug`, clientId, date: '2026-08-05', month: '2026-08', channel: '위챗' },
          { consultId: `${clientId}-sep`, clientId, date: '2026-09-01', month: '2026-09', channel: '라인' },
        ],
      },
    }),
  });

  const out = await runMonthlyReset(deps);

  assert.deepEqual(calls.consultsList, [
    { clientId: 'btskin', month: '2026-08' },
    { clientId: 'belrmon', month: '2026-08' },
  ]);
  for (const history of out.histories) {
    assert.equal(history.month, '2026-08');
    assert.equal(history.records.length, 1, 'only the backup month is kept');
    assert.equal(history.records[0].month, '2026-08');
  }
});

test('상담이 0건인 거래처는 백업 이력을 만들지 않는다', async () => {
  const { runMonthlyReset } = resetHarness();
  const { deps } = makeDeps({
    consultsList: async (clientId) => ({
      success: true,
      data: {
        consults: clientId === 'btskin'
          ? [{ consultId: 'a', clientId, date: '2026-08-05', month: '2026-08', channel: '위챗' }]
          : [],
      },
    }),
  });

  const out = await runMonthlyReset(deps);

  assert.equal(out.histories.length, 1);
  assert.equal(out.histories[0].clientId, 'btskin');
});

// ── 소스 수준 보증 ─────────────────────────────────────────────

test('상담 화면 진입만으로는 addConsult POST가 발생하지 않는다', () => {
  const start = dashboard.indexOf('    const CONSULT_CLIENTS =');
  const end = dashboard.indexOf('    const consultMonths =', start);
  assert.ok(start >= 0 && end > start, 'consult block must exist');
  const block = dashboard.slice(start, end);

  // 사용자 행동(addConsult/deleteConsult 함수) 밖에서 POST가 남아있으면 안 된다.
  // 주석에는 과거 동작 설명이 들어가므로 코드만 남기고 검사한다.
  const loadEffect = block
    .slice(block.indexOf('    useEffect(() => {'))
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  assert.doesNotMatch(loadEffect, /action:\s*'addConsult'/, 'the load effect must not send addConsult');
  assert.doesNotMatch(loadEffect, /method:\s*'POST'/, 'the load effect must not POST at all');

  // 명시적 사용자 행동은 그대로 남아 있어야 한다.
  assert.match(block, /function addConsult\(\)[\s\S]*action:\s*'addConsult'/);
  assert.match(block, /function deleteConsult\(id\)[\s\S]*action:\s*'deleteConsult'/);
});

test('초기화는 ref 기반 재진입 가드와 버튼 비활성화를 갖는다', () => {
  assert.match(dashboard, /const resetInFlight = useRef\(false\)/);
  assert.match(dashboard, /if \(resetInFlight\.current\) return;/);
  assert.match(dashboard, /resetInFlight\.current = true;/);
  assert.match(dashboard, /disabled=\{resetRunning\}/);
});

test('초기화 후 로컬 monthlyJobs는 서버 응답을 그대로 사용한다', () => {
  const start = dashboard.indexOf('      // ── 정상 완료: 서버 응답을 source of truth로 반영한다 ──');
  assert.ok(start >= 0, 'the success branch must be explicit');
  const block = dashboard.slice(start, start + 700);
  assert.match(block, /monthlyJobs: afterReset\.monthlyJobs/);
  assert.doesNotMatch(block, /prev\.monthlyJobs/, 'local reconstruction must not come back');
});

test('미리보기 집계는 순위 업무를 포함한다', () => {
  assert.match(dashboard, /const isSubLikeJob = \(job\) => job\?\.kind === '서브' \|\| job\?\.kind === '순위';/);
  const start = dashboard.indexOf('  function getMonthlyResetPreview(');
  const block = dashboard.slice(start, start + 500);
  assert.match(block, /\.filter\(isSubLikeJob\)/);
});
