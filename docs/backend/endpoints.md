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

List elements with optional type and name filtering.

| Param | In | Required | Description |
|-------|------|----------|-------------|
| `type` | query | no | One of `nutrient`, `whole_food`, `recipe`, `branded_food` |
| `filter` | query | no | Substring to match against element name (SQL `LIKE %...%`) |

**Examples**

```
GET /elements
GET /elements?type=whole_food
GET /elements?filter=vitamin
GET /elements?type=branded_food&filter=oat
```

**Response** `200` — array of elements ordered by name
```json
[
  { "id": 42, "type": "whole_food", "name": "Apple", "usda_id": 1001, "user_id": null },
  { "id": 87, "type": "whole_food", "name": "Avocado", "usda_id": 1024, "user_id": null }
]
```

**Error** `400`
```json
{ "error": "invalid type parameter. expected one of nutrient, whole_food, recipe, branded_food" }
```

---

## Nutrient Groups

### `GET /nutrient-groups`

Returns all admin-curated nutrient groups with their member element ids. Use this to render grouped nutrition panels on the client.

**Examples**

```
GET /nutrient-groups
```

**Response** `200` — array of groups ordered by `display_order` then `name`
```json
[
  { "id": 1, "name": "Basic", "display_order": 10, "element_ids": [3, 4, 5, 48, 75, 89, 247, 248, 281, 282, 400] },
  { "id": 2, "name": "Macronutrients", "display_order": 20, "element_ids": [3, 4, 5, 7, 48] },
  { "id": 3, "name": "Vitamins", "display_order": 30, "element_ids": [100, 101, 105, 106, 108, 152, 155, 156, 157, 160, 165, 166, 167, 168, 170, 175, 452, 460] }
]
```

Membership is sourced from [`db/dataset/nutrient_group.json`](../../db/dataset/nutrient_group.json) and applied by Phase 6 of the USDA import pipeline. See [`docs/db/import-usda.md`](../db/import-usda.md).

---

## Element Tree

### `GET /element/:id/tree`

Returns the full ingredient tree rooted at the given element.

| Param | In | Required | Description |
|-------|------|----------|-------------|
| `id` | path | yes | Element ID (integer) |

**Examples**

```
GET /element/123/tree
```

**Response** `200` — recursive tree structure
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

**Error** `400`
```json
{ "error": "invalid id parameter" }
```

**Error** `404`
```json
{ "error": "element 123 not found" }
```

---

## Element Nutrients

### `GET /element/:id/nutrients`

Returns aggregated nutrient amounts for the given element, walking the full tree.

| Param | In | Required | Description |
|-------|------|----------|-------------|
| `id` | path | yes | Element ID (integer) |
| `mass` | query | no | Mass multiplier (positive number, defaults to `1`) |
| `groupId` | query | no | Nutrient group id (integer). Filters returned nutrients to members of that group. Discover valid ids via `GET /nutrient-groups`. Unknown ids yield an empty array. |

**Examples**

```
GET /element/123/nutrients
GET /element/123/nutrients?mass=2.5
GET /element/123/nutrients?groupId=1
GET /element/123/nutrients?groupId=3&mass=2.5
```

**Response** `200` — array of nutrients with computed amounts
```json
[
  { "id": 7, "name": "Fiber", "amount": 0.275 },
  { "id": 12, "name": "Protein", "amount": 0.18 }
]
```

**Error** `400`
```json
{ "error": "invalid id parameter" }
```
```json
{ "error": "invalid ?mass= parameter. expected positive number" }
```
```json
{ "error": "invalid ?groupId= parameter. expected integer" }
```

**Error** `404`
```json
{ "error": "element 123 not found" }
```
