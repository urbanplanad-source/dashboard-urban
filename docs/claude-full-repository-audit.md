# Claude용 dashboard-urban 전체 코드 감사 지시서

## 1. 감사 목적

이 저장소는 번들러 없이 `index.html`을 직접 여는 방식과 GitHub Pages 배포를 동시에 지원하는 운영 대시보드다. 프런트엔드, Google Apps Script API 계약, Google Sheets 데이터, 월말보고서 HTML, 네이버 리뷰 모니터링 스크립트가 한 저장소에 함께 있다.

이번 감사의 목적은 코드를 수정하는 것이 아니라 다음 위험을 근거와 함께 찾는 것이다.

- 데이터 손실, 중복 저장, 부분 성공, 재시도 중복 실행
- 로컬 `file://` 실행과 GitHub Pages 실행 간 차이
- Apps Script/Sheets API 계약 불일치
- 월간 초기화, 상담 백업, 글 보관함, 손익 데이터의 월 경계 오류
- 인증·권한·민감정보·공개 API 관련 보안 위험
- 단일 대형 HTML의 상태 동기화, 비동기 처리, 예외 처리 문제
- 테스트가 통과해도 브라우저에서 깨질 수 있는 경로
- 운영용 임시 스크립트와 오래된 백업 파일로 인한 혼동

감사는 **읽기 전용**이다. 명시적인 별도 승인이 없으면 파일 수정, Git 작업, POST 요청, 삭제, 초기화, 저장, 발행, 배포를 하지 않는다.

## 2. 반드시 먼저 읽을 파일

다음 순서로 읽는다.

1. `AGENTS.md`
2. `package.json`
3. `docs/apps-script-api.md`
4. `index.html`
5. `scripts/ops-check.mjs`
6. 감사 구역에서 지정한 관련 파일

`apps-script/*.gs`는 배포된 전체 Apps Script 원본이 아니라 수동 반영용 패치/헬퍼일 수 있다. 저장소 코드만 보고 라이브 서버가 동일하다고 단정하지 않는다.

## 3. 절대 금지 사항

- `monthlyReset`, `deleteDraft`, `deleteConsult`, `deleteExpense`, `deleteSubJob` 등 변경성 API 호출
- `addDraft`, `addConsult`, `addPost`, `addExpense` 등 실제 데이터 저장
- 리뷰 모니터의 비드라이런 실행
- Google Sheets 또는 Apps Script 편집/배포
- 커밋, 푸시, 배포, 브랜치 생성
- 사용자의 기존 변경 덮어쓰기
- 실제 운영 데이터에 대한 자동 수정 또는 정리

허용되는 검사는 파일 읽기, `git diff`, 정적 검색, 문법 검사, 로컬 테스트, GET 기반 조회다. GET도 개인정보가 포함될 수 있으므로 결과 전문을 감사 보고서에 복사하지 말고 구조와 건수만 기록한다.

## 4. 현재 주의해야 할 작업 상태

감사 시작 시 반드시 `git status --short`와 `git diff -- index.html docs/apps-script-api.md`를 먼저 확인한다. 현재 `index.html`과 `docs/apps-script-api.md`에는 사용자가 요청한 미커밋 변경이 있을 수 있으므로 기존 코드와 섞어서 수정하면 안 된다.

최근 집중 수정 영역은 다음과 같다.

- 벨르몬성형외과 2026년 8월 외국인 상담 표시
- 상담 화면의 월 선택과 과거 월 보존
- 월말 초기화 미리보기의 원격 `consultsList` 기준 집계
- `API is not defined` 수정
- 초기화 전에 상담자료를 `addConsult`로 대량 재전송하던 경로 제거
- 브라우저의 다중 변경 요청 대신 서버 `monthlyReset` 단일 요청 사용

2026년 8월 표준 상담 조회에서 확인된 기준 건수는 다음과 같다. 라이브 상태는 바뀔 수 있으므로 필요하면 GET으로만 재확인한다.

- `btskin`: 99건 — 위챗 80, 라인 12, 인스타 7
- `belrmon`: 26건 — 라인 11, 위챗 11, 인스타 4

## 5. 권장 실행 명령

PowerShell 실행 정책 문제가 있으면 `npm` 대신 `npm.cmd`를 사용한다.

```powershell
git status --short
git diff --check
git diff -- index.html docs/apps-script-api.md
npm.cmd run check
npm.cmd test
npm.cmd run verify
npm.cmd run check:syntax
npm.cmd run report:consults:check -- --month 2026-08 --client btskin,belrmon
npm.cmd run review:monitor:dry-run
```

`review:monitor` 비드라이런은 실행하지 않는다. 테스트가 외부 상태를 변경할 가능성이 있으면 실행 전에 멈추고 보고한다.

## 6. 심각도와 보고 형식

각 발견사항은 다음 형식을 사용한다.

```text
[P0/P1/P2/P3] 짧은 제목
- 위치: 파일:시작줄-끝줄
- 증거: 실제 코드와 재현 가능한 흐름
- 영향: 어떤 데이터/사용자/월/거래처가 영향을 받는가
- 재현: 안전한 읽기 전용 또는 로컬 절차
- 권장 수정: 최소 변경 방향
- 검증: 수정 후 확인해야 할 테스트
- 확신도: 높음/중간/낮음
```

- P0: 즉시 데이터 손실·대규모 보안 사고 가능
- P1: 실제 운영 실패, 중복/부분 반영, 권한 문제 가능
- P2: 특정 조건에서 오류 또는 유지보수 위험
- P3: 품질·가독성·문서·테스트 개선

스타일 취향이나 근거 없는 리팩터링 제안은 발견사항으로 올리지 않는다. 문제가 없으면 “중대한 문제 없음”이라고 명시한다.

---

# 구역별 감사 프롬프트

전체 범위가 넓기 때문에 아래 구역을 각각 별도 Claude 대화 또는 별도 컨텍스트에서 감사한 뒤 마지막에 통합한다.

## 구역 A — `index.html` 프런트엔드 구조와 상태 관리

### 범위

- `index.html`
- 비교 목적으로만 `index.backup.html` 및 `index.before-*.html`

### 집중 항목

- 전역 함수/컴포넌트 스코프 오류와 선언 순서
- `window.dashboardAPI`, `safeStorage`, `window.dashboardData` 생명주기
- React state와 localStorage, Sheets 응답 간 우선순위
- 비동기 fetch 경쟁, stale closure, 언마운트 후 상태 변경
- 로컬 파일 실행에서 CORS/redirect/리소스 경로 문제
- 월 계산에서 KST 대신 UTC가 섞이는 경로
- 목록 병합 시 중복·누락·과거 월 삭제 가능성
- 오류 시 오래된 로컬 데이터를 정상 원격 데이터처럼 표시하는지
- 버튼 중복 클릭, 로딩 중 재실행, disabled 처리
- 대형 단일 파일 안의 중복 구현과 서로 다른 API 처리 방식

### Claude에게 보낼 프롬프트

```text
이 저장소의 AGENTS.md와 docs/claude-full-repository-audit.md를 먼저 읽고, 구역 A만 읽기 전용으로 감사해 주세요. index.html의 프런트엔드 구조, React 상태, localStorage/Sheets 동기화, 비동기 오류, file://와 GitHub Pages 호환성, KST 월 경계를 집중적으로 확인하세요. 기존 미커밋 변경은 수정하지 마세요. 발견사항은 P0-P3 순서로 파일과 정확한 줄 번호, 재현 흐름, 최소 수정 방향을 제시하세요. 코드 수정이나 운영 API POST는 하지 마세요.
```

## 구역 B — API 계약, 데이터 변경 안전성, 보안

### 범위

- `index.html`의 모든 fetch/API 호출
- `docs/apps-script-api.md`
- `apps-script/*.gs`

### 집중 항목

- action 이름, 필드명, 응답 구조 불일치
- POST의 `redirect: 'follow'` 및 금지된 `Content-Type` 헤더
- JSON이 아닌 HTML 오류 응답 처리
- 부분 성공 후 재시도 시 중복/삭제 위험
- mutation idempotency, request ID, 재전송 안전성
- 익명 GET/POST와 인증·인가·리플레이 위험
- 개인정보가 공개 API/로그/브라우저 저장소에 노출되는지
- Apps Script 패치와 라이브 배포 코드의 불확실성
- 여러 POST를 `Promise.all`로 동시에 보내 부분 성공할 가능성
- 실패 메시지가 “반영 안 됨”을 사실로 보장하는지

### Claude에게 보낼 프롬프트

```text
AGENTS.md와 docs/claude-full-repository-audit.md를 먼저 읽고 구역 B만 감사해 주세요. index.html의 모든 API 호출, docs/apps-script-api.md 계약, apps-script 패치들을 대조하세요. 데이터 변경 요청의 부분 성공, 중복 재시도, 인증/인가, 개인정보 노출, JSON/redirect/CORS 처리를 최우선으로 보세요. 라이브 Apps Script가 패치 파일과 동일하다고 가정하지 마세요. 실제 POST/저장/삭제/초기화는 금지하며, 필요하면 GET 또는 정적 분석만 사용하세요. 결과는 P0-P3, 파일:줄, 증거, 영향, 안전한 재현, 최소 수정, 검증 방법으로 작성하세요.
```

## 구역 C — 월말 초기화와 상담 백업 집중 감사

### 범위

- `index.html`의 `getMonthlyResetPreview`
- `MonthlyResetPreviewModal`
- `handleMonthlyReset`
- 상담 저장/조회/병합 함수
- `apps-script/monthly_reset_patch_v16.gs`
- `apps-script/consults_patch_v14.gs`
- 관련 API 문서

### 필수 검증 질문

1. 미리보기와 실제 백업이 동일한 월·동일한 원격 자료를 사용하는가?
2. 초기화 실패 전후에 로컬과 Sheets가 서로 다른 상태가 될 수 있는가?
3. `monthlyReset` 성공 후 summary GET 실패 시 사용자가 재실행하면 안전한가?
4. 완료 서브업무 삭제와 미완료 이월이 서버에서 원자적으로 처리되는가?
5. 상담 원본은 Sheets에 유지되고 백업 이력에는 정확히 한 번 저장되는가?
6. 같은 월 초기화를 두 번 눌러도 중복·손실이 없는가?
7. 버튼 다중 클릭과 느린 네트워크가 방지되는가?
8. 성공 여부를 확인하기 전에 로컬 화면을 초기화하지 않는가?
9. 8월 자료가 9월 상담 1건 때문에 숨겨지지 않는가?
10. `API is not defined`, `Failed to fetch`, HTML 응답 등 최근 오류가 다시 발생할 경로가 있는가?

### Claude에게 보낼 프롬프트

```text
AGENTS.md와 docs/claude-full-repository-audit.md를 먼저 읽고 구역 C만 매우 엄격하게 감사해 주세요. 최근 장애는 8월 벨르몬 상담이 9월 1건 때문에 숨겨짐, 초기화 미리보기의 API is not defined, 원격 조회 실패 시 잘못된 로컬 누적 건수 표시, 초기화 전 상담 125건 재전송으로 Failed to fetch 발생이었습니다. 현재 코드는 이를 수정하려는 미커밋 상태입니다. getMonthlyResetPreview, MonthlyResetPreviewModal, handleMonthlyReset, 상담 병합, monthly_reset_patch_v16.gs, consults_patch_v14.gs를 end-to-end로 추적하세요. 실제 초기화나 POST는 절대 실행하지 말고, 모의 fetch 또는 정적 분석을 사용하세요. 이중 실행, 부분 성공, 성공 후 GET 실패, 월 경계, 로컬/Sheets 불일치를 집중적으로 찾아 P0-P3 형식으로 보고하세요.
```

## 구역 D — Node 스크립트, 테스트, 자동화

### 범위

- `scripts/ops-check.mjs`
- `scripts/check-consults-api.mjs`
- `scripts/fetch-report-context.mjs`
- `scripts/naver-review-monitor.mjs`
- `test/*.test.mjs`
- `.github/workflows/*`
- `review-monitor.config.example.json`

### 집중 항목

- dry-run이 실제 쓰기를 완전히 막는지
- 네트워크 timeout/retry가 읽기와 쓰기를 구분하는지
- `check_failed`에서 기준 리뷰 수를 변경하지 않는지
- KST 날짜 처리
- JSON/HTML 오류 응답 처리
- 임시 파일, 스냅샷, 로그, 비밀 설정의 Git 포함 위험
- ops-check가 실제 `index.html` JSX/브라우저 동작을 검증하지 못하는 공백
- 테스트가 중요한 mutation 실패 경로를 다루는지
- `.github` 정기 실행의 권한과 비밀값 처리

### Claude에게 보낼 프롬프트

```text
AGENTS.md와 docs/claude-full-repository-audit.md를 읽고 구역 D만 감사해 주세요. scripts, test, workflow, review monitor 설정을 읽기 전용으로 검사하세요. dry-run 무결성, KST 날짜, 읽기/쓰기 재시도 구분, check_failed 기준값 보존, 비밀정보, timeout, JSON 오류, 테스트 공백을 확인하세요. review:monitor 비드라이런은 실행하지 마세요. npm.cmd run check/test/verify와 review:monitor:dry-run만 안전성을 확인한 뒤 실행할 수 있습니다. 발견사항을 P0-P3와 정확한 줄 번호로 보고하세요.
```

## 구역 E — 보고서 HTML, 문서, 운영 파일 위생

### 범위

- `btskin.html`, `belrmon.html`, `gyunghee.html`, `eyecare.html`, `igochi.html`, `echi.html`, `seoulup.html`, `jejuexpress.html`
- `docs/briefs/**`
- `docs/compliance/**`
- 루트의 `index.backup.html`, `index.before-*.html`
- `scripts/tmp-*`

### 집중 항목

- 새 월 탭이 기존 월을 덮어쓰는지
- active 탭과 월 순서
- 보고서 데이터가 API/Sheets 수치와 구분되는지
- 깨진 상대 링크, 로컬 절대경로, `file://`, GitHub 전용 URL
- 의료광고 문구와 검수 자료 연결
- 오래된 백업 HTML이 운영 파일로 오인될 가능성
- `tmp-*` 스크립트가 실제 운영 mutation을 수행할 수 있는지
- 임시 파일·민감 데이터·다운로드 산출물이 커밋 대상에 섞이는지

### Claude에게 보낼 프롬프트

```text
AGENTS.md와 docs/claude-full-repository-audit.md를 읽고 구역 E만 감사해 주세요. 거래처별 보고서 HTML, briefs/compliance 문서, 루트 백업 HTML, scripts/tmp-*의 운영 위험을 검사하세요. 기존 월 보존, active 탭, 상대 링크, 수치 출처, 의료광고 검수 연결, 임시 mutation 스크립트와 민감정보/커밋 위험을 확인하세요. 문구 자체를 대량 교정하지 말고 실제 결함과 운영 혼동 위험만 P0-P3로 보고하세요.
```

---

# 최종 통합 감사 프롬프트

구역 A-E 결과를 모두 받은 뒤 아래 프롬프트와 함께 전달한다.

```text
첨부한 구역 A-E 감사 결과를 통합해 주세요. 중복 발견사항은 하나로 합치고, 서로 충돌하는 결론은 원본 코드 근거로 재판정하세요. 최종 보고서는 다음 순서로 작성하세요.

1. 운영 중단이 필요한 P0/P1
2. 데이터 손실·중복·부분 성공 위험
3. 보안 및 개인정보 위험
4. 월말 초기화/상담 백업 전용 결론
5. 테스트와 관측성 공백
6. P2/P3 개선사항
7. 최소 수정 순서(각 단계의 파일, 예상 영향, 검증 명령)
8. 수정하지 않아도 되는 영역
9. 확인이 필요한 라이브 Apps Script 가정

읽기 전용 감사이며 코드 수정, POST, 삭제, 초기화, 배포를 하지 마세요. 각 핵심 결론에는 반드시 파일:줄 근거를 붙이고, 확신도가 낮으면 낮다고 표시하세요. 근거 없는 전면 재작성이나 프레임워크 마이그레이션은 제안하지 마세요.
```

## 7. 감사 완료 기준

- A-E 모든 구역이 검사됨
- 각 발견사항에 파일과 줄 번호가 있음
- 현재 미커밋 변경과 기존 결함이 구분됨
- 실제 운영 상태를 바꾼 검사가 없음
- 월간 초기화와 상담 백업의 실패/재시도 시나리오가 포함됨
- 보안 문제는 공격 가능성과 실제 노출 범위를 구분함
- 최종 수정 우선순위와 검증 방법이 제시됨
- “문제 없음”인 구역도 명시됨
