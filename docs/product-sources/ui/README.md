# TXKPRO UI, Design System, and Style Sources

This directory mirrors the UI-, UX-, design-system-, and style-related source documents available in the TXKPRO project workspace so repository-based coding assistants and contributors can consult the same product guidance.

## Source precedence

For TXKPRO interface work, use the precedence defined by the authoritative design-system source:

1. Product/domain sources control behavior, workflows, roles, scope, permissions, data ownership, canonical lifecycle state, privacy, security, and event behavior.
2. `UI_DESIGN_SYSTEM_STANDARD.txt` controls branding, logo usage, icons, typography, color semantics, spacing, component behavior, navigation patterns, responsiveness, feedback, accessibility, visual hierarchy, prototype conventions, and UI QA.
3. App-specific IA and user-flow specifications control screen hierarchy, role-specific views, app-specific content, and workflow presentation.
4. Individual implementation must conform to the sources above.

Lower-precedence sources must not silently contradict higher-precedence sources.

## Workforce / shared UI sources

### `UI_DESIGN_SYSTEM_STANDARD.txt`

**Authority:** Authoritative UI/UX design-system source of truth for all TXKPRO-branded applications.

Use it for:
- brand and official logo rules;
- Heroicons requirements;
- typography, spacing, color semantics, radii, shadows, and design-token guidance;
- component and navigation patterns;
- responsive behavior;
- interaction feedback;
- accessibility;
- provenance/trust presentation;
- role-aware UI conventions;
- UI QA gates and design-system exception/change-control rules.

### `INSTITUTION_PLATFORM_INFORMATION_ARCHITECTURE_USER_FLOWS_ROLE_VIEWS.txt`

**Authority:** Canonical Institution IA update for the TXKPRO Workforce Institution prototype.

Use it for:
- Institution navigation and screen hierarchy;
- role-view behavior;
- Institution user flows;
- Workforce Readiness presentation;
- Pilot Center and reporting UX;
- employer-learning/micro-certification workflows;
- branded Institution entry/SSO prototype presentation;
- prototype-specific presentation requirements.

This source does not override the shared design system or production authorization/domain rules.

### `HELP_CENTER_ARTICLE_CONTENT_STANDARD.txt`

**Authority:** Source of truth for Help Center article structure and content style in projects using Help Center Manager.

Use it for:
- article metadata and Markdown structure;
- heading/list/procedure conventions;
- interface-label references;
- notes/warnings;
- writing style;
- search-oriented titles and keywords;
- content quality and import behavior.

This is a content standard, not a replacement for the visual design system.

## Legacy marketplace UI references

The sibling directory `../legacy-marketplace-ui/` contains older TXK PRO Home Service Marketplace screen/MVP references:

- `ADMIN_INTERNAL_MVP.txt`
- `CONTRACTOR_MVP.txt`
- `HOMEOWNER_MVP.txt`

These are retained because they are UI/screen-related TXK PRO source material, but they are **not TXKPRO Workforce requirements**. Do not import marketplace-specific workflows, statuses, or screens into Workforce unless a current Workforce requirement explicitly calls for them.

## Implementation rule

Before implementing or materially changing a TXKPRO Workforce user interface:

1. Read the relevant live issue and product/domain requirements.
2. Read `UI_DESIGN_SYSTEM_STANDARD.txt`.
3. Read the applicable app-specific IA/user-flow source.
4. Reuse existing shared components/tokens where possible.
5. Run the design-system QA gates that apply to the changed surface.
6. Document any intentional design-system exception explicitly.
