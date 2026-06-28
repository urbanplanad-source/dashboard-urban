// ═══════════════════════════════════════════════════════════════
//  APPS SCRIPT 패치 v15 — 거래처 콘텐츠 브리프 / 시술 가격표
//  적용 방법:
//  1. [1A] doGet switch(action)에 clientBriefs/clientBrief case 추가
//  2. [1B] doPost switch(body.action)에 upsertClientBrief case 추가
//  3. [2] summary 반환 객체에 clientBriefs 줄 추가
//  4. [3] 함수들을 파일 하단에 붙여넣기
//
//  목적:
//  - 병원 특징, 원장님 스타일, 대표 시술, 글 작성 지침, 의료광고 주의사항,
//    시술 가격표를 clientId별로 보관한다.
//  - Codex/외부 작성 에이전트가 콘텐츠 생성 전 GET clientBrief를 조회해
//    글 보관함 addDraft 전에 참고할 수 있게 한다.
// ═══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// [1A] doGet의 switch(action) 안에 추가할 case 블록
// ──────────────────────────────────────────────────────────────

  case 'clientBriefs':
    return jsonRes({ success: true, data: getClientBriefsList() });

  case 'clientBrief':
    return jsonRes(getClientBrief(e.parameter.clientId));

// ──────────────────────────────────────────────────────────────
// [1B] doPost의 switch(body.action) 안에 추가할 case 블록
// ──────────────────────────────────────────────────────────────

  case 'upsertClientBrief':
    return jsonRes(upsertClientBrief(body));

// ──────────────────────────────────────────────────────────────
// [2] getSummary 반환 객체에 추가 (data: { ... } 안에 삽입)
// ──────────────────────────────────────────────────────────────

/*
  clientBriefs: getClientBriefsList(),  // v15 추가
*/

// ──────────────────────────────────────────────────────────────
// [3] 파일 하단에 추가할 함수들
// ──────────────────────────────────────────────────────────────

var CLIENT_BRIEF_HEADERS = [
  'clientId',
  'brandSummary',
  'clinicFeatures',
  'doctorStyle',
  'targetPatients',
  'representativeTreatments',
  'procedureNotes',
  'pricingMemo',
  'procedurePricesJson',
  'writingGuidelines',
  'toneAndManner',
  'requiredPhrases',
  'forbiddenPhrases',
  'medicalAdCautions',
  'contentAngles',
  'keywords',
  'faq',
  'localContext',
  'referenceLinks',
  'internalNotes',
  'updatedAt'
];

function ensureClientBriefsSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('ClientBriefs');
  if (!sheet) {
    sheet = ss.insertSheet('ClientBriefs');
    sheet.appendRow(CLIENT_BRIEF_HEADERS);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 240);
    sheet.setColumnWidth(9, 420);
    for (var w = 3; w <= CLIENT_BRIEF_HEADERS.length; w++) {
      if (w !== 9) sheet.setColumnWidth(w, 280);
    }
    return sheet;
  }
  ensureClientBriefHeaders_(sheet);
  return sheet;
}

function ensureClientBriefHeaders_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (!header[0]) {
    sheet.getRange(1, 1, 1, CLIENT_BRIEF_HEADERS.length).setValues([CLIENT_BRIEF_HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }
  CLIENT_BRIEF_HEADERS.forEach(function(name) {
    if (header.indexOf(name) < 0) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(name);
      header.push(name);
    }
  });
  sheet.setFrozenRows(1);
}

function parseClientProcedurePrices_(value) {
  if (!value) return [];
  if (Object.prototype.toString.call(value) === '[object Array]') return value;
  try {
    var parsed = JSON.parse(String(value));
    return Object.prototype.toString.call(parsed) === '[object Array]' ? parsed : [];
  } catch (e) {
    return [];
  }
}

function normalizeClientBriefDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
  }
  var text = String(value);
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[1] + '-' + match[2] + '-' + match[3];
  return text;
}

function clientBriefRowToObject_(header, row) {
  var obj = {};
  header.forEach(function(col, index) {
    obj[col] = row[index] !== undefined ? row[index] : '';
  });
  obj.clientId = String(obj.clientId || '');
  obj.procedurePrices = parseClientProcedurePrices_(obj.procedurePricesJson);
  obj.updatedAt = normalizeClientBriefDate_(obj.updatedAt);
  return obj;
}

function getClientBriefsList() {
  var sheet = ensureClientBriefsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  var header = values[0];
  return values.slice(1)
    .map(function(row) { return clientBriefRowToObject_(header, row); })
    .filter(function(item) { return item.clientId; });
}

function getClientBrief(clientId) {
  if (!clientId) return { success: false, error: 'clientId 필수' };
  var list = getClientBriefsList();
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].clientId) === String(clientId)) {
      return { success: true, data: list[i] };
    }
  }
  return { success: true, data: { clientId: clientId, procedurePrices: [] } };
}

function upsertClientBrief(body) {
  var clientId = body.clientId;
  if (!clientId) return { success: false, error: 'clientId 필수' };

  var sheet = ensureClientBriefsSheet();
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var clientIdCol = header.indexOf('clientId');
  if (clientIdCol < 0) return { success: false, error: 'clientId 컬럼 없음' };

  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var payload = {};
  CLIENT_BRIEF_HEADERS.forEach(function(col) {
    if (col === 'clientId') {
      payload[col] = clientId;
    } else if (col === 'procedurePricesJson') {
      payload[col] = body.procedurePricesJson || JSON.stringify(body.procedurePrices || []);
    } else if (col === 'updatedAt') {
      payload[col] = body.updatedAt || now;
    } else {
      payload[col] = body[col] !== undefined ? body[col] : '';
    }
  });

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][clientIdCol]) === String(clientId)) {
      CLIENT_BRIEF_HEADERS.forEach(function(col) {
        var colIndex = header.indexOf(col);
        if (colIndex >= 0) sheet.getRange(i + 1, colIndex + 1).setValue(payload[col]);
      });
      return { success: true, action: 'updated', clientId: clientId, updatedAt: payload.updatedAt };
    }
  }

  var row = header.map(function(col) {
    return payload[col] !== undefined ? payload[col] : '';
  });
  sheet.appendRow(row);
  return { success: true, action: 'inserted', clientId: clientId, updatedAt: payload.updatedAt };
}

// ──────────────────────────────────────────────────────────────
// [4] ClientBriefs 시트 헤더 (자동 생성되지만 수동 생성 시 1행에 입력)
// ──────────────────────────────────────────────────────────────
//
// clientId | brandSummary | clinicFeatures | doctorStyle | targetPatients |
// representativeTreatments | procedureNotes | pricingMemo | procedurePricesJson |
// writingGuidelines | toneAndManner | requiredPhrases | forbiddenPhrases |
// medicalAdCautions | contentAngles | keywords | faq | localContext |
// referenceLinks | internalNotes | updatedAt
//
// procedurePricesJson 예:
// [{"category":"피부","name":"리프팅","regularPrice":"300,000원","eventPrice":"","sessionInfo":"1회","notes":"가격 공개 전 확인"}]
//
// 계정/비밀번호, 내부 계약조건, 노출되면 안 되는 민감 정보는 이 시트에 넣지 않는다.
