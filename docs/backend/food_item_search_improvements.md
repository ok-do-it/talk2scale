# Food Item Search Improvements

Embedding search should not be the only ranking signal for food names. For common
queries, users often expect the generic whole food first. For example, searching
for `egg` should return whole egg before `egg yolk` or `egg white`.

The same search service is used by typed food search and voice resolution:

- `GET /search-food?food_name=...` calls `embeddingService.searchFoodName`.
- `POST /voice/transcribe` transcribes audio, then calls the same search method
  with the recognized text.
- `POST /element/:id/names` already lets users add custom `food_name` aliases and
  embeds them immediately.

This makes `searchFoodName` the right place to centralize ranking improvements.
Typed search, voice search, and user-added aliases should all benefit from the
same resolver.

## Status

**Implemented today:**

- Hybrid candidate generation (exact/prefix, trigram, embedding).
- Query normalization (lowercase, punctuation stripped).
- Deterministic ranking that uses `food_name.rank` and `food_name.is_default`.
- Collapse results to one hit per `element_id`.
- Schema columns `is_default` and `rank` on `food_name`.
- Foundation-food suppression, exact-name dedupe, curated merges, and simplified
  aliases during USDA reseed (see [`docs/db/import-usda.md`](../db/import-usda.md)).
- Search regression fixtures in `backend/int-test/search/expectations.json`.

**Still open:**

- User-scoped search (`user_id` on search/voice endpoints).
- Voice correction mappings.
- Optional rank/debug fields in the API response.
- Whisper prompt/context for rare custom words.

## Goals

- Put obvious lexical matches ahead of semantically related matches.
- Prefer a food's default/common alias when several aliases match the same query.
- Boost user-owned aliases for that user without hiding global foods.
- Preserve embedding search for vague or descriptive queries.
- Make voice transcription mistakes recoverable through aliases and fuzzy search.
- Add regression tests so common food names do not drift as the dataset changes.

## Non-Goals

- Do not train or fine-tune the speech model for this work.
- Do not replace embedding search; use it as one ranking signal.
- Do not build an audio fingerprint system as the first solution. Text aliases,
  correction mappings, and phonetic/fuzzy matching should come first.

## Current Ranking Approach

`searchFoodName` builds a candidate pool from:

1. Exact / prefix / whole-word lexical matches on normalized `food_name.name`
   and `element.name`.
2. Trigram candidates (`pg_trgm`, similarity threshold `0.45`).
3. Embedding nearest neighbors.

Final ordering (conceptually):

```sql
ORDER BY
  text_rank ASC,          -- exact / whole / prefix / fuzzy buckets
  rank DESC,              -- curated food_name.rank
  is_default DESC,        -- prefer default alias when collapsing
  element_rank ASC,       -- whole_food before branded/recipe when tied
  vector_distance ASC,
  trigram_similarity DESC
```

`text_rank` buckets include exact name, `whole <query>` / `<query> whole`,
prefix matches, and looser contains / reversed-term matches. After SQL ranking,
the service collapses to the first hit per `element_id` and returns top 10.

For the `egg` case:

- Curated alias `Egg` (`is_default`, high `rank`) is seeded in
  `db/dataset/curate-foundation-food-names.json`.
- Exact alias match outranks semantic near-neighbors like yolk/white.

## Ranking Signals

Use a score made from explicit signals instead of relying on vector distance
alone. Keep the result explainable enough that tests can assert why a food won.

Signals in use:

- `text_rank`: exact/prefix/fuzzy ranking bucket.
- `rank` (`food_name.rank`): curated alias priority.
- `is_default`: preferred display/search alias for an element.
- `element_rank`: generic whole foods before branded foods when all else ties.
- `vector_distance`: embedding distance.
- `trigram_similarity`: PostgreSQL `pg_trgm` similarity for typo and ASR cleanup.

Still planned:

- `user_rank`: whether the alias belongs to the requesting user.

## Candidate Generation

Candidates are collected from multiple sources and ranked together:

1. Exact and prefix candidates from `food_name.name`.
2. Trigram candidates from `food_name.name`.
3. Embedding candidates from `food_name.embedding`.

Implementation notes:

- SQL CTEs union lexical, trigram, and vector candidate ids.
- Over-fetch so collapsing by `element_id` still yields enough hits.
- Rank columns are computed in the final SELECT; collapse happens in
  application code after ordering.

This avoids a failure mode where vector search never sees an exact alias because
the alias was outside the initial vector top N.

## Schema

`food_name` includes ranking metadata (see `db/migrations/002_schema.sql`):

```sql
is_default BOOLEAN NOT NULL DEFAULT FALSE,
rank INTEGER NOT NULL DEFAULT 0
```

Use `is_default` for the best display/search alias of an element. Use `rank`
for curated priority (higher wins). Seeded values come from
[`db/dataset/curate-foundation-food-names.json`](../../db/dataset/curate-foundation-food-names.json)
via `npm run curate-usda-foundation-food-names` during reseed.

Optional later fields:

```sql
ALTER TABLE food_name
  ADD COLUMN normalized_name TEXT,
  ADD COLUMN phonetic_name TEXT;
```

Today normalization is computed in the search SQL (`lower` + punctuation strip).
Persist `normalized_name` only if that becomes expensive. `phonetic_name` should
wait until trigram matching is not enough for voice mistakes.

## Dataset curation (companion to search)

Import-time curation improves what search can see:

| Step | Config / script | Effect |
|------|-----------------|--------|
| Suppress | `suppressed-foundation-food-names.json` | Delete unlikely `food_name` rows (raw meats, lab rows, etc.); elements kept |
| Exact dedupe | `dedupe-whole-foods` | Merge `whole_food` elements with identical `element.name` |
| Curated merge | `curate-foundation-food-names.json` `merge_groups` | Merge similar FDC ids (e.g. apple cultivars) onto one winner |
| Name simplification | same file `aliases` | Add short names like `Egg`, `Apple`, `Chicken breast` with `is_default` / `rank` |

Details: [`docs/db/import-usda.md`](../db/import-usda.md).

## User-Specific Aliases

Custom foods and aliases should influence both typed and voice search.

Plan:

- Accept `user_id` on `GET /search-food` and `POST /voice/transcribe`.
- In `searchFoodName`, include global names and that user's names:

```sql
WHERE fn.user_id IS NULL OR fn.user_id = :user_id
```

- Rank user-owned exact aliases above global semantic matches.
- Do not rank unrelated user aliases above strong global exact matches unless
  the text is also close. This prevents a personal alias from polluting every
  search.
- When a user adds a custom name through `POST /element/:id/names`, allow storing
  several aliases in follow-up work, such as `smetana`, `smetanna`, and
  `sour cream`.

## Voice-Specific Improvements

Adding a `food_name` row helps resolve text after transcription, but it does not
force Whisper to transcribe a rare custom word correctly. Improve voice search in
layers:

1. Pass a short dynamic prompt to Whisper if the transformer pipeline supports
   prompt/context options for the selected model. Include recent foods, favorite
   foods, and user-owned aliases.
2. Search using the transcript plus fuzzy aliases. For example, if `radicchio`
   transcribes as `radicure`, trigram/alias search should still find the right
   food.
3. Store correction mappings when the user picks a different result:

```text
user_id, heard_text, selected_food_name_id, created_at, last_used_at, use_count
```

4. On later voice searches, boost foods selected for similar previous
   transcripts.

Avoid storing audio fingerprints initially. They are sensitive, harder to match
reliably across microphones/noise/accent, and do not solve typed search. If audio
examples are stored later, use them as evaluation fixtures or an explicit
user-specific fallback for rare names, not as the primary resolver.

## API Changes

### `GET /search-food`

Current:

```text
GET /search-food?food_name=egg
```

Recommended:

```text
GET /search-food?food_name=egg&user_id=1
```

Response can remain backward-compatible, with optional debug/rank fields added
only if useful:

```json
{
  "foodNameId": 123,
  "elementId": 610,
  "elementName": "Egg, whole",
  "name": "egg",
  "distance": 0.12,
  "rank": {
    "textRank": 0,
    "aliasPriority": 10,
    "trigramSimilarity": 1
  }
}
```

### `POST /voice/transcribe`

Add optional `user_id` as form data or query string so the backend can:

- include user aliases in the dynamic prompt;
- boost user aliases during search;
- apply prior correction mappings.

## Implementation Plan

### Phase 1: Hybrid Search Ranking — done

- Query normalization helper for food search.
- Candidates from exact/prefix, trigram, and embedding sources.
- Deterministic final ranking and collapse-by-`element_id`.
- Top 10 hits returned.

### Phase 2: Alias Priority Metadata — done

- `is_default` and `rank` on `food_name`.
- Curated default aliases for common whole foods via
  `curate-foundation-food-names.json` (includes `egg` and other staples).
- Embed script still only embeds rows with `embedding IS NULL`.

### Phase 3: User-Aware Search

- Add optional `user_id` to `GET /search-food`.
- Pass current user id from mobile search calls when available.
- Add optional user id support to `POST /voice/transcribe`.
- Rank user aliases and correction mappings.

### Phase 4: Voice Corrections

- Add a small table for voice/text correction mappings.
- Record a correction when the user rejects the auto-selected food and picks a
  different one.
- Boost corrections for future searches by the same user.
- Investigate Whisper prompt/context support in `@huggingface/transformers` for
  `onnx-community/whisper-large-v3-turbo`.

### Phase 5: Evaluation and Tuning — partially done

- Expand `backend/int-test/search/expectations.json` with common generic foods:
  `egg`, `banana`, `apple`, `milk`, `rice`, `chicken`, `potato`, `tomato`.
- Keep voice fixtures for known transcription errors such as `radicure` for
  `radicchio`.
- Add tests for user aliases and correction mappings.
- Run both search and voice integration tests before changing ranking constants.

## Test Cases

Minimum cases:

- `egg` returns whole egg before yolk or white.
- `egg white` returns egg white before whole egg.
- `boiled egg` returns the boiled/cooked egg item.
- `banan` returns banana.
- `radicure` returns radicchio.
- A user alias exact match beats a global semantic match for that user.
- Another user does not see that user-owned alias.
- A short query like `tea` does not match unrelated fuzzy names.

## Open Decisions

- Should branded foods be demoted by default for short generic queries?
- Should recipe results appear before whole foods when the recipe name is an
  exact user alias?
- Should the API expose rank/debug fields only in development, or always?
- What user id source should mobile use before real authentication exists?
