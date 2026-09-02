# Claude 수정 실행용 handoff — dashboard-urban 감사 후속 조치

## 목표와 작업 원칙

이 문서는 `docs/claude-full-repository-audit.md` 및 Claude의 감사 결과를 바탕으로 실제 수정 범위를 통제하기 위한 handoff다.

- 먼저 `AGENTS.md`, `docs/apps-script-api.md`, `docs/claude-full-repository-audit.md`를 읽는다.
- 현재 `index.html`, `docs/apps-script-api.md`, 이 문서는 사용자 소유의 미커밋 변경이다. 덮어쓰거나 되돌리지 않는다.
- 각 단계는 별도 diff와 검증 결과를 사용자에게 보여준 후 다음 단계로 넘어간다.
- 운영 POST, 월간 초기화, 삭제, 발행, 배포, force push는 사용자 승인 없이 실행하지 않는다.
- 보안 정리와 기능 수정은 한 커밋에 섞지 않는다.
- 단일 정적 HTML 구조를 유지하고 프레임워크/번들러 마이그레이션을 하지 않는다.

## 감사 결과 재확인 및 정정

현재 체크아웃에서 재확인된 사항:

- GitHub 원격 저장소는 인증 없는 GitHub API에서 `public`으로 확인된다.
- `review-monitor.config.json`은 Git이 추적 중이며 Telegram token/chat ID 필드를 포함한다. 실제 값을 출력하거나 문서에 복사하지 않는다.
- 환자 상담 원문을 포함한 `scripts/tmp-retry-btskin-aug-consults.mjs`가 Git에 추적되어 있다.
- Git 추적 중인 `scripts/tmp-*`는 17개다. 감사 보고서의 14개보다 많으므로 고정 목록을 믿지 말고 `git ls-files 'scripts/tmp-*'` 결과를 기준으로 한다.
- 현재 추적 목록에는 `.tmp-btskin-aug-retry-status.json`, `verification-status.png`가 있다.
- 감사 보고서가 언급한 루트 `18건` 파일은 현재 `git ls-files` 결과에는 없다. 없는 파일을 삭제 대상으로 만들지 않는다.
- 상담 상세 화면의 자동 `addConsult` 재전송 루프 두 곳은 현재도 존재한다.
- 월간 초기화 성공 후 summary 실패를 구분하지 못하며, 빈 업무 응답 시 자동 `addSubJob` 보강으로 중복 생성할 수 있다.

중요한 정정:

- 공개 정적 `index.html` 안에 공유 시크릿을 넣는 방식은 보안 개선이 아니다. 브라우저에 전달되는 값은 누구나 볼 수 있다.
- Apps Script 인증 문제는 사용자 인증이 있는 배포, 인증 프록시/백엔드, 또는 공개 응답에서 민감정보와 mutation을 제거하는 방식으로 해결해야 한다.

---

# Phase 0 — 즉시 보안 차단

이 단계는 코드 수정만으로 끝나지 않는다. 사용자가 직접 해야 할 운영 조치가 포함된다.

## Claude가 할 일

1. 민감한 값을 출력하지 않고 다음을 목록화한다.
   - `git ls-files 'scripts/tmp-*'`
   - `git ls-files review-monitor.config.json`
   - `git log --all --oneline -- review-monitor.config.json scripts/tmp-retry-btskin-aug-consults.mjs`
2. `scripts/tmp-*`를 읽기 전용/변경성/개인정보 포함으로 분류한다.
3. 재사용 가치가 없는 임시 파일은 삭제 대상으로 제안한다.
4. 필요한 진단 스크립트는 개인정보와 운영 endpoint를 제거하고 `--apply` 없이는 절대 POST하지 않는 정식 이름으로 재작성할지 제안한다.
5. `.gitignore`에 최소한 다음 패턴을 추가하는 패치를 준비한다.
   - `review-monitor.config.json`
   - `.tmp-*`
   - `scripts/tmp-*`
   - 검증 스크린샷/상태 파일의 명확한 패턴
6. Git 이력 정리 명령은 **제안만** 한다. 사용자 승인 전 실행하지 않는다.

## 사용자가 직접 해야 할 일

1. GitHub 저장소를 즉시 private으로 전환한다.
2. GitHub Pages가 별도로 계속 공개되는지 확인하고, 공개 중이면 우선 비활성화한다.
3. BotFather에서 노출된 Telegram bot token을 폐기하고 재발급한다. 새 토큰을 채팅이나 저장소에 붙여 넣지 않는다.
4. Apps Script 배포 관리에서 기존 익명 Web App을 확인한다. 민감 상담 GET과 mutation을 익명 공개 상태로 유지할지 결정한다.
5. 병원/환자정보 노출 범위와 필요한 통지·대응은 개인정보 담당자 또는 법률 전문가와 검토한다.
6. 이력 제거와 force push는 협업자 영향이 있으므로 Claude가 만든 대상 목록을 확인한 뒤 별도 승인한다.

## 완료 조건

- 저장소와 Pages의 공개 노출이 차단됨
- 기존 Telegram token이 무효화됨
- 민감 파일이 현재 브랜치에서 제거될 준비가 됨
- Git 이력 정리 대상과 복구 가능한 보관 방법이 사용자에게 제시됨
- 새 비밀값은 Git에 포함되지 않음

## Claude 프롬프트

```text
Phase 0만 수행해 주세요. AGENTS.md와 docs/claude-remediation-handoff.md를 먼저 읽으세요. 민감값은 절대 출력하지 말고, 현재 Git 추적 파일과 이력에서 개인정보/토큰 노출 대상을 정확히 목록화하세요. 작업 트리에서 안전하게 제거하고 .gitignore를 보강하는 패치를 준비하되, git filter-repo, force push, 저장소 공개 설정 변경, 토큰 재발급, Apps Script 배포 변경은 실행하지 말고 사용자가 할 명령과 영향만 제시하세요. 기존 index.html/docs 미커밋 변경은 건드리지 마세요. 완료 후 변경 파일, 삭제 파일, 이력 제거 후보, 사용자가 즉시 해야 할 일, 검증 명령을 보고하고 다음 단계로 넘어가지 마세요.
```

---

# Phase 1 — 초기화와 상담 동기화의 데이터 안전성

## 수정 범위

- `index.html`
- `test/*.test.mjs`
- 필요 시 `docs/apps-script-api.md`
- 실제 Apps Script 배포 코드는 아직 변경하지 않음

## 필수 수정

1. 상담 화면 로딩 시 자동 POST 제거
   - 원격 결과가 빈 배열이어도 로컬 전체를 자동 `addConsult`하지 않는다.
   - 원격에 없는 로컬 항목도 화면을 여는 것만으로 자동 POST하지 않는다.
   - 기존 로컬 데이터는 삭제하지 말고 표시/병합 정책을 유지하되, 서버 저장은 명시적 사용자 행동으로만 수행한다.
2. 월간 초기화 상태 머신 분리
   - `preflight` 상담 GET
   - `monthlyReset` POST 1회
   - `serverResetSucceeded = true`
   - summary 재조회/화면 반영
3. POST 성공 후 summary GET 실패를 초기화 실패로 표시하지 않는다.
   - 안내: “Sheets 초기화는 완료되었으나 화면 갱신에 실패했습니다. 다시 초기화하지 말고 동기화해 주세요.”
4. 자동 이월 보강 POST 제거
   - summary가 비거나 불완전하면 `addSubJob`으로 자동 재생성하지 않는다.
   - 서버 결과 검증에 실패하면 경고하고 수동 확인 대상으로 남긴다.
5. 로컬 상태는 성공한 `afterReset` 서버 응답을 우선 사용한다.
   - 특히 `monthlyJobs`를 로컬 추정 규칙으로 다시 만들지 않는다.
6. 재진입 방지
   - state뿐 아니라 즉시 동작하는 ref/lock으로 중복 클릭을 막는다.
   - 미리보기와 실행 버튼에 진행 상태 및 disabled를 연결한다.
7. `순위` 업무를 미리보기의 완료/이월 집계에 포함한다.
8. 실패 메시지는 어느 단계까지 성공했는지 구분한다.

## 권장 설계

`handleMonthlyReset`은 다음 결과 상태를 명시적으로 가져야 한다.

```text
idle
  -> preflight_loading
  -> reset_posting
  -> reset_applied_refreshing
  -> complete
  -> preflight_failed
  -> reset_failed
  -> reset_applied_refresh_failed
```

`reset_applied_refresh_failed`에서는 초기화를 재시도하라고 안내하면 안 된다.

## 필수 테스트

- 상담 화면을 열어도 `addConsult` POST가 0회
- 초기화 연속 클릭 시 `monthlyReset` POST가 1회
- `monthlyReset` POST 실패 시 로컬 상태 미변경
- POST 성공 후 summary 실패 시 “서버 적용됨/새로고침 실패” 안내
- summary가 빈 배열 또는 필드 누락이면 `addSubJob` POST가 0회
- 정상 경로에서 원격 `monthlyJobs`가 로컬 상태에 반영
- 8월 상담 기준 `btskin 99`, `belrmon 26` 조회 유지
- `npm.cmd run verify` 통과
- 실제 POST는 모의 fetch로만 검증

## Claude 프롬프트

```text
Phase 1만 구현해 주세요. AGENTS.md와 docs/claude-remediation-handoff.md를 먼저 읽고 현재 미커밋 변경을 보존하세요. index.html의 상담 화면 자동 addConsult 백필 두 경로를 제거하고, 월간 초기화를 preflight/POST 성공/refresh 성공 단계로 분리하세요. monthlyReset POST 성공 후 summary 실패는 서버 적용 완료로 안내하고 재초기화를 유도하지 마세요. 빈/불완전 summary에서 addSubJob 자동 보강을 절대 하지 마세요. afterReset 서버 데이터를 로컬 상태의 source of truth로 사용하고, ref 기반 재진입 방지와 버튼 disabled를 추가하세요. 순위 업무도 미리보기 집계에 포함하세요. 실제 운영 POST 없이 모의 fetch 테스트를 추가해 모든 필수 시나리오를 검증하고 npm.cmd run verify를 실행하세요. 완료 후 diff, 테스트 결과, 남은 위험을 보고하고 Phase 2로 넘어가지 마세요.
```

---

# Phase 2 — 월 선택, 로컬 복원, 백업 표시 정확성

## 수정 범위

- `index.html`
- 관련 테스트
- `docs/apps-script-api.md`

## 필수 수정

1. `loadData()`에 `reviewTargets` 복원 추가
2. 상담 월 selector의 value가 옵션에 없으면 첫 유효 월로 보정
3. 월말 초기화의 마감월을 `prevMonth()`로 암묵 고정하지 않음
   - 미리보기에서 사용자가 마감월을 확인/선택
   - 목표 운영월은 마감월의 다음 달로 계산
   - 미래/역행/이미 처리된 월은 경고 또는 차단
4. `consultHistories`가 브라우저 로컬 보조 이력이며 Sheets 원본을 대체하는 영구 백업이 아님을 UI/문서에 명시
5. 같은 달 자동 백업 키 덮어쓰기 방지
   - 최소한 날짜·시간 또는 세대 번호를 포함
   - 보관 개수 정책을 둠
6. `postLogs: []`로 잠깐 사라졌다 다시 나타나는 혼란 제거
7. 불필요한 `data.expenses` dead write는 서버 source of truth와 맞게 정리

## 필수 테스트

- localStorage만 있는 상태에서 `reviewTargets` 복원
- 상담 0건/1개 월/여러 월 selector
- 8월 31일, 9월 1일, 9월 2일 마감월 계산
- 동일 월 백업이 이전 스냅샷을 조용히 덮어쓰지 않음
- 초기화 성공 직후 발행기록 UI가 불필요하게 비지 않음

## Claude 프롬프트

```text
Phase 2만 구현해 주세요. loadData의 reviewTargets 복원, 상담 월 selector 유효값 보정, 명시적 마감월 선택과 다음 운영월 계산, 로컬 consultHistories의 보조 백업 표시, 자동 백업 키 세대 관리, postLogs/expenses의 초기화 후 화면 불일치를 최소 변경으로 수정하세요. 8월 31일과 9월 1일 경계를 테스트하세요. 기존 단일 HTML 구조와 KST 규칙을 유지하고 실제 운영 POST는 하지 마세요. npm.cmd run verify 후 변경 및 검증 결과를 보고하고 Phase 3으로 넘어가지 마세요.
```

---

# Phase 3 — Apps Script 서버 안전성

## 전제

저장소의 `apps-script/*.gs`는 배포된 전체 원본이 아니라 적용용 패치다. Claude는 로컬 패치를 작성할 수 있지만 실제 Apps Script 편집기 반영과 재배포는 사용자가 해야 한다.

## 필수 수정안

1. `monthlyReset`
   - `LockService.getScriptLock()` 획득, timeout 처리, `finally` 해제
   - 동일 마감월/목표월 재실행에 대한 멱등 결과
   - 완료업무 삭제와 카운트/월 변경의 처리 결과를 응답에 포함
   - 가능하면 셀별 `setValue` 반복을 범위 `setValues`로 축소
2. `addConsult`
   - lock 안에서 consultId 존재 확인과 append/update 수행
   - 동시 요청 중복 방지
3. 응답 계약
   - 모든 예외를 JSON `{ success:false, error, stage }`로 반환
   - 민감 원문이나 stack trace를 응답하지 않음
4. 인증/공개 범위
   - 공개 정적 HTML에 공유 시크릿을 넣지 않음
   - 최소한 익명 `consultsList`에서 상담 원문 `content`를 제거하거나 인증된 상세 조회로 분리
   - mutation은 인증된 사용자/프록시를 거치도록 별도 설계안 제시

## 사용자 결정 필요

- A: Google 계정 로그인이 필요한 Apps Script Web App으로 제한
- B: 인증 프록시/백엔드를 두고 정적 대시보드는 프록시만 호출
- C: 공개 대시보드는 집계 데이터만 조회하고 상담 원문·mutation 기능을 제거

보안상 권장은 B 또는 내부 사용자만 쓸 경우 A다. 기존처럼 익명 mutation을 유지하면서 정적 HTML에 secret을 넣는 선택은 허용하지 않는다.

## 배포 전 검증

- 현재 라이브 Apps Script 전체 원본을 안전한 비공개 위치에 백업
- 로컬 patch와 실제 라이브 함수 차이 확인
- 스테이징 또는 복제 Sheet에서만 reset 테스트
- 원본 `Consults`/`PostLogs`가 monthlyReset 전후 유지되는지 확인
- 동시 reset 2회에서 1회만 적용되는지 확인
- 배포 후 GET 계약과 인증 실패 응답 확인

## Claude 프롬프트

```text
Phase 3의 로컬 Apps Script 패치와 배포 체크리스트만 준비해 주세요. 실제 Apps Script 편집/배포나 운영 Sheet POST는 하지 마세요. 라이브 전체 원본이 저장소에 없다는 전제로, monthlyReset과 addConsult에 LockService 및 멱등 가드를 설계하고 JSON stage 오류 계약을 문서화하세요. 공개 정적 HTML에 공유 시크릿을 넣지 마세요. 익명 상담 원문 GET과 mutation을 차단하기 위한 A/B/C 아키텍처 차이를 제시하되, 사용자가 선택하기 전 프런트 계약을 깨는 변경은 하지 마세요. 복제 Sheet 테스트 절차와 적용 순서를 보고하세요.
```

---

# Phase 4 — 테스트·문서·운영 위생

## 수정 범위

- `test/*.test.mjs`
- `scripts/ops-check.mjs`
- `.github/workflows/naver-review-monitor.yml`
- `docs/apps-script-api.md`
- 보고서 HTML은 별도 승인 후

## 작업

1. 월간 초기화와 상담 병합의 회귀 테스트 추가
2. 브라우저 JSX/런타임 smoke test 방법 추가
3. `commonTask*`, `upsertContract` API 문서화
4. 리뷰 모니터가 실제 정기 실행이어야 한다면 cron 추가 여부를 사용자에게 확인
5. 리뷰 로그와 기준값 업데이트 2단계의 중복 알림 방지 설계
6. 보고서 탭 ID를 장기적으로 `panel-YYYY-MM`로 전환
   - 2026 기존 탭 링크 호환성을 깨지 않도록 마이그레이션 계획부터 작성
7. `credentials.local.js` 404는 기능 오류가 아니므로 낮은 우선순위로 처리

## Claude 프롬프트

```text
Phase 4만 진행해 주세요. 앞 단계 완료 상태를 먼저 확인하고, 회귀 테스트·ops-check·API 문서·워크플로 불일치만 다루세요. GitHub Actions cron은 사용자 승인 없이 활성화하지 마세요. 보고서 8개의 탭 ID는 즉시 일괄 변경하지 말고 기존 링크 호환성을 포함한 마이그레이션 계획과 한 파일의 검증 예시를 먼저 제시하세요. npm.cmd run verify를 실행하고 결과를 보고하세요.
```

---

# 사용자 실행 순서 요약

1. 지금: GitHub 저장소 private + Pages 공개 중단
2. 지금: Telegram token 폐기/재발급
3. Claude Phase 0 결과 검토 후 민감 파일 현재 브랜치 제거 승인
4. Git 이력 제거 범위와 force push 승인
5. Claude Phase 1 수정 및 로컬 검증
6. 사용자가 대시보드에서 초기화를 다시 누르기 전 Phase 1 완료 확인
7. Claude Phase 2 수정 및 로컬 검증
8. Apps Script 인증 방식 A/B/C 선택
9. Claude Phase 3 패치 작성
10. 사용자가 복제 Sheet에서 검증 후 Apps Script 수동 반영·재배포
11. Claude Phase 4 정리

# 최종 승인 체크리스트

- [ ] 저장소가 더 이상 public이 아님
- [ ] Pages가 민감 대시보드를 공개하지 않음
- [ ] 노출된 Telegram token이 폐기됨
- [ ] 환자 상담 원문이 현재 브랜치와 Git 이력에서 제거됨
- [ ] 익명 API로 상담 원문 조회가 불가능함
- [ ] 익명 사용자가 mutation을 호출할 수 없음
- [ ] 상담 화면 진입만으로 POST가 발생하지 않음
- [ ] 월간 초기화 POST는 1회이며 재진입이 차단됨
- [ ] POST 성공 후 refresh 실패가 “초기화 실패”로 오인되지 않음
- [ ] 빈 summary에서 자동 업무 재생성이 발생하지 않음
- [ ] 서버 monthlyReset/addConsult에 lock과 멱등 처리가 있음
- [ ] 복제 Sheet 테스트 후에만 라이브 배포함
- [ ] `npm.cmd run verify`와 브라우저 smoke test가 통과함
