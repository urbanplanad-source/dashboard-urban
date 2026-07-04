# 거래처 브리프 위키

이 폴더는 대시보드 `ClientBriefs`보다 긴 거래처 지식을 보관하는 markdown 위키다. 대시보드는 빠른 운영 입력과 API 조회용으로 쓰고, 이 폴더는 깊은 맥락·원본 메모·작성 기준·검수 로그를 보관한다.

## 기본 구조

| 경로 | 용도 |
|------|------|
| `index.md` | 거래처별 브리프 목차 |
| `overview.md` | 전체 거래처 콘텐츠 운영 요약 |
| `log.md` | 브리프 변경 이력 |
| `clients/*.md` | 거래처별 상세 브리프 |
| `prompts/*.md` | 거래처별 콘텐츠 작성/검수 프롬프트팩 |
| `sources/{clientId}/` | 가격표, 미팅 메모, 원장님 코멘트, 원본 자료 보관 |
| `templates/client-brief-template.md` | 새 거래처 브리프 템플릿 |

## 사용 원칙

1. 콘텐츠 작성 전 `docs/apps-script-api.md`와 대시보드 `clientBrief` API를 먼저 확인한다.
2. 의료/시술 콘텐츠라면 `docs/compliance/` 검수 기준도 함께 읽는다.
3. 거래처별 깊은 맥락은 `clients/{clientId}.md`를 읽는다.
4. 원본 가격표, 미팅 메모, 병원 자료는 `sources/{clientId}/`에 보관하고, 거래처별 브리프에는 요약과 링크만 남긴다.
5. 확인되지 않은 효과, 가격, 수상/인증, 시술 건수는 만들지 않고 `자료 확인 필요`로 남긴다.

## 정본 규칙

브리프는 아래 흐름으로 관리한다.

1. 원본 자료: 가격표, 포스터, 미팅 메모, 병원 코멘트는 `sources/{clientId}/`에 보관한다.
2. 상세 정본: 원본에서 확인한 운영 기준은 `clients/{clientId}.md`에 정리한다.
3. 빠른 입력: 대시보드 `ClientBriefs`에는 자주 쓰는 핵심 요약만 넣는다.
4. 제작 프롬프트: 반복 작성/검수 방식은 `prompts/{clientId}-prompts.md`에 둔다.

서로 충돌하면 의료광고 기준, 상세 정본, 대시보드 요약 순으로 더 보수적인 기준을 적용한다. 대시보드 `ClientBriefs`는 편의용 요약이며, 긴 맥락의 최종 기준은 `clients/{clientId}.md`다.

## 작성 전 게이트

의료/시술 콘텐츠는 초안 작성 전에 아래 항목을 먼저 확인한다.

1. 가격/이벤트 게이트: 체험가, 기간 한정, 무제한, VAT, 횟수·단위가 불명확하면 외부 발행 문구로 쓰지 않는다.
2. 심의 게이트: 매체별 심의 대상 여부나 심의필 문구가 애매하면 `HOLD`로 둔다.
3. 후기/전후사진 게이트: 환자 경험담처럼 보이는 문체, 맘카페형 1인칭, 전후 비교는 기본적으로 사용하지 않는다.
4. 이미지 게이트: 환자 식별, 시술 장면, 포스터 가격 조건, 채널별 사용 허용 범위가 확인되지 않으면 `[확인필요]`로 남긴다.

## 대시보드 브리프와의 역할 분리

| 구분 | 저장 위치 | 성격 |
|------|-----------|------|
| 빠른 운영 브리프 | Google Sheets `ClientBriefs` / 대시보드 UI | 짧고 자주 보는 핵심 기준 |
| 깊은 지식 브리프 | `docs/briefs/clients/*.md` | 콘텐츠 전략, 장기 맥락, 원본 링크 |
| 제작 프롬프트팩 | `docs/briefs/prompts/*.md` | 채널별 작성/검수 반복 지시 |
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
7. 필요한 경우 `docs/briefs/prompts/{clientId}-prompts.md`
8. 필요한 경우 `docs/briefs/sources/{clientId}/`

이 구조는 최종 법률 판단이나 심의 승인이 아니라, 콘텐츠 제작과 검수의 일관성을 높이기 위한 운영 지식 저장소다.
