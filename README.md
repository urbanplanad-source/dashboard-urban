# Urbanplanad Report Dashboard

Urbanplanad client report dashboard and Naver Place visitor review monitor.

## Dashboard

- Main dashboard: `index.html`
- Client reports: `btskin.html`, `belrmon.html`, `gyunghee.html`, and other client HTML files
- Codex project guide: `AGENTS.md`
- Detailed Apps Script API reference: `docs/apps-script-api.md`
- Apps Script patch snippets: `apps-script/`

This project is a static HTML dashboard. The primary working file is the local `index.html`; GitHub Pages serves the same repository root for remote access.

## Operating Modes

- Local: open `index.html` directly from this folder.
- Remote: use the GitHub Pages deployment of the same root files.
- Keep dashboard links relative, such as `btskin.html`, so local file use and GitHub Pages stay in sync.
- Before uploading changes, run `npm run check` or `npm.cmd run check`.

## Visitor Review Monitor

The review monitor checks only Naver Place visitor reviews. Blog review counts are ignored.

Targets:

- `btskin` / 노형아름다운피부과
- `belrmon` / 벨르몬성형외과
- `kyunghee` / 365경희부부한의원

The monitor reads `visitorReviewsTotal` from each Naver visitor review page, compares it with `savedVisitorReviewCount` from the Apps Script API, then records changes through `addReviewLog` and updates `ReviewTargets` only when the visitor review count was read successfully.

## Commands

```bash
npm run check
npm run check:syntax
npm run review:monitor:dry-run
npm run review:monitor:check
npm run review:monitor
```

`npm run check` runs the operational guardrails for this Codex-managed repository, including report-file link checks. No npm dependencies are required. Node.js 20 or newer is enough.

## GitHub Actions

`.github/workflows/naver-review-monitor.yml` runs the review monitor:

- 09:00 KST
- 13:00 KST
- 17:00 KST

The workflow also supports manual execution from the GitHub Actions tab.

Review changes are reported as a `[notice]` summary in the run output. External messenger delivery was removed in 2026-09; read the results in the GitHub Actions run log or the local console.

## Optional Local Config

`review-monitor.config.example.json` shows the optional config shape. The real local config file name is `review-monitor.config.json`, and it is ignored by Git.

For local-only account notes, copy `credentials.local.example.js` to `credentials.local.js`. The real `credentials.local.js` file is ignored by Git and must not be uploaded to GitHub Pages.

## Using The Dashboard Away From The Main PC

`index.html` is deliberately **not** deployed to Vercel. The public deployment serves only the
client report pages (`btskin.html` and the other seven), enforced by `.vercelignore`.

To work from a laptop, keep a copy of `index.html` on that machine and open it directly:

```bash
git pull        # only needed when the dashboard UI itself changes
```

Then double-click `index.html`, or open it in any browser.

All dashboard data — clients, jobs, post logs, expenses, consults — is fetched live from the
Apps Script API at page load, so a local copy shows exactly the same, current data as the main
PC. Only the UI code goes stale, and only when the dashboard itself is updated.

`credentials.local.js` is optional. When it is absent the browser logs a harmless 404 and the
dashboard runs normally.
