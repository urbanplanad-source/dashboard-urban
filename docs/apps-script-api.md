# 어반플랜애드 대시보드 Apps Script API Reference
> 최종 업데이트: 2026-06-01 / Apps Script 버전 12.1 (v13 리뷰모니터링 포함) / 글 보관함 경량 조회 규칙 반영

이 문서는 Apps Script API, Google Sheets 구조, 대시보드 운영 규칙의 상세 계약이다.
Codex의 항상 읽는 작업 지시는 저장소 루트의 `AGENTS.md`에 둔다.

---

## 기본 정보

| 항목 | 내용 |
|------|------|
| Web App URL | `https://script.google.com/macros/s/AKfycbwUsy5dDEG-t4FszWRCj-f0-FLIOY4SPMatiNsm55xM7bFXzaAEFS6McQdvmXT85dT0/exec` |
| Google Sheets | `https://docs.google.com/spreadsheets/d/1VY8E-7T1pP37FHbdnCf76mzJc1p7Cv1uzKS8tuCY7Kk/` |
| 인증 | 없음 — 익명 접근 가능 |
| 실행 계정 | urbanplanad@gmail.com |
| ⚠️ 리디렉트 | Apps Script POST는 302 리디렉트 응답. fetch 사용 시 `redirect: 'follow'` 필수. curl 사용 시 `-L` 필수 |

---

## 거래처 ID 목록

| clientId | 거래처명 | 분야 |
|----------|---------|------|
| btskin | 노형아름다운피부과 | 피부과 |
| belrmon | 벨르몬성형외과 | 성형외과 |
| eyecare | 눈사랑안과 | 안과 |
| seoulup | 서울UP치과 | 치과 |
| echi | 이치과 | 치과 |
| igochi | 이고치과 | 치과 |
| jejuexpress | 제주인익스프레스 | 이사/운송 |
| kyunghee | 365경희부부한의원 피부센터 | 한의원 |

---

## 핵심 jobId 목록 (addPost 호출 시 사용)

| jobId | clientId | 업무명 | 월 목표 | channel |
|-------|----------|--------|---------|---------|
| mj-bts-001 | btskin | 홈페이지 포스팅 | 10건 | 홈페이지 |
| mj-bts-004 | btskin | 네이버 블로그 의학정보 발행 | - | 블로그 |
| mj-blr-001 | belrmon | 홈페이지 포스팅 | 5건 | 홈페이지 |
| mj-blr-004 | belrmon | 네이버 블로그 의학정보 발행 | - | 블로그 |
| mj-eye-001 | eyecare | 홈페이지 글 발행 | 4건 | 홈페이지 |
| mj-igo-001 | igochi | 홈페이지 글 발행 | 4건 | 홈페이지 |
| mj-kgh-001 | kyunghee | 네이버 블로그 의학정보 발행 | 5건 | 블로그 |

> 서브업무(kind='서브')는 jobId가 동적 생성됨. summary 조회 후 monthlyJobs 배열에서 확인.

---

## 1. 데이터 조회 (GET)

### 전체 요약 — 브리핑의 기본 데이터 소스

```
GET {URL}?action=summary
```

**응답 구조:**
```json
{
  "success": true,
  "data": {
    "clients": [
      {
        "clientId": "btskin",
        "clientName": "노형아름다운피부과",
        "specialty": "피부과",
        "priority": "높음",
        "status": "진행중",
        "reportFile": "btskin.html"
      }
    ],
    "monthlyJobs": [
      {
        "jobId": "mj-bts-001",
        "clientId": "btskin",
        "title": "홈페이지 포스팅",
        "kind": "필수",
        "targetCount": 10,
        "currentCount": 6,
        "unit": "건",
        "dueDate": null,
        "note": ""
      },
      {
        "jobId": "mj-dyn-abc123",
        "clientId": "btskin",
        "title": "카카오채널 FAQ 업데이트",
        "kind": "서브",
        "targetCount": null,
        "currentCount": null,
        "unit": null,
        "dueDate": "2026-04-10",
        "note": ""
      }
    ],
    "postLogs": [
      {
        "logId": "pl-abc123",
        "clientId": "btskin",
        "jobId": "mj-bts-001",
        "title": "제주 여드름 피부과 추천",
        "url": "https://...",
        "publishedAt": "2026-04-03",
        "month": "2026-04",
        "channel": "홈페이지"
      }
    ]
  }
}
```

**브리핑에 활용할 핵심 필드:**
- `monthlyJobs[].dueDate` — 마감일 (YYYY-MM-DD). null이면 마감일 미설정
- `monthlyJobs[].kind` — `"필수"` 또는 `"서브"` 또는 `"순위"`
- `monthlyJobs[].currentCount / targetCount` — 필수 업무 달성률
- `monthlyJobs[].note` — `"완료"` 이면 완료 처리된 서브업무

---

## 2. 오늘의 업무 브리핑 로직

`summary` GET 후 아래 순서로 데이터를 처리해 브리핑 생성:

### Step 1 — 마감임박 서브업무 추출

> ⚠️ **타임존 주의 (KST 필수)**: `today`를 `new Date().toISOString().split('T')[0]` 방식으로 구하면 UTC 기준이 됨. 한국(UTC+9)에서 오전 9시 이전에는 UTC 날짜가 하루 전날이 되어 D-day 계산이 틀림.
> 반드시 로컬 날짜 기준으로 today를 산출할 것.
>
> ```javascript
> // ✅ 올바른 today 산출 (KST 기준)
> const n = new Date();
> const today = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
>
> // ✅ 올바른 daysLeft 계산 (로컬 자정 기준)
> function daysLeft(d) {
>   if (!d) return null;
>   const due = new Date(d + 'T00:00:00');          // 로컬 자정으로 파싱
>   const tod = new Date(n.getFullYear(), n.getMonth(), n.getDate()); // 오늘 로컬 자정
>   return Math.ceil((due - tod) / 86400000);
> }
>
> // ❌ 잘못된 방식 — UTC 기준, 오전 9시 전 하루 어긋남
> // const today = new Date().toISOString().split('T')[0];
> ```

```
오늘 날짜 = today (YYYY-MM-DD, KST 로컬 기준)

D-0 (오늘 마감): monthlyJobs.filter(j => j.dueDate === today && j.note !== '완료')
D-1 (내일 마감): monthlyJobs.filter(j => j.dueDate === tomorrow && j.note !== '완료')
D-3 이내:        monthlyJobs.filter(j => daysLeft(j.dueDate) <= 3 && j.note !== '완료')
초과:            monthlyJobs.filter(j => daysLeft(j.dueDate) < 0 && j.note !== '완료')
```

### Step 2 — 필수 업무 달성률 계산 (거래처별)
```
달성률 = currentCount / targetCount × 100
미달 업무 = targetCount != null && currentCount < targetCount
```

### Step 3 — 브리핑 출력 예시
```
📋 오늘의 업무 브리핑 (2026-04-04)

⚠️ 오늘 마감
  · [btskin] 카카오채널 FAQ 업데이트

🔶 내일까지
  · [kyunghee] 외벽 현수막 디자인 시안 제작

📊 필수 업무 현황
  · btskin 홈페이지 포스팅: 6/10건 (60%)
  · eyecare 홈페이지 글 발행: 2/4건 (50%)

✅ 이번 달 완료된 서브업무: 3건
```

---

## 3. 데이터 업데이트 (POST)

### ⚠️ POST 필수 규칙 — 반드시 지킬 것

Google Apps Script는 POST 요청 시 302 리디렉트를 거친 후 응답을 반환한다.
**`redirect: 'follow'` 없이 호출하면 리디렉트를 따라가지 못해 "Page not found"처럼 보이지만 데이터는 실제로 저장된다.**
→ 성공/실패 여부를 잘못 판단하는 원인이 됨. 반드시 아래 코드 형식을 사용할 것.

```javascript
// ✅ 올바른 POST 호출 방식 (JavaScript fetch 기준)
const API = 'https://script.google.com/macros/s/AKfycbwUsy5dDEG-t4FszWRCj-f0-FLIOY4SPMatiNsm55xM7bFXzaAEFS6McQdvmXT85dT0/exec';

const res = await fetch(API, {
  method: 'POST',
  redirect: 'follow',          // ← 이 줄이 없으면 항상 실패처럼 보임
  body: JSON.stringify({ action: 'updateJobNote', jobId: 'mj-dyn-xxx', note: '완료' })
  // Content-Type 헤더 추가 금지 — 추가하면 CORS preflight 문제 발생
});
const data = await res.json();
// data.success === true 이면 성공
```

> curl 사용 시: `curl -L -X POST -d '{"action":"..."}' {URL}` (`-L` 플래그 필수)

---

### 글 발행 기록 (가장 자주 사용)

홈페이지/블로그/위챗에 글 발행 시 호출 → PostLogs 기록 + 필수업무 카운트 +1

```json
POST {URL}
{
  "action": "addPost",
  "clientId": "btskin",
  "jobId": "mj-bts-001",
  "title": "제주 여드름 피부과 추천",
  "url": "https://btskin.co.kr/blog/acne",
  "channel": "홈페이지"
}
```
channel 선택값: `홈페이지` / `블로그` / `위챗` / `인스타` / `라인`

응답: `{ "success": true, "logId": "pl-xxx", "publishedAt": "2026-04-04", ... }`

---

### 발행 글 수정
```json
{ "action": "updatePost", "logId": "pl-xxx", "title": "수정된 제목", "url": "https://..." }
```

### 발행 글 삭제
```json
{ "action": "deletePost", "logId": "pl-xxx" }
```

---

### 서브업무 추가
```json
{
  "action": "addSubJob",
  "clientId": "btskin",
  "title": "카카오채널 FAQ 업데이트",
  "dueDate": "2026-04-10"
}
```
> `dueDate`는 선택값. 중복 방지: 같은 clientId+title 조합 5분 이내 재요청 시 기존 jobId 반환.

### 서브업무 수정 (제목·메모·마감일)
```json
{ "action": "updateSubJob", "jobId": "mj-dyn-xxx", "title": "수정된 제목", "note": "진행중", "dueDate": "2026-04-15" }
```

### 서브업무 삭제
```json
{ "action": "deleteSubJob", "jobId": "mj-dyn-xxx" }
```
> kind='서브'만 삭제 가능. 필수 업무는 삭제 불가.

---

### 필수 업무 카운트 직접 수정
```json
{ "action": "updateJobCount", "jobId": "mj-bts-001", "delta": 1 }
```
delta: `1` (증가) 또는 `-1` (감소)

### 필수 업무 목표 수량 수정
```json
{ "action": "updateJobTarget", "jobId": "mj-bts-001", "targetCount": 12 }
```

### 업무 노트 수정 / 서브업무 완료 처리
```json
{ "action": "updateJobNote", "jobId": "mj-dyn-xxx", "note": "완료" }
```
> note를 `"완료"`로 설정하면 대시보드에서 완료 처리됨.
> jobId는 먼저 `summary` GET → `monthlyJobs` 배열에서 title로 검색해 확인할 것.
> ⚠️ 반드시 `redirect: 'follow'` 포함한 fetch로 호출 (위 POST 필수 규칙 참조).

### 업무 추가 (필수 업무)
```json
{
  "action": "addJob",
  "clientId": "btskin",
  "title": "인스타그램 콘텐츠 발행",
  "kind": "필수",
  "targetCount": 8,
  "unit": "건"
}
```

---

### 거래처 추가
```json
{
  "action": "addClient",
  "clientId": "newclient",
  "clientName": "새 거래처",
  "specialty": "피부과",
  "priority": "중간",
  "status": "진행중"
}
```
> 동일 clientId가 이미 있으면 updateClient로 처리됨.

### 거래처 정보 수정
```json
{ "action": "updateClient", "clientId": "btskin", "priority": "높음", "status": "진행중" }
```

### 거래처 삭제
```json
{ "action": "deleteClient", "clientId": "newclient" }
```
> 연관 MonthlyJobs, PostLogs, UpdateLogs 행도 함께 삭제됨.

---

### 업데이트 로그 추가 (내부 메모용 — 대시보드에 미표시)
```json
{ "action": "addLog", "clientId": "btskin", "message": "원장님 미팅 — 4월 이벤트 기획 협의" }
```

### 업데이트 로그 삭제
```json
{ "action": "deleteLog", "logId": "l-xxx" }
```

---

### 월간 초기화 (수동 실행)
```json
{ "action": "monthlyReset", "month": "2026-05" }
```
> 자동 실행하지 않는다. 월말보고서 작성을 모두 마친 뒤 대시보드의 `다음 달 초기화` 버튼으로만 실행한다.
>
> 대시보드 버튼은 먼저 `deleteSubJob`으로 진행중/완료 서브업무를 모두 삭제한 뒤, `monthlyReset`으로 필수 업무 카운트 초기화와 새 달 시트 구성을 처리한다. `month`는 새 운영월(`YYYY-MM`)을 전달한다.

---

## 4. Codex 핵심 시나리오

| # | 상황 | 호출 action | 비고 |
|---|------|------------|------|
| 1 | 오전 업무 브리핑 | `summary` GET → 마감임박 필터링 | D-0/D-1 우선 |
| 2 | 홈페이지 글 발행 완료 | `addPost` | channel: 홈페이지, 카운트 자동 +1 |
| 3 | 블로그 글 발행 완료 | `addPost` | channel: 블로그, 카운트 변동 없음 |
| 4 | 위챗 포스팅 완료 | `addPost` | channel: 위챗 |
| 5 | 서브업무 신규 발생 | `addSubJob` | dueDate 함께 지정 권장 |
| 6 | 서브업무 완료 처리 | `updateJobNote` | note: "완료" |
| 7 | 서브업무 마감일 변경 | `updateSubJob` | dueDate만 전달 가능 |
| 8 | 클라이언트 미팅 메모 | `addLog` | 대시보드에 미표시, Sheets에만 저장 |
| 9 | 진행률 확인 | `summary` GET → monthlyJobs 분석 | 월말 보고 준비 등 |

---

---

## 5. 비용 관리 (손익 대시보드 연동)

손익 관리 탭의 "비용 기록"은 Google Sheets `Expenses` 시트에 저장된다.  
Codex가 비용을 등록·수정·삭제하면 대시보드에 즉각 반영된다.

### Expenses 시트 컬럼 구조

| 컬럼 | 타입 | 설명 |
|------|------|------|
| expenseId | string | 고유 ID (`exp-xxxxxxxx`) |
| date | YYYY-MM-DD | 지출일 |
| category | string | 비용 항목 (아래 카테고리 참고) |
| description | string | 세부 내용 |
| amount | number | 금액 (원, 숫자만) |
| type | string | `고정비` 또는 `변동비` |
| clientId | string | 관련 거래처 ID (없으면 빈 문자열 `""`) |
| payMethod | string | `카드` / `계좌이체` / `현금` / `기타` |
| isRecurring | boolean | 정기지출 여부 (`true` / `false`) |
| memo | string | 메모 (선택) |

### 비용 카테고리 목록

`인건비` / `외주비` / `광고비` / `촬영/디자인 제작비` / `툴/구독료` / `사무운영비` / `세무/수수료` / `기타비용`

---

### POST — 비용 추가 (`addExpense`)

```javascript
const res = await fetch(API, {
  method: 'POST',
  redirect: 'follow',
  body: JSON.stringify({
    action: 'addExpense',
    date: '2026-04-10',
    category: '촬영/디자인 제작비',
    description: '노형아름다운피부과 4월 촬영비',
    amount: 350000,
    type: '변동비',
    clientId: 'btskin',       // 관련 거래처 없으면 "" 전달
    payMethod: '계좌이체',
    isRecurring: false,
    memo: ''
  })
});
const result = await res.json();
// 응답: { success: true, expenseId: "exp-xxxx" }
```

**중요:** `clientId`를 지정하면 해당 거래처의 "귀속비용"에 자동 반영되어 수익성 탭에서 확인 가능.

---

### POST — 비용 수정 (`updateExpense`)

```javascript
const res = await fetch(API, {
  method: 'POST',
  redirect: 'follow',
  body: JSON.stringify({
    action: 'updateExpense',
    expenseId: 'exp-abc123',   // 수정할 비용 ID (필수)
    amount: 400000,            // 변경할 필드만 전달
    description: '노형 4월 촬영비 (수정)',
    memo: '세금계산서 발행 완료'
  })
});
// 응답: { success: true, expenseId: "exp-abc123" }
```

---

### POST — 비용 삭제 (`deleteExpense`)

```javascript
const res = await fetch(API, {
  method: 'POST',
  redirect: 'follow',
  body: JSON.stringify({
    action: 'deleteExpense',
    expenseId: 'exp-abc123'
  })
});
// 응답: { success: true, expenseId: "exp-abc123" }
```

---

### GET — 비용 목록 조회 (`summary`)

별도 엔드포인트 없음. `summary` GET에 `expenses` 배열이 포함된다.

```javascript
const res = await fetch(API + '?action=summary');
const { data } = await res.json();
const expenses = data.expenses; // 전체 비용 목록

// 이번 달 비용만 필터링
const today = new Date();
const thisMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
const thisMonthExp = expenses.filter(e => e.date && e.date.startsWith(thisMonth));
const totalCost = thisMonthExp.reduce((s, e) => s + e.amount, 0);
```

---

### Codex 비용 등록 시나리오 예시

| 상황 | action | 필수 필드 |
|------|--------|-----------|
| 거래처 촬영비 지출 | `addExpense` | date, category: "촬영/디자인 제작비", amount, clientId |
| 외주 번역비 지출 | `addExpense` | category: "외주비", amount, clientId (해당 병원) |
| 광고비 집행 | `addExpense` | category: "광고비", type: "변동비", clientId |
| 월 구독료 (정기) | `addExpense` | category: "툴/구독료", type: "고정비", isRecurring: true |
| 기존 금액 수정 | `updateExpense` | expenseId, amount |
| 잘못 입력 취소 | `deleteExpense` | expenseId |

---

## 6. 글 보관함 (초안 저장)

Codex가 작성한 글을 대시보드 **글 보관함** 탭에 저장한다.  
대표가 보관함을 열어 글을 복사한 뒤 직접 발행하는 방식이다.

### Drafts 시트 컬럼 구조

| 컬럼 | 타입 | 설명 |
|------|------|------|
| draftId | string | 고유 ID (`dr-xxxxxxxx`) |
| clientId | string | 거래처 ID (없으면 빈 문자열 `""`) |
| channel | string | `홈페이지` / `블로그` / `위챗` / `인스타` / `라인` / `기타` |
| title | string | 글 제목 |
| content | string | 본문 전체 (줄바꿈 포함) |
| memo | string | 키워드, 시술명 등 참고사항 (선택) |
| createdAt | YYYY-MM-DD | 저장일 (KST 자동) |
| status | string | 항상 `draft` |

---

### POST — 초안 저장 (`addDraft`)

글 작성을 완료한 후 반드시 이 액션을 호출해 보관함에 저장한다.

```javascript
const res = await fetch(API, {
  method: 'POST',
  redirect: 'follow',
  body: JSON.stringify({
    action: 'addDraft',
    clientId: 'btskin',           // 관련 거래처 없으면 "" 전달
    channel: '홈페이지',           // 홈페이지 / 블로그 / 위챗 / 인스타 / 라인 / 기타
    title: '제주 여드름 피부과 추천 | 노형아름다운피부과',
    content: '본문 전체 내용...',  // 완성된 글 전체
    memo: '여드름, 피부과, 제주'    // 키워드 등 (선택)
  })
});
const result = await res.json();
// 응답: { success: true, draftId: "dr-xxxx" }
```

---

### POST — 초안 수정 (`updateDraft`)

```javascript
const res = await fetch(API, {
  method: 'POST',
  redirect: 'follow',
  body: JSON.stringify({
    action: 'updateDraft',
    draftId: 'dr-abc123',    // 수정할 초안 ID (필수)
    title: '수정된 제목',     // 변경할 필드만 전달
    content: '수정된 본문'
  })
});
// 응답: { success: true, draftId: "dr-abc123" }
```

---

### POST — 초안 삭제 (`deleteDraft`)

```javascript
const res = await fetch(API, {
  method: 'POST',
  redirect: 'follow',
  body: JSON.stringify({
    action: 'deleteDraft',
    draftId: 'dr-abc123'
  })
});
// 응답: { success: true, draftId: "dr-abc123" }
```

> 대시보드에서 직접 삭제(발행 완료 후)도 가능하므로 Codex는 저장만 담당해도 됨.

---

### GET — 초안 목록 조회 (`draftsList`)

글 보관함 화면은 속도 개선을 위해 `summary` 전체 응답 대신 경량 목록을 먼저 조회한다.  
`draftsList`는 본문 전체(`content`)를 반환하지 않는다. 사용자가 글을 펼치거나 복사할 때 `draftDetail`로 단일 본문만 조회한다.

```javascript
const res = await fetch(API + '?action=draftsList');
const { data } = await res.json();
const drafts = data; // content 없는 초안 목록
```

응답 예시:
```json
{
  "success": true,
  "data": [
    {
      "draftId": "dr-abc123",
      "clientId": "btskin",
      "channel": "블로그",
      "title": "제주 여드름 피부과 추천",
      "memo": "여드름, 피부과, 제주",
      "createdAt": "2026-06-01",
      "status": "draft",
      "preview": "",
      "contentLength": null
    }
  ]
}
```

### GET — 초안 본문 조회 (`draftDetail`)

```javascript
const res = await fetch(API + '?action=draftDetail&draftId=dr-abc123');
const { data } = await res.json();
const content = data.content;
```

응답 예시:
```json
{
  "success": true,
  "data": {
    "draftId": "dr-abc123",
    "clientId": "btskin",
    "channel": "블로그",
    "title": "제주 여드름 피부과 추천",
    "content": "본문 전체 내용...",
    "memo": "여드름, 피부과, 제주",
    "createdAt": "2026-06-01",
    "status": "draft",
    "preview": "본문 일부...",
    "contentLength": 1200
  }
}
```

> 하위 호환: `summary` GET에도 `drafts` 배열이 포함될 수 있다. 대시보드 동기화처럼 본문이 필요 없는 경우 `GET ?action=summary&draftMode=light`를 사용해 `draftsList`와 같은 경량 구조를 받을 수 있다. 기존 `addDraft`, `updateDraft`, `deleteDraft` POST 구조는 변경하지 않는다.

---

### Codex 글 저장 시나리오 예시

| 상황 | action | 필수 필드 |
|------|--------|-----------|
| 홈페이지 글 작성 완료 | `addDraft` | clientId, channel: "홈페이지", title, content |
| 블로그 포스트 작성 완료 | `addDraft` | clientId, channel: "블로그", title, content, memo (키워드) |
| 위챗 포스팅 작성 완료 | `addDraft` | clientId, channel: "위챗", title, content |
| 거래처 무관 공통 글 | `addDraft` | clientId: "", channel, title, content |
| 저장한 글 내용 수정 | `updateDraft` | draftId, 변경 필드 |
| 잘못 저장한 초안 취소 | `deleteDraft` | draftId |

> **글 발행과 분리:** `addDraft`는 보관만 한다. 발행 기록(`addPost`)은 대표가 실제 발행 후 별도로 호출한다.

---

## 7. 네이버플레이스 방문자 리뷰 모니터링 (Codex/자동화 스크립트)

> Apps Script v13부터 지원. 비교 대상은 **방문자 리뷰(visitor review)만** 해당. 블로그 리뷰는 저장·비교하지 않는다.

---

### 기본 흐름 (자동화 스크립트 매일 실행)

```
1. GET ?action=reviewTargets → isActive=TRUE 대상 목록 수신
2. 각 naverPlaceUrl에서 실제 방문자 리뷰 수 확인
3. savedVisitorReviewCount와 비교
4. 변화 있으면 → addReviewLog (POST) + updateReviewTarget (POST)
5. 텔레그램 알림 (증가/감소/차단 시)
```

---

### ReviewTargets 시트 구조

| 컬럼 | 설명 |
|------|------|
| clientId | 거래처 ID (Clients 시트와 동일) |
| clientName | 거래처명 |
| naverPlaceUrl | 네이버플레이스 URL (`https://naver.me/xxxxx`) |
| reviewType | 항상 `visitor` (블로그 리뷰 제외) |
| savedVisitorReviewCount | 자동화 비교 기준값 (정수) |
| recentReviewFingerprintsJson | 최근 방문자 리뷰 fingerprint 목록 (JSON 문자열, 신규 리뷰 판별용) |
| isActive | `TRUE` 인 거래처만 자동화 스크립트가 확인 |
| memo | 비고 |

---

### GET — 모니터링 대상 조회 (`reviewTargets`)

```javascript
const res = await fetch(API + '?action=reviewTargets');
const { data } = await res.json();
// data: isActive=TRUE 거래처만 반환
```

응답 예시:
```json
{
  "success": true,
  "data": [
    {
      "clientId": "btskin",
      "clientName": "노형아름다운피부과",
      "naverPlaceUrl": "https://naver.me/xxxxx",
      "reviewType": "visitor",
      "savedVisitorReviewCount": 1234,
      "recentReviewFingerprintsJson": "[]",
      "isActive": true,
      "memo": ""
    }
  ]
}
```

> `summary` GET에도 `reviewTargets` 배열이 포함된다. 대시보드 카드는 이 값으로 "⭐ 방문자리뷰 1,234"를 표시한다.

---

### POST — 리뷰 수 갱신 (`updateReviewTarget`)

네이버에서 확인한 실제 방문자 리뷰 수로 Sheets 기준값을 업데이트한다.  
**리뷰 수가 변화한 경우에만 호출** (check_failed 시 호출 금지).

```javascript
const res = await fetch(API, {
  method: 'POST',
  redirect: 'follow',
  body: JSON.stringify({
    action: 'updateReviewTarget',
    clientId: 'btskin',
    savedVisitorReviewCount: 1237,
    recentReviewFingerprintsJson: '["fp1","fp2","fp3"]'  // 선택
  })
});
// 응답: { success: true, clientId: "btskin", savedVisitorReviewCount: 1237 }
```

---

### POST — 리뷰 변화 로그 저장 (`addReviewLog`)

리뷰 증가·감소·차단·확인 실패 시 ReviewLogs 시트에 기록한다.  
이 로그는 대시보드 카드에 노출되지 않으며 내부 기록용이다.

```javascript
const res = await fetch(API, {
  method: 'POST',
  redirect: 'follow',
  body: JSON.stringify({
    action: 'addReviewLog',
    clientId: 'btskin',
    previousVisitorReviewCount: 1234,
    currentVisitorReviewCount: 1237,
    diff: 3,
    status: 'increased',           // 아래 status 표 참조
    detectedReviewCount: 3,        // 실제 확인한 신규 리뷰 수
    newReviewsSummary: '친절함 2건, 시술 만족 1건',  // 텔레그램 전송용 요약
    newReviewsJson: '[{"text":"...","date":"..."}]',
    telegramSent: true,
    errorMessage: ''
  })
});
// 응답: { success: true, logId: "rl-xxxx", clientId: "btskin", status: "increased" }
```

**status 값:**

| status | 의미 |
|--------|------|
| `normal` | 리뷰 수 변화 없음 (로그 생략 가능) |
| `increased` | 리뷰 수 증가, 신규 리뷰 확인 완료 |
| `decreased` | 리뷰 수 감소 |
| `increased_but_blocked` | 리뷰 수 증가했으나 네이버 차단으로 신규 리뷰 본문 확인 실패 |
| `check_failed` | 리뷰 수 자체를 확인하지 못함 (savedVisitorReviewCount 변경 금지) |

---

### 상황별 처리 가이드

| 상황 | addReviewLog | updateReviewTarget | 텔레그램 |
|------|-------------|-------------------|---------|
| 리뷰 수 동일 | 생략 가능 (normal) | 생략 가능 | 없음 |
| 리뷰 수 증가 | ✅ increased | ✅ 현재 수로 갱신 | 신규 리뷰 요약 전송 |
| 리뷰 수 감소 | ✅ decreased | ✅ 현재 수로 갱신 | 감소 사실 + 현재 수 전송 |
| 증가 but 네이버 차단 | ✅ increased_but_blocked | ✅ 현재 수로 갱신 | "N개 증가했으나 본문 확인 실패" 반드시 전송 |
| 리뷰 수 자체 확인 불가 | ✅ check_failed | ❌ 변경 금지 | 선택 |

**리뷰 수 증가 시 처리 규칙:**
- diff = current - previous
- 리뷰 수가 N개 증가했다면 자동화 스크립트는 신규 방문자 리뷰 N개를 **모두** 확인해야 한다.  
  (예: 3개 증가 → 신규 3개 전부 본문 확인)
- 신규 리뷰 본문 전체는 `newReviewsJson`에 저장, 텔레그램에는 `newReviewsSummary`(요약)만 전송
- `recentReviewFingerprintsJson`을 최신 상태로 갱신해 다음 실행 시 중복 판별에 사용

**네이버 접근 제한 발생 시 (increased_but_blocked):**
- 네이버 접근 제한으로 본문 확인이 막힌 경우에도 리뷰 수 증가 사실은 반드시 알림 대상이다.
- ReviewTargets의 `savedVisitorReviewCount`는 현재 확인된 리뷰 수(증가한 수)로 갱신한다.
- ReviewLogs에는 `increased_but_blocked` 상태로 남긴다.
- 텔레그램 알림 문구: `"방문자 리뷰가 N개 증가했으나 신규 리뷰 본문 확인 실패"` — 반드시 전송

---

### Codex/API 규칙 (리뷰 모니터링에도 동일 적용)

- POST는 반드시 `redirect: 'follow'` 포함
- `Content-Type` 헤더 추가 금지 (CORS preflight 문제)
- curl 사용 시 `-L` 플래그 필수

---

## 8. 대시보드·월말보고서 운영 규칙

### 공통 데이터 정규화

대시보드와 거래처별 월말보고서는 Google Sheets/Apps Script 응답값을 그대로 비교하지 않고 아래 규칙으로 정규화한 뒤 사용한다.

| 필드 | 규칙 | 이유 |
|------|------|------|
| `clientId` | `Clients.clientId`를 기준값으로 사용 | 손익·비용·발행 기록이 거래처 카드와 정확히 매칭되어야 함 |
| `publishedAt` | `YYYY-MM-DD`로 정규화 | Apps Script가 날짜를 ISO 문자열로 반환할 수 있음 |
| `month` | `YYYY-MM`로 정규화 | `2026-04-30T15:00:00.000Z` 형태도 월 필터에 포함하기 위함 |
| `channel` | `channel`, 빈 헤더 키 `""`, `Channel`, `채널` 순서로 읽음 | 과거 `PostLogs` 헤더 오류/빈 헤더 데이터 보정 |

현재 공식 clientId는 아래 값을 사용한다.

`btskin`, `belrmon`, `eyecare`, `seoulup`, `echi`, `igochi`, `jejuexpress`, `kyunghee`

손익/비용/보고서 생성 시 아래 오기 사용 금지:

| 잘못된 값 | 올바른 값 |
|-----------|-----------|
| `bellemont` | `belrmon` |
| `eyeclinic` | `eyecare` |
| `igo` | `igochi` |

### 월말보고서 생성 규칙

거래처별 보고서 HTML은 기존 파일에 월별 탭을 누적하는 방식을 기본으로 한다.

1. 새 월 보고서는 기존 최신 월 탭 위에 추가하고, 새 월을 기본 `active` 탭으로 둔다.
2. 기존 월 보고서 내용은 삭제하지 않는다.
3. 발행 내역은 `postLogs`를 기준으로 하되, `month`와 `channel` 정규화 후 필터링한다.
4. 월 필터 기준은 보고월의 `YYYY-MM`이다. 소급 입력분을 포함해야 할 때만 보고서 내부에 별도 배열을 명시한다.
5. 정량 수치는 API/Sheets에서 확인 가능한 값과 사용자가 제공한 외부 콘솔 수치를 구분해서 작성한다.
6. 외부 콘솔 수치가 없으면 임의로 만들지 않고, “자료 확인 필요”로 남긴 뒤 사용자에게 요청한다.
7. 보고서 저장 후 대시보드 `Clients.reportFile` 링크가 실제 파일명과 맞는지 확인한다.

### 업무 캘린더 연동 규칙

대시보드 메인 화면의 업무 캘린더는 별도 Calendar 시트를 쓰지 않는다. 아래 원본 데이터를 날짜 기준으로 모아 보여준다.

| 캘린더 항목 | 원본 데이터 | 날짜 필드 | 등록/수정/삭제 action |
|-------------|-------------|-----------|------------------------|
| 거래처 주업무/순위/서브업무 | `MonthlyJobs` | `dueDate` | `addSubJob`, `updateSubJob`, `deleteSubJob` |
| 내 사업 공통업무 | `CommonTasks` | `dueDate` | `commonTaskAdd`, `commonTaskUpdate`, `commonTaskDelete` |

Codex가 캘린더에 거래처 업무를 등록하려면 `addSubJob`을 사용하고 `dueDate`를 반드시 포함한다.

```json
{
  "action": "addSubJob",
  "clientId": "btskin",
  "title": "5월 월말보고서 초안 작성",
  "dueDate": "2026-05-28"
}
```

Codex가 캘린더에 내 사업 공통업무를 등록하려면 `commonTaskAdd`를 사용한다.

```json
{
  "action": "commonTaskAdd",
  "title": "5월 보고서 전체 검수",
  "kind": "task",
  "parentId": null,
  "dueDate": "2026-05-30"
}
```

삭제는 원본 항목 삭제와 동일하게 처리한다.

```json
{ "action": "deleteSubJob", "jobId": "mj-dyn-xxx" }
{ "action": "commonTaskDelete", "taskId": "ct-xxx" }
```

필수 업무는 캘린더에서 삭제 시 업무 자체를 삭제하지 않고 `dueDate`를 비워 캘린더에서만 제거하는 방식으로 운영한다. 필수 업무 자체 삭제는 월간 업무 구조를 흔들 수 있으므로 거래처 상세 화면 또는 Apps Script에서 별도 확인 후 처리한다.

### Apps Script 수정 시 문서 갱신 규칙

Apps Script의 `doGet`, `doPost`, 시트 컬럼, action 이름, 응답 구조를 바꾸면 이 문서도 같은 작업 단위에서 갱신한다.

- `최종 업데이트` 날짜 수정
- 관련 action 요청/응답 예시 수정
- 새 시트 또는 컬럼이 생기면 시트 구조 표 추가
- 브라우저/대시보드에서 필요한 정규화 규칙이 생기면 이 섹션에 기록

---

## 9. 에러 처리

| 응답 | 의미 |
|------|------|
| `{ "success": false, "error": "..." }` | 요청 오류 — error 메시지 확인 |
| HTTP 302 + redirect | 정상. `redirect: 'follow'` 미설정 시 발생. 반드시 follow 처리 |
| `{ "success": true, "duplicate": true }` | addSubJob 중복 — 기존 jobId 반환, 정상 처리 |
