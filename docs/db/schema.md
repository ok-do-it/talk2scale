# Talk2Scale — Database Schema & Architecture

## Overview

The system uses a **TypeScript Backend + PostgreSQL** architecture. The mobile app fetches food data and syncs logs via a REST/GraphQL API. 

Core entities: `User`, `NutriNode` (the canonical component: nutrients, foods, recipes), `FoodName` (search aliases), `NutriEdge` (recursive composition junction), `portion` (serving definitions), `Meal`, `LogEntry`.

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
| `name` | String      | Basic/internal canonical name for the node |

*(Note: quantities are always grams; `FoodName` points here so each node can have user-facing aliases too.)*

---

### `NutriEdge` (Self-referencing junction)

Defines what makes up a `NutriNode`. Creates a directed acyclic graph (DAG) of components.

| Field      | Type         | Notes                                              |
|------------|--------------|----------------------------------------------------|
| `parentId` | BIGINT (FK)  | References `NutriNode.id` (Container/recipe/food)  |
| `childId`  | BIGINT (FK)  | References `NutriNode.id` (Ingredient/nutrient)    |
| `amount`   | Double       | Fraction of parent mass (`1.0` means 100%)         |

Composite primary key: `(parentId, childId)`.

---

### `Portion`

Serving names and gram conversion for UX units like `"slice"` or `"cup"`.

| Field    | Type         | Notes                                      |
|----------|--------------|--------------------------------------------|
| `id`     | BIGINT (PK)  |                                            |
| `nodeId` | BIGINT (FK)  | References `NutriNode.id`                  |
| `name`   | String       | Serving label, e.g. `"slice"`              |
| `amount` | Double       | Grams for one serving unit                 |

---

### `FoodAlias`

A searchable/display name for a node. Separating names allows multiple user-facing aliases per item while `NutriNode.name` stays as the internal canonical name. Best queried in Postgres using `pg_trgm` for fuzzy matching.

| Field        | Type               | Notes                                      |
|--------------|--------------------|--------------------------------------------|
| `id`         | BIGINT (PK)        |                                            |
| `nodeId`     | BIGINT (FK)        | References `NutriNode.id`                  |
| `name`       | String             | e.g. `"Bananas, Raw"` or `"Vit C"`         |
| `locale`     | String?            | Optional: `"en"`, `"de"`                   |

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
| `grams` | Int                | Weight from BLE scale                              |
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
    
    -- Recursive step: traverse children using amount fractions
    SELECT child.id, child.type, (parent.cumulative_amount * edge.amount)
    FROM RecipeTree parent
    JOIN NutriEdge edge ON parent.id = edge.parentId
    JOIN NutriNode child ON edge.childId = child.id
)
-- Aggregate final leaf nutrients (can be wrapped in json_agg for API response)
SELECT n.id, n.name, SUM(rt.cumulative_amount) AS total_grams
FROM RecipeTree rt
JOIN NutriNode n ON rt.id = n.id
WHERE rt.type = 'nutrient'
GROUP BY n.id, n.name;
```

---

## Key Design Decisions

1. **PostgreSQL Backend** — Ideal for recursive CTEs (fast graph traversal) and fuzzy text search (`pg_trgm` on `FoodName.name` to handle typos in food logging).
2. **Composite Pattern (NutriNode + NutriEdge)** — Infinite nesting. Nutrients, whole foods, and complex recipes all use the same recursive math in grams (`amount` where `1.0 = 100%`).
3. **FoodName is separate from NutriNode** — `NutriNode.name` stays as the internal canonical name while `FoodName` stores alternate/search names.
4. **LogEntry nodeId is nullable** — voice input may not immediately resolve; allows optimistic logging on the client and asynchronous backend resolution.
5. **Nutrition is computed, not stored** — recursive queries keep the truth in one place. A snapshot column can be added later for historical accuracy if food data changes.