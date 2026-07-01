# 거래처 브리프 위키

이 폴더는 대시보드 `ClientBriefs`보다 긴 거래처 지식을 보관하는 markdown 위키다. 대시보드는 빠른 운영 입력과 API 조회용으로 쓰고, 이 폴더는 깊은 맥락·원본 메모·작성 기준·검수 로그를 보관한다.

## 기본 구조

| 경로 | 용도 |
|------|------|
| `index.md` | 거래처별 브리프 목차 |
| `overview.md` | 전체 거래처 콘텐츠 운영 요약 |
| `log.md` | 브리프 변경 이력 |
| `clients/*.md` | 거래처별 상세 브리프 |
| `sources/{clientId}/` | 가격표, 미팅 메모, 원장님 코멘트, 원본 자료 보관 |
| `templates/client-brief-template.md` | 새 거래처 브리프 템플릿 |

## 사용 원칙

1. 콘텐츠 작성 전 `docs/apps-script-api.md`와 대시보드 `clientBrief` API를 먼저 확인한다.
2. 의료/시술 콘텐츠라면 `docs/compliance/` 검수 기준도 함께 읽는다.
3. 거래처별 깊은 맥락은 `clients/{clientId}.md`를 읽는다.
4. 원본 가격표, 미팅 메모, 병원 자료는 `sources/{clientId}/`에 보관하고, 거래처별 브리프에는 요약과 링크만 남긴다.
5. 확인되지 않은 효과, 가격, 수상/인증, 시술 건수는 만들지 않고 `자료 확인 필요`로 남긴다.

## 대시보드 브리프와의 역할 분리

| 구분 | 저장 위치 | 성격 |
|------|-----------|------|
| 빠른 운영 브리프 | Google Sheets `ClientBriefs` / 대시보드 UI | 짧고 자주 보는 핵심 기준 |
| 깊은 지식 브리프 | `docs/briefs/clients/*.md` | 콘텐츠 전략, 장기 맥락, 원본 링크 |
| 원본 자료 | `docs/briefs/sources/{clientId}/` | 가격표, 메모, 병원 자료 원문 |
| 의료광고 기준 | `docs/compliance/` | 공통 검수 기준 |

## Codex 기본 읽기 순서

콘텐츠 초안 요청을 받으면 아래 순서로 읽는다.

1. `AGENTS.md`
2. `docs/apps-script-api.md`
3. `docs/compliance/README.md`
4. 대시보드 API `summary&draftMode=light`
5. 대시보드 API `clientBrief&clientId=...`
6. `docs/briefs/clients/{clientId}.md`
7. 필요한 경우 `docs/briefs/sources/{clientId}/`

이 구조는 최종 법률 판단이나 심의 승인이 아니라, 콘텐츠 제작과 검수의 일관성을 높이기 위한 운영 지식 저장소다.
