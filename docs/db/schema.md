# Talk2Scale — Database Schema & Architecture

## Overview

The system uses a **TypeScript Backend + PostgreSQL** architecture. The mobile app fetches food data and syncs logs via a REST/GraphQL API. 

Core entities: `User`, `NutriNode` (the canonical component: nutrients, foods, recipes), `FoodName` (search aliases), `NutriEdge` (recursive composition junction), `Meal`, `LogEntry`.

---

## Data Scale Estimations (USDA Database)

If importing the full USDA FoodData Central (SR Legacy + Branded Foods):
- **`NutriNode`**: ~510,000 rows (Nutrients, generic foods, branded items)
- **`NutriEdge`**: ~6.7 million rows (Mappings between foods and their nutrient profiles)
- **`FoodName`**: ~600,000+ rows (Aliases and searchable names)
- **Storage**: ~400-500MB. Easily cached in RAM on a standard Postgres instance for sub-millisecond recursive queries.

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

A searchable name or alias for a node. Separating names allows multiple aliases per item. Best queried in Postgres using `pg_trgm` for fuzzy matching.

| Field        | Type               | Notes                                      |
|--------------|--------------------|--------------------------------------------|
| `id`         | BIGINT (PK)        |                                            |
| `nodeId`     | BIGINT (FK)        | References `NutriNode.id`                  |
| `name`       | String             | e.g. `"Bananas, Raw"` or `"Vitamin C"`     |
| `locale`     | String?            | Optional: `"en"`, `"de"`                   |
| `isPrimary`  | Boolean            | True for canonical display name            |

---

### `User`

Basic user account information.

| Field   | Type        | Notes                  |
|---------|-------------|------------------------|
| `id`    | BIGINT (PK) |                        |
| `name`  | String      |                        |
| `email` | String      | Unique email address   |

---

### `Meal`

A timestamped collection of log entries — represents one eating occasion.

| Field        | Type               | Notes                                          |
|--------------|--------------------|------------------------------------------------|
| `id`         | BIGINT (PK)        |                                                |
| `userId`     | BIGINT (FK → User) | Reference to the user who logged the meal      |
| `name`       | String?            | Optional label, e.g. `"Lunch"`                 |
| `loggedAt`   | DateTime           | When the meal was recorded                     |

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

## Example: Fetch All Nutrients (Postgres Recursive CTE)

To calculate total nutrients for a logged item (e.g., a complex recipe), we traverse the graph down to the leaf nodes (`type = 'nutrient'`). This is highly optimized in Postgres.

```sql
WITH RECURSIVE RecipeTree AS (
    -- Base case: The logged item (e.g. 250g of a Smoothie)
    SELECT id, type, 250.0 AS cumulative_amount 
    FROM NutriNode WHERE id = [LOGGED_NODE_ID]
    
    UNION ALL
    
    -- Recursive step: traverse children, multiply amounts
    SELECT child.id, child.type, (parent.cumulative_amount * edge.amount / 100.0)
    FROM RecipeTree parent
    JOIN NutriEdge edge ON parent.id = edge.parentId
    JOIN NutriNode child ON edge.childId = child.id
)
-- Aggregate final leaf nutrients (can be wrapped in json_agg for API response)
SELECT n.id, n.unit, SUM(rt.cumulative_amount) AS total_amount
FROM RecipeTree rt
JOIN NutriNode n ON rt.id = n.id
WHERE rt.type = 'nutrient'
GROUP BY n.id, n.unit;
```

---

## Key Design Decisions

1. **PostgreSQL Backend** — Ideal for recursive CTEs (fast graph traversal) and fuzzy text search (`pg_trgm` on `FoodName.name` to handle typos in food logging).
2. **Composite Pattern (NutriNode + NutriEdge)** — Infinite nesting. Nutrients, whole foods, and complex recipes all use the same recursive math.
3. **FoodName is separate from NutriNode** — allows multiple aliases to resolve to the same node.
4. **LogEntry nodeId is nullable** — voice input may not immediately resolve; allows optimistic logging on the client and asynchronous backend resolution.
5. **Nutrition is computed, not stored** — recursive queries keep the truth in one place. A snapshot column can be added later for historical accuracy if food data changes.