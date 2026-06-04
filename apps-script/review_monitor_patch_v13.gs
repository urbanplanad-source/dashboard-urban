// ═══════════════════════════════════════════════════════════════
//  APPS SCRIPT 패치 v13 — 네이버플레이스 방문자 리뷰 모니터링
//  적용 방법:
//  [1] doGet switch 안에 추가 (reviewTargets case)
//  [2] doPost switch 안에 추가 (updateReviewTarget, addReviewLog case)
//  [3] getSummary 반환 객체에 reviewTargets 줄 추가
//  [4] 파일 하단에 함수 전체 붙여넣기
//
//  추가 시트: ReviewTargets, ReviewLogs (없으면 자동 생성)
//  비교 대상: 네이버플레이스 방문자 리뷰만 (블로그 리뷰 제외)
// ═══════════════════════════════════════════════════════════════


// ──────────────────────────────────────────────────────────────
// [1] doGet의 switch(e.parameter.action) 안에 추가
// ──────────────────────────────────────────────────────────────

/*
  case 'reviewTargets':
    return jsonRes({ success: true, data: getReviewTargetsList() });
*/


// ──────────────────────────────────────────────────────────────
// [2] doPost의 switch(body.action) 안에 추가
// ──────────────────────────────────────────────────────────────

  case 'updateReviewTarget':
    return jsonRes(updateReviewTarget(body));

  case 'addReviewLog':
    return jsonRes(addReviewLog(body));


// ──────────────────────────────────────────────────────────────
// [3] getSummary 반환 객체 data: { ... } 안에 추가
// ──────────────────────────────────────────────────────────────

/*
  reviewTargets: getReviewTargetsList(),   // ← v13 추가
*/


// ──────────────────────────────────────────────────────────────
// [4] 파일 하단에 붙여넣기
// ──────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════
//  v13 — REVIEW MONITORING (네이버플레이스 방문자 리뷰)
// ═══════════════════════════════════════════════════════════════

/**
 * ReviewTargets 시트 헬퍼 — 없으면 자동 생성
 * 컬럼: clientId | clientName | naverPlaceUrl | reviewType |
 *        savedVisitorReviewCount | recentReviewFingerprintsJson | isActive | memo
 */
function getOrCreateReviewTargetsSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('ReviewTargets');
  if (!sheet) {
    sheet = ss.insertSheet('ReviewTargets');
    sheet.appendRow([
      'clientId',
      'clientName',
      'naverPlaceUrl',
      'reviewType',
      'savedVisitorReviewCount',
      'recentReviewFingerprintsJson',
      'isActive',
      'memo'
    ]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(3, 280);  // naverPlaceUrl
    sheet.setColumnWidth(6, 300);  // recentReviewFingerprintsJson
  }
  return sheet;
}

/**
 * ReviewLogs 시트 헬퍼 — 없으면 자동 생성
 * 컬럼: logId | clientId | checkedAt | previousVisitorReviewCount |
 *        currentVisitorReviewCount | diff | status | detectedReviewCount |
 *        newReviewsSummary | newReviewsJson | telegramSent | errorMessage
 */
function getOrCreateReviewLogsSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('ReviewLogs');
  if (!sheet) {
    sheet = ss.insertSheet('ReviewLogs');
    sheet.appendRow([
      'logId',
      'clientId',
      'checkedAt',
      'previousVisitorReviewCount',
      'currentVisitorReviewCount',
      'diff',
      'status',
      'detectedReviewCount',
      'newReviewsSummary',
      'newReviewsJson',
      'telegramSent',
      'errorMessage'
    ]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(10, 400);  // newReviewsJson
    sheet.setColumnWidth(9, 300);   // newReviewsSummary
  }
  return sheet;
}

/**
 * getReviewTargetsList — isActive=TRUE 대상만 반환
 * GET ?action=reviewTargets 및 getSummary에서 호출
 */
function getReviewTargetsList() {
  var sheet = getOrCreateReviewTargetsSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i] !== undefined ? row[i] : ''; });
    // 타입 정규화
    obj.savedVisitorReviewCount = Number(obj.savedVisitorReviewCount) || 0;
    obj.isActive = (obj.isActive === true || obj.isActive === 'TRUE' || obj.isActive === 'true');
    obj.reviewType = obj.reviewType || 'visitor';
    obj.recentReviewFingerprintsJson = obj.recentReviewFingerprintsJson || '[]';
    return obj;
  }).filter(function(r) { return r.isActive; });
}

/**
 * updateReviewTarget — ReviewTargets의 리뷰 수 및 fingerprint 갱신
 * body: {
 *   clientId: string,
 *   savedVisitorReviewCount: number,
 *   recentReviewFingerprintsJson?: string   (선택)
 * }
 */
function updateReviewTarget(body) {
  var clientId = body.clientId;
  if (!clientId) return { success: false, error: 'clientId 필수' };
  if (body.savedVisitorReviewCount == null) return { success: false, error: 'savedVisitorReviewCount 필수' };

  var sheet = getOrCreateReviewTargetsSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var clientIdCol  = headers.indexOf('clientId');
  var countCol     = headers.indexOf('savedVisitorReviewCount');
  var fingerprintCol = headers.indexOf('recentReviewFingerprintsJson');

  if (clientIdCol < 0 || countCol < 0) return { success: false, error: '헤더 컬럼 확인 필요' };

  for (var i = 1; i < data.length; i++) {
    if (data[i][clientIdCol] === clientId) {
      var rowNum = i + 1;
      sheet.getRange(rowNum, countCol + 1).setValue(Number(body.savedVisitorReviewCount) || 0);
      if (body.recentReviewFingerprintsJson !== undefined && fingerprintCol >= 0) {
        sheet.getRange(rowNum, fingerprintCol + 1).setValue(body.recentReviewFingerprintsJson);
      }
      return { success: true, clientId: clientId, savedVisitorReviewCount: Number(body.savedVisitorReviewCount) || 0 };
    }
  }
  return { success: false, error: 'clientId not found in ReviewTargets: ' + clientId };
}

/**
 * addReviewLog — ReviewLogs에 확인 이력 저장
 * body: {
 *   clientId: string,
 *   previousVisitorReviewCount: number,
 *   currentVisitorReviewCount: number,
 *   diff: number,
 *   status: 'normal' | 'increased' | 'decreased' | 'increased_but_blocked' | 'check_failed',
 *   detectedReviewCount?: number,
 *   newReviewsSummary?: string,
 *   newReviewsJson?: string,
 *   telegramSent?: boolean,
 *   errorMessage?: string
 * }
 */
function addReviewLog(body) {
  var clientId = body.clientId;
  var status   = body.status;
  if (!clientId) return { success: false, error: 'clientId 필수' };
  if (!status)   return { success: false, error: 'status 필수' };

  var validStatuses = ['normal', 'increased', 'decreased', 'increased_but_blocked', 'check_failed'];
  if (validStatuses.indexOf(status) < 0) {
    return { success: false, error: 'status 값 오류: ' + status };
  }

  var sheet = getOrCreateReviewLogsSheet();
  var logId = 'rl-' + new Date().getTime().toString(36);

  var now  = new Date();
  var kst  = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  var checkedAt = Utilities.formatDate(kst, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss");

  sheet.appendRow([
    logId,
    clientId,
    checkedAt,
    Number(body.previousVisitorReviewCount) || 0,
    Number(body.currentVisitorReviewCount)  || 0,
    Number(body.diff) || 0,
    status,
    Number(body.detectedReviewCount)  || 0,
    body.newReviewsSummary  || '',
    body.newReviewsJson     || '[]',
    (body.telegramSent === true || body.telegramSent === 'true') ? true : false,
    body.errorMessage       || ''
  ]);

  return { success: true, logId: logId, clientId: clientId, status: status };
}


// ──────────────────────────────────────────────────────────────
// [5] 시트 헤더 참조 업데이트 (v13 추가분)
// ──────────────────────────────────────────────────────────────
// ReviewTargets 헤더: clientId | clientName | naverPlaceUrl | reviewType |
//                     savedVisitorReviewCount | recentReviewFingerprintsJson | isActive | memo
//
// ReviewLogs 헤더:    logId | clientId | checkedAt | previousVisitorReviewCount |
//                     currentVisitorReviewCount | diff | status | detectedReviewCount |
//                     newReviewsSummary | newReviewsJson | telegramSent | errorMessage
