# Urbanplanad Report Dashboard

Urbanplanad client report dashboard and Naver Place visitor review monitor.

## Dashboard

- Main dashboard: `index.html`
- Client reports: `btskin.html`, `belrmon.html`, `gyunghee.html`, and other client HTML files
- Apps Script API notes: `오픈클로_API_가이드.md`

This project is a static HTML dashboard. GitHub Pages can serve it directly from the repository root.

## Visitor Review Monitor

The review monitor checks only Naver Place visitor reviews. Blog review counts are ignored.

Targets:

- `btskin` / 노형아름다운피부과
- `belrmon` / 벨르몬성형외과
- `kyunghee` / 365경희부부한의원

The monitor reads `visitorReviewsTotal` from each Naver visitor review page, compares it with `savedVisitorReviewCount` from the Apps Script API, then records changes through `addReviewLog` and updates `ReviewTargets` only when the visitor review count was read successfully.

## Commands

```bash
npm run review:monitor
npm run review:monitor:dry-run
npm run review:monitor:check
```

No npm dependencies are required. Node.js 20 or newer is enough.

## GitHub Actions

`.github/workflows/naver-review-monitor.yml` runs the review monitor:

- 09:00 KST
- 13:00 KST
- 17:00 KST

The workflow also supports manual execution from the GitHub Actions tab.

Telegram is optional and not required. When review changes are detected without Telegram credentials, the script prints a `[codex-notice]` summary in the run output.

## Optional Local Config

`review-monitor.config.example.json` shows the optional config shape. The real local config file name is `review-monitor.config.json`, and it is ignored by Git.
