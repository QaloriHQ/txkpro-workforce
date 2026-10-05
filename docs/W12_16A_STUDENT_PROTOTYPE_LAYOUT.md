# Student prototype layout follow-up

Owner direction: Student workspace follows supplied prototype screenshots IMG_1376–1380. Unbuilt destinations may say Coming soon. Presentation-only follow-up to #223; no database, event, privacy or lifecycle changes.

- Primary navigation: Home, Feed, Training, Career, Messages, in one mobile bottom row with safe-area clearance. My Profile combines profile and portfolio in the avatar account menu.
- Shared single-row top bar: official brand, theme icon, notifications Coming soon modal and initials avatar account menu. Guide and Online were removed per owner direction. No invented unread badges.
- Home: live next-action hero (interview response, training or portfolio); Today/trivia and PRO Points Coming soon; real canonical verified skills, training, interview and confirmed-placement counts. No fabricated profile percentage, ranking, streak, sample dates or sample employer data.
- Training Center: gradient employer-learning hero, real completed/in-progress counts, search and status filter, collection tabs, employer cover cards, canonical course progress and existing Start/Continue/Review routes. Recommended/My Program collections Coming soon. No recommendations or catalog implied by assigned courses.
- Career: Discover, Matches, Referrals, Applications, Interviews and Employment destinations. First four Coming soon; existing Interview responses and employment records preserved. Pending starts remain distinct from confirmed employment. No opaque matching score or pretend Apply flow.
- Feed and Messages: authorized Student placeholder pages, explicit Coming soon. No sample posts or conversations and no writes enabled.
- All Student training details, lessons, assessments, profile and portfolio use the same header and navigation. Existing route names remain stable.

## Verification and owner UAT

Required typecheck, lint and build plus PR CI. No schema migration needed. Owner visual/browser UAT remains:

1. At 320/375/390/430px and desktop, verify Home/Feed/Training/Career/Messages navigation order, active destination, safe-area spacing and no overlap with content.
2. Open avatar: My Profile and Sign out remain accessible. Account/Notifications dialogs support Escape, close and return focus. Test light/dark.
3. Home next action opens the real interview or assignment. Counts match canonical records. Trivia/points are Coming soon with no sample scores.
4. Training search/status/collection tabs work; search-empty differs from no assignments; Start/Continue/Review and lesson/assessment flows still work.
5. Career Interviews preserves response forms; Employment preserves pending-start/confirmed distinction; other tabs show Coming soon. Feed/Messages show Coming soon.
6. Confirm public portfolio privacy and per-file access continue to work through the existing UAT checklist.

#223 remains Verification pending owner acceptance. #224 points/rankings and #225–226 rewards remain separate work; no feature implementation is inferred from these placeholders. Actual agent usage telemetry remains unavailable in this runtime.

Owner mobile compact-card follow-up: training summary has a short employer/status strip, two-line description, inline version/assigned metadata, required-item progress and one Start/Continue/Review action. Full details remain on the course detail page. Desktop cards unchanged. Verify at 320–430px; top-bar icons remain 44px targets and light/dark controls remain usable.

## Unified profile follow-up

`/student/profile` is the single owner workspace for the digital resume, portfolio and evidence. `/student/portfolio` redirects there for existing links. The public `/students/{slug}` path is unchanged. Identity/photo/cover appears once, followed by compact visibility/Edit profile controls. Portfolio, Credentials and Activity tabs reduce page length; native modal forms remain button-accessible and mounted drafts survive tab changes. Keyboard tabs support arrows/Home/End. Portfolio cards show project images/descriptions/skills and document View/Download next to their management actions. Canonical earned/verified evidence stays read-only and separate from Student-entered projects/files. Editing identity/privacy refreshes the visible header.

Owner UAT: avatar has one My profile & portfolio destination; old portfolio URL redirects; all three tabs work at mobile/desktop with keyboard navigation; photo/cover/name/headline updates render after save; upload/project/delete/file-access modals and drafts still work; public/private controls and public preview remain accurate; public page/credential links retain prior behavior. No schema/API/privacy/status changes.
