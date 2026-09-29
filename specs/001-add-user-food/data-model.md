# Data Model: Add a Food from a Nutrition Table Photo

No new tables. Confirm writes existing rows in one transaction. Leaving the review form writes nothing.

## Personal food (`element`)

| Field | Rule |
|-------|------|
| `type` | `branded_food` |
| `name` | Trimmed non-empty text from the review form. Not read from the photo. Duplicate names are allowed. |
| `source` | `user` |
| `external_id` | `null`, so many foods for one user do not collide with each other or with a recipe |

Not a `whole_food`, not a `recipe`, not `source = usda`.

## Serving measure (`measure`)

One row per confirmed food.

| Field | Rule |
|-------|------|
| `element_id` | The new food |
| `user_id` | The current user. Required. Not null. |
| `name` | Exactly `serving` |
| `grams` | Confirmed serving size, greater than zero |

No `whole batch` measure.

## Nutrient link (`link`)

One row per confirmed nutrient row.

| Field | Rule |
|-------|------|
| `parent_id` | The new food |
| `child_id` | An existing element with `type = nutrient` |
| `ratio` | `nutrient grams / serving grams`. Must be greater than zero. |

Example: 10 g protein, 40 g serving → ratio `0.25`. Nutrient amount at a mass is `ratio × mass`, so one serving returns 10 g.

Not `child grams / sum(children grams)`. Calories and %DV are not rows. Two rows for the same nutrient are invalid.

## Display name (`food_name`)

One row so the name is recorded as that user's name.

| Field | Rule |
|-------|------|
| `element_id` | The new food |
| `user_id` | The current user |
| `name` | Same text as `element.name` |
| `is_default` | `true` |

Do not embed this row for catalog search. Catalog search and the default element list exclude `element.source = user`.

## Label draft (not stored)

Held only in the review screen until confirm or leave.

| Field | Rule |
|-------|------|
| `name` | Starts empty. A new photo does not clear it. |
| `servingGrams` | From the parser, then editable. Must be greater than zero to confirm. |
| `nutrients` | `{ elementId, name, grams }[]` from the parser, then editable. Add only a known nutrient. Remove any row. At least one row with grams greater than zero to confirm. |

The photo file is discarded when the user confirms or leaves. A failed save keeps this draft on screen.

## State

1. **Idle** — menu closed, nothing stored.
2. **Capturing** — camera open. Cancel stores nothing.
3. **Reading** — photo sent to the existing parser. Failure stays here with a retry. Nothing stored.
4. **Reviewing** — form visible. Edits and a retake stay in memory.
5. **Saving** — confirm in flight. Failure returns to Reviewing with the form unchanged.
6. **Saved** — element, links, measure, and food name committed. No food log. Screen shows success and leaves the flow.

## Validation

- Confirm stays unavailable until the name has visible text, serving grams are greater than zero, and at least one nutrient has grams greater than zero.
- The server repeats those checks and also checks that the user exists, each child is a nutrient, and nutrient ids are unique.
- A failed check writes no rows.
