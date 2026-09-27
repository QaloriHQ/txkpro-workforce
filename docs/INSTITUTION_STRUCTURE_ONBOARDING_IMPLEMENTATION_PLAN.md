# TXKPRO Workforce — Institution Structure and Guided Onboarding

**Implementation planning draft · September 27, 2026**  
**Status:** Product decisions from the design conversation, with open decisions called out. This is not a claim that the flows are implemented.

## 1. Purpose and decisions made

Enable an institution to build a light organizational skeleton, delegate setup through scoped invitations, let instructors create their own scheduled classes, and let students join those classes with an email link or QR code. The resulting activity updates all authorized higher-level views without duplicate entry.

Agreed direction:

- Management chain: Institution Admin → Department Head → Program Coordinator → Instructor → students enrolled in class sections. A roster is the displayed enrollment list, not a role or organizational level.
- Structural chain: institution → department → program → cohort, with scheduled class sections associated with programs. A cohort is a student's program group, commonly an intake; section enrollment is separate. The same cohort may take a course in different terms, and a section may include students from different cohorts when permitted.
- One staff account belongs to one institution. A person working at another institution uses another institution-approved email and account. Within an institution, one account can hold multiple independently scoped roles and assignments.
- Instructors can create, schedule, and manage class sections in assigned programs. Coordinators may optionally prepare draft sections or help with details. Once an instructor creates a valid section and shares its QR code or email invitation, students may join without Program Coordinator approval.
- Staff onboarding proceeds through scoped invitations. Students create an account once, then join each class section through an email invitation or QR link. Subsequent joins reuse their account and profile.
- Institution Setup has org chart, card/gallery, and list views over the same records, with permissions and progress status consistent across views.
- Approved staff email domains are optional. Domain verification establishes eligibility for a shared invitation request; it never grants a privileged role by itself. Named outside-domain invitations are supported.

## 2. Canonical terms and relationships

| Concept | Meaning and relationship |
|---|---|
| Institution | Tenant and data boundary. Has many departments and institution-scoped staff. |
| Department | Belongs to one institution; groups programs. One person may head multiple departments through separate assignments. |
| Program | Has one home department by default; cross-department cases need an explicit design. A coordinator may be assigned to multiple programs. |
| Cohort | Belongs to one program; represents a group of students, often by entry term. Its membership does not change when a student joins another section. |
| Course | Reusable subject or curriculum requirement, such as Welding Safety. A program may offer it in multiple terms. |
| Class section | A particular scheduled offering of a course in a term, with optional recurring meetings and labs; one or more instructors may be assigned. May serve more than one cohort if institution policy permits. |
| Class enrollment | Student-to-section relationship, with status and provenance. A roster is a view over these records. |
| Staff assignment | Role + exact institution/department/program/cohort/section scope. Multiple assignments can belong to one staff account within its institution. |

Do not model a student's enrollment as a child record nested permanently inside a cohort. Maintain distinct cohort membership and section enrollment so schedules, makeups, and transfers do not rewrite history. Course definition and section instance must also remain distinct.

## 3. Management and creation rights

| Actor | Default setup responsibility | Invite/assignment authority in own scope |
|---|---|---|
| TXKPRO platform admin | Create/approve institution and bootstrap first Institution Admin | Platform-controlled only; audited |
| Institution Admin | Institution settings, departments, domain policy, oversight | Appoint/remove Department Head and other institution staff assignments within that institution |
| Department Head | Confirm department and programs; oversee downstream setup | Invite/assign/remove Program Coordinators within assigned department |
| Program Coordinator | Program and cohort skeleton, course catalog oversight, optional draft sections | Invite/assign/remove instructors within assigned program; perform or delegate allowed class actions, monitor section setup and enrollment |
| Instructor | Complete profile, create section, schedule meetings/labs, publish enrollment link, manage class roster | Invite students to assigned section; may remove students from own section under program policy; cannot grant or revoke instructor or higher staff assignments |
| Student | Complete student profile and accept section enrollments | Own profile fields as allowed; no staff privileges |

These are proposed changes to the canonical role matrix: it currently gives Program Coordinators **READ** for Team & Permissions, and does not define `class_section` scope. Add narrow invite/assign capabilities without giving a coordinator general institution-wide permission management. An instructor's section creation must be limited to their assigned program(s). A coordinator can assist at any point without forcing a full setup before inviting instructors.

A Department Head's authority over a coordinator applies only to the coordinator's assignment in that department. Revoking one assignment leaves unrelated assignments intact. A person can be Department Head of Plumbing and Instructor of an Electrical section; the Plumbing workspace cannot expose Electrical roster data through the department role.

**Staff removal decision:** A Program Coordinator may revoke an instructor's program/section assignment only within programs the coordinator actively manages. A Department Head may revoke a Program Coordinator assignment only within that head's department; an Institution Admin may revoke staff assignments within their institution. A higher role can manage subordinate assignments inside its own authorized scope, never peer or higher roles merely by being a peer, and never another program or institution. An instructor cannot remove another instructor's access. Revoke the specific scoped membership, not the person's account or unrelated memberships; prompt for confirmation, record actor/reason/time, and recheck access immediately for ongoing sessions.

**Program-controlled class delegation:** Program Coordinators may perform any class action available to an instructor within their assigned program, including roster management, but need not personally handle routine actions. Instructors have those actions in their assigned sections by default. A coordinator may configure narrowly enumerated program-level instructor permissions within institution-admin limits, such as whether an instructor's student removal is immediate or requires coordinator approval. This setting cannot grant actions outside the instructor's program/sections, broaden data access, or let an instructor manage peer staff roles. Default: an instructor can remove a student from their own section. Optional review mode: instructor submits a removal request; the enrollment remains active until a coordinator approves it. Coordinator can also initiate the removal directly. All paths retain an audit history and remove only the student's section enrollment, not their student account, cohort membership, or other classes.

**Rejoin after removal:** Once a student has been removed from a section, an existing QR code or email link may submit a rejoin request but must not reactivate that section enrollment automatically. The assigned instructor reviews and approves the request before the student regains section access. Keep the prior removal and approval history; a repeat scan while approval is pending must not create duplicate requests. This exception to immediate first-time QR joining applies only to that student and section.

## 4. Guided setup relay

1. **Bootstrap:** TXKPRO approves institution and first Institution Admin. Admin verifies institution identity and configures optional approved staff domains.
2. **Institution skeleton:** Admin adds departments or imports an approved structure. Each department may have an unfilled head assignment. Admin sends named invites or enables a moderated shared invite path.
3. **Department skeleton:** Head accepts, verifies their department, creates/adjusts programs, and invites scoped Program Coordinators.
4. **Program skeleton:** Coordinator accepts, defines or confirms program and cohorts, may add courses or placeholder sections, invites instructors into assigned programs, and optionally preassigns courses/sections.
5. **Instructor detail:** Instructor accepts, selects assigned program, creates/completes class sections with term, meeting recurrence, optional lab meetings, section capacity and enrollment settings. Instructor publishes student email links or a printable/displayable class QR; enrollment can begin immediately, with no coordinator approval gate.
6. **Student self-onboarding:** First QR/email open preserves the section target across account creation and email verification. Student completes minimum profile, views section details, and requests or confirms enrollment. Later scans go straight to section confirmation after sign-in.
7. **Rollup:** Section enrollment changes derive its roster; authorized dashboards aggregate class, cohort, program, department, and institution counts from canonical records. Show pending versus confirmed counts separately.

Setup is resumable. A parent can invite a subordinate before filling every optional field. Each step displays what is complete, missing, pending acceptance, or awaiting review. No invitation should silently create a role membership before identity and approval checks.

## 5. Staff invitation and email-domain policy

- **Named invite (preferred for staff):** target email, intended role, exact scope, issuer, expiration, single-use token, status. Recipient verifies email, accepts, and completes profile. Grant only the specified scoped assignment, subject to institution policy.
- **Shared link/QR for staff:** identifies institution and requested target role/scope; requires verified email that matches an institution-approved domain, or an expressly allowed named exception. Create `pending_review`; an authorized manager approves the exact assignment. Sharing or scanning never automatically grants a privileged role.
- **Domains:** optional allowlist of exact approved domains per institution, verified as institution-controlled before use; support more than one and explicit outside-domain invites. Do not presume `.edu`. Domain membership is an eligibility filter, not evidence of employment, identity beyond the verified mailbox, or authority.
- **Existing staff:** accepting another invitation at the same institution adds a separate assignment to the existing account. It must not create a duplicate profile. An invite sent to an email associated with another institution needs a clear conflict/recovery path consistent with the one-institution-per-account policy.
- **Lifecycle:** issued → opened → email_verified → accepted/pending_review → active; declined, expired, revoked, and suspended paths. Revocation must cut off server-side access promptly and be audited. Resend rotates tokens; duplicate acceptance is idempotent.

## 6. Student enrollment and cohort decision

Class invitation URL/QR points to a **section**, not a cohort or permission grant. Display course, section, term, instructor, and institution before confirmation. First use preserves the destination through registration and email verification. Existing students use the same account and add a new enrollment. A repeat scan of an already joined section shows its current status rather than duplicating membership.

Three separate states are required: (a) student account/profile, (b) institution/program/cohort affiliation, and (c) class-section enrollment. After account creation and email verification, a valid QR or email invitation immediately creates the student's section enrollment without coordinator confirmation. It does not assert (b) or grant access to another section or private student records. Existing confirmed cohort affiliation is retained when joining another section. Where one section serves multiple cohorts, the student may indicate theirs, but the choice remains unverified until matched or approved. An unmatched student appears on the class roster as enrolled with **affiliation pending review**, so the instructor can resolve the program/cohort information later without blocking the class join. Counts distinguish enrolled students with verified versus unresolved affiliation.

**Decision — shared responsibility with instructor as primary owner:** The instructor is responsible for getting students correctly enrolled in each assigned section, reviewing unmatched QR joins, and confirming or correcting the student's program/cohort against an institution-approved source where authorized. The Program Coordinator oversees all sections in the program, reviews unresolved affiliation mismatches, can correct/approve an exception within program scope, and follows up with instructors until every expected student is accounted for. Neither role should infer affiliation solely from a student-selected dropdown. A preapproved import or named student invite can establish affiliation without manual review when it supplies an approved match.

**Optional enrollment baseline:** TXKPRO does not require an institution-wide expected enrollment count or a preloaded class roster. An instructor may upload or enter a separate list of expected student email addresses for each section. This is an **invitation/expected list**, distinct from the live roster generated from confirmed section enrollments. The system normalizes email addresses, previews duplicates and invalid entries, then can send section invitations. It matches verified student account emails and confirmed section enrollments to entries on that section's expected list. If present, show `matched active enrolled / valid expected addresses`, plus invited, pending signup, pending enrollment, unmatched, declined, and removed counts. The Program Coordinator can see these class-level results in program rollups and follow up with instructors. If no expected list is supplied, show enrollment counts without a completion percentage. An instructor may replace or update a list with an auditable change so the denominator is clear; a student who joins by QR but was not listed is flagged as an additional enrollee, not silently added to the expected denominator. The goal of 100% is an operational target, not a required data field or a claim of full institutional enrollment.

`Join Class` is term/section enrollment. A future `Check In` records attendance for a meeting and uses a separate action/token. A static enrollment QR is not proof that a student attended that day.

## 7. Working context, three views, and permissions

Within one institution, a staff member's workspace selector lists meaningful assignments, for example “Plumbing · Department Head” and “Electrical · Instructor · Section A.” A selected context controls default navigation and queries; it is not itself authorization. All reads, mutations, exports, invite actions, and aggregates are checked server-side against current active memberships and the record's institution and exact scope. Deny cross-institution access by default. Switching roles clears or reloads sensitive view state so prior student records do not linger in the next context.

**Org chart:** institution → departments → programs → expandable cohorts and class sections; people appear as assignment badges or attached cards, not as a rigid single-parent tree. A person with two roles appears in two assignment positions but has one institution account. Node actions are scoped: add, assign, invite, open detail, resolve gap. Collapsed branches, search, focus, and counts prevent a large chart becoming unusable.

**Card view:** entity cards with owner, counts, completion, pending invites, and next action. **List view:** filter, sort, search, and permitted bulk invite actions. All three views use the same canonical entities and actions. Changes in one view update the others; the same server authorization applies. Use accessible list alternatives for canvas actions, including on mobile.

Progress is a derived state: missing owner, invite pending, setup in progress, section draft, enrollment open, ready, blocked. Do not treat a prototype “View as” role switch as production authorization.

## 8. Proposed data additions and implementation constraints

Extend existing Supabase/Postgres entities rather than duplicate them. Validate the live schema before migration. Likely additions/mappings:

- `departments`: institution FK, name, status.
- `programs`: existing entity plus department FK; migrate carefully and handle unassigned legacy programs.
- `cohorts`: existing program FK and dates; separate `student_cohort_memberships` where history or multiple affiliations are needed instead of relying only on `student_profiles.cohort_id`.
- `courses`: institution/program association, code/name and optional curriculum metadata.
- `class_sections`: course/program FK, term, title, status, capacity, published/enrollment-open state; model recurrence and labs as `section_meetings` rather than one free-text schedule. Publishing is instructor-controlled within assigned scope and does not require coordinator approval.
- `section_instructor_assignments`: section + staff assignment, lead/support designation, dates/status.
- `section_enrollments`: section + student, unique active enrollment, status, source (email, QR, import, admin), timestamps and reviewer.
- Optional `section_expected_invitees`: section + normalized email, invite/match status, upload batch/source and timestamps. Store only the minimum contact data needed for invitations and matching; do not treat entries as enrolled students or confirmed cohort members.
- `staff_invitations`, `student_section_invites`/`section_join_tokens`, and `institution_email_domains`: hashed/opaque token records, expiration, use limits, issuer, scope and status.
- Existing `role_memberships` extend with section scope, or use a canonical staff-assignment table with explicit section ownership. Keep one effective authorization model.
- Audit events for role assignment, invite approval/revocation, section publication, cohort changes, and enrollment overrides.

Use stable IDs and explicit institution IDs on tenant-owned rows, unique constraints, foreign keys, idempotent accept/join transactions, server checks, and row-level security. Derive rosters through enrollment queries and aggregates through scoped database views/queries. Never authorize from editable user metadata, a workspace selector, a link, or an email domain alone. Do not include grades, financial aid, or unrelated student records in this MVP extension.

## 9. Acceptance scenarios

1. Institution Admin creates two departments, invites heads, and sees both pending nodes in chart/card/list; an accepted invite updates all views.
2. A head of Plumbing invites a coordinator for Plumbing only; attempts to assign Electrical are denied server-side.
3. One coordinator has Welding and Plumbing program assignments; choosing either context exposes only the corresponding program actions.
4. An instructor assigned to Welding creates a recurring section with a lab, publishes a QR, and an eligible student immediately joins without coordinator approval; the instructor cannot create one in unassigned Plumbing.
5. A new student scans the Welding QR, verifies email, completes minimum profile, returns to that section, and joins once; scanning a second class QR skips onboarding and retains cohort membership.
6. A student with an unconfirmed cohort choice joins the section immediately and appears on its roster, but their cohort is not counted as institution-confirmed; the assigned instructor reviews it first, with the Program Coordinator able to resolve program-level exceptions.
7. An instructor uploads 20 distinct valid email addresses for a section. Eighteen listed students create verified accounts and confirm enrollment; two have not joined. The dashboard shows 18/20 matched and the two outstanding invitations, while a QR enrollee absent from the list is reported separately. Another section without an uploaded list shows its enrolled total and no completion percentage.
8. Two students in one cohort enroll in different term offerings of one course; both remain in their original cohort.
9. Revoking an instructor's one section removes access there while preserving other active section/program assignments.
9a. A Plumbing coordinator may remove an instructor from Plumbing but cannot remove the same person's Electrical assignment. An instructor cannot revoke a peer instructor, and a department head cannot remove a coordinator assignment in a different department.
9b. A Welding instructor removes a student from their own section immediately under default policy. If the Welding coordinator enabled approval for removals, the action instead awaits coordinator approval and the student's enrollment remains active until approved. The student's other classes and cohort are unaffected.
9c. A removed student scans the same section QR. The system records one rejoin request, leaves section access inactive, and restores it only after the assigned instructor approves. Their first-time join behavior in other eligible sections is unaffected.
10. A shared staff QR with a valid institution-domain email creates a request, not immediate staff access. An outside-domain named invite can be accepted when explicitly authorized.
11. A user cannot access another institution's section, roster, exports, or invitation endpoint, even by changing URL IDs or selected workspace.

## 10. Delivery order and source alignment

1. Confirm the instructor-first affiliation review and coordinator exception permissions against the pilot institution; specify optional instructor-managed per-section email lists, matching, and denominator changes. Resolve institution email/account edge cases and approve the narrow permissions amendment.
2. Inventory the live schema and routes against the canonical Workforce PRD/TRD and role matrix; determine migration/backfill and compatibility with current roster CSV import.
3. Add department/course/section/enrollment relations, scoped staff assignments, invitation/token lifecycles, RLS, and audit events. Verify negative authorization cases.
4. Implement staff invitation relay and role-specific resumable setup. Implement instructor section creation and schedule editor with immediate enrollment availability after instructor publication.
5. Implement first-scan student signup redirect and later section joins. Roll up confirmed and pending counts distinctly.
6. Build list/card views and shared actions; add interactive org chart on the same model. Verify large-organization and mobile usability.
7. Pilot one department/program with two cohorts, two instructors and multiple sections. Exercise invitations, QR signup, transfer, revocation, and cross-scope denial before broader release.

**Alignment/gaps in existing sources:** The September 2026 Workforce PRD and TRD already define email verification, multiple server-controlled memberships, institution/program/cohort management, roster import, and scoped educator access. The role matrix defines Institution Admin, Department Head, Program Coordinator, Instructor, and scopes through cohort; it does not yet define class-section scope or coordinator staff invites. The status dictionary supplies onboarding, membership, program and cohort states. The shared ownership rules require canonical Supabase/Postgres records, server authorization, and institution isolation. The roadmap marks some foundation items complete, but this plan does not assert that the new hierarchy, class-section flow, or canvas exists in production. Reconcile roadmap status against the live repository before changing it.

### Source files reviewed

- `TXKPRO_Workforce_MVP1_PRD.txt` §§8.1–8.2
- `TXKPRO_Workforce_MVP1_TRD.txt` §§6–7
- `TXKPRO_Role_Permissions_Matrix.txt`
- `TXKPRO_Data_Ownership_and_Scope_Rules.txt`
- `TXKPRO_Status_Dictionary.txt`
- `INSTITUTION PLATFORM INFORMATION ARCHITECTURE + USER FLOWS + ROLE VIEWS.txt`
- `TXKPRO_Workforce_Master_Implementation_Roadmap_Gantt_Kanban(1).csv`
