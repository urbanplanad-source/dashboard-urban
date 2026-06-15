// ═══════════════════════════════════════════════════════════════
//  APPS SCRIPT 패치 v12
//  적용 방법:
//  1. [1] switch case 블록 → 기존 doPost switch 안에 붙여넣기
//  2. [2] getSummary 수정 → data 반환 객체에 expenses/drafts 줄 추가
//  3. [3] 함수들 → 파일 하단에 전체 붙여넣기
//  v11: Expenses 기능 추가
//  v12: Drafts (글 보관함) 기능 추가
//  v12.1: Drafts 경량 목록/단일 본문 조회 추가
// ═══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// [1A] doGet의 switch(action) 안에 추가할 case 블록
// ──────────────────────────────────────────────────────────────

  // ── v12.1: Drafts lightweight reads ──
  case 'draftsList':
    return jsonRes({ success: true, data: getDraftsListLight() });

  case 'draftDetail':
    return jsonRes(getDraftDetail(e.parameter.draftId));

// ──────────────────────────────────────────────────────────────
// [1B] doPost의 switch(body.action) 안에 추가할 case 블록
// ──────────────────────────────────────────────────────────────

  case 'deleteLog':
    return jsonRes(deleteLogById(ss, body));

  case 'deletePost':
    return jsonRes(deletePostById(ss, body));

  // ── v11: Expenses ──
  case 'addExpense':
    return jsonRes(addExpense(body));

  case 'updateExpense':
    return jsonRes(updateExpense(body));

  case 'deleteExpense':
    return jsonRes(deleteExpense(body));

  // ── v12: Drafts (글 보관함) ──
  case 'addDraft':
    return jsonRes(addDraft(body));

  case 'updateDraft':
    return jsonRes(updateDraft(body));

  case 'deleteDraft':
    return jsonRes(deleteDraft(body));

  case 'updatePost':
    return jsonRes(updatePost(ss, body));

  case 'updateJobTarget':
    return jsonRes(updateJobTarget(ss, body));

  case 'commonTaskUpdate':
    return jsonRes(commonTaskUpdate(ss, body));

  case 'addJob':
    return jsonRes(addJobToSheet(ss, body));

  case 'addClient':
    return jsonRes(addClientToSheet(ss, body));

  case 'updateClient':
    return jsonRes(updateClientInSheet(ss, body));

  case 'deleteClient':
    return jsonRes(deleteClientFromSheet(ss, body));


// ──────────────────────────────────────────────────────────────
// [2] getSummary 반환 객체에 추가 (data: { ... } 안에 삽입)
// ──────────────────────────────────────────────────────────────

/*
  expenses: getExpensesList(),    // ← v11 추가
  drafts:   getDraftsList(),      // ← v12 추가
*/

/*
  // v12.1 권장: doGet(e)의 summary 처리에서 e.parameter.draftMode를 읽을 수 있으면
  // 목록/대시보드 동기화용으로 본문 없는 초안 목록을 반환한다.
  var draftMode = (e.parameter && e.parameter.draftMode) || '';
  drafts: draftMode === 'light' ? getDraftsListLight() : getDraftsList(),
*/

// ──────────────────────────────────────────────────────────────
// [3] 파일 하단에 추가할 함수들
// ──────────────────────────────────────────────────────────────

/**
 * deleteLog — UpdateLogs 시트에서 logId로 행 삭제
 * body: { logId: 'l-xxxx' }
 */
function deleteLogById(ss, body) {
  var logId = body.logId;
  if (!logId) return { success: false, error: 'logId 필수' };

  var sheet = ss.getSheetByName('UpdateLogs');
  if (!sheet) return { success: false, error: 'UpdateLogs 시트 없음' };

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === logId) {
      sheet.deleteRow(i + 1);
      return { success: true, deleted: true, logId: logId };
    }
  }
  return { success: false, error: 'Log not found: ' + logId };
}

/**
 * deletePost — PostLogs 시트에서 logId로 행 삭제
 * body: { logId: 'pl-xxxx' }
 */
function deletePostById(ss, body) {
  var logId = body.logId;
  if (!logId) return { success: false, error: 'logId 필수' };

  var sheet = ss.getSheetByName('PostLogs');
  if (!sheet) return { success: false, error: 'PostLogs 시트 없음' };

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === logId) {
      sheet.deleteRow(i + 1);
      return { success: true, deleted: true, logId: logId };
    }
  }
  return { success: false, error: 'Post log not found: ' + logId };
}

/**
 * updateJobTarget — MonthlyJobs 시트에서 targetCount 수정
 * body: { jobId: 'mj-xxx', targetCount: 12 }
 */
function updateJobTarget(ss, body) {
  var jobId = body.jobId;
  var targetCount = parseInt(body.targetCount, 10);
  if (!jobId) return { success: false, error: 'jobId 필수' };
  if (isNaN(targetCount)) return { success: false, error: 'targetCount must be a number' };

  var sheet = ss.getSheetByName('MonthlyJobs');
  if (!sheet) return { success: false, error: 'MonthlyJobs 시트 없음' };

  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var jobIdCol  = header.indexOf('jobId');
  var targetCol = header.indexOf('targetCount');
  if (jobIdCol < 0 || targetCol < 0) return { success: false, error: '헤더 컬럼 확인 필요' };

  for (var i = 1; i < data.length; i++) {
    if (data[i][jobIdCol] === jobId) {
      sheet.getRange(i + 1, targetCol + 1).setValue(targetCount);
      return { success: true, jobId: jobId, targetCount: targetCount };
    }
  }
  return { success: false, error: 'Job not found: ' + jobId };
}

/**
 * commonTaskUpdate — CommonTasks 시트에서 title 수정
 * body: { taskId: 'ct-xxx', title: '새 제목' }
 */
function commonTaskUpdate(ss, body) {
  var taskId = body.taskId;
  var title  = body.title;
  if (!taskId || !title) return { success: false, error: 'taskId, title 필수' };

  var sheet = ss.getSheetByName('CommonTasks');
  if (!sheet) return { success: false, error: 'CommonTasks 시트 없음' };

  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var taskIdCol = header.indexOf('taskId');
  var titleCol  = header.indexOf('title');
  if (taskIdCol < 0 || titleCol < 0) return { success: false, error: '헤더 컬럼 확인 필요' };

  for (var i = 1; i < data.length; i++) {
    if (data[i][taskIdCol] === taskId) {
      sheet.getRange(i + 1, titleCol + 1).setValue(title);
      return { success: true, taskId: taskId, title: title };
    }
  }
  return { success: false, error: 'Task not found: ' + taskId };
}

/**
 * addClientToSheet — Clients 시트에 새 거래처 추가
 * body: { clientId, clientName, specialty, mainContact, priorityLevel, reportFile, lastUpdated }
 * Clients 헤더: clientId | clientName | specialty | mainContact | priorityLevel | reportFile | lastUpdated
 */
function addClientToSheet(ss, body) {
  if (!body.clientId || !body.clientName) return { success: false, error: 'clientId, clientName 필수' };

  var sheet = ss.getSheetByName('Clients');
  if (!sheet) return { success: false, error: 'Clients 시트 없음' };

  // 중복 체크 — 이미 존재하면 업데이트로 처리
  var rows = sheet.getDataRange().getValues();
  var header = rows[0];
  var col = header.indexOf('clientId');
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][col] === body.clientId) {
      // 이미 존재 → 업데이트
      return updateClientInSheet(ss, body);
    }
  }

  var row = header.map(function(h) { return body[h] !== undefined ? body[h] : ''; });
  sheet.appendRow(row);
  return { success: true, clientId: body.clientId, clientName: body.clientName };
}

/**
 * updateClientInSheet — Clients 시트에서 거래처 정보 수정
 * body: { clientId, clientName?, specialty?, mainContact?, priorityLevel?, reportFile?, lastUpdated? }
 * 전달된 필드만 선택적으로 업데이트 (partial update)
 */
function updateClientInSheet(ss, body) {
  var clientId = body.clientId;
  if (!clientId) return { success: false, error: 'clientId 필수' };

  var sheet = ss.getSheetByName('Clients');
  if (!sheet) return { success: false, error: 'Clients 시트 없음' };

  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var clientIdCol = header.indexOf('clientId');
  if (clientIdCol < 0) return { success: false, error: 'clientId 컬럼 없음' };

  for (var i = 1; i < data.length; i++) {
    if (data[i][clientIdCol] === clientId) {
      header.forEach(function(col, idx) {
        if (col !== 'clientId' && body[col] !== undefined) {
          sheet.getRange(i + 1, idx + 1).setValue(body[col]);
        }
      });
      return { success: true, clientId: clientId };
    }
  }
  return { success: false, error: 'Client not found: ' + clientId };
}

/**
 * deleteClientFromSheet — Clients 시트에서 거래처 삭제
 *                          MonthlyJobs / UpdateLogs / PostLogs에서 해당 clientId 행도 삭제
 * body: { clientId: 'cl-xxx' }
 */
function deleteClientFromSheet(ss, body) {
  var clientId = body.clientId;
  if (!clientId) return { success: false, error: 'clientId 필수' };

  var deleted = 0;

  var clientSheet = ss.getSheetByName('Clients');
  if (clientSheet) {
    var rows = clientSheet.getDataRange().getValues();
    var col = rows[0].indexOf('clientId');
    if (col >= 0) {
      for (var i = rows.length - 1; i >= 1; i--) {
        if (rows[i][col] === clientId) { clientSheet.deleteRow(i + 1); deleted++; }
      }
    }
  }

  function cleanSheet(sheetName) {
    var s = ss.getSheetByName(sheetName);
    if (!s) return;
    var d = s.getDataRange().getValues();
    var c = d[0].indexOf('clientId');
    if (c < 0) return;
    for (var i = d.length - 1; i >= 1; i--) {
      if (d[i][c] === clientId) s.deleteRow(i + 1);
    }
  }
  cleanSheet('MonthlyJobs');
  cleanSheet('UpdateLogs');
  cleanSheet('PostLogs');

  if (deleted === 0) return { success: false, error: 'Client not found: ' + clientId };
  return { success: true, deleted: true, clientId: clientId };
}

/**
 * addJobToSheet — MonthlyJobs 시트에 필수/순위업무 추가
 * body: { clientId, title, kind ('필수'|'순위'), targetCount, unit }
 */
function addJobToSheet(ss, body) {
  if (!body.clientId || !body.title || !body.kind) return { success: false, error: 'clientId, title, kind 필수' };

  var sheet = ss.getSheetByName('MonthlyJobs');
  if (!sheet) return { success: false, error: 'MonthlyJobs 시트 없음' };

  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var jobId  = 'mj-' + new Date().getTime().toString(36);
  var month  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');

  var rowMap = {
    jobId:        jobId,
    clientId:     body.clientId,
    title:        body.title,
    kind:         body.kind,
    targetCount:  body.targetCount != null ? body.targetCount : '',
    currentCount: body.targetCount != null ? 0 : '',
    unit:         body.unit || '',
    note:         '',
    dueDate:      '',
    month:        month,
  };
  var row = header.map(function(col) { return rowMap[col] !== undefined ? rowMap[col] : ''; });
  sheet.appendRow(row);
  return { success: true, jobId: jobId };
}

/**
 * updatePost — PostLogs 시트에서 title, url 수정
 * body: { logId: 'pl-xxx', title: '새 제목', url: '새 URL' }
 */
function updatePost(ss, body) {
  var logId = body.logId;
  if (!logId) return { success: false, error: 'logId 필수' };

  var sheet = ss.getSheetByName('PostLogs');
  if (!sheet) return { success: false, error: 'PostLogs 시트 없음' };

  var data   = sheet.getDataRange().getValues();
  var header = data[0];
  var logIdCol = header.indexOf('logId');
  var titleCol = header.indexOf('title');
  var urlCol   = header.indexOf('url');
  if (logIdCol < 0 || titleCol < 0) return { success: false, error: '헤더 컬럼 확인 필요' };

  for (var i = 1; i < data.length; i++) {
    if (data[i][logIdCol] === logId) {
      if (body.title !== undefined && titleCol >= 0) sheet.getRange(i+1, titleCol+1).setValue(body.title);
      if (body.url   !== undefined && urlCol   >= 0) sheet.getRange(i+1, urlCol+1).setValue(body.url);
      return { success: true, logId: logId };
    }
  }
  return { success: false, error: 'Post not found: ' + logId };
}


// ──────────────────────────────────────────────────────────────
// [4] 시트 헤더 참조 (Sheets 열 순서)
// ──────────────────────────────────────────────────────────────
// Clients    헤더: clientId | clientName | specialty | mainContact | priorityLevel | reportFile | lastUpdated
// MonthlyJobs헤더: jobId | clientId | title | kind | targetCount | currentCount | note | dueDate | month
// PostLogs   헤더: logId | clientId | jobId | title | url | publishedAt | month | channel
// UpdateLogs 헤더: logId | clientId | createdAt | message
// CommonTasks헤더: taskId | title | done | createdAt
// Expenses   헤더: expenseId | date | category | description | amount | type | clientId | payMethod | isRecurring | memo
// Drafts     헤더: draftId | clientId | channel | title | content | memo | createdAt | status


// ═══════════════════════════════════════════════════════════════
//  v11 — EXPENSES (비용 관리)
// ═══════════════════════════════════════════════════════════════

/**
 * Expenses 시트 헬퍼 — 없으면 자동 생성
 */
function getOrCreateExpensesSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Expenses');
  if (!sheet) {
    sheet = ss.insertSheet('Expenses');
    sheet.appendRow(['expenseId','date','category','description','amount','type','clientId','payMethod','isRecurring','memo']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * getExpensesList — 전체 비용 목록 반환 (getSummary에서 호출)
 */
function getExpensesList() {
  var sheet = getOrCreateExpensesSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i] !== undefined ? row[i] : ''; });
    obj.amount = Number(obj.amount) || 0;
    obj.isRecurring = (obj.isRecurring === true || obj.isRecurring === 'TRUE' || obj.isRecurring === 'true');
    return obj;
  });
}

/**
 * addExpense — 비용 추가
 * body: { date, category, description, amount, type, clientId, payMethod, isRecurring, memo }
 */
function addExpense(body) {
  var sheet = getOrCreateExpensesSheet();
  var expenseId = 'exp-' + new Date().getTime().toString(36);
  sheet.appendRow([
    expenseId,
    body.date        || '',
    body.category    || '',
    body.description || '',
    Number(body.amount) || 0,
    body.type        || '변동비',
    body.clientId    || '',
    body.payMethod   || '카드',
    body.isRecurring === true || body.isRecurring === 'true' ? true : false,
    body.memo        || ''
  ]);
  return { success: true, expenseId: expenseId };
}

/**
 * updateExpense — 비용 수정 (전달된 필드만)
 * body: { expenseId, date?, category?, description?, amount?, type?, clientId?, payMethod?, isRecurring?, memo? }
 */
function updateExpense(body) {
  var expenseId = body.expenseId;
  if (!expenseId) return { success: false, error: 'expenseId 필수' };

  var sheet = getOrCreateExpensesSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('expenseId');

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === expenseId) {
      var rowNum = i + 1;
      var updatable = ['date','category','description','amount','type','clientId','payMethod','isRecurring','memo'];
      updatable.forEach(function(field) {
        if (body[field] !== undefined) {
          var col = headers.indexOf(field);
          if (col >= 0) {
            var val = field === 'amount' ? (Number(body[field]) || 0)
                    : field === 'isRecurring' ? (body[field] === true || body[field] === 'true')
                    : body[field];
            sheet.getRange(rowNum, col + 1).setValue(val);
          }
        }
      });
      return { success: true, expenseId: expenseId };
    }
  }
  return { success: false, error: 'expenseId not found: ' + expenseId };
}

/**
 * deleteExpense — 비용 삭제
 * body: { expenseId }
 */
function deleteExpense(body) {
  var expenseId = body.expenseId;
  if (!expenseId) return { success: false, error: 'expenseId 필수' };

  var sheet = getOrCreateExpensesSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('expenseId');

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === expenseId) {
      sheet.deleteRow(i + 1);
      return { success: true, expenseId: expenseId };
    }
  }
  return { success: false, error: 'expenseId not found: ' + expenseId };
}


// ═══════════════════════════════════════════════════════════════
//  v12 — DRAFTS (글 보관함)
// ═══════════════════════════════════════════════════════════════

/**
 * Drafts 시트 헬퍼 — 없으면 자동 생성
 */
function getOrCreateDraftsSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Drafts');
  if (!sheet) {
    sheet = ss.insertSheet('Drafts');
    sheet.appendRow(['draftId','clientId','channel','title','content','memo','createdAt','status']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(4, 200);  // title 열 너비
    sheet.setColumnWidth(5, 400);  // content 열 너비
  }
  return sheet;
}

/**
 * getDraftsList — 전체 초안 목록 반환 (getSummary에서 호출)
 */
function getDraftsList() {
  var sheet = getOrCreateDraftsSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i] !== undefined ? row[i] : ''; });
    obj.createdAt = formatDraftDate_(obj.createdAt);
    return obj;
  });
}

/**
 * formatDraftDate_ — Drafts.createdAt을 KST YYYY-MM-DD 문자열로 고정한다.
 * Sheets가 날짜 셀을 Date 객체나 UTC ISO 문자열로 돌려줘도 외부 도구에는 날짜만 노출한다.
 */
function formatDraftDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
  }
  var text = String(value).trim();
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[1] + '-' + match[2] + '-' + match[3];
  var parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'Asia/Seoul', 'yyyy-MM-dd');
  }
  return text;
}

/**
 * getDraftsListLight — 글 보관함 목록용 경량 초안 목록 반환
 * content 본문 열은 읽지 않는다. 본문은 draftDetail에서 draftId별로 조회한다.
 */
function getDraftsListLight() {
  var sheet = getOrCreateDraftsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var numRows = lastRow - 1;
  var left = sheet.getRange(2, 1, numRows, 4).getValues();  // draftId, clientId, channel, title
  var right = sheet.getRange(2, 6, numRows, 3).getValues(); // memo, createdAt, status

  return left.map(function(row, i) {
    return {
      draftId: row[0] || '',
      clientId: row[1] || '',
      channel: row[2] || '',
      title: row[3] || '',
      memo: right[i][0] || '',
      createdAt: formatDraftDate_(right[i][1]),
      status: right[i][2] || '',
      preview: '',
      contentLength: null
    };
  });
}

/**
 * getDraftDetail — draftId로 단일 초안 본문 조회
 */
function getDraftDetail(draftId) {
  if (!draftId) return { success: false, error: 'draftId 필수' };

  var sheet = getOrCreateDraftsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: 'Drafts 시트가 비어 있음' };

  var numRows = lastRow - 1;
  var ids = sheet.getRange(2, 1, numRows, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === draftId) {
      var row = sheet.getRange(i + 2, 1, 1, 8).getValues()[0];
      var content = row[4] || '';
      return {
        success: true,
        data: {
          draftId: row[0] || '',
          clientId: row[1] || '',
          channel: row[2] || '',
          title: row[3] || '',
          content: content,
          memo: row[5] || '',
          createdAt: formatDraftDate_(row[6]),
          status: row[7] || '',
          preview: String(content).slice(0, 120),
          contentLength: String(content).length
        }
      };
    }
  }

  return { success: false, error: 'draftId not found: ' + draftId };
}

/**
 * addDraft — 초안 저장
 * body: { clientId, channel, title, content, memo }
 */
function addDraft(body) {
  var sheet = getOrCreateDraftsSheet();
  var draftId = 'dr-' + new Date().getTime().toString(36);
  var now = new Date();
  var kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  var createdAt = Utilities.formatDate(kst, 'Asia/Seoul', 'yyyy-MM-dd');

  sheet.appendRow([
    draftId,
    body.clientId || '',
    body.channel  || '',
    body.title    || '',
    body.content  || '',
    body.memo     || '',
    createdAt,
    'draft'
  ]);
  return { success: true, draftId: draftId };
}

/**
 * updateDraft — 초안 수정 (전달된 필드만)
 * body: { draftId, clientId?, channel?, title?, content?, memo?, status? }
 */
function updateDraft(body) {
  var draftId = body.draftId;
  if (!draftId) return { success: false, error: 'draftId 필수' };

  var sheet = getOrCreateDraftsSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('draftId');

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === draftId) {
      var rowNum = i + 1;
      var updatable = ['clientId','channel','title','content','memo','status'];
      updatable.forEach(function(field) {
        if (body[field] !== undefined) {
          var col = headers.indexOf(field);
          if (col >= 0) sheet.getRange(rowNum, col + 1).setValue(body[field]);
        }
      });
      return { success: true, draftId: draftId };
    }
  }
  return { success: false, error: 'draftId not found: ' + draftId };
}

/**
 * deleteDraft — 초안 삭제
 * body: { draftId }
 */
function deleteDraft(body) {
  var draftId = body.draftId;
  if (!draftId) return { success: false, error: 'draftId 필수' };

  var sheet = getOrCreateDraftsSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('draftId');

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === draftId) {
      sheet.deleteRow(i + 1);
      return { success: true, draftId: draftId };
    }
  }
  return { success: false, error: 'draftId not found: ' + draftId };
}
