import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = await fs.readFile(path.join(root, 'index.html'), 'utf8');

function approvalHelpers() {
  const start = dashboard.indexOf("const DRAFT_STATUSES =");
  const end = dashboard.indexOf('function DraftsView', start);
  assert.ok(start >= 0 && end > start, 'draft approval helpers must remain before DraftsView');

  const context = vm.createContext({});
  vm.runInContext(`${dashboard.slice(start, end)}\n;globalThis.__approvalHelpers = { shouldShowApproveButton, isNaverCommandEligible, canRegisterPublishedDraft };`, context);
  return context.__approvalHelpers;
}

function draftClientMap() {
  const start = dashboard.indexOf('const DRAFT_CLIENT_MAP =');
  const end = dashboard.indexOf('const DRAFT_CHANNELS =', start);
  assert.ok(start >= 0 && end > start, 'draft client map must exist');

  const context = vm.createContext({});
  vm.runInContext(`${dashboard.slice(start, end)}\n;globalThis.__draftClientMap = DRAFT_CLIENT_MAP;`, context);
  return context.__draftClientMap;
}

function statusReadbackHarness(fetch) {
  const start = dashboard.indexOf('function extractDraftList');
  const end = dashboard.indexOf('function applyDraftStatusSnapshot', start);
  assert.ok(start >= 0 && end > start, 'status readback helpers must exist');

  const context = vm.createContext({ fetch });
  vm.runInContext(`
    const API_URL = 'https://dashboard.test/exec';
    const DRAFT_STATUSES = ['draft','review','approved','staged','published'];
    const requireSafeDraftId = (draftId) => {
      const value = String(draftId || '').trim();
      if (!/^dr-[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/.test(value)) throw new Error('unsafe draftId');
      return value;
    };
    const normalizeDraftList = (list) => list.map(item => ({ ...item }));
    async function readApiJson(response) { return response.json(); }
    ${dashboard.slice(start, end)}
    ;globalThis.__statusReadback = { readDraftStatusSnapshot };
  `, context);
  return context.__statusReadback;
}

test('approval button is available only for draft/review blog rows', () => {
  const { shouldShowApproveButton } = approvalHelpers();

  for (const status of ['draft', 'review']) {
    assert.equal(shouldShowApproveButton({ channel:'블로그', status }), true);
    assert.equal(shouldShowApproveButton({ channel:'홈페이지', status }), false);
    assert.equal(shouldShowApproveButton({ channel:'인스타', status }), false);
    assert.equal(shouldShowApproveButton({ channel:'위챗', status }), false);
  }

  assert.equal(shouldShowApproveButton({ channel:'홈페이지', status:'approved' }), false);
  assert.equal(shouldShowApproveButton({ channel:'블로그', status:'staged' }), false);
});

test('Kyunghee draft archives use distinct branch routing IDs', () => {
  const clients = draftClientMap();

  assert.equal(clients.kyunghee, '365경희부부한의원 피부클리닉');
  assert.equal(clients.hwabuk, '365경희부부한의원 화북점');
  assert.equal(clients.jocheon, '경희부부한의원 조천점');
  assert.equal(Object.values(clients).includes('365경희부부한의원'), false);
});

test('homepage stays manual: approved is blocked and publish requires staged', () => {
  const { canRegisterPublishedDraft } = approvalHelpers();
  assert.equal(canRegisterPublishedDraft({ channel:'홈페이지', status:'approved' }), false);
  assert.equal(canRegisterPublishedDraft({ channel:'홈페이지', status:'staged' }), true);
  assert.equal(canRegisterPublishedDraft({ channel:'블로그', status:'approved' }), true);

  const start = dashboard.indexOf('async function changeDraftStatus');
  const end = dashboard.indexOf('async function copyDraftText', start);
  const source = dashboard.slice(start, end);
  assert.match(source, /isHomepageChannel\(draft\?\.channel\) && next === 'approved'/);
  assert.doesNotMatch(dashboard, /buildHomepageLoginAndTempSaveCommand|로그인·저장 CMD/);
});

test('homepage approval does not become eligible for the Naver CMD bridge', () => {
  const { isNaverCommandEligible } = approvalHelpers();
  const base = { draftId:'dr-routing-test', status:'approved', memo:'' };

  assert.equal(isNaverCommandEligible({ ...base, channel:'홈페이지' }), false);
  assert.equal(isNaverCommandEligible({ ...base, channel:'블로그' }), true);
});

test('single-row status changes keep compare-and-set and read-after-write verification', () => {
  const start = dashboard.indexOf('async function changeDraftStatus');
  const end = dashboard.indexOf('async function copyDraftText', start);
  assert.ok(start >= 0 && end > start, 'changeDraftStatus must exist');
  const source = dashboard.slice(start, end);

  assert.match(source, /expectedStatus:\s*prevStatus/);
  assert.match(source, /verifiedSnapshot = await readDraftStatusSnapshot\(draftId\)/);
  assert.equal((source.match(/method:\s*'POST'/g) || []).length, 1);
  assert.match(dashboard, /const showApprove = shouldShowApproveButton\(draft\);/);
  assert.match(dashboard, /onClick=\{\(\) => changeDraftStatus\(draft, 'approved'\)\}/);

  const readbackStart = dashboard.indexOf('async function readDraftStatusSnapshot');
  const readbackEnd = dashboard.indexOf('function applyDraftStatusSnapshot', readbackStart);
  const readback = dashboard.slice(readbackStart, readbackEnd);
  assert.match(readback, /await fetchDraftListSnapshot\(\)/);
  assert.match(readback, /await fetchDraftDetailSnapshot\(expectedDraftId\)/);
});

test('status readback checks draftsList then the same draftDetail before confirmation', async () => {
  const calls = [];
  const row = { draftId:'dr-home-verify', clientId:'btskin', channel:'홈페이지', status:'approved', title:'홈페이지 글' };
  const fetch = async (input) => {
    const url = new URL(String(input));
    const action = url.searchParams.get('action');
    calls.push({ action, draftId:url.searchParams.get('draftId') });
    if (action === 'draftsList') {
      return { async json() { return { success:true, data:[row] }; } };
    }
    if (action === 'draftDetail') {
      return { async json() { return { success:true, data:{ ...row, content:'<h1>홈페이지 글</h1>' } }; } };
    }
    throw new Error(`unexpected action: ${action}`);
  };

  const { readDraftStatusSnapshot } = statusReadbackHarness(fetch);
  const snapshot = await readDraftStatusSnapshot(row.draftId);
  assert.equal(snapshot.status, 'approved');
  assert.deepEqual(calls, [
    { action:'draftsList', draftId:null },
    { action:'draftDetail', draftId:row.draftId },
  ]);
});

test('status readback fails closed when list and detail disagree', async () => {
  const row = { draftId:'dr-home-mismatch', clientId:'btskin', channel:'홈페이지', status:'approved', title:'홈페이지 글' };
  const fetch = async (input) => {
    const action = new URL(String(input)).searchParams.get('action');
    if (action === 'draftsList') return { async json() { return { success:true, data:[row] }; } };
    return { async json() { return { success:true, data:{ ...row, status:'review', content:'<h1>홈페이지 글</h1>' } }; } };
  };

  const { readDraftStatusSnapshot } = statusReadbackHarness(fetch);
  await assert.rejects(readDraftStatusSnapshot(row.draftId), /draftsList.*draftDetail/);
});
