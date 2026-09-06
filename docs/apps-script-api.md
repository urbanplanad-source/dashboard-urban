# Apps Script 내부 API 계약

## 역할과 경계

Apps Script는 로컬 `index.html`과 Google Sheets 사이의 내부 데이터 서버입니다.
저장소의 `apps-script/*.gs`는 붙여넣기용 패치이며 라이브 전체 소스가 아닙니다.
라이브 Apps Script에 수동 반영하기 전에는 편집기 전체를 비공개 백업하고 실제 함수 위치를 확인합니다.
로컬 패치·문서 수정과 로컬 검증은 요청 범위 안에서 진행하며, 라이브 접근을 선행 조건으로 삼지 않습니다. 운영 POST와 배포의 사용자 수동 수행 경계는 유지합니다.

공개 보고서 HTML은 이 API를 호출하지 않습니다. 모든 GET/POST action은 관리 키가 필요합니다.

## 인증

- Script Property: `DASHBOARD_API_KEY`
- GET: `apiKey` 쿼리 파라미터
- POST: JSON 본문의 `apiKey`
- 실패 응답: `{"success":false,"error":"unauthorized"}`
- 인증 실패 시 Sheets를 열거나 데이터를 읽거나 변경하지 않습니다.
- 키는 `credentials.local.js` 또는 로컬 환경변수에만 두며 Git에 저장하지 않습니다.

브라우저 POST는 Apps Script CORS 동작을 위해 `redirect: 'follow'`를 사용하고
`Content-Type`을 포함한 커스텀 헤더를 추가하지 않습니다.

## 내부 action

GET 조회: `summary`, `clients`, `postLogs`, `draftsList`, `draftDetail`,
`clientBriefs`, `clientBrief`, `consultsList` 및 현재 대시보드가 사용하는 기타 조회.

POST 변경: 거래처·업무·로그·발행·초안·브리프·비용·계약·상담의 저장/수정/삭제와
`monthlyReset`.

### 발행·예약 기록

`addPost`는 `publishedAt: YYYY-MM-DD`를 받으며 과거·오늘·미래 날짜를 모두 그대로
`PostLogs.publishedAt`에 저장합니다. `month`는 해당 날짜의 `YYYY-MM`에서 계산합니다.
날짜가 없거나 유효하지 않을 때만 Apps Script 시간대 기준 오늘 날짜를 사용합니다.
클라이언트는 재전송 중복 방지를 위해 `logId`를 함께 보낼 수 있습니다.

`summary`에는 상담 원문 `consults`와 리뷰 모니터 `reviewTargets`를 포함하지 않습니다.
상담은 `consultsList`로 거래처와 월을 지정해 조회합니다.

`consultHistories`는 이 브라우저에만 저장되는 보조 이력이며 상담 원본이 아닙니다.
예약 고객 캘린더도 Apps Script나 Google Sheets로 전송하지 않고 해당 브라우저에만 저장합니다.

## 상담 저장

`addConsult`는 `consultId`와 `clientId`가 필요합니다. Script Lock 안에서 같은 ID를
찾아 기존 행을 갱신하거나 새 행을 추가합니다. 클라이언트 재시도는 같은 `consultId`를
사용하므로 버튼 연타나 통신 결과 불명 뒤 재시도에서 중복 행을 만들지 않습니다.

## 월간 초기화

`monthlyReset`은 `month: YYYY-MM`을 받고 Script Lock 안에서 실행합니다.
완료 서브업무 삭제, 카운트 초기화, 월 변경을 수행하며 명확한 `success`와 `stage`를
반환합니다. 대시보드는 Sheets 성공 응답을 확인한 뒤에만 로컬 상태를 초기화합니다.

초기화 검증은 반드시 복제 Sheets와 임시 배포에서만 수행합니다. 운영 시트에서 시험하지
않습니다. 통신 오류나 비 JSON 응답은 반영 여부 불명으로 취급하고 자동 재시도하지 않습니다.

## 제거된 기능

리뷰 모니터 action과 `reportPostLogs` 공개 경로는 사용하지 않습니다.
`ReviewTargets`와 `ReviewLogs` 시트는 과거 기록 보존용으로 남기되 API 응답에 넣지 않습니다.

## 수동 반영 순서

1. 라이브 Apps Script 전체 백업
2. `apps-script/internal_api_security_patch_v23.gs`의 인증 게이트 적용
3. `summary` 최소화와 제거 대상 case 확인
4. 안전한 `addConsult`, `monthlyReset`, 선택 날짜를 보존하는 `addPost` 교체
5. 복제 Sheets에서 무키/오키/정상키와 mutation 안전성 검증
6. 기존 웹 앱 배포의 새 버전으로 갱신해 `/exec` URL 유지
7. 두 PC의 `credentials.local.js`에 URL과 키를 별도 입력

운영 POST와 배포는 로컬·복제 검증 후 사용자가 명시적으로 수행합니다.
