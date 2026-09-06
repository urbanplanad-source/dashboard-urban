# Codex Project Guide

Codex가 이 저장소에서 항상 먼저 참고하는 작업 지시다. 이 파일에는 작업 판단에 필요한 핵심 규칙만 둔다. 상세 Apps Script API 계약, 시트 구조, 요청/응답 예시는 `docs/apps-script-api.md`에서 확인한다.

## Project Map

- `index.html`: 메인 정적 대시보드. 로컬 폴더에서 직접 열어 쓰는 1차 운영 파일이다. 의도적으로 배포하지 않는다. 외부에서 쓸 때는 노트북에 파일을 두고 직접 연다. 공개 배포(Vercel)는 `.vercelignore` allow-list로 거래처 보고서 HTML만 서빙한다.
- `btskin.html`, `belrmon.html`, `gyunghee.html`, `eyecare.html`, `igochi.html`, `echi.html`, `seoulup.html`, `jejuexpress.html`: 거래처별 월말보고서 HTML.
- `scripts/fetch-report-context.mjs`: 월말보고서 작성 전 Apps Script 데이터를 조회해 `.report-context/YYYY-MM/*.json` 스냅샷을 만드는 조회 전용 스크립트.
- `scripts/ops-check.mjs`: Codex 운영 점검 스크립트. 설정 분리, 정적 보고서, Vercel 공개 범위, JSON, 보고서 링크, 날짜 처리와 스크립트 문법을 확인한다.
- `apps-script/*.gs`: Google Apps Script에 수동 반영할 패치/헬퍼 코드. 배포된 라이브 코드 자체가 아니라 적용용 스니펫이다.
- `apps-script/internal_api_security_patch_v23.gs`: 전체 action 인증과 상담/초기화 안전성을 통합한 최신 수동 적용 기준이다.
- `credentials.local.example.js`: 개발 PC와 노트북에 각각 둘 `credentials.local.js`의 비밀값 없는 예시다.
- `docs/apps-script-api.md`: Apps Script API, Google Sheets 구조, 대시보드 운영 규칙의 상세 기준 문서.
- `docs/briefs/`: 거래처별 상세 브리프 위키. 대시보드 `ClientBriefs`보다 긴 맥락, 원본 자료 링크, 작성 기준을 보관한다.
- `docs/compliance/`: 의료광고 검수 원본 PDF, 운영 가이드, JSON 체크리스트, 서브에이전트 검수 프롬프트.

## 자율 수행과 적용 범위

- 요청된 로컬 구현·수정·검증은 완료까지 진행한다. 대화와 저장소에서 확인 가능한 정보는 먼저 조사하고, 되돌릴 수 있는 구현 선택은 기존 구조에 맞춰 판단한다. 결과·대상·운영 데이터에 중대한 영향을 주며 확인할 수 없는 사항만 질문한다.
- 승인이나 사용자 조작이 필요한 단계만 보류하고 독립적인 로컬 작업은 계속한다. 운영 POST와 Apps Script 배포는 로컬·복제 검증 후 사용자가 명시적으로 수행한다. 기존 삭제·공개 배포·유료 작업·샘플 품질 승인의 경계는 유지한다.
- 일반 구현 완료에는 commit·push·배포가 자동으로 포함되지 않는다. 명시적으로 요청된 Git 작업만 대상 변경을 검토해 수행하며 commit 요청을 push·배포 승인으로 간주하지 않는다.
- 읽기 전용 감사에서는 캐시·그래프 자동 갱신을 포함한 쓰기 작업을 실행하지 않는다. Graft 명령도 자동 갱신될 수 있으므로 이 경우에는 그래프 파일을 직접 읽거나 `rg`로 확인한다.
- 아래 Graft 절차는 도구가 사용 가능하고 갱신에 필요한 쓰기가 허용된 코드 탐색에 적용한다. 그래프가 없거나 오래됐거나 필요한 문맥이 빠졌으면 직접 소스 읽기와 `rg`로 계속한다. 상위 검색 결과는 탐색 단서이며, 필요한 실제 소스와 문맥을 확인한다.
- 아래의 “저장소에 추가하지 않는다”는 로컬 설정·토큰·의존성을 Git 추적·스테이징·커밋·공개 배포에 포함하지 않는다는 뜻이다. 필요한 로컬 생성·사용은 기존 설정 방식과 허용된 파일시스템 범위 안에서 수행하며 비밀값은 출력하지 않는다.
- Skill은 실제 작업 범위에만 적용하며 구조 변경이나 외부 서비스 변경의 승인으로 해석하지 않는다. `index.html` 유지보수에는 Sites 생성·호스팅 절차를 적용하지 않는다. 보고서 배포는 기존 Vercel 경로를 유지하며, Skill의 기본 절차만을 이유로 사이트 등록·push·배포·WebMCP·외부 제어 인터페이스를 추가하지 않는다.
- Marketplace와 bootstrap의 신규 통합 절차는 해당 서비스 변경이 요청 범위인 경우에만 적용한다. 기존 Apps Script 수정·로컬 작업·감사에는 신규 서비스 설치를 요구하지 않는다.
- 사용자가 지정한 브라우저와 현재 허용된 도구로 로컬 `index.html`을 직접 열어 검증한다. 특정 CLI나 개발 서버 설치를 필수로 만들지 않는다. 도구 부재 시 허용된 동등 도구를 확인하며, 독립 검증은 계속하고 남은 항목은 미검증으로 보고한다.
- 구현·수정 요청에서 검증의 첫 실패는 전체 작업의 종료 조건이 아니다. 승인 범위 안에서 원인을 수정하고 관련 검증을 다시 수행한다. 같은 실패를 근거 없이 반복하지 않되 새로운 증거나 수정이 있으면 재검증한다. 읽기 전용 진단에서는 수정하지 않고 결과를 보고한다.
- 보고서 자료 조회가 실패하면 확인된 자료로 작성 가능한 부분을 진행하고 누락 항목은 “자료 확인 필요”로 표시한다. 필수 데이터가 없으면 최종 확정은 보류하며, 의료·거래처 사실 확인 요건은 완화하지 않는다.
- 완료 보고에는 변경 결과, 수행한 검증, 미검증 항목, 남은 사용자 단계를 구분한다. 필요한 검증을 후속 작업 제안으로 대체하지 않으며 필수 단계가 남았다면 전체 완료로 보고하지 않는다.

- 문서·시트가 신규라는 이유만으로 질문하지 않는다. 요청·대화·원본에서 확인할 수 없고 결과를 크게 바꾸는 정보만 묻는다. 대상 파일·수신자·권한·중대한 사실은 추정하지 않는다. 명시적인 템플릿·샘플·품질 승인 단계는 유지한다.
- 사용자가 명시적으로 요청한 동일 대상·범위의 Google Drive 댓글은 도구 한도에 맞춰 배치로 나눈다. 배치 분할만으로 재승인을 요구하지 않는다. 대상·내용 범위 확대는 별도 확인하며 결과 불명 시 조회 후 재시도한다. 댓글 작성이 요청되지 않았다면 보내지 않는다.
- 선택한 실행 경로에 필요한 도구만 확인한다. 특정 도구가 없으면 현재 호스트의 허용된 동등 도구를 검색한다. 네트워크 사용 자체를 추가 승인 사유로 만들지 않되 실제 환경 권한과 승인 거절을 준수한다.
- Skill은 최초 사용 전에 읽고 같은 내용은 재사용한다. 파일 변경·문맥 유실·새 실행 경로 때문에 필요한 경우 다시 확인한다. 진행 안내는 현재 호스트 지침을 따르며 관성적인 후속 질문을 추가하지 않는다.

## Operating Principles

- 이 프로젝트는 로컬 폴더의 `index.html` 직접 사용을 전제로 하는 정적 HTML 대시보드다. 대시보드 자체는 배포하지 않는다. 사용자가 명시하지 않으면 번들러, 로컬 서버, 프레임워크 마이그레이션, 빌드 산출물 구조를 추가하지 않는다.
- 대시보드는 Codex를 통한 로컬 유지보수만 전제로 한다. 브라우저 전역에 외부 도구용 제어 인터페이스를 노출하지 않는다.
- 로컬과 공개 배포는 같은 루트 파일을 사용해야 한다. 로컬 전용 경로, PC 절대경로, 호스팅 전용 절대 URL을 대시보드 내부 링크로 넣지 않는다.
- 기존 단일 HTML 구조를 존중한다. 대규모 재작성보다 필요한 영역만 좁게 수정한다.
- 한국어 문구, 거래처명, 의료/마케팅 리포트 문맥은 의미가 바뀌지 않도록 보존한다.
- 파일은 UTF-8 기준으로 다룬다. 한글이 깨져 보이면 먼저 출력 인코딩 문제인지 확인한다.
- API URL, Google Sheets URL, clientId처럼 문서화된 운영 식별자는 임의로 교체하지 않는다.
- Apps Script API, 시트 컬럼, action 이름, 응답 구조를 바꾸면 같은 작업에서 `docs/apps-script-api.md`도 갱신한다.
- 로컬 전용 설정, 토큰, `.env`, `credentials.local.js`, 로그 파일, `node_modules/`는 저장소에 추가하지 않는다.

## Data And API Rules

- Apps Script POST 요청은 반드시 `redirect: 'follow'`를 포함한다.
- Apps Script POST 요청에는 `Content-Type` 헤더를 추가하지 않는다. CORS preflight 문제를 피하기 위한 운영 규칙이다.
- 모든 GET은 `apiKey` 쿼리 파라미터, 모든 POST는 JSON 본문의 `apiKey`로 인증한다. URL과 키가 없는 상태에서는 요청을 보내지 않는다.
- 글 보관함 저장은 기존 `addDraft`, `updateDraft`, `deleteDraft` POST 구조를 유지한다.
- 글 보관함 조회는 가능하면 `GET ?action=draftsList`로 본문 없는 목록을 받고, 사용자가 펼치거나 복사할 때만 `GET ?action=draftDetail&draftId=...`로 본문을 조회한다. 대시보드 전체 동기화는 `GET ?action=summary&draftMode=light`를 사용할 수 있다.
- 날짜와 마감일 계산은 KST 로컬 날짜 기준으로 처리한다. `new Date().toISOString().slice(0, 10)` 방식으로 오늘 날짜를 만들지 않는다.
- 공식 clientId는 `btskin`, `belrmon`, `eyecare`, `seoulup`, `echi`, `igochi`, `jejuexpress`, `kyunghee`, `hwabuk`, `jocheon`만 사용한다. `kyunghee`는 기존 Drafts 호환을 위해 365경희부부한의원 피부클리닉에 유지하고, `hwabuk`과 `jocheon`은 지점별 글 보관함/Naver 라우팅에만 사용한다.
- 잘못된 별칭 `bellemont`, `eyeclinic`, `igo`는 사용하지 않는다. 각각 `belrmon`, `eyecare`, `igochi`로 정정한다.
- 발행 기록은 `postLogs`를 기준으로 하며, `publishedAt`은 `YYYY-MM-DD`, `month`는 `YYYY-MM`, `channel`은 문서의 정규화 규칙에 맞춰 처리한다.
- API/Sheets에서 확인 가능한 정량 수치와 사용자가 제공한 외부 콘솔 수치를 구분한다. 확인되지 않은 수치는 만들지 않고 “자료 확인 필요”로 남긴다.
- 의료/시술 콘텐츠 초안 작성 전에는 `clientBrief&clientId=...`, `docs/briefs/clients/{clientId}.md`, `docs/compliance/`를 함께 확인한다.

## Dashboard Rules

- `index.html`은 CDN 기반 브라우저 실행 파일이다. Node 빌드 검사가 대시보드 JSX까지 검증해주지 않는다는 점을 감안한다.
- 화면 문구를 바꿀 때는 대시보드 사용자에게 보이는 운영 표현으로 작성한다. 내부 구현 설명이나 사용법 문장을 불필요하게 늘리지 않는다.
- 대시보드 `ClientBriefs`는 빠른 운영 입력용이다. 긴 거래처 맥락, 원본 자료, 작성 패턴은 `docs/briefs/`에 보관한다.
- 거래처 카드, 손익, 비용, 글 보관함, 캘린더는 Apps Script `summary` 응답과 연결되어 있다. 관련 데이터 구조를 바꾸면 `docs/apps-script-api.md`를 확인하고 함께 수정한다.
- 서브/순위 업무의 `진행중/완료` 상태는 Sheets `MonthlyJobs.note`를 기준으로 동기화한다. `localStorage`는 화면 즉시 반영과 API 응답 전 임시 항목 보존용으로만 사용한다.
- 월간 초기화는 자동 실행하지 않는다. 월말보고서 작성을 끝낸 뒤 대시보드 `다음 달 초기화` 버튼으로만 실행하며, 버튼은 Sheets 처리 성공을 확인한 후 로컬 상태를 초기화해야 한다.
- `reportFile` 값은 `btskin.html` 같은 루트의 상대 HTML 파일명으로 둔다. `https://...`, `file://...`, `/absolute/path` 형식은 로컬/공개 배포 동기화를 깨뜨리므로 사용하지 않는다.
- UI 변경은 로컬 `index.html` 직접 열기 기준으로 검증한다. 대시보드는 배포하지 않으므로 외부 배포 화면으로 확인하지 않는다.

## Report Rules

- 거래처별 보고서 HTML은 기존 월별 탭을 누적하는 방식으로 관리한다.
- 새 월 보고서는 기존 최신 월 탭 위에 추가하고, 새 월을 기본 active 탭으로 둔다.
- **새 거래처 보고서 HTML을 추가하면 `.vercelignore` allow-list에도 파일명을 추가한다.** allow-list 방식이라 등록하지 않으면 공개 배포에서 404가 된다.
- 기존 월 보고서 내용은 삭제하지 않는다.
- 발행 내역은 API/Sheets `postLogs`를 기준으로 하되, 보고월의 `YYYY-MM` 필터를 적용한다.
- 월말보고서 작성 전 `npm.cmd run report:context -- --month YYYY-MM --client CLIENT_ID` 또는 `--all`을 실행해 보고서용 컨텍스트를 먼저 생성한다.
- `btskin`/`belrmon` 보고서는 상담내역 표준경로 확인을 위해 가능하면 `npm.cmd run report:consults:check -- --month YYYY-MM --client btskin,belrmon`도 먼저 실행한다.
- 생성된 `.report-context/` 파일은 업무/발행/상담/비용/계약 데이터를 정규화한 작업용 스냅샷이며 커밋하지 않는다.
- 외부 콘솔 수치가 없으면 임의로 만들지 않는다. 필요한 항목은 “자료 확인 필요”로 남기거나 사용자에게 요청한다.

## Removed Features

- 네이버 리뷰 모니터 코드, 워크플로, 명령과 API action은 운영 범위에서 제거했다. 기존 Sheets 기록 시트는 보존만 하며 대시보드와 API에서 읽거나 갱신하지 않는다.
- 외부 AI 도구가 대시보드를 제어하는 브라우저 전역 API나 원격 수정 인터페이스를 다시 추가하지 않는다.

## Commands

PowerShell에서 `npm` 실행 정책 오류가 나면 `npm.cmd`를 사용한다.

```bash
npm run check
npm run verify
npm run report:consults:check -- --month YYYY-MM --client btskin,belrmon
npm run report:context -- --month YYYY-MM --client btskin
```

- `npm run check`: 저장소 운영 점검 전체 실행.
- `npm run verify`: 운영 점검과 전체 Node 테스트를 순서대로 실행.
- `npm run report:consults:check -- --month YYYY-MM --client btskin,belrmon`: 월말보고서 상담내역 API 표준경로 확인.
- `npm run report:context -- --month YYYY-MM --client btskin`: 월말보고서 작성용 거래처 데이터 스냅샷 생성.

## Completion Checklist

- 변경 범위가 요청과 직접 관련된 파일에 제한되어 있는지 확인한다.
- 이전 AI 도구명 표현을 새로 추가하지 않는다.
- API 계약이나 시트 구조 변경이 있으면 `docs/apps-script-api.md`를 갱신한다.
- API, 문서, 파일 구조, 보고서 파일명을 바꾸면 `npm.cmd run verify` 또는 `npm run verify`를 실행한다.
- 문서나 UI에서 파일 경로를 바꿨다면 `rg`로 이전 경로/파일명 잔여 참조를 확인한다.

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
