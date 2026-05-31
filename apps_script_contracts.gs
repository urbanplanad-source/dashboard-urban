// ═══════════════════════════════════════════════════════════════
//  APPS SCRIPT 패치 — 수익 관리 (Contracts 시트)
//  적용 방법:
//  1. doGet의 summary 처리 부분에 contracts 데이터 추가 (아래 [1] 참조)
//  2. doPost의 switch(body.action) 안에 case 블록 추가 (아래 [2] 참조)
//  3. 함수들을 파일 하단에 붙여넣기 (아래 [3] 참조)
//  4. Spreadsheet에 'Contracts' 시트 생성 후 1행에 헤더 입력 (아래 [4] 참조)
// ═══════════════════════════════════════════════════════════════


// ──────────────────────────────────────────────────────────────
// [1] doGet의 summary 반환 JSON에 contracts 추가
//     기존 코드에서 data: { clients: ..., logs: ..., ... } 부분에 아래 한 줄 추가
// ──────────────────────────────────────────────────────────────

//  contracts: getContractsList(ss),

// 예시 — 기존 코드:
//   return jsonRes({ success: true, data: {
//     clients: ...,
//     monthlyJobs: ...,
//     postLogs: ...,
//     commonTasks: ...
//   }});
//
// 수정 후:
//   return jsonRes({ success: true, data: {
//     clients: ...,
//     monthlyJobs: ...,
//     postLogs: ...,
//     commonTasks: ...,
//     contracts: getContractsList(ss),   // ← 이 줄 추가
//   }});


// ──────────────────────────────────────────────────────────────
// [2] doPost의 switch(body.action) 안에 추가할 case 블록
// ──────────────────────────────────────────────────────────────

  case 'upsertContract':
    return jsonRes(upsertContract(ss, body));


// ──────────────────────────────────────────────────────────────
// [3] 파일 하단에 추가할 함수들
// ──────────────────────────────────────────────────────────────

/**
 * getContractsList — Contracts 시트 전체 조회
 * 반환: [ { clientId, monthlyFee, contractStart, contractRenew, paymentStatus, memo }, ... ]
 */
function getContractsList(ss) {
  var sheet = ss.getSheetByName('Contracts');
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var header = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    header.forEach(function(col, i) { obj[col] = row[i] !== undefined ? String(row[i]) : ''; });
    obj.monthlyFee = Number(obj.monthlyFee) || 0;
    return obj;
  });
}

/**
 * upsertContract — Contracts 시트에서 clientId 기준으로 행 추가/업데이트
 * body: { clientId, monthlyFee, contractStart, contractRenew, paymentStatus, memo }
 *
 * - clientId가 이미 있으면 UPDATE
 * - 없으면 INSERT (새 행 추가)
 */
function upsertContract(ss, body) {
  var clientId = body.clientId;
  if (!clientId) return { success: false, error: 'clientId 필수' };

  var sheet = ss.getSheetByName('Contracts');
  if (!sheet) return { success: false, error: 'Contracts 시트 없음 — 시트를 먼저 생성하세요' };

  var data   = sheet.getDataRange().getValues();
  var header = data[0];

  var clientIdCol     = header.indexOf('clientId');
  var monthlyFeeCol   = header.indexOf('monthlyFee');
  var contractStartCol= header.indexOf('contractStart');
  var contractRenewCol= header.indexOf('contractRenew');
  var payStatusCol    = header.indexOf('paymentStatus');
  var memoCol         = header.indexOf('memo');

  if (clientIdCol < 0) return { success: false, error: 'clientId 컬럼 없음 — 헤더를 확인하세요' };

  // 기존 행 탐색
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][clientIdCol]) === String(clientId)) {
      // UPDATE
      if (monthlyFeeCol    >= 0 && body.monthlyFee    !== undefined) sheet.getRange(i+1, monthlyFeeCol+1).setValue(Number(body.monthlyFee)||0);
      if (contractStartCol >= 0 && body.contractStart !== undefined) sheet.getRange(i+1, contractStartCol+1).setValue(body.contractStart);
      if (contractRenewCol >= 0 && body.contractRenew !== undefined) sheet.getRange(i+1, contractRenewCol+1).setValue(body.contractRenew);
      if (payStatusCol     >= 0 && body.paymentStatus !== undefined) sheet.getRange(i+1, payStatusCol+1).setValue(body.paymentStatus);
      if (memoCol          >= 0 && body.memo          !== undefined) sheet.getRange(i+1, memoCol+1).setValue(body.memo);
      return { success: true, action: 'updated', clientId: clientId };
    }
  }

  // INSERT — 새 행 추가
  var newRow = header.map(function(col) {
    if (col === 'clientId')     return clientId;
    if (col === 'monthlyFee')   return Number(body.monthlyFee) || 0;
    if (col === 'contractStart')return body.contractStart || '';
    if (col === 'contractRenew')return body.contractRenew || '';
    if (col === 'paymentStatus')return body.paymentStatus || '정상';
    if (col === 'memo')         return body.memo || '';
    return '';
  });
  sheet.appendRow(newRow);
  return { success: true, action: 'inserted', clientId: clientId };
}


// ──────────────────────────────────────────────────────────────
// [4] Contracts 시트 헤더 (1행에 그대로 입력)
// ──────────────────────────────────────────────────────────────
//
//  clientId | monthlyFee | contractStart | contractRenew | paymentStatus | memo
//
//  - clientId      : 거래처 ID (btskin, belrmon 등)
//  - monthlyFee    : 월 계약금액 (숫자, 예: 500000)
//  - contractStart : 계약 시작일 (YYYY-MM-DD)
//  - contractRenew : 계약 갱신일 (YYYY-MM-DD)
//  - paymentStatus : 결제 상태 (정상 / 미수금 / 보류)
//  - memo          : 메모 (자유 입력)
//
// ──────────────────────────────────────────────────────────────
