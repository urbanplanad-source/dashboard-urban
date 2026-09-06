// ═══════════════════════════════════════════════════════════════
//  APPS SCRIPT 수동 통합 패치 v23 — 내부 API 인증 + 안전한 상담 저장/월간 초기화
//
//  ⚠️ 전제
//  라이브 Web App이 저장소 스니펫과 같다고 가정하지 않는다. 먼저 Apps Script
//  편집기 전체를 비공개 백업한 뒤, 실제 doGet/doPost에 아래 인증 게이트를 넣는다.
//
//  적용 순서는 파일 하단 [적용 절차]를 따른다.
//  각 섹션은 독립적이므로 하나씩 적용하고 저장해도 된다.
// ═══════════════════════════════════════════════════════════════


// ───────────────────────────────────────────────────────────────
// [0] 모든 action 공통 인증 게이트   ★ 가장 먼저 적용 ★
// ───────────────────────────────────────────────────────────────
//
// Script Properties에 DASHBOARD_API_KEY를 등록한다. URL이나 키를 코드에 쓰지 않는다.
// 인증 실패 응답에는 데이터, action 목록, 내부 오류를 포함하지 않는다.

function dashboardApiAuthorized_(candidate) {
  var expected = PropertiesService.getScriptProperties().getProperty('DASHBOARD_API_KEY');
  if (!expected) return false;
  return String(candidate || '') === String(expected);
}

function dashboardUnauthorized_() {
  return jsonRes({ success: false, error: 'unauthorized' });
}

// 기존 doGet(e)의 첫 실행문으로 추가:
//   if (!dashboardApiAuthorized_(e && e.parameter && e.parameter.apiKey)) {
//     return dashboardUnauthorized_();
//   }
//
// 기존 doPost(e)는 JSON을 먼저 파싱한 직후, SpreadsheetApp.openById보다 앞에 추가:
//   var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
//   if (!dashboardApiAuthorized_(body.apiKey)) return dashboardUnauthorized_();
//
// 그 뒤에만 switch(action)과 Spreadsheet 접근을 실행한다. GET/POST의 예외도
// jsonRes({success:false,error:'server_error'})처럼 내부 정보를 감춘 JSON으로 반환한다.


// ───────────────────────────────────────────────────────────────
// [A] summary 최소화
// ───────────────────────────────────────────────────────────────
//
// 문제: getSummary 응답에 consults 배열이 들어 있다. 익명 접근이 가능하므로
//       URL을 아는 누구나 전 거래처 환자 상담 원문(nickname, content)을 받는다.
// 확인: 브라우저에서 <배포URL>?action=summary 를 열어 "consults" 키가 있는지 본다.
// 조치: getSummary 반환 객체에서 consults 줄을 삭제한다.
//
// 편집기에서 getSummary 함수를 찾아 data 객체 안의 아래 줄을 지운다.
//
//     consults: getConsultsList(),      ← 이 줄을 삭제 (또는 주석 처리)
//
// 대시보드 영향 없음: index.html은 data.consults를 저장만 하고 어떤 화면도
// 읽지 않는다. 상담 화면은 별도 action=consultsList로 조회한다.
// consultsList 자체는 그대로 둔다. 대시보드가 사용한다.


// ───────────────────────────────────────────────────────────────
// [B] 공개 보고서 action 제거
// ───────────────────────────────────────────────────────────────
//
// 공개 보고서는 정적 HTML로 전환되었으므로 reportPostLogs 같은 익명 action을
// 추가하지 않는다. 아래 예전 helper는 라이브 코드에 붙여넣지 않는다.
// doGet의 reportPostLogs/reviewTargets/reviewLogs case가 있으면 제거한다.
// getSummary 반환 객체에서도 reviewTargets와 consults 필드를 제거한다.
// ReviewTargets/ReviewLogs 시트 자체는 기록 보존을 위해 삭제하지 않는다.
//
// doGet의 switch(action)에 해당 case가 있으면 삭제한다. 대체 공개 action은 만들지 않는다.


// ───────────────────────────────────────────────────────────────
// [C] monthlyReset — 잠금 + 멱등 + 일괄 쓰기
// ───────────────────────────────────────────────────────────────
//
// 문제 1: 동시 실행 잠금이 없다. 두 요청이 겹치면 deleteRow 인덱스가 밀려
//         엉뚱한 행이 지워질 수 있다.
// 문제 2: 셀 단위 setValue 반복이라 행이 많으면 6분 실행 한도에 걸려
//         절반만 처리된 상태로 끝날 수 있다.
// 문제 3: 예외가 HTML 오류 페이지로 새면 대시보드가 결과를 알 수 없다.
//
// 조치: 아래 monthlyReset 함수 전체로 교체한다.
//       편집기에 monthlyReset이 없으면 그냥 추가하고 [C-2] case도 넣는다.
//       기존 monthlyResetEnsureColumns_ / monthlyResetHeaderMap_ 등 보조 함수가
//       이미 있으면 그대로 두고, 없으면 이 파일 아래쪽 것을 함께 붙여넣는다.

function monthlyReset(ss, body) {
  var lock = LockService.getScriptLock();
  // 다른 초기화가 진행 중이면 두 번째 요청은 아무것도 하지 않고 즉시 거부한다.
  // 대시보드는 이 응답을 "서버가 거부함"으로 처리하므로 안전하다.
  if (!lock.tryLock(30000)) {
    return {
      success: false,
      stage: 'lock',
      error: '다른 초기화 작업이 진행 중입니다. 잠시 후 상태를 확인해 주세요.'
    };
  }

  try {
    ss = ss || SpreadsheetApp.openById(SHEET_ID);
    body = body || {};

    var month = normalizeMonthlyResetMonth_(body.month);
    if (!month) return { success: false, stage: 'validate', error: 'month must be YYYY-MM' };

    var sheet = ss.getSheetByName('MonthlyJobs');
    if (!sheet) return { success: false, stage: 'sheet', error: 'MonthlyJobs 시트 없음' };

    monthlyResetEnsureColumns_(sheet, [
      'jobId', 'clientId', 'title', 'kind',
      'targetCount', 'currentCount', 'note', 'dueDate', 'month'
    ]);

    var deleted = monthlyResetDeleteCompletedSubs_(sheet);
    var result = monthlyResetUpdateRows_(sheet, month);

    // 같은 달로 다시 실행해도 결과가 같다(멱등).
    // 완료 서브업무는 이미 지워졌고, currentCount는 이미 0이며, month도 이미 같다.
    return {
      success: true,
      stage: 'done',
      month: month,
      deletedCompletedSubJobs: deleted,
      resetJobs: result.resetJobs,
      carryoverSubJobs: result.carryoverSubJobs,
      updatedMonthRows: result.updatedMonthRows
    };
  } catch (err) {
    return { success: false, stage: 'exception', error: formatMonthlyResetError_(err) };
  } finally {
    lock.releaseLock();
  }
}

// [C-2] doPost의 switch(body.action) 안에 이 case가 없으면 추가한다.

  case 'monthlyReset':
    return jsonRes(monthlyReset(ss, body));


// ───────────────────────────────────────────────────────────────
// [C-3] 보조 함수 — 편집기에 없을 때만 추가한다
// ───────────────────────────────────────────────────────────────

function normalizeMonthlyResetMonth_(value) {
  var raw = String(value || '').trim();
  if (raw) {
    // 월은 01~12만 허용한다. '2026-13'을 받으면 조용히 다음 해로 굴러간다.
    var match = raw.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    return match ? raw : null;
  }
  var tz = Session.getScriptTimeZone() || 'Asia/Seoul';
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM');
}

function monthlyResetEnsureColumns_(sheet, requiredColumns) {
  var lastCol = sheet.getLastColumn();
  var header = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (c) { return String(c || '').trim(); })
    : [];

  if (header.length === 0) {
    sheet.getRange(1, 1, 1, requiredColumns.length).setValues([requiredColumns]);
    sheet.setFrozenRows(1);
    return;
  }
  requiredColumns.forEach(function (col) {
    if (header.indexOf(col) >= 0) return;
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue(col);
    header.push(col);
  });
}

function monthlyResetHeaderMap_(sheet) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (c) { return String(c || '').trim(); });
  var map = {};
  header.forEach(function (col, i) { map[col] = i; });
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
  // 뒤에서부터 지워야 인덱스가 밀리지 않는다. 잠금 안에서만 실행된다.
  for (var i = data.length - 1; i >= 0; i--) {
    var kind = String(data[i][kindCol] || '').trim();
    var note = String(data[i][noteCol] || '').trim();
    if (kind === '서브' && note.indexOf('완료') === 0) {
      sheet.deleteRow(i + 2);
      deleted++;
    }
  }
  return deleted;
}

/**
 * 셀 단위 setValue 반복을 열 단위 setValues 일괄 쓰기로 바꿨다.
 * 행이 많아도 쓰기 호출이 최대 3번이라 실행 한도에 걸리지 않는다.
 */
function monthlyResetUpdateRows_(sheet, month) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { resetJobs: 0, carryoverSubJobs: 0, updatedMonthRows: 0 };
  }

  var header = monthlyResetHeaderMap_(sheet);
  var rowCount = lastRow - 1;
  var data = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues();

  var months = [];
  var counts = [];
  var notes = [];
  var resetJobs = 0;
  var carryoverSubJobs = 0;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var kind = String(row[header.kind] || '').trim();
    var targetCount = header.targetCount == null ? '' : row[header.targetCount];
    var hasTarget = String(targetCount === null || targetCount === undefined ? '' : targetCount).trim() !== '';
    var note = header.note == null ? '' : String(row[header.note] || '');

    months.push([month]);

    if (kind === '서브') {
      // 서브업무는 이월한다. 카운트와 메모를 건드리지 않는다.
      carryoverSubJobs++;
      counts.push([header.currentCount == null ? '' : row[header.currentCount]]);
      notes.push([note]);
      continue;
    }

    if (kind === '필수' || hasTarget) {
      counts.push([0]);
      notes.push([note.trim().indexOf('완료') === 0 ? '' : note]);
      resetJobs++;
    } else {
      counts.push([header.currentCount == null ? '' : row[header.currentCount]]);
      notes.push([note]);
    }
  }

  if (header.month != null) {
    sheet.getRange(2, header.month + 1, rowCount, 1).setValues(months);
  }
  if (header.currentCount != null) {
    sheet.getRange(2, header.currentCount + 1, rowCount, 1).setValues(counts);
  }
  if (header.note != null) {
    sheet.getRange(2, header.note + 1, rowCount, 1).setValues(notes);
  }

  return {
    resetJobs: resetJobs,
    carryoverSubJobs: carryoverSubJobs,
    updatedMonthRows: header.month != null ? rowCount : 0
  };
}

function formatMonthlyResetError_(err) {
  if (!err) return 'Unknown Apps Script error';
  // stack은 시트 구조와 내부 경로를 노출하므로 익명 API 응답에 넣지 않는다.
  if (err.message) return String(err.message);
  return String(err);
}


// ───────────────────────────────────────────────────────────────
// [D] addConsult — 동시 요청 중복 방지
// ───────────────────────────────────────────────────────────────
//
// 문제: 기존 addConsult는 전체 시트를 읽어 consultId를 찾은 뒤 appendRow 한다.
//       읽기와 쓰기 사이에 잠금이 없어, 같은 consultId 요청이 동시에 오면
//       둘 다 "없음"으로 판단해 중복 행이 생길 수 있다.
// 조치: 기존 addConsult 함수 전체를 아래로 교체한다.
//       기존 ensureConsultsSheet / writeConsultRow_ 는 그대로 사용한다.

function addConsult(body) {
  var clientId = body.clientId;
  var consultId = body.consultId || body.id;
  if (!clientId) return { success: false, error: 'clientId 필수' };
  if (!consultId) return { success: false, error: 'consultId 필수' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { success: false, error: '다른 저장 작업이 진행 중입니다. 다시 시도해 주세요.' };
  }

  try {
    var date = body.date || Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    var month = normalizeSheetMonth_(body.month || date);
    var rowObject = {
      consultId: consultId,
      clientId: clientId,
      date: date,
      month: month,
      channel: body.channel || '',
      nickname: body.nickname || '',
      content: body.content || '',
      createdAt: body.createdAt || new Date().toISOString(),
      status: body.status || 'active'
    };

    var sheet = ensureConsultsSheet();
    var values = sheet.getDataRange().getValues();
    var header = values[0].map(function (c) { return String(c || '').trim(); });
    var idCol = header.indexOf('consultId');
    var clientCol = header.indexOf('clientId');
    if (idCol < 0) return { success: false, error: 'Consults.consultId 컬럼 없음' };

    for (var i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(consultId)
        && (clientCol < 0 || String(values[i][clientCol]) === String(clientId))) {
        writeConsultRow_(sheet, header, i + 1, rowObject);
        return { success: true, action: 'updated', consultId: consultId };
      }
    }

    sheet.appendRow(header.map(function (col) {
      return rowObject[col] !== undefined ? rowObject[col] : '';
    }));
    return { success: true, action: 'inserted', consultId: consultId };
  } finally {
    lock.releaseLock();
  }
}


// ───────────────────────────────────────────────────────────────
// [E] 권장 — doPost 전역 JSON 오류 래퍼
// ───────────────────────────────────────────────────────────────
//
// 예외가 그대로 새면 Apps Script가 HTML 오류 페이지를 반환하고,
// 대시보드는 "응답이 JSON이 아닙니다"만 보게 되어 원인을 알 수 없다.
// doPost가 아직 try/catch로 감싸져 있지 않다면 아래 형태로 감싼다.
//
// function doPost(e) {
//   try {
//     var ss = SpreadsheetApp.openById(SHEET_ID);
//     var body = JSON.parse(e.postData.contents || '{}');
//     switch (body.action) {
//       // ... 기존 case들 ...
//       case 'monthlyReset':
//         return jsonRes(monthlyReset(ss, body));
//       default:
//         return jsonRes({ success: false, error: 'Unknown action: ' + body.action });
//     }
//   } catch (err) {
//     return jsonRes({ success: false, stage: 'doPost', error: String(err && err.message || err) });
//   }
// }


// ───────────────────────────────────────────────────────────────
// [F] addPost — 사용자가 선택한 발행일/예약일 보존
// ───────────────────────────────────────────────────────────────
//
// 증상: 대시보드가 미래 publishedAt을 보내도 기존 addPost가 서버의 오늘 날짜를
// 다시 만들어 저장하면 예약 발행일이 당일로 바뀐다.
//
// doPost의 기존 addPost case를 아래 한 줄로 교체한다.
//
//   case 'addPost':
//     return jsonRes(addPostWithSelectedDate_(ss, body));
//
// 기존 addPost case 안에서 appendRow/updateJobCount를 다시 실행하지 않는다.

function normalizePostDate_(value) {
  var raw = String(value || '').trim();
  var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day) {
      return raw;
    }
  }
  var timeZone = Session.getScriptTimeZone() || 'Asia/Seoul';
  return Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd');
}

function addPostWithSelectedDate_(ss, body) {
  body = body || {};
  if (!body.clientId || !body.jobId || !String(body.title || '').trim()) {
    return { success: false, error: 'clientId, jobId, title 필수' };
  }

  var publishedAt = normalizePostDate_(body.publishedAt);
  var month = publishedAt.slice(0, 7);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: 'busy' };

  try {
    var postSheet = ss.getSheetByName('PostLogs');
    if (!postSheet) return { success: false, error: 'PostLogs 시트 없음' };

    var header = postSheet.getRange(1, 1, 1, postSheet.getLastColumn()).getValues()[0];
    var required = ['logId', 'clientId', 'jobId', 'title', 'url', 'publishedAt', 'month', 'channel'];
    for (var i = 0; i < required.length; i++) {
      if (header.indexOf(required[i]) < 0) return { success: false, error: 'PostLogs 헤더 확인 필요: ' + required[i] };
    }

    var logId = String(body.logId || '').trim() || ('pl-' + new Date().getTime().toString(36));
    var logIdCol = header.indexOf('logId');
    var existing = postSheet.getDataRange().getValues();
    for (var rowIndex = 1; rowIndex < existing.length; rowIndex++) {
      if (String(existing[rowIndex][logIdCol]) === logId) {
        return { success: true, duplicate: true, logId: logId, publishedAt: publishedAt, month: month };
      }
    }

    var rowMap = {
      logId: logId,
      clientId: String(body.clientId),
      jobId: String(body.jobId),
      title: String(body.title).trim(),
      url: String(body.url || '').trim(),
      publishedAt: publishedAt,
      month: month,
      channel: String(body.channel || '홈페이지')
    };
    postSheet.appendRow(header.map(function(column) {
      return rowMap[column] !== undefined ? rowMap[column] : '';
    }));

    // 기존 동작을 보존한다. targetCount가 있는 카운트 업무만 1 증가한다.
    var jobSheet = ss.getSheetByName('MonthlyJobs');
    if (jobSheet) {
      var jobData = jobSheet.getDataRange().getValues();
      var jobHeader = jobData[0] || [];
      var jobIdCol = jobHeader.indexOf('jobId');
      var targetCol = jobHeader.indexOf('targetCount');
      var currentCol = jobHeader.indexOf('currentCount');
      if (jobIdCol >= 0 && targetCol >= 0 && currentCol >= 0) {
        for (var j = 1; j < jobData.length; j++) {
          if (String(jobData[j][jobIdCol]) !== String(body.jobId)) continue;
          var targetValue = jobData[j][targetCol];
          if (String(targetValue === null || targetValue === undefined ? '' : targetValue).trim() !== '') {
            jobSheet.getRange(j + 1, currentCol + 1).setValue(Number(jobData[j][currentCol] || 0) + 1);
          }
          break;
        }
      }
    }

    return { success: true, logId: logId, publishedAt: publishedAt, month: month };
  } finally {
    lock.releaseLock();
  }
}


// ═══════════════════════════════════════════════════════════════
//  [적용 절차]
//
//  0. 적용 전에 현재 편집기 코드 전체를 복사해 안전한 비공개 위치에 백업한다.
//
//  1. Script Properties에 DASHBOARD_API_KEY 등록.
//  2. doGet/doPost 시작부에 [0] 인증 게이트 추가.
//  3. getSummary에서 consults/reviewTargets 줄 삭제.
//  4. doGet/doPost에서 review monitor 및 reportPostLogs case 제거.
//  5. [C] monthlyReset 함수 교체 (없으면 추가)
//     [C-2] doPost에 case가 없으면 추가
//     [C-3] 보조 함수는 편집기에 없는 것만 추가
//  6. [D] addConsult 함수 교체.
//  7. [E] doPost JSON 오류 래퍼 적용.
//  8. [F] addPost case를 addPostWithSelectedDate_ 호출로 교체.
//
//  9. 저장 후 "배포 관리 > 기존 웹 앱 배포 > 편집 > 새 버전"으로 배포한다.
//     새 배포를 만들지 말고 기존 배포에 새 버전을 연결해야 URL이 유지된다.
//
//  [배포 후 확인 — 모두 GET, 데이터를 바꾸지 않는다]
//
//  a) 무키/오키 인증
//     <배포URL>?action=summary → {"success":false,"error":"unauthorized"}
//     잘못된 키도 동일하며 데이터가 없어야 한다.
//
//  b) 대시보드 상담 조회는 그대로인가
//     DASHBOARD_API_URL/DASHBOARD_API_KEY를 설정한 로컬 터미널에서
//     npm.cmd run report:consults:check -- --month YYYY-MM --client btskin,belrmon
//     인증된 상담 목록만 반환되어야 한다.
//
//  [월간 초기화 테스트는 복제 시트에서만]
//  monthlyReset은 실제로 행을 지운다. 운영 시트에서 시험하지 않는다.
//  Sheets를 사본으로 복제하고 SHEET_ID를 사본으로 바꾼 임시 배포에서 확인한다.
//  확인 항목: 동시에 두 번 호출하면 한 쪽이 stage:'lock'으로 거부되는가,
//            같은 month로 두 번 실행해도 결과가 같은가(멱등).
// ═══════════════════════════════════════════════════════════════
