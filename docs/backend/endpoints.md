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

**Examples**

```
GET /element/123/nutrients
GET /element/123/nutrients?mass=2.5
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

**Error** `404`
```json
{ "error": "element 123 not found" }
```
