# Talk2Scale — Database Schema

## Overview

Core entities: `NutriNode` (the canonical component: nutrients, foods, recipes), `FoodName` (search aliases), `NutriEdge` (recursive composition junction), `Meal`, `LogEntry`.

---

## Entities

### `NutriNode`

The canonical entity for anything with nutritional value or composition (Composite Pattern).

| Field  | Type        | Notes                                      |
|--------|-------------|--------------------------------------------|
| `id`   | BIGINT (PK) |                                            |
| `type` | Enum        | `nutrient`, `whole_food`, `recipe`         |
| `unit` | String      | e.g. `"g"` for foods, `"kcal"` for nutrients|

*(Note: `FoodName` points here, so nutrients can have aliases too, like "Vit C" -> "Vitamin C")*

---

### `NutriEdge` (Self-referencing junction)

Defines what makes up a `NutriNode`. Creates a directed acyclic graph (DAG) of components.

| Field      | Type        | Notes                                              |
|------------|-------------|----------------------------------------------------|
| `parentId` | BIGINT (FK) | References `NutriNode.id` (Container/recipe/food)  |
| `childId`  | BIGINT (FK) | References `NutriNode.id` (Ingredient/nutrient)    |
| `amount`   | Float       | Amount of child per 100 units of parent            |

Composite primary key: `(parentId, childId)`.

---

### `FoodName`

A searchable name or alias for a node. Separating names allows multiple aliases per item.

| Field        | Type               | Notes                                      |
|--------------|--------------------|--------------------------------------------|
| `id`         | BIGINT (PK)        |                                            |
| `nodeId`     | BIGINT (FK)        | References `NutriNode.id`                  |
| `name`       | String             | e.g. `"Bananas, Raw"` or `"Vitamin C"`     |
| `locale`     | String?            | Optional: `"en"`, `"de"`                   |
| `isPrimary`  | Boolean            | True for canonical display name            |

---

### `Meal`

A timestamped collection of log entries — represents one eating occasion.

| Field        | Type         | Notes                                          |
|--------------|--------------|------------------------------------------------|
| `id`         | BIGINT (PK)  |                                                |
| `userId`     | String       | User identifier (stored locally on device)     |
| `name`       | String?      | Optional label, e.g. `"Lunch"`                 |
| `loggedAt`   | DateTime     | When the meal was recorded                     |

---

### `LogEntry`

A single food/recipe + weight measurement within a meal.

| Field         | Type               | Notes                                              |
|---------------|--------------------|----------------------------------------------------|
| `id`          | BIGINT (PK)        |                                                    |
| `mealId`      | BIGINT (FK → Meal) |                                                    |
| `nodeId`      | BIGINT? (FK)       | References `NutriNode.id`. Nullable until resolved |
| `foodNameRaw` | String             | Original voice/text input from user                |
| `weightGrams` | Int                | Weight from BLE scale                              |
| `loggedAt`    | DateTime           | Timestamp of this log entry                        |

---

## Example: Fetch All Nutrients (Recursive CTE)

To calculate total nutrients for a logged item (e.g., a complex recipe), we traverse the graph down to the leaf nodes (`type = 'nutrient'`).

```sql
WITH RECURSIVE RecipeTree AS (
    -- Base case: The logged item (e.g. 250g of a Smoothie)
    SELECT id, type, 250.0 AS cumulative_amount 
    FROM NutriNode WHERE id = [LOGGED_NODE_ID]
    
    UNION ALL
    
    -- Recursive step: traverse children, multiply amounts (assuming per-100 units relations)
    SELECT child.id, child.type, (parent.cumulative_amount * edge.amount / 100.0)
    FROM RecipeTree parent
    JOIN NutriEdge edge ON parent.id = edge.parentId
    JOIN NutriNode child ON edge.childId = child.id
)
-- Aggregate final leaf nutrients
SELECT n.id, n.unit, SUM(rt.cumulative_amount) AS total_amount
FROM RecipeTree rt
JOIN NutriNode n ON rt.id = n.id
WHERE rt.type = 'nutrient'
GROUP BY n.id, n.unit;
```

---

## Key Design Decisions

1. **Composite Pattern (NutriNode + NutriEdge)** — Infinite nesting. Nutrients, whole foods, and complex recipes all use the same recursive math.
2. **FoodName is separate from NutriNode** — allows multiple aliases to resolve to the same node.
3. **LogEntry nodeId is nullable** — voice input may not immediately resolve; allows optimistic logging and later confirmation.
4. **Nutrition is computed, not stored** — recursive queries keep the truth in one place. A snapshot column can be added later for historical accuracy if food data changes.
5. **userId is a plain String** — matches current Android plan (just a text input, no auth system yet).