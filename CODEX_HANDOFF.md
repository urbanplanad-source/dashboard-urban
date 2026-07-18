# Codex Handoff

Last reviewed: 2026-07-19

This repository remains the operating hub for Urbanplanad. The dashboard and Apps Script/Sheets data contract are the source of truth; adjacent projects connect through the documented Drafts pipeline instead of being merged into this folder.

## Current Architecture

| Area | Path | Role |
|------|------|------|
| Dashboard | `C:\Users\user\Desktop\dashboard-urban` | Static HTML dashboard, Apps Script snippets, API contract docs |
| Growth team | `C:\Users\user\Desktop\개발 작업\hospital-marketing-growth-team` | Urbanplanad B2B marketing content drafts; pushes drafts into dashboard |
| Naver writer | `C:\Users\user\Desktop\개발 작업\naver-writer` | Imports approved dashboard blog drafts and temp-saves them to Naver Blog |
| Hospital GEO | `C:\Users\user\Desktop\개발 작업\병원 GEO` | Long-term GEO measurement/opportunity app; no dashboard write integration yet |

## Pipeline Contract

Draft status values are fixed:

`draft -> review -> approved -> staged -> published`

- `growth-team` creates drafts and normally promotes them to `review`.
- A human changes `review` to `approved` in the dashboard. The card remains unchanged and its CMD stays disabled until the server confirms the status update for the same `draftId`. Rows marked `needs_compliance_review` (case-insensitive) cannot be approved or registered as published until that marker is resolved.
- `naver-writer` may temp-save only server-confirmed `approved` blog drafts. With the current cleanup settings, a successful temp-save deletes that exact source `draftId`; it does not automatically write `staged`. The `staged` value remains for manual/legacy flows where source deletion is disabled.
- Actual publication remains manual. Only after publication should a draft become `published` and `addPost` be recorded.
- Individual and bulk CMD actions accept only approved blog-channel rows with a safe `dr-...` ID and no `needs_compliance_review` marker. The copied command is one line (`cd /d ... && npm.cmd ...`) and is ready to paste into Windows CMD.
- After a CMD run, refresh the dashboard to remove source drafts deleted after successful Naver temp-save.

## Operating Rules

- Do not add a bundler or framework to the dashboard unless explicitly requested.
- Apps Script POST requests must include `redirect: 'follow'`.
- Do not add `Content-Type` to Apps Script POST requests.
- Keep dashboard report links as root-relative HTML filenames.
- Do not automatically publish to Naver or any external channel.
- Treat the dashboard as the status authority: do not expose a writer CMD before the approval POST succeeds.
- Never interpolate an unvalidated draft ID into a copied Windows command.
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
