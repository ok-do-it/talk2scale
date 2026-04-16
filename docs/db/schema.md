# Talk2Scale — Database Schema & Architecture

## Overview

The system uses a **TypeScript Backend + PostgreSQL** architecture. The mobile app fetches food data and syncs logs via a REST/GraphQL API. 

Core entities: `Users`, `Element` (the canonical component: nutrients, foods, recipes), `Alias` (search/display names), `Link` (recursive composition junction), `Unit` (serving definitions), `Meal`, `Log`.

---

## Data Scale Estimations (USDA Database)

If importing the full USDA FoodData Central (SR Legacy + Branded Foods):

- `**Element`**: ~510,000 rows (Nutrients, generic foods, branded items)
- `**Link`**: ~6.7 million rows (Mappings between foods and their nutrient profiles)
- `**Alias**`: ~600,000+ rows (Aliases and searchable names)
- **Storage**: ~400-500MB. Easily cached in RAM on a standard Postgres instance for sub-millisecond recursive queries.

---

## Entities

### `Element`

The canonical entity for anything with nutritional value or composition (Composite Pattern).


| Field   | Type                   | Notes                                      |
| ------- | ---------------------- | ------------------------------------------ |
| `id`    | BIGINT (PK)            |                                            |
| `type`  | Enum                   | `nutrient`, `whole_food`, `recipe`, `branded_food` |
| `name`  | String                 | Basic/internal canonical name for the node |
| `userId` | BIGINT? (FK -> Users) | Optional owner if it belongs to a user     |


*(Note: quantities are always grams;* `Alias` *points here so each element can have user-facing aliases too.)*

---

### `Link` (Self-referencing junction)

Defines what makes up a `Element` if it is not nutrient. Creates a directed acyclic graph (DAG) of components.


| Field      | Type        | Notes                                           |
| ---------- | ----------- | ----------------------------------------------- |
| `parentId` | BIGINT (FK) | References `Element.id` (Container/recipe/food) |
| `childId`  | BIGINT (FK) | References `Element.id` (Ingredient/nutrient)   |
| `ratio`    | Double      | Fraction of parent mass (`1.0` means 100%)      |


Composite primary key: `(parentId, childId)`.

---

### `Unit`

Serving names and gram conversion for UX units like `"slice"` or `"cup"` or `"Gram"` or `"Ounce"`.


| Field       | Type                   | Notes                                                  |
| ----------- | ---------------------- | ------------------------------------------------------ |
| `id`        | BIGINT (PK)            |                                                        |
| `elementId` | BIGINT (FK) (Nullable) | References `Element.id`. if Null the unit is universal |
| `name`      | String                 | Serving label, e.g. `"slice"`                          |
| `grams`     | Double                 | Grams for one serving unit                             |


---

### `Alias`

A searchable/display name for a node. Separating names allows multiple user-facing aliases per item while `Element.name` stays as the internal canonical name. Best queried in Postgres using `pg_trgm` for fuzzy matching.


| Field       | Type        | Notes                              |
| ----------- | ----------- | ---------------------------------- |
| `id`        | BIGINT (PK) |                                    |
| `elementId` | BIGINT (FK) | References `Element.id`            |
| `userId`    | BIGINT? (FK) | Optional owner for user-specific aliases |
| `name`      | String      | e.g. `"Bananas, Raw"` or `"Vit C"` |
| `locale`    | String?     | Optional: `"en"`, `"de"`           |


---

### `Users`

Basic user account information.


| Field   | Type        | Notes                |
| ------- | ----------- | -------------------- |
| `id`    | BIGINT (PK) |                      |
| `name`  | String      |                      |
| `email` | String      | Unique email address |


---

### `Meal`

A timestamped collection of log entries — represents one eating occasion.


| Field      | Type                | Notes                                     |
| ---------- | ------------------- | ----------------------------------------- |
| `id`       | BIGINT (PK)         |                                           |
| `userId`   | BIGINT (FK → Users) | Reference to the user who logged the meal |
| `name`     | String?             | Optional label, e.g. `"Lunch"`            |
| `loggedAt` | DateTime            | When the meal was recorded                |


---

### `Log`

A single food/recipe + weight measurement within a meal.


| Field       | Type               | Notes                                                                                                                                                  |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`        | BIGINT (PK)        |                                                                                                                                                        |
| `mealId`    | BIGINT (FK → Meal) | Meal is a group of Log entries                                                                                                                         |
| `elementId` | BIGINT? (FK)       | References `Element.id`. Nullable until resolved                                                                                                       |
| `rawName`   | String             | Original voice/text input from user                                                                                                                    |
| `amount`    | Double             | If it is Weight from BLE scale: amount= number of grams and unitId point to gram entry in `unit` table. it can also be a single egg or banana or slice |
| `unitId`    | BIGINT (FK → Unit) | Amount of what (unit can be slice or gram or cup)                                                                                                      |


---

## Example: Fetch All Nutrients (Postgres Recursive CTE)

To calculate total nutrients for a logged item (e.g., a complex recipe), we traverse the graph down to the leaf nodes (`type = 'nutrient'`). This is highly optimized in Postgres.

```sql
WITH RECURSIVE RecipeTree AS (
    -- Base case: The logged item (e.g. 250g of a Smoothie)
    SELECT id, type, 250.0 AS cumulative_amount 
    FROM Element WHERE id = [LOGGED_ELEMENT_ID]
    
    UNION ALL
    
    -- Recursive step: traverse children using ratio fractions
    SELECT child.id, child.type, (parent.cumulative_amount * edge.ratio)
    FROM RecipeTree parent
    JOIN Link edge ON parent.id = edge.parentId
    JOIN Element child ON edge.childId = child.id
)
-- Aggregate final leaf nutrients (can be wrapped in json_agg for API response)
SELECT n.id, n.name, SUM(rt.cumulative_amount) AS total_grams
FROM RecipeTree rt
JOIN Element n ON rt.id = n.id
WHERE rt.type = 'nutrient'
GROUP BY n.id, n.name;
```

---

## Key Design Decisions

1. **PostgreSQL Backend** — Ideal for recursive CTEs (fast graph traversal) and fuzzy text search (`pg_trgm` on `Alias.name` to handle typos in food logging).
2. **Composite Pattern (Element + Link)** — Infinite nesting. Nutrients, whole foods, and complex recipes all use the same recursive math in grams (`ratio` where `1.0 = 100%`).
3. **Alias is separate from Element** — `Element.name` stays as the internal canonical name while `Alias` stores alternate/search names.
4. **Log elementId is nullable** — voice input may not immediately resolve; allows optimistic logging on the client and asynchronous backend resolution.
5. **Nutrition is computed, not stored** — recursive queries keep the truth in one place. A snapshot column can be added later for historical accuracy if food data changes.

