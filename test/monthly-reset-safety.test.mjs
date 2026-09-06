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

test('서버가 JSON으로 거부하면 확실한 실패로 보고한다', async () => {
  const { runMonthlyReset, MONTHLY_RESET_STAGE, MONTHLY_RESET_MESSAGE } = resetHarness();
  const { deps, calls } = makeDeps({
    postJson: async () => {
      const err = new Error('monthlyReset 실패: API 오류');
      err.serverResponded = true;   // 서버가 응답했고 거부했다
      throw err;
    },
  });

  const out = await runMonthlyReset(deps);

  assert.equal(out.stage, MONTHLY_RESET_STAGE.RESET_FAILED);
  assert.equal(out.serverResetSucceeded, false);
  assert.equal(calls.summary, 0, 'summary must not be fetched after a failed reset');
  // 서버가 처리하지 않았음이 확실하므로 재시도를 안내해도 된다.
  assert.match(MONTHLY_RESET_MESSAGE[out.stage], /다시 시도/);
  assert.match(MONTHLY_RESET_MESSAGE[out.stage], /변경되지 않았고/);
});

test('통신이 끊기면 실패로 단정하지 않고 결과 불명으로 보고한다', async () => {
  const { runMonthlyReset, MONTHLY_RESET_STAGE, MONTHLY_RESET_MESSAGE } = resetHarness();
  const { deps, calls } = makeDeps({
    postJson: async () => {
      // Failed to fetch. 서버가 이미 처리했을 수도 있다.
      const err = new Error('monthlyReset 요청이 서버에 도달했는지 확인할 수 없습니다.');
      err.serverResponded = false;
      throw err;
    },
  });

  const out = await runMonthlyReset(deps);

  assert.equal(out.stage, MONTHLY_RESET_STAGE.RESET_OUTCOME_UNKNOWN);
  assert.equal(out.serverResetSucceeded, false, '확인되지 않았으므로 성공으로 취급하지 않는다');
  assert.equal(calls.summary, 0);

  const message = MONTHLY_RESET_MESSAGE[out.stage];
  assert.match(message, /확인할 수 없습니다/);
  assert.match(message, /다시 실행하지 마세요/);
  assert.doesNotMatch(message, /다시 시도해 주세요/, '재시도를 권하면 중복 처리 위험이 있다');
});

test('serverResponded 표시가 없는 예외도 결과 불명으로 처리한다', async () => {
  const { runMonthlyReset, MONTHLY_RESET_STAGE } = resetHarness();
  const { deps } = makeDeps({
    postJson: async () => { throw new Error('알 수 없는 오류'); },
  });

  const out = await runMonthlyReset(deps);
  assert.equal(out.stage, MONTHLY_RESET_STAGE.RESET_OUTCOME_UNKNOWN,
    'fail-safe: 모르면 실패가 아니라 불명으로 분류해야 한다');
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
  // greedy 매칭으로 함수 경계를 넘지 않도록 각 함수 본문을 잘라서 확인한다.
  const fnBody = (header, next) => {
    const s0 = block.indexOf(header);
    assert.ok(s0 >= 0, `${header} must exist`);
    const s1 = block.indexOf(next, s0);
    assert.ok(s1 > s0, `${next} must follow ${header}`);
    return block.slice(s0, s1);
  };

  const addBody = fnBody('    async function addConsult() {', '    async function retryConsultSync(');
  assert.match(addBody, /await sendConsult\(entry\)/, 'save must await a single send');
  assert.equal((addBody.match(/sendConsult\(/g) || []).length, 1, 'exactly one send per save');
  assert.doesNotMatch(addBody, /fetch\(/, 'the save path must go through the shared POST helper');

  const delBody = fnBody('    async function deleteConsult(id) {', '    useEffect(() => {');
  assert.match(delBody, /action:\s*'deleteConsult'/);
  assert.equal((delBody.match(/postApiJson\(/g) || []).length, 1, 'exactly one delete request');

  // 페이로드는 공용 헬퍼가 만든다.
  assert.match(block, /function consultPayload\(entry\) \{[\s\S]{0,400}?action: 'addConsult'/);
});

test('초기화는 ref 기반 재진입 가드와 버튼 비활성화를 갖는다', () => {
  assert.match(dashboard, /const resetInFlight = useRef\(false\)/);
  assert.match(dashboard, /if \(resetInFlight\.current\) return;/);
  assert.match(dashboard, /resetInFlight\.current = true;/);
  assert.match(dashboard, /disabled=\{resetRunning \|\| resetOutcomeUnknown\}/);
  assert.match(dashboard, /const resetOutcomeUnknown = resetStage === MONTHLY_RESET_STAGE\.RESET_OUTCOME_UNKNOWN;/);
});

test('초기화 후 로컬 monthlyJobs는 서버 응답을 그대로 사용한다', () => {
  const start = dashboard.indexOf('      // ── 정상 완료: 서버 응답을 source of truth로 반영한다 ──');
  assert.ok(start >= 0, 'the success branch must be explicit');
  const block = dashboard.slice(start, start + 700);
  assert.match(block, /monthlyJobs: afterReset\.monthlyJobs/);
  assert.doesNotMatch(block, /prev\.monthlyJobs/, 'local reconstruction must not come back');
});

test('미리보기가 순위 업무의 카운트 초기화를 별도로 알린다', () => {
  // 순위 업무는 서버가 삭제하지 않고 카운트만 0으로 되돌린다.
  // Phase 1에서는 이를 "삭제될 서브·순위 업무"로 묶어 잘못 예고했다.
  const start = dashboard.indexOf('  function getMonthlyResetPreview(');
  const block = dashboard.slice(start, start + 1400);

  assert.match(block, /const countResetJobs = \(data\.monthlyJobs \|\| \[\]\)/);
  assert.match(block, /\.filter\(job => !isDeletableSubJob\(job\) && isCountResetJob\(job\)\)/);
  assert.doesNotMatch(dashboard, /isSubLikeJob/, 'the merged 서브/순위 predicate must be gone');
});

// ── Kimi 감사 지적 반영분 회귀 방지 ─────────────────────────

test('초기화 성공 후 로컬 상담 캐시를 통째로 비우지 않는다', () => {
  // 예전에는 consult-v1-*를 '[]'로 덮어 Sheets에 없는 로컬 전용 상담이 사라졌다.
  // 백업 이력에는 원격 조회분만 담기므로 그 건들은 어디에도 남지 않았다.
  assert.doesNotMatch(
    dashboard,
    /safeStorage\.setItem\('consult-v1-' \+ cid, '\[\]'\)/,
    'the reset path must not wipe the local consult cache',
  );

  const start = dashboard.indexOf('      // ── 여기부터 서버는 이미 초기화됨');
  const end = dashboard.indexOf('      // ── 정상 완료: 서버 응답을 source of truth로 반영한다 ──', start);
  assert.ok(start >= 0 && end > start, 'the post-reset block must exist');

  // 주석에는 과거 동작 설명이 남으므로 코드만 남기고 검사한다.
  const code = dashboard.slice(start, end)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  assert.doesNotMatch(code, /safeStorage\.(setItem|removeItem)\([^)]*consult-v1-/, 'no consult cache mutation after reset');
});

test('미리보기 삭제 예고는 서버가 실제로 지우는 서브 업무만 대상으로 한다', () => {
  // 서버 통합 패치는 kind === '서브'만 삭제한다.
  // 순위 업무를 삭제 대상으로 예고하면 다음 달에 되살아나 사용자를 혼란시킨다.
  assert.match(dashboard, /const isDeletableSubJob = \(job\) => job\?\.kind === '서브';/);

  const start = dashboard.indexOf('  function getMonthlyResetPreview(');
  const block = dashboard.slice(start, start + 1400);
  assert.match(block, /const allSubs = \(data\.monthlyJobs \|\| \[\]\)\.filter\(isDeletableSubJob\);/);

  // 순위 업무는 별도 버킷(카운트 초기화 대상)으로 분리해 안내해야 한다.
  assert.match(block, /countResetJobs/);
  assert.match(dashboard, /카운트 초기화 대상/);
  assert.doesNotMatch(dashboard, /삭제될 완료 서브·순위 업무/, 'delete card must not lump 순위 with 삭제');
});

test('미리보기 판정이 서버 패치의 kind 조건과 일치한다', async () => {
  const patch = await fs.readFile(path.join(root, 'apps-script/internal_api_security_patch_v23.gs'), 'utf8');

  // 서버 삭제 조건
  assert.match(patch, /if \(kind === '서브' && note\.indexOf\('완료'\) === 0\)/);
  // 서버 이월 조건
  assert.match(patch, /if \(kind === '서브'\) \{[\s\S]{0,160}?carryoverSubJobs\+\+;/);
  // 서버 카운트 초기화 조건
  assert.match(patch, /if \(kind === '필수' \|\| hasTarget\) \{/);

  // 클라이언트가 같은 집합을 쓰는지
  assert.match(dashboard, /const isCountResetJob = \(job\) => job\?\.kind === '필수' \|\| hasJobTarget\(job\);/);
});

test('runMonthlyReset이 예외로 탈출해도 버튼이 영구히 잠기지 않는다', () => {
  const start = dashboard.indexOf('      let outcome;');
  const end = dashboard.indexOf('      // ── 서버 미반영 단계', start);
  assert.ok(start >= 0 && end > start, 'the orchestration call site must exist');
  const block = dashboard.slice(start, end);

  assert.match(block, /\} catch \(error\) \{/, 'the call site must catch escaping exceptions');
  assert.match(block, /setResetStage\(MONTHLY_RESET_STAGE\.IDLE\)/, 'stage must return to IDLE so the button unlocks');
  assert.match(block, /return;/, 'it must not fall through to outcome access');
  assert.match(block, /resetInFlight\.current = false;/, 'the ref must still be released');

  // 예외 안내는 재초기화를 권하면 안 된다.
  const alertText = block.slice(block.indexOf('alert('), block.indexOf('return;'));
  assert.match(alertText, /다시 초기화하지 마시고/);
});

// ── 서버 구현을 가정하지 않는다 (라이브 Apps Script 버전 불명) ───────────

function outcomeHarness() {
  const start = dashboard.indexOf('  function summarizeResetOutcome(');
  const end = dashboard.indexOf('  // 순수 오케스트레이션', start);
  assert.ok(start >= 0 && end > start, 'summarizeResetOutcome must exist');
  const context = vm.createContext({});
  vm.runInContext(`${dashboard.slice(start, end)}
    ;globalThis.__o = { summarizeResetOutcome, formatResetOutcome };`, context);
  return context.__o;
}

test('초기화 결과는 예측이 아니라 before/after 비교로 보고한다', () => {
  const { summarizeResetOutcome } = outcomeHarness();

  const before = [
    { jobId: 'a', kind: '서브', note: '완료', currentCount: 0 },
    { jobId: 'b', kind: '필수', note: '', currentCount: 5, targetCount: 5 },
    { jobId: 'c', kind: '순위', note: '완료 (3위)', currentCount: 2, targetCount: 4 },
    { jobId: 'd', kind: '서브', note: '진행중', currentCount: 0 },
  ];
  const after = [
    { jobId: 'b', kind: '필수', note: '', currentCount: 0, targetCount: 5 },
    { jobId: 'c', kind: '순위', note: '', currentCount: 0, targetCount: 4 },
    { jobId: 'd', kind: '서브', note: '진행중', currentCount: 0 },
  ];

  const out = summarizeResetOutcome(before, after, { deletedCompletedSubJobs: 1, resetJobs: 2 });

  assert.deepEqual(out.removed.map(j => j.jobId), ['a'], '사라진 업무만 삭제로 본다');
  assert.deepEqual(out.countReset.map(j => j.jobId), ['b', 'c'], '카운트가 0이 된 업무');
  assert.deepEqual(out.noteCleared.map(j => j.jobId), ['c'], '메모가 비워진 업무');
  assert.equal(out.reported.deletedCompletedSubJobs, 1, '서버 보고 값도 함께 전달');
});

test('서버가 처리 건수를 응답하지 않아도 결과 보고가 동작한다', () => {
  const { summarizeResetOutcome, formatResetOutcome } = outcomeHarness();

  // 라이브 버전이 v16과 달라 응답 필드가 없을 수 있다.
  const out = summarizeResetOutcome(
    [{ jobId: 'a', kind: '서브', note: '완료', currentCount: 0 }],
    [],
    null,
  );
  assert.deepEqual(out.removed.map(j => j.jobId), ['a']);
  assert.deepEqual(Object.keys(out.reported), [], 'no server counters is fine');

  const text = formatResetOutcome(out);
  assert.match(text, /삭제된 업무: 1건/);
  assert.doesNotMatch(text, /서버 보고 삭제/, 'absent counters must not be printed');
});

test('서버가 예상과 다르게 동작해도 결과 보고가 사실을 그대로 전한다', () => {
  const { summarizeResetOutcome } = outcomeHarness();

  // v16과 달리 라이브가 완료 순위 업무까지 지웠다고 가정한다.
  const before = [
    { jobId: 'sub', kind: '서브', note: '완료' },
    { jobId: 'rank', kind: '순위', note: '완료', targetCount: 3, currentCount: 3 },
  ];
  const out = summarizeResetOutcome(before, [], null);

  assert.deepEqual(out.removed.map(j => j.jobId), ['sub', 'rank'],
    '프런트 예측과 무관하게 실제로 사라진 것을 그대로 보고해야 한다');
});

test('미리보기는 서버 동작을 단정하지 않는다', () => {
  assert.match(dashboard, /실제로 무엇이 삭제·초기화되는지는 서버가 결정하며/);
  // 확정적 표현이 되살아나면 안 된다.
  assert.doesNotMatch(dashboard, />삭제될 완료 서브/);
  assert.doesNotMatch(dashboard, />이월될 미완료 서브/);
  assert.doesNotMatch(dashboard, />카운트가 0으로 초기화될 업무</);
});

test('초기화 완료 안내에 실제 처리 결과가 포함된다', () => {
  const start = dashboard.indexOf('      // ── 정상 완료: 서버 응답을 source of truth로 반영한다 ──');
  const block = dashboard.slice(start, start + 1200);
  assert.match(block, /summarizeResetOutcome\(\s*jobsBeforeReset,/);
  assert.match(block, /formatResetOutcome\(resetOutcome\)/);
  assert.match(dashboard, /const jobsBeforeReset = data\.monthlyJobs \|\| \[\];/);
});
