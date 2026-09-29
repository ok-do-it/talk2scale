# Quickstart: Add a Food from a Nutrition Table Photo

Validation guide. Implementation steps belong in `tasks.md`.

## Prerequisites

- Postgres migrated with `db/migrations/002_schema.sql`
- Backend dependencies installed
- A known user id and at least one `element` with `type = nutrient`
- For the phone flow: an Expo dev client with camera permission, after `expo-image-picker` is added

## Backend checks

From `backend/`:

```bash
npm run typecheck && npm run check
npm test
```

`userFoodRoutes` tests must cover:

1. `POST /user-foods` with a real nutrient returns `201`, `type = branded_food`, `source = user`, `external_id = null`, one `serving` measure for that user, and `ratio = grams / serving_grams`.
2. `GET /element/:id/nutrients?mass=<serving_grams>` returns the submitted nutrient amount.
3. No `food_log` row and no `recipe` row were created.
4. `GET /elements?type=branded_food` and `GET /search-food` do not return the new food.
5. A second food for the same user and the same name also returns `201`.
6. Missing name, zero serving, empty nutrients, a duplicate nutrient, a non-nutrient id, and an unknown user return `400` and leave no new element.

Parse stays the existing route. A missing image still returns `400` from `POST /llm/nutrition-facts` and inserts nothing.

## Phone checks

1. Open the food-logging menu. The item reads **Add Nutrition**. Create Recipe is still separate.
2. Tap it. The camera opens. Cancel. No new food and no new meal.
3. Photograph a readable nutrition-facts label. The form appears with an empty name, a serving size, and nutrient rows. Nothing is saved yet.
4. Change the name and one amount. Confirm. A saved message appears, then the food-logging screen. Today's meals are unchanged.
5. Repeat, leave the form without confirming. No new food.
6. From a filled form, photograph again. Serving size and nutrients change. The typed name stays. Nothing is saved until confirm.
7. Deny the camera, or send a photo that is not a label. The screen explains the failure and does not save.

## Contracts

- [create-user-food.md](./contracts/create-user-food.md)
- [review-flow.md](./contracts/review-flow.md)
- [data-model.md](./data-model.md)
