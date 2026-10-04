# UX-OVERVIEW-MOBILE / #212

Owner screenshot IMG_1349.jpeg showed right-edge clipping and oversized Employer Overview content. The dashboard's implicit grid track allowed intrinsic child widths to expand the page. Use `minmax(0, 1fr)` and explicit shrinkable children to constrain content; do not mask the problem with page overflow hiding.

Phone layout at 620px and below: compact hero/company card, smaller wrapping heading, stacked touch-sized primary actions, two-column metric cards, wrapping section headings and mobile Hiring Needs record cards. Larger views retain the existing Hiring Needs table. Same data/counts/statuses/role scope and button-opened modal forms; no API, state or database change. Design sources: UI Design System Standard sections 24–25; PRD Employer dashboard.

Verification: typecheck/lint/build and required CI. No new tests for this reversible presentation-only change. No staging browser testing. No migration; recovery is code revert.

Owner signed-in UAT remains:

1. At 320, 375, 390, 430 and 768px, confirm no page-wide horizontal scrolling or right-edge clipping, including long company/role/hiring-need names.
2. Check the hero actions, approval/role card and all six metrics; verify readable wrapping and unchanged counts. At desktop width verify existing layout/table remains.
3. On phones verify Hiring Needs cards show title, trade, target, status and visibility, including empty state. Edit company/create hiring need buttons still open modals.
4. Check light/dark themes, keyboard focus, touch targets and mobile navigation. Report UAT before closing #212.
