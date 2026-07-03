// ═══════════════════════════════════════════════════════════════
//  APPS SCRIPT 패치 v16 — 월간 초기화 / JSON 오류 안정화
//  적용 방법:
//  1. [1B] doPost switch(body.action)에 monthlyReset case 추가
//  2. [1C] doPost 전체 try/catch 래퍼를 적용할 수 있으면 추가
//  3. [2] 함수들을 파일 하단에 붙여넣기
//
//  목적:
//  - 대시보드 "다음 달 초기화" 버튼의 monthlyReset POST를 서버에서 처리한다.
//  - 필수/카운트 업무 currentCount를 0으로 돌리고 운영월(month)을 새 달로 갱신한다.
//  - 완료된 서브업무(note가 "완료"로 시작)는 삭제하고, 미완료 서브업무는 이월한다.
//  - 서버 예외가 HTML 오류 페이지로 새지 않도록 JSON 오류 응답을 권장한다.
// ═══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// [1B] doPost의 switch(body.action) 안에 추가할 case 블록
// ──────────────────────────────────────────────────────────────

  case 'monthlyReset':
    return jsonRes(monthlyReset(ss, body));

// ──────────────────────────────────────────────────────────────
// [1C] 권장: doPost 내부 action 처리 전체를 try/catch로 감싸기
// ──────────────────────────────────────────────────────────────

/*
function doPost(e) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var body = JSON.parse(e.postData.contents || '{}');
    switch (body.action) {
      // 기존 case들...
      case 'monthlyReset':
        return jsonRes(monthlyReset(ss, body));
      default:
        return jsonRes({ success: false, error: 'Unknown action: ' + body.action });
    }
  } catch (err) {
    return jsonRes({ success: false, error: formatMonthlyResetError_(err) });
  }
}
*/

// ──────────────────────────────────────────────────────────────
// [2] 파일 하단에 추가할 함수들
// ──────────────────────────────────────────────────────────────

function monthlyReset(ss, body) {
  ss = ss || SpreadsheetApp.openById(SHEET_ID);
  body = body || {};

  var month = normalizeMonthlyResetMonth_(body.month);
  if (!month) return { success: false, error: 'month must be YYYY-MM' };

  var sheet = ss.getSheetByName('MonthlyJobs');
  if (!sheet) return { success: false, error: 'MonthlyJobs 시트 없음' };

  monthlyResetEnsureColumns_(sheet, [
    'jobId',
    'clientId',
    'title',
    'kind',
    'targetCount',
    'currentCount',
    'note',
    'dueDate',
    'month'
  ]);

  var deletedCompletedSubJobs = monthlyResetDeleteCompletedSubs_(sheet);
  var result = monthlyResetUpdateRows_(sheet, month);

  return {
    success: true,
    month: month,
    resetJobs: result.resetJobs,
    carryoverSubJobs: result.carryoverSubJobs,
    updatedMonthRows: result.updatedMonthRows,
    deletedCompletedSubJobs: deletedCompletedSubJobs
  };
}

function normalizeMonthlyResetMonth_(value) {
  var raw = String(value || '').trim();
  if (raw) {
    var match = raw.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    var monthNum = Number(match[2]);
    if (monthNum < 1 || monthNum > 12) return null;
    return raw;
  }

  var now = new Date();
  var tz = Session.getScriptTimeZone() || 'Asia/Seoul';
  return Utilities.formatDate(now, tz, 'yyyy-MM');
}

function monthlyResetEnsureColumns_(sheet, requiredColumns) {
  var lastCol = sheet.getLastColumn();
  var header = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(col) {
        return String(col || '').trim();
      })
    : [];

  if (header.length === 0) {
    sheet.getRange(1, 1, 1, requiredColumns.length).setValues([requiredColumns]);
    sheet.setFrozenRows(1);
    return;
  }

  requiredColumns.forEach(function(col) {
    if (header.indexOf(col) >= 0) return;
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue(col);
    header.push(col);
  });
}

function monthlyResetHeaderMap_(sheet) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(col) {
    return String(col || '').trim();
  });
  var map = {};
  header.forEach(function(col, index) {
    map[col] = index;
  });
  return map;
}

function monthlyResetDeleteCompletedSubs_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var header = monthlyResetHeaderMap_(sheet);
  var kindCol = header.kind;
  var noteCol = header.note;
  if (kindCol == null || noteCol == null) return 0;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var deleted = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    var row = data[i];
    var kind = String(row[kindCol] || '').trim();
    var note = String(row[noteCol] || '').trim();
    if (kind === '서브' && note.indexOf('완료') === 0) {
      sheet.deleteRow(i + 2);
      deleted++;
    }
  }
  return deleted;
}

function monthlyResetUpdateRows_(sheet, month) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { resetJobs: 0, carryoverSubJobs: 0, updatedMonthRows: 0 };
  }

  var header = monthlyResetHeaderMap_(sheet);
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var resetJobs = 0;
  var carryoverSubJobs = 0;
  var updatedMonthRows = 0;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rowNum = i + 2;
    var kind = String(row[header.kind] || '').trim();
    var targetCount = header.targetCount == null ? '' : row[header.targetCount];
    var hasTarget = String(targetCount || '').trim() !== '';

    if (header.month != null) {
      sheet.getRange(rowNum, header.month + 1).setValue(month);
      updatedMonthRows++;
    }

    if (kind === '서브') {
      carryoverSubJobs++;
      continue;
    }

    if (kind === '필수' || hasTarget) {
      if (header.currentCount != null) {
        sheet.getRange(rowNum, header.currentCount + 1).setValue(0);
      }
      if (header.note != null && String(row[header.note] || '').trim().indexOf('완료') === 0) {
        sheet.getRange(rowNum, header.note + 1).setValue('');
      }
      resetJobs++;
    }
  }

  return {
    resetJobs: resetJobs,
    carryoverSubJobs: carryoverSubJobs,
    updatedMonthRows: updatedMonthRows
  };
}

function formatMonthlyResetError_(err) {
  if (!err) return 'Unknown Apps Script error';
  if (err.stack) return String(err.stack);
  if (err.message) return String(err.message);
  return String(err);
}
