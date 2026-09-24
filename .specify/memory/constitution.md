<!--
Sync Impact Report
- Version change: unversioned template → 1.0.0
- Modified principles:
  - [PRINCIPLE_1_NAME] → I. Food-Logging Product
  - [PRINCIPLE_2_NAME] → II. Existing Module Boundaries
  - [PRINCIPLE_3_NAME] → III. Backend Verification Gate
  - [PRINCIPLE_4_NAME] → IV. Hard-Coded Mobile Captions
  - [PRINCIPLE_5_NAME] → V. User-Owned Foods
- Added sections:
  - Technology Constraints
  - Development Workflow
  - Governance (filled from template placeholder)
- Removed sections: none (template placeholders replaced)
- Follow-up TODOs: none
-->

# Talk to Scale Constitution

## Core Principles

### I. Food-Logging Product

Talk to Scale is a food-logging app. The product is a React Native mobile app,
a Node backend, Postgres, and scale hardware that the app connects to and
streams weight data from over BLE.

Rationale: Feature work stays inside this product and stack. New capabilities
extend food logging, weight capture, or the services that support them.

### II. Existing Module Boundaries

New work MUST follow the module boundaries already described in `README.md`
and the docs linked from `AGENTS.md`. Those modules are the TypeScript backend
(`backend/`), the React Native (Expo) mobile app (`mobile/`), and the ESP32
firmware (`esp32/`).

Rationale: The repository already separates API and persistence, the logging
UI and BLE client, and scale firmware. New work extends those boundaries
instead of introducing a parallel architecture.

### III. Backend Verification Gate

Backend changes MUST pass `cd backend && npm run typecheck && npm run check`
before the work is treated as finished.

Rationale: Typecheck and the project check are the required proof that a
backend change is consistent with the existing codebase.

### IV. Hard-Coded Mobile Captions

Mobile captions MUST stay hard-coded in component files.

Rationale: Copy lives next to the component that renders it. A string catalog
or i18n layer is out of scope until this principle is amended.

### V. User-Owned Foods

A new user food is user-owned data. It MUST stay separate from the USDA
catalog: stored and authorized as that user's data, and never written into,
merged with, or treated as part of the shared USDA catalog.

Rationale: The USDA import is a shared catalog. A food a user creates is
private and must not enter catalog search, dedupe, or reseed.

## Technology Constraints

- Mobile UI is React Native (Expo) under `mobile/`.
- The API and persistence layer are the Node/TypeScript backend under
  `backend/`, with Postgres as the database.
- Scale weight reaches the app by a BLE connection that streams weight data
  from the scale hardware. Firmware for that hardware lives under `esp32/`.
- Architecture detail lives in `README.md` and the docs listed in `AGENTS.md`.
  Plans and implementation MUST match those documents when they already
  specify a flow, schema, or protocol.

## Development Workflow

- Before backend work is finished, run `cd backend && npm run typecheck && npm run check`
  and keep the change only when both succeed.
- Mobile user-visible captions are string literals in the component file that
  renders them.
- Do not create a git commit unless the user explicitly asks. Leave changes
  for the user to review first.

## Governance

This constitution is the governance source for Spec Kit work on Talk to Scale.
Where `AGENTS.md` or `README.md` conflict with it, this constitution wins.
Where those documents add detail that does not conflict, follow them.

Amendments are made by updating this file. A change that removes or redefines
a principle in a backward-incompatible way increments the MAJOR version. A new
principle or a material expansion increments the MINOR version. Clarifications
and wording fixes increment the PATCH version. The ratification date stays
fixed. The last-amended date is the date of the change, in `YYYY-MM-DD`.

Plans, task lists, and implementation MUST be checked against these principles
before the work is called complete. Backend work is complete only after the
verification gate passes. Commits happen only when the user asks.

**Version**: 1.0.0 | **Ratified**: 2026-09-23 | **Last Amended**: 2026-09-23
