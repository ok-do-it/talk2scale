# Contract: Backend API used by the app

The app calls the existing backend only (FR-015). Full request and response shapes are in [docs/backend/endpoints.md](../../../docs/backend/endpoints.md). This list is binding: it is every call `mobile/src/services/*` makes, and the native app needs no others.

Base URL: `BuildConfig.API_BASE_URL` (default `http://10.0.2.2:8888`, see research R8).

| Call | Used for | React Native source |
|------|----------|---------------------|
| `GET /users/:userId` | User name in the header | `userApi.fetchUser` |
| `GET /users/:userId/food-logs?from&to` | Today's food log | `nutritionApi.fetchUserFoodLogs` |
| `GET /users/:userId/food-logs/nutrients?from&to` | Nutrition totals | `fetchUserFoodLogNutrients` |
| `GET /users/:userId/daily-targets` | Targets (may be `null`) | `fetchDailyTargets` |
| `GET /elements?type=nutrient` | Nutrient names for targets | `fetchNutrientElements` |
| `GET /search-food?food_name=` | Food search, first 6 hits | `searchFoodNames` |
| `POST /food-logs` | Log a food | `createFoodLog` |
| `PUT /food-logs/:id` | Edit a log (`element_id`, `raw_name`) | `updateFoodLog` |
| `DELETE /food-logs/:id` | Delete a log | `deleteFoodLog` |
| `POST /recipes` | Save a recipe | `createRecipe` |
| `POST /voice/transcribe` | Voice clip to text and grams | `voiceApi.transcribeFoodAudio` |

`fetchElementNutrients`, `fetchMeasures`, and `searchElements` exist in `nutritionApi.ts` but no screen calls them. They are not ported.

## Request details that differ from plain JSON

- **Times**: `from`, `to`, and `logged_at` are ISO-8601 UTC strings. `from`/`to` cover the local day.
- **New food log**: `measure_id` is `1` (grams) and `amount` is grams.
- **Search hits**: `/search-food` returns `{ foodNameId, elementId, elementName, name, distance }[]`. The app shows `name` and uses `elementId`.
- **Voice**: `multipart/form-data`, one part `audio`, filename `recording.m4a`, content type `audio/mp4`. Response `{ text, grams? }`. On a non-2xx status, if the body still has non-empty `text`, use it; otherwise show `error`. Client timeout 15 s.

## Errors

A non-2xx response with `{ "error": "..." }` shows that message; otherwise `HTTP <status>`. A network failure shows a short "cannot reach server" message and keeps what the user entered.
