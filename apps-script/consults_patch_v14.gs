// ═══════════════════════════════════════════════════════════════
//  APPS SCRIPT 패치 v14 — 상담내역 Sheets 동기화
//  적용 방법:
//  1. [1A] doGet switch(action)에 consultsList case 추가
//  2. [1B] doPost switch(body.action)에 addConsult/deleteConsult case 추가
//  3. [2] summary 반환 객체에 consults 줄 추가
//  4. [3] 함수들을 파일 하단에 붙여넣기
//
//  목적:
//  - 대시보드 상담 입력 방식은 유지한다.
//  - btskin/belrmon 상담내역을 localStorage뿐 아니라 Sheets에도 보존해
//    월말보고서 생성 스크립트가 사용자 수동 전달 없이 읽을 수 있게 한다.
// ═══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// [1A] doGet의 switch(action) 안에 추가할 case 블록
// ──────────────────────────────────────────────────────────────

  case 'consultsList':
    return jsonRes({
      success: true,
      data: {
        consults: getConsultsList(e.parameter.clientId, e.parameter.month)
      }
    });

// ──────────────────────────────────────────────────────────────
// [1B] doPost의 switch(body.action) 안에 추가할 case 블록
// ──────────────────────────────────────────────────────────────

  case 'addConsult':
    return jsonRes(addConsult(body));

  case 'deleteConsult':
    return jsonRes(deleteConsult(body));

// ──────────────────────────────────────────────────────────────
// [2] getSummary 반환 객체에 추가 (data: { ... } 안에 삽입)
// ──────────────────────────────────────────────────────────────

/*
  consults: getConsultsList(),  // v14 추가
*/

// ──────────────────────────────────────────────────────────────
// [3] 파일 하단에 추가할 함수들
// ──────────────────────────────────────────────────────────────

var CONSULTS_COLUMNS = ['consultId','clientId','date','month','channel','nickname','content','createdAt','status'];

function ensureConsultsSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Consults');
  if (!sheet) {
    sheet = ss.insertSheet('Consults');
  }

  var lastCol = sheet.getLastColumn();
  var header = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(col) {
    return String(col || '').trim();
  }) : [];

  var hasHeader = header.some(function(col) { return col; });
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, CONSULTS_COLUMNS.length).setValues([CONSULTS_COLUMNS]);
    return sheet;
  }

  var missing = CONSULTS_COLUMNS.filter(function(col) {
    return header.indexOf(col) < 0;
  });
  if (missing.length > 0) {
    sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
  }

  return sheet;
}

function getConsultsList(clientId, month) {
  var sheet = ensureConsultsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  var header = values[0].map(function(col) { return String(col || '').trim(); });
  var rows = values.slice(1);

  var cId = header.indexOf('consultId');
  var cClient = header.indexOf('clientId');
  var cDate = header.indexOf('date');
  var cMonth = header.indexOf('month');
  var cChannel = header.indexOf('channel');
  var cNickname = header.indexOf('nickname');
  var cContent = header.indexOf('content');
  var cCreated = header.indexOf('createdAt');
  var cStatus = header.indexOf('status');

  return rows.map(function(row) {
    var date = normalizeSheetDate_(cellValue_(row, cDate));
    var rowMonth = cellValue_(row, cMonth) || date.slice(0, 7);
    return {
      consultId: cellValue_(row, cId),
      id: cellValue_(row, cId),
      clientId: cellValue_(row, cClient),
      date: date,
      month: rowMonth,
      channel: cellValue_(row, cChannel),
      nickname: cellValue_(row, cNickname),
      content: cellValue_(row, cContent),
      createdAt: normalizeSheetDateTime_(cellValue_(row, cCreated)),
      status: cellValue_(row, cStatus) || 'active'
    };
  }).filter(function(item) {
    if (String(item.status || '').toLowerCase() === 'deleted') return false;
    if (clientId && String(item.clientId) !== String(clientId)) return false;
    if (month && String(item.month) !== String(month)) return false;
    return true;
  });
}

function addConsult(body) {
  var clientId = body.clientId;
  var consultId = body.consultId || body.id;
  if (!clientId) return { success: false, error: 'clientId 필수' };
  if (!consultId) return { success: false, error: 'consultId 필수' };

  var date = body.date || normalizeSheetDate_(new Date());
  var month = body.month || String(date).slice(0, 7);
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
  var header = values[0].map(function(col) { return String(col || '').trim(); });
  var idCol = header.indexOf('consultId');
  var clientCol = header.indexOf('clientId');
  if (idCol < 0) return { success: false, error: 'Consults.consultId 컬럼 없음' };

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(consultId) && (clientCol < 0 || String(values[i][clientCol]) === String(clientId))) {
      writeConsultRow_(sheet, header, i + 1, rowObject);
      return { success: true, action: 'updated', consultId: consultId };
    }
  }

  sheet.appendRow(header.map(function(col) { return rowObject[col] !== undefined ? rowObject[col] : ''; }));
  return { success: true, action: 'inserted', consultId: consultId };
}

function deleteConsult(body) {
  var clientId = body.clientId;
  var consultId = body.consultId || body.id;
  if (!consultId) return { success: false, error: 'consultId 필수' };

  var sheet = ensureConsultsSheet();
  var values = sheet.getDataRange().getValues();
  var header = values[0].map(function(col) { return String(col || '').trim(); });
  var idCol = header.indexOf('consultId');
  var clientCol = header.indexOf('clientId');
  var statusCol = header.indexOf('status');
  if (idCol < 0) return { success: false, error: 'Consults.consultId 컬럼 없음' };
  if (statusCol < 0) return { success: false, error: 'Consults.status 컬럼 없음' };

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(consultId) && (!clientId || clientCol < 0 || String(values[i][clientCol]) === String(clientId))) {
      sheet.getRange(i + 1, statusCol + 1).setValue('deleted');
      return { success: true, deleted: true, consultId: consultId };
    }
  }
  return { success: false, error: 'Consult not found: ' + consultId };
}

function writeConsultRow_(sheet, header, rowNumber, item) {
  var row = header.map(function(col) {
    if (col === 'status') return item.status || 'active';
    return item[col] !== undefined ? item[col] : '';
  });
  sheet.getRange(rowNumber, 1, 1, header.length).setValues([row]);
}

function cellValue_(row, index) {
  return index >= 0 ? row[index] : '';
}

function normalizeSheetDate_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
  }
  var text = String(value);
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[1] + '-' + match[2] + '-' + match[3];
  return text;
}

function normalizeSheetDateTime_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return String(value);
}
