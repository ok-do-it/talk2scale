# USDA Import Script

This document explains how `backend/src/scripts/importUsda.ts` imports USDA CSV datasets into our schema.

## What the script imports

It imports into these DB tables:

- `element`
- `link`
- `alias`
- `unit`

It does **not** import into:

- `users`
- `meal`
- `log`

## Input modes

Run with:

```bash
cd backend
npx tsx src/scripts/importUsda.ts <dataset_dir> <whole_food|branded_food>
```

Examples:

```bash
npx tsx src/scripts/importUsda.ts ../docs/db/FoodData_Central_foundation_food_csv_2025-12-18 whole_food
npx tsx src/scripts/importUsda.ts ../docs/db/FoodData_Central_branded_food_csv_2025-12-18 branded_food
```

Mode controls expected `food.csv.data_type`:

- `whole_food` -> `foundation_food`
- `branded_food` -> `branded_food`

## Required source files

Always required:

- `nutrient.csv`
- `food.csv`
- `food_nutrient.csv`

Mode-specific:

- `branded_food`: `branded_food.csv`
- `whole_food`: `food_portion.csv`

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
  - `usda_id = nutrient.id`
  - `user_id = null`

Rules:

- Only mass units are kept:
  - `g` -> multiplier `1`
  - `mg` -> multiplier `0.001`
  - `ug`/`mcg`/`µg` -> multiplier `0.000001`
- Non-mass nutrients are skipped (for example energy `kcal`/`kJ`, `IU`).
- Upsert behavior: `ON CONFLICT (usda_id) DO NOTHING`.

Outputs used by later phases:

- `nutrientElementByUsdaId: Map<nutrient_id, element.id>`
- `nutrientMultiplierByUsdaId: Map<nutrient_id, grams_per_unit>`

### Phase 2: Foods (`food.csv` -> `element`)

Source:

- `food.fdc_id`
- `food.description`
- `food.data_type` (filtered by selected mode)

Target:

- insert `element` rows with:
  - `type = 'whole_food'` or `'branded_food'` (from CLI arg)
  - `name = food.description`
  - `usda_id = food.fdc_id`
  - `user_id = null`

Rules:

- `food.csv` rows are filtered to expected USDA `data_type`.
- Upsert behavior: `ON CONFLICT (usda_id) DO NOTHING`.

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

### Phase 4: Aliases (`food.csv` and optional `branded_food.csv` -> `alias`)

#### Phase 4A (both modes): Food descriptions

Source:

- `food.fdc_id`
- `food.description`

Target:

- insert `alias` rows:
  - `element_id = food element.id`
  - `name = food.description`
  - `locale = 'en'`

#### Phase 4B (branded mode only): Brand alias

Source:

- `branded_food.fdc_id`
- `branded_food.brand_owner`
- `branded_food.brand_name`

Target:

- insert `alias` rows:
  - `element_id = food element.id`
  - `name = "<brand_owner> <brand_name>"`
  - `locale = 'en'`

### Phase 5: Units (mode-specific -> `unit`)

#### Branded mode (`branded_food.csv`)

Source:

- `branded_food.fdc_id`
- `branded_food.serving_size`
- `branded_food.serving_size_unit`
- `branded_food.household_serving_fulltext`

Target:

- insert `unit` rows with:
  - `element_id = food element.id`
  - `grams = serving_size`
  - `name = "<serving_size_unit> serving"`
- if `household_serving_fulltext` is present and different, insert one extra `unit` row with that name and same grams

Rules:

- Only gram-like serving units are accepted (`g`/`gram`/`grams`).

#### Whole food mode (`food_portion.csv`)

Source:

- `food_portion.fdc_id`
- `food_portion.gram_weight`
- `food_portion.portion_description` (fallback: `modifier`, fallback: `"portion"`)

Target:

- insert `unit` rows with:
  - `element_id = food element.id`
  - `name = portion description`
  - `grams = gram_weight`

## Batching and performance

The script streams CSV input (`csv-parse`) and writes in batches:

- foods: 5000
- links: 5000
- aliases: 5000
- units: 5000

Progress logs every 10,000 processed rows.

## Idempotency behavior

Conflict-safe on re-run:

- `element` (conflict on `usda_id`)
- `link` (conflict on `(parent_id, child_id)`)

Not conflict-protected currently:

- `alias`
- `unit`

Re-running the same dataset can append duplicate alias/unit rows unless cleaned or constrained.
