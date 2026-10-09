# Implementation Plan: Add a Food from a Nutrition Table Photo

**Branch**: `001-add-user-food` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-add-user-food/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A user taps **Add Nutrition** on the food-logging screen, photographs a nutrition-facts label, corrects a draft, and confirms. Only confirm writes a user-owned branded food. The photo is read by the existing nutrition-facts parser and is not stored. Confirm inserts one `element` (`branded_food`, `source = user`), one `link` per nutrient with `ratio = nutrient grams / serving grams`, and one `measure` named `serving` owned by that user. It does not insert a `food_log` or a recipe. The shared element list and food search omit `source = user` rows so the new food stays out of the USDA catalog.

## Technical Context

**Language/Version**: TypeScript on Node (backend) and React Native 0.81 / Expo SDK 54 (mobile)

**Primary Dependencies**: Express, Kysely, Postgres, Zod, Vitest; Expo image picker for the camera capture only (no photo library)

**Storage**: Existing Postgres tables `element`, `link`, `measure`. No new table and no schema migration. The label photo is not stored.

**Testing**: Backend Vitest + Supertest, following `backend/src/routes/recipeRoutes.test.ts`. Mobile has no test runner; the phone flow is checked with the quickstart.

**Target Platform**: Backend API and the Expo iOS/Android app

**Performance Goals**: A readable label can be photographed, corrected, and confirmed in under 2 minutes. Save is one database transaction. Label reading stays the existing parse call.

**Constraints**: Reuse `llmService.parseNutritionFactsImage` via `POST /llm/nutrition-facts`. Do not extract a food name from the photo. Do not create a meal or a recipe. Nutrient links are not recipe composition shares. Captions are string literals in the component that renders them. Backend work is finished only after `cd backend && npm run typecheck && npm run check`.

**Scale/Scope**: One new mobile screen and one new create endpoint. A typical label has a handful of recognized nutrients. Two foods may share a name. Multiple foods per user must be allowed.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Result |
|-----------|------|--------|
| I. Food-Logging Product | Stay inside food logging on the existing app, API, and database | Pass. Camera, review, and save extend food logging. No firmware work. |
| II. Existing Module Boundaries | Backend under `backend/`, mobile under the legacy React Native app `mobile-rn/` | Pass. New route and service sit next to recipes. New screen sits next to Create Recipe. |
| III. Backend Verification Gate | `cd backend && npm run typecheck && npm run check` | Pass. Required before backend work is called finished. |
| IV. Hard-Coded Mobile Captions | "Add Nutrition" and the review copy are literals in the rendering component | Pass. No string catalog. |
| V. User-Owned Foods | Branded food with `source = user`, never USDA, not merged, not in catalog search or reseed | Pass. See research decision on `external_id` and catalog filters. |

**Post-design re-check**: Pass. The data model uses existing tables, the contract does not write `food_log` or `recipe`, and catalog queries exclude `source = user`. No principle exception.

## Project Structure

### Documentation (this feature)

```text
specs/001-add-user-food/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── create-user-food.md
│   └── review-flow.md
└── tasks.md              # /speckit-tasks, not this command
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── index.ts                          # mount the new route
│   ├── routes/userFoodRoutes.ts          # POST /user-foods
│   ├── routes/userFoodRoutes.test.ts
│   ├── service/userFoodService.ts        # transaction: element, links, measure
│   └── service/foodTreeService.ts        # shared list excludes source = user
└── src/service/embeddingService.ts       # catalog search excludes source = user

mobile-rn/                              # legacy React Native app
├── app.json                              # camera permission strings
├── src/navigation/RootStack.tsx
├── src/navigation/types.ts
├── src/screens/HomeScreen.tsx            # menu caption "Add Nutrition"
├── src/screens/AddNutritionScreen.tsx    # camera, review form, confirm
└── src/services/nutritionApi.ts          # parse photo + create user food
```

**Structure Decision**: Mobile + API inside the legacy `mobile-rn/` and `backend/` trees. The ESP32 firmware is untouched. The photo parser stays `POST /llm/nutrition-facts`. Persistence is a new create endpoint, not `POST /recipes`, because a recipe link ratio is a share of ingredients and this feature's ratio is nutrient mass divided by serving mass.

## Complexity Tracking

No constitution violations.
