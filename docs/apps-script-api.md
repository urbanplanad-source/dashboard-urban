# 어반플랜애드 대시보드 Apps Script API Reference
> 최종 업데이트: 2026-07-04 / Apps Script 버전 15 (거래처 콘텐츠 브리프 포함) / 의료광고 검수 자료 연결 / 브리프 위키·프롬프트팩 운영 규칙 반영

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
    ],
    "clientBriefs": [
      {
        "clientId": "btskin",
        "brandSummary": "거래처 콘텐츠 포지션",
        "doctorStyle": "원장님 스타일",
        "procedurePrices": []
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
- `clientBriefs[]` — 콘텐츠 작성 전 참고할 거래처별 브리프

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
> 대시보드 버튼은 먼저 `note`가 `"완료"` 또는 `"완료 (...)"`로 시작하는 완료된 서브업무만 `deleteSubJob`으로 삭제한 뒤, `monthlyReset`으로 필수 업무 카운트 초기화와 새 달 시트 구성을 처리한다. 완료 체크하지 않은 서브업무는 다음 달로 이월한다. 완료 서브업무 삭제 중 `Job not found`가 나오면 이미 Sheets에서 삭제된 항목으로 간주하고 계속 진행한다. 초기화 후 `summary`를 다시 조회해 이월 대상 서브업무가 누락됐으면 `addSubJob`/`updateSubJob`으로 보강한다. `month`는 새 운영월(`YYYY-MM`)을 전달한다.
>
> 손익 관리의 `Expenses` 중 전월 `type`이 `"고정비"`인 항목은 `다음 달 초기화` 성공 후 새 운영월로 자동 복사한다. 복사는 기존 `addExpense` 액션을 사용하며, 새 운영월에 같은 카테고리·세부 내용·금액·거래처·결제수단·메모 조합의 고정비가 이미 있으면 중복 생성하지 않는다.
>
> `monthlyReset` 서버 구현은 `apps-script/monthly_reset_patch_v16.gs`를 기준으로 배포한다. 대시보드에서 `<!DOCTYPE ... is not valid JSON` 또는 `응답이 JSON이 아닙니다`가 나오면 Apps Script Web App 배포에 `monthlyReset` case/함수 또는 doPost JSON 예외 래퍼가 빠졌는지 먼저 확인한다.

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
| 10 | 거래처 브리프 기반 초안 작성 | `clientBrief` GET → 의료광고 검수 → `addDraft` | 병원 특징/시술/가격/작성 지침과 `docs/compliance/` 기준을 먼저 확인 |

---

---

## 5. 비용 관리 (손익 대시보드 연동)

손익 관리 탭의 "비용 기록"은 Google Sheets `Expenses` 시트에 저장된다.  
Codex가 비용을 등록·수정·삭제하면 대시보드에 즉각 반영된다.

손익 관리 1차 업그레이드는 기존 `Expenses` 컬럼만 사용해 화면에서 직접비 기준/공통비 포함 수익성을 계산한다. 새 Apps Script action이나 Sheets 컬럼은 추가하지 않는다. `clientId`가 비어 있는 비용은 자체 지출/공통비로 보고, 공통비 포함 보기에서는 거래처 총매출 비중대로 비교 배부한다.

손익 관리 후속 업데이트도 기존 `summary` 응답과 `Expenses` 컬럼만 사용한다. 거래처별 원인 분석, 전월 대비 경고, 비용 원인 필터, 반복비 검수, 업무량 대비 수익성은 화면 계산값이며 Sheets에 새 컬럼을 추가하지 않는다. 반복비 검수 완료 여부는 월별 localStorage 상태(`rev-recurring-review-YYYY-MM`)로만 보관한다.

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
| status | string | 파이프라인 상태. `addDraft` 시 항상 `draft`로 시작 |

`createdAt`은 Apps Script 내부에서 Date 객체나 ISO 문자열로 읽히더라도 API 응답에서는 항상 KST 기준 `YYYY-MM-DD` 문자열로 정규화한다.

### status 파이프라인 표준 어휘

글 보관함은 콘텐츠 파이프라인 허브로 동작하며, status는 아래 5개 값만 사용한다.

| status | 라벨 | 의미 | 갱신 주체 |
|--------|------|------|----------|
| `draft` | 초안 | 막 저장된 초안 (`addDraft` 기본값) | Apps Script |
| `review` | 검토중 | 의료광고/품질 검토 대기 | growth-team push 스크립트(기본값), 대시보드 UI |
| `approved` | 승인 | 검토 통과, 게시 가능 | 대시보드 UI (사람 승인) |
| `staged` | 임시저장됨 | naver-writer가 네이버 블로그 임시저장 완료 | naver-writer write-back (자동) |
| `published` | 발행완료 | 실제 발행 확인됨 | 대시보드 UI (수동 확인) |

status 변경은 기존 `updateDraft` 액션으로 처리한다 (별도 액션 불필요):

```javascript
{ "action": "updateDraft", "draftId": "dr-xxxx", "status": "approved" }
```

연동 주체별 규칙:

- `hospital-marketing-growth-team/scripts/push-dashboard-draft.mjs`: addDraft 후 기본적으로 `review`로 승격. `--status`, `--update --draft-id` 옵션 지원.
- `naver-writer`: 실제 네이버 임시저장은 `approved` 상태 초안만 허용한다. 임시저장 성공 시 `staged`로 자동 갱신 (`DASHBOARD_WRITEBACK=false`로 비활성화 가능). 실패해도 임시저장 자체는 실패 처리하지 않는다.
- 대시보드 UI: 글 보관함 상단 파이프라인 바와 카드별 상태 선택으로 변경. 상태 저장 실패 시 화면 값을 이전 상태로 되돌린다.
- `approved` → 사람 검토 없이 자동으로 만들지 않는다 (운영 원칙).

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

## 7. 거래처 콘텐츠 브리프

거래처별 병원 특징, 원장님 스타일, 대표 시술, 시술 가격, 글 작성 지침, 의료광고 주의사항을 저장한다.  
Codex나 외부 작성 에이전트는 콘텐츠 초안을 만들기 전에 해당 거래처의 브리프를 먼저 조회하고, 상세 맥락은 `docs/briefs/clients/{clientId}.md`에서 확인한다. 작성 완료 후 기존 `addDraft`로 글 보관함에 저장한다.

### 역할 분리

| 저장 위치 | 역할 | 사용 시점 |
|----------|------|-----------|
| Google Sheets `ClientBriefs` | 대시보드에서 빠르게 보는 핵심 브리프, 가격표, 금지 표현 | 매번 API로 조회 |
| `docs/briefs/clients/{clientId}.md` | 긴 맥락, 콘텐츠 전략, FAQ, 소재, 원본 자료 링크 | 초안 작성 전 함께 확인 |
| `docs/briefs/prompts/{clientId}-prompts.md` | 채널별 초안 작성, 리라이트, 의료광고 검수 반복 프롬프트 | 같은 거래처 콘텐츠를 반복 제작할 때 |
| `docs/briefs/sources/{clientId}/` | 가격표, 미팅 메모, 병원 자료 원본 | 근거 확인이 필요할 때 |
| `docs/compliance/` | 의료광고 공통 검수 기준 | 의료/시술 콘텐츠 작성 및 검수 시 |

### ClientBriefs 시트 컬럼 구조

| 컬럼 | 타입 | 설명 |
|------|------|------|
| clientId | string | 공식 거래처 ID |
| brandSummary | text | 한 줄 포지션 / 콘텐츠 기준 |
| clinicFeatures | text | 병원 특징, 강점, 공간, 장비, 운영 방식 |
| doctorStyle | text | 원장님 상담 스타일, 선호 표현, 피하고 싶은 이미지 |
| targetPatients | text | 핵심 타깃, 지역, 환자 고민, 검색 의도 |
| representativeTreatments | text | 대표 시술 / 주력 서비스 |
| procedureNotes | text | 시술별 설명 포인트, 사후관리, FAQ |
| pricingMemo | text | 가격표 해석, 이벤트 조건, 공개 시 주의사항 |
| procedurePricesJson | JSON string | 구조화된 시술/가격 행 배열 |
| writingGuidelines | text | 제목, 본문 흐름, CTA, 채널별 작성 지침 |
| toneAndManner | text | 톤앤매너 |
| requiredPhrases | text | 반드시 포함할 표현, 고정 CTA |
| forbiddenPhrases | text | 금지/주의 표현 |
| medicalAdCautions | text | 의료광고, 심의, 효과 표현 주의사항 |
| contentAngles | text | 콘텐츠 소재, 계절 이슈, 기획 방향 |
| keywords | text | 핵심/지역/롱테일 키워드 |
| faq | text | 자주 묻는 질문과 답변 기준 |
| localContext | text | 지역, 경쟁, 유입 채널, 운영 맥락 |
| referenceLinks | text | 홈페이지, 플레이스, 내부 자료 링크 |
| internalNotes | text | 기타 내부 메모. 계정/비밀번호 입력 금지 |
| updatedAt | YYYY-MM-DD | 브리프 수정일 |

`procedurePricesJson` 예시:

```json
[
  {
    "category": "피부",
    "name": "리프팅",
    "regularPrice": "300,000원",
    "eventPrice": "199,000원",
    "sessionInfo": "1회 / 부위별 상담",
    "notes": "가격 공개 전 확인"
  }
]
```

### GET — 브리프 목록 조회 (`clientBriefs`)

```javascript
const res = await fetch(API + '?action=clientBriefs');
const { data } = await res.json();
```

응답:

```json
{
  "success": true,
  "data": [
    {
      "clientId": "kyunghee",
      "brandSummary": "한 줄 포지션",
      "doctorStyle": "원장님 스타일",
      "procedurePrices": [
        {
          "category": "한의원",
          "name": "시술명",
          "regularPrice": "가격",
          "eventPrice": "",
          "sessionInfo": "구성",
          "notes": "주의사항"
        }
      ],
      "updatedAt": "2026-06-28"
    }
  ]
}
```

### GET — 단일 거래처 브리프 조회 (`clientBrief`)

```javascript
const res = await fetch(API + '?action=clientBrief&clientId=kyunghee');
const { data } = await res.json();
```

브리프가 아직 없어도 `{ success: true, data: { clientId, procedurePrices: [] } }` 형태로 빈 객체를 반환한다.

### POST — 브리프 저장/수정 (`upsertClientBrief`)

```javascript
const res = await fetch(API, {
  method: 'POST',
  redirect: 'follow',
  body: JSON.stringify({
    action: 'upsertClientBrief',
    clientId: 'kyunghee',
    brandSummary: '365경희부부한의원 피부센터 콘텐츠 포지션',
    clinicFeatures: '병원 특징...',
    doctorStyle: '원장님 스타일...',
    representativeTreatments: '대표 시술...',
    writingGuidelines: '글 작성 지침...',
    medicalAdCautions: '의료광고 주의사항...',
    procedurePricesJson: JSON.stringify([
      {
        category: '피부',
        name: '시술명',
        regularPrice: '정상가',
        eventPrice: '이벤트가',
        sessionInfo: '구성',
        notes: '비고'
      }
    ])
  })
});
```

응답:

```json
{ "success": true, "action": "updated", "clientId": "kyunghee", "updatedAt": "2026-06-28" }
```

### 콘텐츠 작성 시 사용 규칙

1. `summary&draftMode=light`로 현재 업무/최근 발행 흐름을 확인한다.
2. `clientBrief&clientId=...`로 거래처 브리프를 조회한다.
3. `docs/briefs/clients/{clientId}.md`로 긴 맥락, FAQ, 소재, 원본 자료 링크를 확인한다.
4. 필요한 경우 `docs/briefs/prompts/{clientId}-prompts.md`에서 채널별 작성/검수 프롬프트를 확인한다.
5. 가격/이벤트, 심의필, 후기/전후사진, 이미지 사용권 게이트를 먼저 통과시킨다. 애매하면 `HOLD` 또는 “자료 확인 필요”로 남긴다.
6. 브리프의 `doctorStyle`, `writingGuidelines`, `forbiddenPhrases`, `medicalAdCautions`, `procedurePrices`를 우선 기준으로 초안을 작성한다.
7. 의료/시술 콘텐츠는 `docs/compliance/medical-ad-review-guide.md`와 `docs/compliance/medical-ad-checklist.json`을 함께 참고한다.
8. 브리프에 없거나 외부에서 확인되지 않은 수치, 가격, 효과는 만들지 않고 “자료 확인 필요”로 남긴다.
9. 작성 후 `docs/compliance/medical-ad-reviewer-prompt.md` 형식으로 별도 검수를 수행한다.
10. 검수 결론이 `PASS`가 아니면 수정 또는 사람 확인 대상으로 남긴다. `HOLD`는 발행용으로 넘기지 않는다.
11. 작성이 끝나면 기존 `addDraft`로 글 보관함에 저장하고, memo에 `의료광고 검수: PASS/REVISE/HOLD`를 남긴다.

### 브리프 위키 자료

거래처별 긴 브리프 기준은 저장소의 `docs/briefs/`에 둔다.

| 파일 | 용도 |
|------|------|
| `docs/briefs/README.md` | 브리프 위키 운영 원칙 |
| `docs/briefs/index.md` | 거래처별 상세 브리프 목차 |
| `docs/briefs/overview.md` | 전체 거래처 콘텐츠 운영 요약 |
| `docs/briefs/clients/{clientId}.md` | 거래처별 상세 브리프 |
| `docs/briefs/prompts/{clientId}-prompts.md` | 거래처별 채널/검수 프롬프트팩 |
| `docs/briefs/sources/{clientId}/` | 거래처별 원본 자료 보관 |
| `docs/briefs/templates/client-brief-template.md` | 새 거래처 브리프 템플릿 |

### 의료광고 검수 자료

의료광고 검수 기준은 저장소의 `docs/compliance/`에 둔다.

| 파일 | 용도 |
|------|------|
| `docs/compliance/source-pdfs/healthy-medical-ads-2nd.pdf` | 보건복지부 의료광고 가이드 2판 원본. 우선 기준 |
| `docs/compliance/source-pdfs/medical-ad-cases-checklist-guide.pdf` | 이전판 원본. 보조 근거 |
| `docs/compliance/medical-ad-review-guide.md` | 콘텐츠 작성자/검수자용 운영 가이드 |
| `docs/compliance/medical-ad-checklist.json` | 구조화된 검수 체크리스트 |
| `docs/compliance/medical-ad-reviewer-prompt.md` | 서브에이전트 검수 프롬프트 |

이 자료는 법률 자문이나 심의 승인 문서가 아니라 보건복지부 가이드 기반의 발행 전 리스크 점검 도구다. 사전심의 대상 매체, 환자 유인, 치료경험담/후기, 전후사진, 비급여 할인, 수상/인증, 전문병원/전문 표현처럼 판단이 갈리는 항목은 사람 확인을 우선한다.

> 민감 정보 주의: 이 API는 익명 접근 가능한 Apps Script Web App 구조다. 계정/비밀번호, 내부 계약조건, 공개되면 안 되는 할인 전략은 `ClientBriefs`에 넣지 않는다.

---

## 8. 상담내역 (월말보고서용)

> Apps Script v14 패치 적용 후 지원. 대시보드 입력 방식은 유지하고, `btskin`/`belrmon` 상담내역을 Sheets `Consults` 시트에도 동기화해 월말보고서 생성 스크립트가 읽을 수 있게 한다.

### Consults 시트 컬럼 구조

| 컬럼 | 타입 | 설명 |
|------|------|------|
| consultId | string | 상담 고유 ID (`cs-...`) |
| clientId | string | 거래처 ID |
| date | YYYY-MM-DD | 상담일 |
| month | YYYY-MM | 보고월 필터 |
| channel | string | `위챗` / `라인` / `인스타` |
| nickname | string | 상대방 닉네임 또는 이름 |
| content | string | 상담 내용 |
| createdAt | string | 생성 시각 |
| status | string | `active` 또는 `deleted` |

### GET — 상담내역 조회 (`consultsList`)

```javascript
const res = await fetch(API + '?action=consultsList&clientId=btskin&month=2026-05');
const { data } = await res.json();
const consults = data.consults;
```

응답 예시:
```json
{
  "success": true,
  "data": {
    "consults": [
      {
        "consultId": "cs-lx123",
        "id": "cs-lx123",
        "clientId": "btskin",
        "date": "2026-05-12",
        "month": "2026-05",
        "channel": "위챗",
        "nickname": "상담고객",
        "content": "상담 내용...",
        "createdAt": "2026-05-12T09:30:00.000Z",
        "status": "active"
      }
    ]
  }
}
```

### POST — 상담내역 저장 (`addConsult`)

대시보드 상담 폼에서 저장할 때 localStorage 저장 후 비차단 방식으로 호출한다. `month`는 보고서 필터 안정성을 위해 함께 보낸다.

```javascript
const res = await fetch(API, {
  method: 'POST',
  redirect: 'follow',
  body: JSON.stringify({
    action: 'addConsult',
    clientId: 'btskin',
    consultId: 'cs-lx123',
    date: '2026-05-12',
    month: '2026-05',
    channel: '위챗',
    nickname: '상담고객',
    content: '상담 내용...',
    createdAt: '2026-05-12T09:30:00.000Z'
  })
});
```

### POST — 상담내역 삭제 (`deleteConsult`)

삭제는 행을 물리 삭제하지 않고 `status: "deleted"`로 표시한다.

```javascript
const res = await fetch(API, {
  method: 'POST',
  redirect: 'follow',
  body: JSON.stringify({
    action: 'deleteConsult',
    clientId: 'btskin',
    consultId: 'cs-lx123'
  })
});
```

> `summary` GET에도 `consults` 배열이 포함될 수 있다. 보고서 생성 스크립트는 우선 `consultsList`를 시도하고, 미배포 상태면 `summary.consults` 또는 자료 공백 표시로 처리한다.

보고서 작성 전 상담 표준경로만 빠르게 확인하려면 아래 명령을 사용한다.

```bash
npm.cmd run report:consults:check -- --month YYYY-MM --client btskin,belrmon
```

이 명령이 성공하면 Apps Script `consultsList`가 배포되어 있고, 월말보고서 컨텍스트 생성 시 상담내역을 자동으로 읽을 수 있는 상태다.

---

## 9. 네이버플레이스 방문자 리뷰 모니터링 (Codex/자동화 스크립트)

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

## 10. 대시보드·월말보고서 운영 규칙

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

보고서 작성 전 Codex는 먼저 아래 명령으로 보고월의 거래처별 컨텍스트를 생성한다.

```bash
npm.cmd run report:context -- --month YYYY-MM --client btskin
npm.cmd run report:consults:check -- --month YYYY-MM --client btskin,belrmon
npm.cmd run report:context -- --month YYYY-MM --all
```

생성 파일은 `.report-context/YYYY-MM/{clientId}.json`에 저장되며 커밋하지 않는다. 이 파일은 `summary&draftMode=light`, `consultsList` 조회 결과를 정규화한 보고서 작성용 스냅샷이다. `btskin`/`belrmon` 보고서는 상담 표준경로 확인 후 작성한다.

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

## 11. 에러 처리

| 응답 | 의미 |
|------|------|
| `{ "success": false, "error": "..." }` | 요청 오류 — error 메시지 확인 |
| HTTP 302 + redirect | 정상. `redirect: 'follow'` 미설정 시 발생. 반드시 follow 처리 |
| `{ "success": true, "duplicate": true }` | addSubJob 중복 — 기존 jobId 반환, 정상 처리 |
