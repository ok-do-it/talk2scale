# USDA Import Script

This document explains how `backend/src/scripts/db/clean-reseed.ts` imports USDA CSV datasets into our schema, then applies foundation-food name curation for search.

## What the script imports

It imports into these DB tables:

- `element`
- `link`
- `food_name` (search/display names)
- `measure` (foundation portions)

It does **not** import into:

- `users` (seeded from static JSON instead)
- `food_log`

## Running

Run with:

```bash
cd backend
npm run clean-reseed
```

By default this will first recreate the DB schema (via `clean-db`) and then
import the USDA foundation dataset from
`db/dataset/usda/FoodData_Central_foundation_food_csv_2025-12-18`.

To skip the DB recreation step (for example, when you have already run
`npm run clean-db` manually or want to append to the current schema):

```bash
npm run clean-reseed -- --skip-recreate
```

Standalone post-import steps (after a previous reseed):

```bash
npm run dedupe-whole-foods
npm run curate-usda-foundation-food-names
npm run embed-food-names
```

The script currently expects foundation (`food.csv.data_type = 'foundation_food'`)
and produces `element` rows of type `whole_food`. Non-foundation rows in
`food.csv` are skipped.

## Required source files

Expected in `db/dataset/usda/FoodData_Central_foundation_food_csv_2025-12-18/`:

- `nutrient.csv`
- `food.csv`
- `food_nutrient.csv`
- `food_portion.csv`

Also required next to the dataset:

- `db/dataset/users.json`
- `db/dataset/static-measures.json`
- `db/dataset/suppressed-foundation-food-names.json`
- `db/dataset/curate-foundation-food-names.json`

## Import order (execution flow)

Order is fixed and matters because later phases depend on ID maps created in earlier phases.

### Phase 1: Nutrients (`nutrient.csv` -> `element`)

Source:

- `nutrient.id`
- `nutrient.name`
- `nutrient.unit_name`

Target:

- insert `element` rows with:
  - `type = 'nutrient'`
  - `name = nutrient.name`
  - `source = 'usda'`
  - `external_id = nutrient.id`
  - `user_id = null`

Rules:

- Only mass units are kept:
  - `g` -> multiplier `1`
  - `mg` -> multiplier `0.001`
  - `ug`/`mcg`/`µg` -> multiplier `0.000001`
- Non-mass nutrients are skipped (for example energy `kcal`/`kJ`, `IU`).
- Upsert behavior: `ON CONFLICT (source, external_id) DO NOTHING`.

Outputs used by later phases:

- `nutrientElementByUsdaId: Map<nutrient_id, element.id>`
- `nutrientMultiplierByUsdaId: Map<nutrient_id, grams_per_unit>`

### Phase 2: Foods (`food.csv` -> `element`)

Source:

- `food.fdc_id`
- `food.description`
- `food.data_type`

Target:

- insert `element` rows with:
  - `type = 'whole_food'`
  - `name = food.description` (raw USDA description; not simplified here)
  - `source = 'usda'`
  - `external_id = food.fdc_id`
  - `user_id = null`

Rules:

- Only `foundation_food` rows are imported.
- Upsert behavior: `ON CONFLICT (source, external_id) DO NOTHING`.

Outputs used by later phases:

- `foodElementByFdcId: Map<fdc_id, element.id>`

### Phase 3: Nutrient links (`food_nutrient.csv` -> `link`)

Source:

- `food_nutrient.fdc_id`
- `food_nutrient.nutrient_id`
- `food_nutrient.amount`

Target:

- insert `link` rows with:
  - `parent_id = food element.id`
  - `child_id = nutrient element.id`
  - `ratio = (amount * unitMultiplier) / 100`

Rules:

- Skips row if:
  - food is not in imported map
  - nutrient was skipped in phase 1
  - amount is missing/non-positive
- Ratio is normalized to grams and then converted from per-100g to per-1g.
- Upsert behavior: `ON CONFLICT (parent_id, child_id) DO NOTHING`.

### Phase 4: Food names (`food.csv` -> `food_name`)

Source:

- `food.fdc_id`
- `food.description`

Target:

- insert `food_name` rows:
  - `element_id = food element.id`
  - `name = food.description`
  - `locale = 'en'`
  - `user_id = null`
  - `is_default = false`
  - `rank = 0`

USDA descriptions are stored as-is at this stage. Friendly short names come later
from curation (Phase 7).

### Phase 4B: Suppress unlikely search names

Config: [`db/dataset/suppressed-foundation-food-names.json`](../../db/dataset/suppressed-foundation-food-names.json)

Each entry is `{ fdc_id, name, reason }`. Matching global `food_name` rows for
USDA elements are **deleted**. The underlying `element` and nutrient `link`s
remain, so nutrition data stays available even when the name is hidden from
search.

Typical suppression reasons:

- raw meat / poultry / fish / shellfish unlikely to be logged as eaten raw
- dried or frozen/pasteurized egg processing artifacts
- `0% moisture` dry-bean analytical rows
- separable-lean lab beef cuts
- rind-only produce items

### Phase 5: Portions (`food_portion.csv` -> `measure`)

Source:

- `food_portion.fdc_id`
- `food_portion.gram_weight`
- `food_portion.portion_description` (fallback: `modifier`, fallback: `"portion"`)

Target:

- insert `measure` rows with:
  - `element_id = food element.id`
  - `name = portion description`
  - `grams = gram_weight`

### Phase 6: Exact-name dedupe

Script: `backend/src/scripts/db/dedupe-whole-foods.ts` (`npm run dedupe-whole-foods`)

Merges `whole_food` elements that share the **exact same** `element.name`:

- Winner = max nutrient-link count, then max numeric `external_id`, then max `id`
- Loser links/measures/`food_name`/`food_log` rows are reassigned to the winner
- Duplicate `(element_id, name, locale)` food names on the winner are removed
- Loser elements are deleted

This is not fuzzy similarity merge. Related but differently named foods
(e.g. raw vs cooked chicken) stay separate unless Phase 7 merges them by FDC id.

### Phase 7: Curated merges and name simplification

Script: `backend/src/scripts/db/curate-usda-foundation-food-names.ts`
(`npm run curate-usda-foundation-food-names`)

Config: [`db/dataset/curate-foundation-food-names.json`](../../db/dataset/curate-foundation-food-names.json)

Two operations:

#### `merge_groups`

Explicit similar-item merges by USDA FDC id:

```json
{
  "winner_fdc_id": 1750339,
  "loser_fdc_ids": [1750340, 1750341, 1750342, 1750343],
  "reason": "Apple cultivars; macros interchangeable for everyday logging"
}
```

For each group:

- Reassign loser links/measures/`food_name`/`food_log` onto the winner element
- Deduplicate food names on the winner (prefer `is_default` / higher `rank`)
- Delete loser elements

Aliases targeting a loser FDC id are remapped to the winner after merge.

#### `aliases`

Friendly / simplified search names with ranking metadata:

```json
{
  "fdc_id": 748967,
  "names": [
    { "name": "Egg", "is_default": true, "rank": 120 },
    { "name": "Whole egg", "rank": 100 }
  ]
}
```

Rules:

- Upserts global (`user_id IS NULL`) `food_name` rows for the target element
- At most one `is_default: true` per alias group
- `rank` is a non-negative integer used by search ranking (`rank DESC`)
- Setting a default clears other defaults on that element first
- USDA long descriptions remain unless suppressed earlier; curated names are
  additional (or updated) aliases, not a rewrite of `element.name`

Examples already in the config: `Apple`, `Banana`, `Chicken breast`, `Egg`,
`Ground beef`, `Milk` / `Whole milk`, bean short names, etc.

### Phase 8: Embeddings

All `food_name` rows with `embedding IS NULL` are embedded for vector search.

## Nutrient groups (not part of this import)

Presentation buckets for the nutrition API live in [`backend/data/nutrient_group.json`](../../backend/data/nutrient_group.json). The backend loads that file when serving `GET /nutrient-groups` and `GET /element/:id/nutrients`, resolving `usda_ids` to current `element.id` values. After changing the JSON or reseeding the database, restart the API process so the in-memory cache is rebuilt (or rely on a fresh process after import).

## Batching and performance

The script streams CSV input (`csv-parse`) and writes in batches:

- foods: 5000
- links: 5000
- food names: 5000
- measures: 5000

Progress logs every 10,000 processed rows.

## Idempotency behavior

Conflict-safe on re-run:

- `element` (conflict on `(source, external_id)`)
- `link` (conflict on `(parent_id, child_id)`)
- curated alias upserts (match on element + name + locale for global names)

Not conflict-protected currently:

- Phase 4 food description inserts (full reseed recreates the schema first)
- `measure` inserts from portions

Re-running import without `--skip-recreate` is the safe path. Curate/dedupe
scripts are safe to re-run on an existing DB when merge losers are already gone
(they log and skip missing losers).

## Related design

Search ranking that consumes `is_default` / `rank` is described in
[`docs/backend/food_item_search_improvements.md`](../backend/food_item_search_improvements.md).
