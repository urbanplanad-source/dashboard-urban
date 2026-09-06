# Urbanplanad Dashboard

Codex로만 유지보수하는 로컬 운영 대시보드와 정적 거래처 보고서 저장소입니다.

## 구성

- `index.html`: 개발 PC와 노트북에서 직접 여는 로컬 대시보드. 공개 배포하지 않습니다.
- `credentials.local.js`: Apps Script URL, 관리 키, 계정 메모. Git에 포함하지 않습니다.
- 거래처 보고서 HTML 8개: Apps Script나 다른 API를 호출하지 않는 완전 정적 문서입니다.
- `apps-script/internal_api_security_patch_v23.gs`: 라이브 Apps Script 편집기에 수동 반영하는 인증·안전성 패치입니다.

## 최초 설정

1. `credentials.local.example.js`를 `credentials.local.js`로 복사합니다.
2. `apiUrl`에 기존 Apps Script `/exec` URL을 입력합니다.
3. 충분히 긴 임의 키를 생성해 `apiKey`에 입력합니다.
4. 같은 값을 Apps Script 프로젝트의 Script Properties에 `DASHBOARD_API_KEY`로 등록합니다.
5. 두 PC에는 각각 로컬 파일을 만들고 Git으로 키를 전달하지 않습니다.

설정이 없거나 키가 비어 있으면 대시보드는 API를 호출하지 않고 설정 안내만 표시합니다.

## 검증

```powershell
npm.cmd run verify
```

인증된 읽기 전용 보고서 컨텍스트를 생성할 때는 현재 터미널에
`DASHBOARD_API_URL`과 `DASHBOARD_API_KEY`를 설정한 뒤 실행합니다.

```powershell
npm.cmd run report:context -- --month YYYY-MM --client btskin
npm.cmd run report:consults:check -- --month YYYY-MM --client btskin,belrmon
```

## 배포 경계

Vercel에는 `.vercelignore` allow-list의 보고서 8개와 `robots.txt`만 배포합니다.
`index.html`, Apps Script 패치, 문서, 테스트, 로컬 비밀값은 공개 대상이 아닙니다.
운영 POST, Apps Script 배포, GitHub Pages 종료, 저장소 private 전환은 자동화하지 않습니다.
