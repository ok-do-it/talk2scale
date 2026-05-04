# Backend API Endpoints

Base URL: `http://localhost:{PORT}`

## Health

### `GET /health`

Returns server health status.

**Response** `200`
```json
{ "status": true }
```

---

## Elements

### `GET /elements`

List elements with optional type and name filtering. `type` is one of `nutrient`, `whole_food`, `recipe`, `branded_food`. `filter` is a substring match on name.

```
GET /elements
GET /elements?type=whole_food
GET /elements?filter=vitamin
GET /elements?type=branded_food&filter=oat
```

**Response** `200`
```json
[
  { "id": 42, "type": "whole_food", "name": "Apple", "usda_id": 1001, "user_id": null },
  { "id": 87, "type": "whole_food", "name": "Avocado", "usda_id": 1024, "user_id": null }
]
```

---

## Nutrient Groups

### `GET /nutrient-groups`

Returns all admin-curated nutrient groups with their member element ids. Use this to render grouped nutrition panels on the client.

**Response** `200` — ordered by `display_order` then `name`. Each `id` is a stable synthetic integer, not a database primary key.

```json
[
  { "id": 1, "name": "Basic", "display_order": 10, "element_ids": [3, 4, 5, 48, 75, 89, 247, 248, 281, 282, 400] },
  { "id": 2, "name": "Macronutrients", "display_order": 20, "element_ids": [3, 4, 5, 7, 48] },
  { "id": 3, "name": "Vitamins", "display_order": 30, "element_ids": [100, 101, 105, 106, 108, 152, 155, 156, 157, 160, 165, 166, 167, 168, 170, 175, 452, 460] }
]
```

Membership is sourced from [`backend/data/nutrient_group.json`](../../backend/data/nutrient_group.json); USDA ids in that file are resolved to `element.id` when the server first loads groups. See [`docs/db/import-usda.md`](../db/import-usda.md).

---

## Element Tree

### `GET /element/:id/tree`

Returns the full ingredient tree rooted at the given element.

```
GET /element/123/tree
```

**Response** `200`
```json
{
  "id": 123,
  "type": "recipe",
  "name": "Granola",
  "ratio": 1,
  "children": [
    {
      "id": 42,
      "type": "whole_food",
      "name": "Oats",
      "ratio": 0.6,
      "children": [
        { "id": 7, "type": "nutrient", "name": "Fiber", "ratio": 0.11, "children": [] }
      ]
    }
  ]
}
```

---

## Element Nutrients

### `GET /element/:id/nutrients`

Returns aggregated nutrient amounts for the given element, walking the full tree, **grouped** into presentation sections. Empty groups are omitted. The `"Basic"` group may include a synthetic energy row (`id: null`, `calculated: true`) derived from macronutrients. `mass` defaults to `1`.

```
GET /element/123/nutrients
GET /element/123/nutrients?mass=2.5
```

**Response** `200`
```json
[
  {
    "id": 1,
    "name": "Basic",
    "displayOrder": 10,
    "nutrients": [
      { "id": null, "name": "Energy (kCal)", "amount": 112.5, "calculated": true },
      { "id": 12, "name": "Protein", "amount": 0.18 }
    ]
  },
  {
    "id": 3,
    "name": "Vitamins",
    "displayOrder": 30,
    "nutrients": [
      { "id": 100, "name": "Vitamin C", "amount": 0.004 }
    ]
  }
]
```

---

## Meals

### `POST /meals`

Create a new meal. Name is assigned by the server based on `logged_at` (or `NOW()` if omitted): **Breakfast** 05–11h, **Lunch** 11–16h, **Dinner** 16–22h, **Late Night** otherwise.

**Request body**
```json
{
  "user_id": 1,
  "logged_at": "2026-05-04T08:30:00Z",
  "food_logs": [
    { "element_id": 42, "raw_name": "oatmeal", "amount": 1, "unit_id": 5 },
    { "element_id": null, "raw_name": "mystery berry", "amount": 100, "unit_id": 1 }
  ]
}
```

`element_id` may be `null` for unresolved voice/text entries. `unit_id` references a measure (see `GET /measures`).

**Response** `201`
```json
{
  "id": 7,
  "user_id": 1,
  "name": "Breakfast",
  "logged_at": "2026-05-04T08:30:00.000Z",
  "food_logs": [
    { "id": 12, "meal_id": 7, "element_id": 42, "raw_name": "oatmeal", "amount": 1, "unit_id": 5 },
    { "id": 13, "meal_id": 7, "element_id": null, "raw_name": "mystery berry", "amount": 100, "unit_id": 1 }
  ]
}
```

---

### `GET /meals/:id`

Fetch a meal with its food logs.

**Response** `200` — same shape as `POST /meals` response

---

### `PATCH /meals/:id/name`

Rename a meal.

**Request body**
```json
{ "name": "Sunday Brunch" }
```

**Response** `200` — updated meal row (without food logs)

---

### `POST /meals/:id/food-logs`

Add a food log item to an existing meal. Request body is a single food log item (same shape as items in `POST /meals`).

**Response** `201` — created food log row

---

### `DELETE /meals/:id/food-logs/:logId`

Remove a food log item from a meal.

**Response** `204`

---

### `GET /meals/:id/nutrients`

Aggregated nutrients for all resolved food log items in the meal. Nutrients are summed across items. Unresolved items (`element_id: null`) are skipped.

**Response** `200` — same structure as `GET /element/:id/nutrients`

---

### `GET /users/:userId/meals`

List all meals for a user, newest first. Each meal includes its food logs. `from` / `to` are optional ISO 8601 datetimes bounding `logged_at`.

```
GET /users/1/meals
GET /users/1/meals?from=2026-05-04T00:00:00Z&to=2026-05-04T23:59:59Z
```

**Response** `200` — array of meals in `POST /meals` shape, ordered by `logged_at` desc

---

### `GET /users/:userId/meals/nutrients`

Aggregated nutrients across all of a user's meals in a date range. Same `from` / `to` query params as `GET /users/:userId/meals`.

**Response** `200` — same structure as `GET /element/:id/nutrients`

---

## Recipes

### `POST /recipes`

Create a new user recipe. Automatically adds a `whole batch` measure (total of all child grams) and optionally a `serving` measure.

**Request body**
```json
{
  "name": "Overnight Oats",
  "children": [
    { "element_id": 10, "grams": 80 },
    { "element_id": 20, "grams": 150 }
  ],
  "serving_grams": 230
}
```

`serving_grams` is optional. `link.ratio` is computed as `child.grams / sum(children.grams)`.

**Response** `201`
```json
{
  "id": 55,
  "type": "recipe",
  "name": "Overnight Oats",
  "source": "user",
  "external_id": null,
  "links": [
    { "parent_id": 55, "child_id": 10, "ratio": 0.348 },
    { "parent_id": 55, "child_id": 20, "ratio": 0.652 }
  ],
  "measures": [
    { "id": 201, "element_id": 55, "name": "whole batch", "grams": 230 },
    { "id": 202, "element_id": 55, "name": "serving", "grams": 230 }
  ]
}
```
