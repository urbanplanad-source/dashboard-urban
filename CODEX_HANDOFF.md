# Codex Handoff

Last reviewed: 2026-06-13

This repository remains the operating hub for Urbanplanad. The dashboard and Apps Script/Sheets data contract are the source of truth; adjacent projects connect through the documented Drafts pipeline instead of being merged into this folder.

## Current Architecture

| Area | Path | Role |
|------|------|------|
| Dashboard | `C:\Users\user\Desktop\어반플랜애드 보고서 대시보드` | Static HTML dashboard, Apps Script snippets, API contract docs |
| Growth team | `C:\Users\user\Desktop\개발 작업\hospital-marketing-growth-team` | Urbanplanad B2B marketing content drafts; pushes drafts into dashboard |
| Naver writer | `C:\Users\user\Desktop\개발 작업\naver-writer` | Imports approved dashboard blog drafts and temp-saves them to Naver Blog |
| Hospital GEO | `C:\Users\user\Desktop\개발 작업\병원 GEO` | Long-term GEO measurement/opportunity app; no dashboard write integration yet |

## Pipeline Contract

Draft status values are fixed:

`draft -> review -> approved -> staged -> published`

- `growth-team` creates drafts and normally promotes them to `review`.
- A human changes `review` to `approved` in the dashboard.
- `naver-writer` may temp-save only `approved` drafts. On successful temp-save it writes back `staged`.
- Actual publication remains manual. Only after publication should a draft become `published` and `addPost` be recorded.
- The dashboard card provides an `승인` shortcut for `draft`/`review` items and a `CMD 복사` shortcut for approved items. The copied command is ready to paste into Windows CMD.

## Operating Rules

- Do not add a bundler or framework to the dashboard unless explicitly requested.
- Apps Script POST requests must include `redirect: 'follow'`.
- Do not add `Content-Type` to Apps Script POST requests.
- Keep dashboard report links as root-relative HTML filenames.
- Do not automatically publish to Naver or any external channel.
- Do not move Hospital GEO into the dashboard yet; connect it later through a small adapter.

## Verification Commands

Dashboard:

```powershell
npm.cmd run check
npm.cmd run check:syntax
```

Growth team:

```powershell
node --check scripts/push-dashboard-draft.mjs
node scripts/push-dashboard-draft.mjs --help
```

Naver writer:

```powershell
npm.cmd run check
npm.cmd run dashboard:drafts -- --channel blog --limit 5
npm.cmd run draft:dashboard -- --draft-id DRAFT_ID --dry-run
```

Hospital GEO:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
```

## Next Phases

1. Verify one approved Kyunghee draft through preflight and Naver temp-save.
2. Expand `naver-writer` mappings for remaining hospital clients.
3. Add a manual publication confirmation path that records `published` plus `addPost`.
4. Repair Hospital GEO Korean mojibake, then add a minimal dashboard adapter for GEO scores/opportunities.
