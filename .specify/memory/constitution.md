<!--
Sync Impact Report
- Version change: 1.0.0 → 2.0.0
- Modified principles:
  - I. Food-Logging Product: client redefined from React Native to native Android; `mobile/` is a temporary reference
  - II. Existing Module Boundaries: mobile module is `android/`; `mobile/` is reference-only until parity
  - IV. Hard-Coded Mobile Captions: applies to native Android UI files
- Added sections: none
- Removed sections: none
- Follow-up TODOs: After parity, amend again to drop `mobile/` as a reference.
-->

# Talk to Scale Constitution

## Core Principles

### I. Food-Logging Product

Talk to Scale is a food-logging app. The product is a native Android app, a
Node backend, Postgres, and scale hardware that the app connects to and
streams weight data from over BLE. The React Native app in `mobile/` is only
a reference until the native app reaches parity.

Rationale: Feature work stays inside this product and stack. New capabilities
extend food logging, weight capture, or the services that support them. The
React Native app is not the client being built.

### II. Existing Module Boundaries

New work MUST follow the module boundaries already described in `README.md`
and the docs linked from `AGENTS.md`, with this exception for the mobile
client: the mobile module is the native Android app in `android/`. The React
Native app in `mobile/` is a reference only until that app reaches feature
parity. The other modules remain the TypeScript backend (`backend/`) and the
ESP32 firmware (`esp32/`).

Until parity:

- New mobile features MUST be implemented in `android/`.
- `mobile/` MUST stay in the repository and MUST stay working.
- `mobile/` is binding for which features exist, for backend calls, and for
  the scale protocol.
- Screen layout, flows, captions, and error handling in `mobile/` are a guide
  only. The native app MAY improve them. Bugs or awkward behavior in
  `mobile/` MUST NOT be copied on purpose.

When the native app reaches parity, this constitution MUST be amended to drop
`mobile/` as a reference.

Rationale: The repository separates API and persistence, the logging client
and BLE, and scale firmware. The port replaces the React Native client; it
does not add a second product.

### III. Backend Verification Gate

Backend changes MUST pass `cd backend && npm run typecheck && npm run check`
before the work is treated as finished.

Rationale: Typecheck and the project check are the required proof that a
backend change is consistent with the existing codebase.

### IV. Hard-Coded Mobile Captions

User-visible captions in the native Android app MUST stay hard-coded in the
UI file that renders them.

Rationale: Copy lives next to the UI that renders it. A string catalog or
i18n layer is out of scope until this principle is amended.

### V. User-Owned Foods

A new user food is user-owned data. It MUST stay separate from the USDA
catalog: stored and authorized as that user's data, and never written into,
merged with, or treated as part of the shared USDA catalog.

Rationale: The USDA import is a shared catalog. A food a user creates is
private and must not enter catalog search, dedupe, or reseed.

## Technology Constraints

- The mobile client under development is the native Android app under
  `android/` at the repository root.
- `mobile/` (React Native, Expo) is a reference for parity only. It includes
  the generated `mobile/android` build folder, which is not the native app.
- The API and persistence layer are the Node/TypeScript backend under
  `backend/`, with Postgres as the database.
- Scale weight reaches the app by a BLE connection that streams weight data
  from the scale hardware. Firmware for that hardware lives under `esp32/`.
- Architecture detail lives in `README.md` and the docs listed in `AGENTS.md`.
  Plans and implementation MUST match those documents when they already
  specify a flow, schema, or protocol. Where those documents still describe
  React Native as the mobile client, this constitution wins until they are
  updated.

## Development Workflow

- New mobile work lands in `android/`. Do not add product features to
  `mobile/` during the port.
- Before backend work is finished, run `cd backend && npm run typecheck && npm run check`
  and keep the change only when both succeed.
- Native Android user-visible captions are string literals in the UI file
  that renders them.
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

**Version**: 2.0.0 | **Ratified**: 2026-09-23 | **Last Amended**: 2026-09-29
