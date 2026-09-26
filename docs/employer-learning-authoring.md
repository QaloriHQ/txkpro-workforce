# Employer Learning Authoring — W11-04C

Implementation note only. Canonical product/authorization/status rules remain in the TXKPRO PRD/TRD, Status Dictionary, Data Ownership/Scope Rules, Role Permissions Matrix, Cross-App Event Map, and Institution IA.

## Authoring hierarchy

- `/employer/learning/:courseId` — Course Overview
  - high-level metrics/readiness/outcomes
  - Course Settings collapsed by default
  - create new draft version for revisions to live/archived content
- `/employer/learning/:courseId/structure` — Course Structure
  - sections/modules
  - lesson architecture and ordering
  - drag/drop plus keyboard move controls
  - Employer-wide lesson templates
- `/employer/learning/:courseId/checkpoints` — Module Detail + Checkpoints
  - learning objective, primary content reference, process/equipment context and safety notes
  - simple interactive checkpoints
  - deterministic completion requirements
  - Company Badge / Employer Certification linkage summary
  - assessment metadata summary only; answer keys remain outside this surface
- `/employer/learning/:courseId/lessons/:lessonId` — Lesson Editor
  - course outline
  - rich editing canvas
  - component/block library
  - Employer-wide reusable blocks
  - autosave state and unsaved-change protection
- `/employer/learning/:courseId/preview` — Student Preview
  - desktop/mobile simulation
  - local-only simulated progress/completion
  - never writes assignment, completion, badge, certification, or assessment evidence

## Approved product decisions

- Publication is course-version based.
- Reusable blocks and lesson templates are Employer-wide.
- Live/archived versions are immutable.
- Student Preview is interactive but non-persistent, including checkpoint simulation.
- Simple course checkpoints and deterministic completion requirement configuration are owned by W11-05.
- Full assessment/question/answer-key authoring remains owned by W11-05A.
- Public human-readable URLs and SEO remain owned by W11-04B.

## Lesson component types

- rich text
- heading
- list
- callout
- safety note
- image
- video
- document
- download
- link
- embed
- button
- divider
- accordion
- columns

Resource URLs are validated server-side and unsafe schemes such as `javascript:` are rejected.
Rich HTML is sanitized before learner rendering.


## W11-05 checkpoint semantics

Simple W11-05 checkpoints are versioned course interactions with type:
- acknowledgement
- confirmation
- reflection

They do not contain assessment answer keys. Course completion requirements are deterministic:
- every checkpoint marked `required` remains mandatory;
- `all_required` requires all required checkpoints;
- `weighted_percent` requires all required checkpoints plus the configured percentage of total checkpoint weight;
- required lessons and required assessments can be independently required by the course rule.

W11-08 owns production completion evaluation and persistence against Student assignments.
