# VPS 원격 에이전트 운영 가이드

이 문서는 PC가 꺼져 있어도 VPS에서 실행되는 원격 AI 에이전트가 어반플랜애드 보고서 대시보드의 운영 데이터를 안전하게 조회, 추가, 수정하기 위한 실무 가이드다.

대시보드 데이터의 원본은 Google Sheets이고, 수정은 Apps Script Web App API를 통해 처리한다. 이 저장소의 HTML 파일은 화면과 보고서 파일이며, 일상 운영 업무(서브업무 추가, 완료 처리, 발행내역 추가, 초안 저장 등)는 대부분 API 호출만으로 처리한다.

---

## 1. 먼저 읽을 파일

작업 시작 시 아래 순서로 확인한다.

1. `VPS_AGENT_GUIDE.md` - VPS 원격 에이전트용 빠른 운영 절차.
2. `AGENTS.md` - 저장소 전체 작업 규칙, 금지 사항, 완료 체크리스트.
3. `docs/apps-script-api.md` - Apps Script API의 상세 계약, 시트 구조, 요청/응답 예시.
4. 필요한 경우 `index.html` - 대시보드가 실제로 어떤 action을 호출하는지 확인.

상세 API 계약이 이 문서와 다르게 보이면 `docs/apps-script-api.md`를 우선한다. 단, 실제 화면 동작과 차이가 있으면 `index.html`의 호출 방식도 함께 확인한다.

---

## 2. 절대 지켜야 할 운영 원칙

- 데이터 수정 전에는 가능하면 먼저 `GET ?action=summary&draftMode=light`로 현재 상태를 조회한다.
- Apps Script POST 요청에는 반드시 `redirect: 'follow'`를 넣는다.
- Apps Script POST 요청에 `Content-Type` 헤더를 추가하지 않는다.
- curl을 쓸 때는 반드시 `-L`을 붙여 리디렉트를 따라간다.
- 날짜는 KST 기준 `YYYY-MM-DD`로 처리한다. `new Date().toISOString().slice(0, 10)` 방식은 UTC 날짜라 사용하지 않는다.
- 공식 `clientId`만 사용한다: `btskin`, `belrmon`, `eyecare`, `seoulup`, `echi`, `igochi`, `jejuexpress`, `kyunghee`.
- 잘못된 별칭은 사용하지 않는다: `bellemont`, `eyeclinic`, `igo`.
- 서브/순위 업무 완료 상태는 `MonthlyJobs.note` 값 `"완료"`로 판단한다.
- 발행 기록은 `PostLogs` 기준이며, 실제 발행이 끝난 글만 `addPost`로 등록한다.
- 초안 보관은 `addDraft`이고, 발행 기록은 `addPost`다. 둘을 섞지 않는다.
- 월간 초기화(`monthlyReset`)는 사용자가 명시적으로 요청한 경우에만 실행한다.
- 운영 식별자(API URL, Sheets URL, clientId)는 임의로 바꾸지 않는다.
- 로컬 전용 설정, 토큰, `.env`, `review-monitor.config.json`, `credentials.local.js`, 로그 파일, `node_modules/`는 저장소에 추가하지 않는다.

---

## 3. 기본 API 정보

```text
API_URL=https://script.google.com/macros/s/AKfycbwUsy5dDEG-t4FszWRCj-f0-FLIOY4SPMatiNsm55xM7bFXzaAEFS6McQdvmXT85dT0/exec
Google Sheets=https://docs.google.com/spreadsheets/d/1VY8E-7T1pP37FHbdnCf76mzJc1p7Cv1uzKS8tuCY7Kk/
```

인증은 없다. 익명 접근 가능한 Apps Script Web App이다.

---

## 4. VPS에서 쓰는 기본 호출 템플릿

Node.js 20 이상에서는 전역 `fetch`를 사용할 수 있다.

```javascript
const API = 'https://script.google.com/macros/s/AKfycbwUsy5dDEG-t4FszWRCj-f0-FLIOY4SPMatiNsm55xM7bFXzaAEFS6McQdvmXT85dT0/exec';

async function getSummary() {
  const res = await fetch(`${API}?action=summary&draftMode=light`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'summary failed');
  return data.data;
}

async function postAction(body) {
  const res = await fetch(API, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || `${body.action} failed`);
  return data;
}
```

curl을 사용할 때:

```bash
curl -L -X POST \
  -d '{"action":"updateJobNote","jobId":"mj-dyn-xxx","note":"완료"}' \
  'https://script.google.com/macros/s/AKfycbwUsy5dDEG-t4FszWRCj-f0-FLIOY4SPMatiNsm55xM7bFXzaAEFS6McQdvmXT85dT0/exec'
```

---

## 5. KST 날짜 helper

날짜가 필요한 작업에서는 KST 로컬 기준을 사용한다.

```javascript
function kstDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function kstMonthString(date = new Date()) {
  return kstDateString(date).slice(0, 7);
}
```

---

## 6. 거래처 ID

| clientId | 거래처명 |
|---|---|
| `btskin` | 노형아름다운피부과 |
| `belrmon` | 벨르몬성형외과 |
| `eyecare` | 눈사랑안과 |
| `seoulup` | 서울UP치과 |
| `echi` | 이치과 |
| `igochi` | 이고치과 |
| `jejuexpress` | 제주인익스프레스 |
| `kyunghee` | 365경희부부한의원 피부센터 |

---

## 7. 현재 상태 조회

수정 전후에는 summary를 조회해 작업이 반영됐는지 확인한다.

```javascript
const data = await getSummary();

console.log(data.clients);
console.log(data.monthlyJobs);
console.log(data.postLogs);
```

자주 쓰는 필드:

| 배열 | 주요 필드 | 용도 |
|---|---|---|
| `clients` | `clientId`, `clientName`, `reportFile` | 거래처 확인 |
| `monthlyJobs` | `jobId`, `clientId`, `title`, `kind`, `dueDate`, `note`, `currentCount`, `targetCount` | 업무/서브업무/진행률 확인 |
| `postLogs` | `logId`, `clientId`, `jobId`, `title`, `url`, `publishedAt`, `month`, `channel` | 발행 기록 확인 |
| `drafts` | `draftId`, `clientId`, `title`, `channel`, `createdAt` | 글 보관함 확인 |
| `expenses` | `expenseId`, `date`, `category`, `amount`, `clientId` | 비용 확인 |

---

## 8. 서브업무 추가

사용자가 "서브업무 추가해줘", "캘린더에 거래처 업무 넣어줘"라고 하면 `addSubJob`을 사용한다.

```javascript
await postAction({
  action: 'addSubJob',
  clientId: 'btskin',
  title: '카카오채널 FAQ 업데이트',
  dueDate: '2026-06-15'
});
```

규칙:

- `clientId`는 공식 목록에서 고른다.
- `title`은 사용자가 말한 업무명을 한국어 그대로 보존한다.
- `dueDate`는 선택값이지만, 일정/캘린더 업무라면 가능한 한 넣는다.
- 같은 `clientId + title` 조합을 5분 안에 다시 추가하면 API가 중복으로 보고 기존 `jobId`를 반환할 수 있다. 이 경우 정상 처리한다.
- 추가 후 summary에서 같은 `clientId`, `title`, `dueDate`가 있는지 확인한다.

---

## 9. 서브업무 완료 처리

사용자가 "완료 처리해줘"라고 하면 먼저 summary에서 정확한 `jobId`를 찾는다.

```javascript
const data = await getSummary();
const job = data.monthlyJobs.find(j =>
  j.clientId === 'btskin' &&
  j.title.includes('카카오채널 FAQ 업데이트')
);

if (!job) throw new Error('업무를 찾을 수 없음');

await postAction({
  action: 'updateJobNote',
  jobId: job.jobId,
  note: '완료'
});
```

규칙:

- 제목이 비슷한 업무가 여러 개면 사용자에게 확인하거나, 마감일/거래처/업무 종류로 더 좁힌다.
- 완료 처리는 `note: "완료"`로 한다.
- 완료 취소나 진행중 처리 요청이면 `note: "진행중"` 또는 빈 문자열을 사용할 수 있다. 기존 대시보드 상태와 맞춰야 하므로 summary로 확인한다.
- 완료 처리 후 summary에서 해당 `jobId`의 `note`가 `"완료"`인지 확인한다.

---

## 10. 서브업무 수정/삭제

제목, 메모, 마감일 수정:

```javascript
await postAction({
  action: 'updateSubJob',
  jobId: 'mj-dyn-xxx',
  title: '수정된 업무명',
  note: '진행중',
  dueDate: '2026-06-20'
});
```

마감일만 변경:

```javascript
await postAction({
  action: 'updateSubJob',
  jobId: 'mj-dyn-xxx',
  dueDate: '2026-06-20'
});
```

삭제:

```javascript
await postAction({
  action: 'deleteSubJob',
  jobId: 'mj-dyn-xxx'
});
```

삭제는 `kind: "서브"` 업무에만 사용한다. 필수 업무는 삭제하지 않는다.

---

## 11. 발행내역 추가

사용자가 "포스팅 발행내역 추가해줘", "홈페이지 글 발행 완료로 넣어줘"라고 하면 `addPost`를 사용한다.

```javascript
await postAction({
  action: 'addPost',
  clientId: 'btskin',
  jobId: 'mj-bts-001',
  title: '제주 여드름 피부과 추천',
  url: 'https://btskin.co.kr/blog/acne',
  channel: '홈페이지'
});
```

대시보드 구현은 발행일을 별도로 전달할 수 있다. 사용자가 특정 발행일을 말했거나 소급 입력이면 `publishedAt`도 함께 넣는다.

```javascript
await postAction({
  action: 'addPost',
  clientId: 'btskin',
  jobId: 'mj-bts-001',
  title: '제주 여드름 피부과 추천',
  url: 'https://btskin.co.kr/blog/acne',
  channel: '홈페이지',
  publishedAt: '2026-06-08'
});
```

규칙:

- 실제로 발행 완료된 글만 등록한다. 작성만 끝난 글은 `addDraft`로 저장한다.
- `channel`은 `홈페이지`, `블로그`, `위챗`, `인스타`, `라인` 중 하나를 우선 사용한다.
- `jobId`는 summary의 `monthlyJobs`에서 찾는다.
- 홈페이지 발행은 보통 필수 업무 카운트가 +1 된다.
- 블로그/위챗/인스타/라인은 업무 설정에 따라 카운트 반영 방식이 다를 수 있으므로 summary로 결과를 확인한다.
- 추가 후 summary에서 `postLogs`에 새 글이 있는지, 필수 업무 카운트가 기대대로 변했는지 확인한다.

핵심 jobId:

| clientId | 업무명 | jobId | channel |
|---|---|---|---|
| `btskin` | 홈페이지 포스팅 | `mj-bts-001` | 홈페이지 |
| `btskin` | 네이버 블로그 의학정보 발행 | `mj-bts-004` | 블로그 |
| `belrmon` | 홈페이지 포스팅 | `mj-blr-001` | 홈페이지 |
| `belrmon` | 네이버 블로그 의학정보 발행 | `mj-blr-004` | 블로그 |
| `eyecare` | 홈페이지 글 발행 | `mj-eye-001` | 홈페이지 |
| `igochi` | 홈페이지 글 발행 | `mj-igo-001` | 홈페이지 |
| `kyunghee` | 네이버 블로그 의학정보 발행 | `mj-kgh-001` | 블로그 |

표에 없는 업무는 반드시 summary에서 `monthlyJobs`를 조회해 `jobId`를 확인한다.

---

## 12. 발행내역 수정/삭제

수정:

```javascript
await postAction({
  action: 'updatePost',
  logId: 'pl-xxx',
  title: '수정된 제목',
  url: 'https://example.com/new-url'
});
```

삭제:

```javascript
await postAction({
  action: 'deletePost',
  logId: 'pl-xxx'
});
```

삭제 전에는 summary에서 `logId`, `clientId`, `title`, `url`, `publishedAt`을 확인한다.

---

## 13. 글 보관함 저장

사용자가 글 작성을 요청했고 아직 실제 발행 전이면 `addDraft`로 보관한다.

```javascript
await postAction({
  action: 'addDraft',
  clientId: 'btskin',
  channel: '블로그',
  title: '제주 여드름 피부과 추천',
  content: '본문 전체 내용...',
  memo: '여드름, 피부과, 제주'
});
```

규칙:

- `addDraft`는 보관함 저장만 한다.
- 대표가 실제 발행한 뒤에만 별도로 `addPost`를 호출한다.
- 본문 없는 목록 조회는 `GET ?action=draftsList`를 사용한다.
- 본문 조회는 `GET ?action=draftDetail&draftId=dr-xxx`를 사용한다.

---

## 14. 내 사업 공통업무

거래처 업무가 아니라 회사 내부 공통 업무라면 `commonTaskAdd`를 사용한다.

```javascript
await postAction({
  action: 'commonTaskAdd',
  title: '6월 보고서 전체 검수',
  kind: 'task',
  parentId: null,
  dueDate: '2026-06-28'
});
```

수정:

```javascript
await postAction({
  action: 'commonTaskUpdate',
  taskId: 'ct-xxx',
  title: '수정된 공통업무',
  dueDate: '2026-06-29'
});
```

완료 토글:

```javascript
await postAction({
  action: 'commonTaskToggle',
  taskId: 'ct-xxx',
  done: true
});
```

삭제:

```javascript
await postAction({
  action: 'commonTaskDelete',
  taskId: 'ct-xxx'
});
```

---

## 15. 비용 등록

손익 대시보드에 반영할 지출은 `addExpense`를 사용한다.

```javascript
await postAction({
  action: 'addExpense',
  date: '2026-06-08',
  category: '촬영/디자인 제작비',
  description: '노형아름다운피부과 6월 촬영비',
  amount: 350000,
  type: '변동비',
  clientId: 'btskin',
  payMethod: '계좌이체',
  isRecurring: false,
  memo: ''
});
```

카테고리:

`인건비`, `외주비`, `광고비`, `촬영/디자인 제작비`, `툴/구독료`, `사무운영비`, `세무/수수료`, `기타비용`

관련 거래처가 없으면 `clientId: ""`를 사용한다.

---

## 16. 상담내역

상담내역은 월말보고서용 데이터다.

```javascript
await postAction({
  action: 'addConsult',
  clientId: 'btskin',
  consultId: `cs-${Date.now()}`,
  date: '2026-06-08',
  channel: '위챗',
  nickname: '상담고객',
  content: '상담 내용...',
  createdAt: new Date().toISOString()
});
```

삭제는 물리 삭제가 아니라 `status: "deleted"` 처리다.

```javascript
await postAction({
  action: 'deleteConsult',
  clientId: 'btskin',
  consultId: 'cs-xxx'
});
```

조회:

```javascript
const res = await fetch(`${API}?action=consultsList&clientId=btskin&month=2026-06`);
const data = await res.json();
```

---

## 17. 업무 브리핑 생성

사용자가 "오늘 할 일 알려줘", "마감 임박 업무 확인해줘"라고 하면 summary를 조회한 뒤 KST 기준으로 계산한다.

처리 순서:

1. `monthlyJobs`에서 `note !== "완료"`인 항목만 본다.
2. `dueDate`가 오늘인 업무를 먼저 보여준다.
3. 내일 마감, 3일 이내 마감, 마감 초과 순으로 보여준다.
4. 필수 업무는 `currentCount / targetCount` 달성률을 계산한다.
5. 완료된 서브업무 수는 `note === "완료"`로 계산한다.

`new Date().toISOString()`로 오늘 날짜를 만들지 않는다.

---

## 18. 월말보고서 작성 관련

거래처별 월말보고서 HTML을 수정해야 하는 작업은 API 호출만으로 끝나지 않는다. 이때는 저장소 파일을 직접 편집해야 하며 아래 규칙을 따른다.

- 보고서 작성 전 `npm.cmd run report:context -- --month YYYY-MM --client CLIENT_ID` 또는 `npm run report:context -- --month YYYY-MM --client CLIENT_ID`로 컨텍스트를 생성한다.
- 새 월 보고서는 기존 최신 월 탭 위에 추가한다.
- 새 월을 기본 active 탭으로 둔다.
- 기존 월 보고서 내용은 삭제하지 않는다.
- 발행 내역은 `postLogs`를 보고월 `YYYY-MM` 기준으로 필터링한다.
- 외부 콘솔 수치가 없으면 임의로 만들지 않고 `자료 확인 필요`로 남긴다.
- `.report-context/` 파일은 작업용 스냅샷이며 커밋하지 않는다.

---

## 19. 네이버 방문자 리뷰 모니터링

리뷰 모니터링 자동화는 `scripts/naver-review-monitor.mjs`가 담당한다.

대상:

- `btskin`
- `belrmon`
- `kyunghee`

운영 규칙:

- 방문자 리뷰만 확인한다. 블로그 리뷰는 저장하거나 비교하지 않는다.
- 실제 운영 데이터 갱신 전에는 가능하면 `npm run review:monitor:dry-run`을 먼저 실행한다.
- `check_failed` 상황에서는 `ReviewTargets.savedVisitorReviewCount`를 변경하지 않는다.
- 리뷰 수가 증가했으나 본문 확인이 막힌 경우에도 `increased_but_blocked`로 로그를 남기고 기준 리뷰 수는 현재 확인값으로 갱신한다.

---

## 20. 수정 후 검증

문서, 스크립트, 보고서 파일, 대시보드 구조를 바꿨다면 가능한 한 아래 명령을 실행한다.

```bash
npm run check
```

Windows PowerShell에서 `npm` 실행 정책 문제가 있으면:

```bash
npm.cmd run check
```

리뷰 모니터 스크립트만 확인할 때:

```bash
npm run check:syntax
```

---

## 21. 사용자에게 보고할 때

작업 완료 후에는 아래 정보를 짧게 보고한다.

- 어떤 action을 실행했는지
- 어떤 거래처와 업무/글/비용에 반영했는지
- 생성 또는 수정된 ID(`jobId`, `logId`, `draftId`, `expenseId` 등)
- summary로 확인한 최종 상태
- 실패했다면 API 응답의 `error` 메시지

예시:

```text
btskin에 서브업무 "카카오채널 FAQ 업데이트"를 추가했습니다.
jobId는 mj-dyn-xxx이고 마감일은 2026-06-15입니다.
summary에서 같은 제목과 마감일로 반영된 것을 확인했습니다.
```

---

## 22. 판단이 애매할 때

아래 상황에서는 바로 수정하지 말고 사용자에게 확인한다.

- 거래처를 특정할 수 없는 경우
- 같은 제목의 업무가 여러 개라 `jobId`를 하나로 좁힐 수 없는 경우
- 발행된 글인지 초안 저장인지 불명확한 경우
- 실제 발행일이 오늘인지 소급일인지 불명확한 경우
- 월간 초기화, 거래처 삭제, 발행내역 삭제처럼 되돌리기 어려운 작업
- API 문서와 실제 대시보드 호출 방식이 충돌하는 경우

확인 질문은 짧게 한다. 예: `btskin의 홈페이지 포스팅으로 등록하면 될까요?`
