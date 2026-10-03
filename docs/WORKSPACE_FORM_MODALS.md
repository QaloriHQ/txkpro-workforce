# Workspace management form modals — #196

The owner selected workspace management forms for this change. Create/edit forms open from action buttons so lists, metrics, and record details remain visible without an expanded editor. Authentication, onboarding, marketing requests, search/filter forms, credential lookup, and Student learning responses retain their dedicated flows.

## Sources and data contract

- Owner request and scope clarification: #196 and its PRE-RUN implementation contract.
- `docs/product-sources/ui/UI_DESIGN_SYSTEM_STANDARD.txt`, sections 14 and 16: visible form labels, action modals, XMarkIcon, Cancel/Escape, focus containment/return, preserved drafts, responsive scrolling.
- Existing W12-05 `institution_cohort_upsert` and Institution program/cohort read model remain canonical. Programs are derived from cohort records, so adding a program also creates its first cohort. No separate empty Program entity is introduced.
- Existing authorization, scope, validation, statuses, audit events, and API handlers remain in place. No schema migration or account/role change is required.

## Coverage

| Workspace | Button-opened create/edit flows |
| --- | --- |
| Institution | Team invitations, Student invitations, referrals, Employer Training assignment wizard, program/first-cohort creation, cohort creation and editing, retention case management, Concierge requests |
| Employer | Company profile, hiring needs, interview request/scheduling/evaluation, private notes, hire recording, Concierge requests, course/lesson/block editors, checkpoints/completion requirements, assessment settings, Company Badges, Employer Certifications |
| Internal Admin | Institution creation, invitations, retention case management, Concierge production-status updates |

Existing course creation, course structure dialogs, assessment creation, question editors, and block properties already open from buttons. They retain their existing modal implementations to avoid nesting a second dialog around the same form.

## Interaction

`ActionModal` uses native `dialog.showModal()` for the top layer, focus containment, and inert background. X, Cancel/close, and Escape close an idle dialog and return focus to its opening button. Clicking the backdrop does not dismiss it. Closed dialogs remain mounted, preserving drafts across cancellation. Pending form actions and explicit busy state prevent dismissal during saves. Save/error feedback is present inside converted dialogs, including retention retry/conflict controls.

Program creation requires a program name and first-cohort name. Existing-program cohort creation requires a program selection and cohort name. Term, graduation date, and status are grouped under Additional details; optional trade code is available when adding a program. Existing cohort edits retain all canonical fields. Controlled cohort drafts persist after server errors; success offers a Done button to reload the list and start a fresh creation.

## Verification and owner UAT

Required local checks: typecheck, lint, production build, Wave 12 regressions. CI additionally runs Wave 11 and governance regression checks. Native dialog keyboard behavior and signed-in visual behavior require owner UAT; no browser-based staging testing was performed. A local browser test could not run because the Playwright browser executable is absent.

Use `https://staging-workforce.txkpro.com` with the appropriate authorized workspace account:

1. Institution Team, Students, Referrals, Programs & Cohorts: confirm the editor is hidden until its action button is clicked, and the list/metrics occupy the available width.
2. Open a modal, enter a draft, close with X, Cancel/close, and Escape, then reopen. Confirm fields retain the draft and focus returns to the opening button. Confirm Tab/Shift+Tab stay inside the dialog, background controls cannot be activated, and backdrop clicks retain the modal.
3. Create a program and its first cohort with the two required names. Create another cohort in that program without optional details. Confirm both appear after Done. Edit term/date/status and verify the saved values.
4. Edit a cohort into another permitted program, including a program without a trade code. Confirm it uses the selected program rather than retaining the old trade code.
5. Submit invalid/incomplete details and confirm validation and server errors are visible inside the modal, drafts remain, and no duplicate save occurs while pending. Confirm cancellation is blocked only while the save is pending.
6. Check Institution assignment and retention dialogs; verify review/create and case retry/conflict controls remain usable inside the modal. Confirm existing scope restrictions still govern available actions.
7. With Employer and internal Admin test accounts, check the converted management buttons in the coverage table. Save a representative record in each area; verify feedback appears inside its modal and existing permissions remain effective.
8. Repeat representative short and long dialogs on phone/tablet/desktop and in light/dark themes. Confirm labels, action buttons, scrollable contents, and close controls are visible without horizontal overflow.

Do not mark acceptance passed or the issue Done before the owner reports these results. No production deployment is included.
