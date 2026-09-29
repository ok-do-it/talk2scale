# Contract: Create a user food

Creates one branded food from a confirmed review form. Does not create a meal entry or a recipe. Does not accept an image.

## `POST /user-foods`

**Request**

```json
{
  "user_id": 1,
  "name": "Greek yogurt",
  "serving_grams": 40,
  "nutrients": [
    { "element_id": 3, "grams": 10 }
  ]
}
```

| Field | Rule |
|-------|------|
| `user_id` | Existing user |
| `name` | Non-empty after trim |
| `serving_grams` | Greater than zero |
| `nutrients` | At least one row. `element_id` is an existing nutrient. `grams` greater than zero. No duplicate `element_id`. |

**Response** `201`

```json
{
  "id": 55,
  "type": "branded_food",
  "name": "Greek yogurt",
  "source": "user",
  "external_id": null,
  "links": [
    { "parent_id": 55, "child_id": 3, "ratio": 0.25 }
  ],
  "measures": [
    {
      "id": 201,
      "element_id": 55,
      "user_id": 1,
      "name": "serving",
      "grams": 40
    }
  ]
}
```

`ratio` is `grams / serving_grams`. `GET /element/55/nutrients?mass=40` returns 10 g for that nutrient.

**Errors**

| Status | When |
|--------|------|
| `400` | Missing or invalid fields, unknown user, unknown or non-nutrient `element_id`, duplicate nutrient |

A `400` or a later failure leaves no element, link, measure, food name, or food log.

## Catalog

These existing reads must not return the new food:

- `GET /elements` and `GET /elements?type=branded_food` with no `user_id`
- `GET /search-food`

`GET /elements?user_id=1` stays the recipe lookup (`source = user` and `external_id` equal to that user). It does not list these foods, because their `external_id` is null. A browser of saved nutrition-table foods is out of scope.
