import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../docs/apps-script-api.md', import.meta.url), 'utf8');

test('report readiness panel is removed from the dashboard', () => {
  assert.doesNotMatch(html, /ReportReadinessPanel|월말보고서 준비도/);
});

test('published posts can be selected by month', () => {
  assert.match(html, /aria-label="발행글 조회 월"/);
  assert.match(html, /postLogMonth\(p\) === postMonth/);
});

test('reservation records are stored locally and not posted to Apps Script', () => {
  assert.match(html, /reservations:\s*s\.reservations \?\? \[\]/);
  const crud = html.match(/\/\/ ── 예약 고객 캘린더 CRUD[\s\S]*?\/\/ ── 자격증명 CRUD/);
  assert.ok(crud, 'reservation CRUD block should exist');
  assert.doesNotMatch(crud[0], /fetch\s*\(/);
  assert.match(docs, /Apps Script나 Google Sheets로 전송하지 않고/);
});

test('reservation form keeps the required multilingual customer fields', () => {
  for (const field of ['clientId', 'appointmentDate', 'appointmentTime', 'patientName', 'birthDate', 'nationality', 'gender', 'partySize', 'treatment', 'note']) {
    assert.match(html, new RegExp(`form\\.${field}`));
  }
});
