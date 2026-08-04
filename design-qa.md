# Design QA

**Source visual truth**
- Source: user-provided screenshots, 2026-08-03 214723 and 214747.
- Target: readable segmented composition bars and a horizontal advertising funnel, adapted to the July mobile report rather than a pixel-for-pixel clone.
- Intended implementation viewport: 390 x 844 CSS px, July 2026 tab active.

**Implementation evidence**
- Implementation: btskin.html, July 2026 tab active by default.
- Added: content-channel composition bar; privacy-safe advertising funnel and regional distribution bar; three-channel consultation composition bar and daily stacked consultation chart.
- Data snapshot: content 18 (homepage 13, blog 5); consults 58 (WeChat 47, LINE 9, Instagram 2).
- Implementation screenshot: unavailable.
- Browser-rendered console and interactions: unavailable.

**Comparison status**
- Full-view comparison: blocked. The in-app browser runtime exited during initialization in this environment before a local file could be rendered.
- Focused-region comparison: blocked for the same reason.
- Static validation completed: inline JavaScript compiled and npm.cmd run check passed.

**Findings**
- [P1] Browser-rendered fidelity evidence unavailable
  Location: mobile July report visual cards.
  Evidence: the supplied graph references are available, but the environment could not capture the modified implementation at 390 px width.
  Impact: bar-label wrapping, canvas spacing, section rhythm, and mobile overflow cannot be visually approved.
  Fix: open btskin.html at 390 x 844, capture the July tab, and compare the three visual cards with the supplied reference components.

**Open Questions**
- None. Consultation contents are intentionally summarized as channel-level totals to avoid exposing individual customer messages.

**Implementation Checklist**
1. Re-run the visual capture at 390 x 844 when the browser runtime is available.
2. Test the July tab, content loading, and resize redraw for both canvas charts.
3. Verify the advertising card contains no spend or cost-per-click value.
4. Resolve any P0, P1, or P2 visual differences found in the capture.

final result: blocked


---

# 벨르몬성형외과 2026년 7월 보고서 QA

**Source visual truth**
- Source: user-provided July 2026 reporting screenshots, including mobile-friendly composition and advertising graph references.
- Target: mobile-first visual report with graph-led summaries; not a pixel-for-pixel copy.

**Implementation evidence**
- Implementation: belrmon.html, July 2026 tab active by default.
- Static validation: 20 fixed content rows; Carrot Business 2-post aggregate (35,385 impressions, 12,565 reach, 263 clicks); no currency-formatted amount or spend/CPC label in the July panel.
- Implementation screenshot: unavailable.
- Browser-rendered console and interactions: unavailable.

**Comparison status**
- Full-view comparison: blocked. The in-app browser runtime exited during initialization with a Windows sandbox ACL error before the local file could render.
- Focused-region comparison: blocked for the same reason.

**Findings**
- [P1] Browser-rendered mobile fidelity evidence unavailable
  Location: July report tab, 390 px mobile viewport.
  Evidence: local browser initialization failed before capture.
  Impact: visual wrapping, chart density, and section spacing cannot be approved from code alone.
  Fix: open belrmon.html at 390 x 844, capture the July tab, and compare the place-rank and paid-promotion cards with the provided references.

**Implementation Checklist**
1. Re-run visual capture when the browser runtime is available.
2. Verify tab switching and horizontal overflow of the 20-item content list on a mobile viewport.
3. Confirm no spend, CPC, or monetary amount appears in the paid-promotion card.

final result: blocked
