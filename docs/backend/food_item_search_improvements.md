# Food Item Search Improvements

Embedding search should not be the only ranking signal for food names. For common
queries, users often expect the generic whole food first. For example, searching
for `egg` should return `egg, whole` before `egg yolk` or `egg white`.

The same search service is used by typed food search and voice resolution:

- `GET /search-food?food_name=...` calls `embeddingService.searchFoodName`.
- `POST /voice/transcribe` transcribes audio, then calls the same search method
  with the recognized text.
- `POST /element/:id/names` already lets users add custom `food_name` aliases and
  embeds them immediately.

This makes `searchFoodName` the right place to centralize ranking improvements.
Typed search, voice search, and user-added aliases should all benefit from the
same resolver.

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

## Recommended Approach

Use a hybrid rank:

1. Exact and common-name intent first.
2. Default or preferred aliases second.
3. Fuzzy lexical matches third.
4. Embedding similarity as the fallback ranking signal.

For the `egg` case:

- Add `egg` as a `food_name` alias for the whole egg element.
- Rank exact alias matches above semantic matches.
- Keep embedding distance as the tie-breaker after intent-based ranking.

Conceptually:

```sql
ORDER BY
  CASE
    WHEN lower(fn.name) = lower(:query) THEN 0
    WHEN lower(fn.name) = 'whole ' || lower(:query) THEN 1
    WHEN lower(fn.name) = lower(:query) || ', whole' THEN 1
    WHEN lower(fn.name) LIKE lower(:query) || ' %' THEN 2
    ELSE 3
  END,
  fn.embedding <=> :query_vector
```

Longer term, add a small priority signal to `food_name`, such as
`rank_priority` or `is_default`, and mark the default/common alias for each food.
Then search can rank by:

```sql
ORDER BY
  exact_match_rank,
  fn.rank_priority DESC,
  vector_distance
```

This preserves semantic search for vague queries while making common one-word
queries behave closer to user expectations.

## Ranking Signals

Use a score made from explicit signals instead of relying on vector distance
alone. Keep the result explainable enough that tests can assert why a food won.

Suggested fields returned from the query:

- `text_rank`: exact/prefix/fuzzy ranking bucket.
- `alias_priority`: curated priority for the matching `food_name`.
- `user_rank`: whether the alias belongs to the requesting user.
- `element_rank`: generic whole foods before branded foods when all else ties.
- `vector_distance`: existing embedding distance.
- `trigram_similarity`: PostgreSQL `pg_trgm` similarity for typo and ASR cleanup.

Suggested priority order:

```sql
ORDER BY
  text_rank ASC,
  user_rank ASC,
  alias_priority DESC,
  element_rank ASC,
  trigram_similarity DESC,
  vector_distance ASC
```

Start with simple buckets:

```sql
CASE
  WHEN lower(fn.name) = :normalized_query THEN 0
  WHEN lower(e.name) = :normalized_query THEN 0
  WHEN lower(fn.name) IN (
    'whole ' || :normalized_query,
    :normalized_query || ', whole'
  ) THEN 1
  WHEN lower(fn.name) LIKE :normalized_query || ' %' THEN 2
  WHEN similarity(lower(fn.name), :normalized_query) >= 0.45 THEN 3
  ELSE 4
END AS text_rank
```

The exact thresholds should be tuned against test fixtures. Keep the threshold
high enough to avoid surprising matches for very short queries like `tea`, `pea`,
or `yam`.

## Candidate Generation

The current query orders all rows by embedding distance and limits to
`SEARCH_RAW_FETCH`. That can drop a good exact/fuzzy match if its embedding is not
near the query. Instead, collect candidates from multiple sources and rank them
together:

1. Exact and prefix candidates from `food_name.name`.
2. Trigram candidates from `food_name.name`.
3. Embedding candidates from `food_name.embedding`.
4. Optional user-history candidates from recent `food_log` rows.

Implementation options:

- Use SQL CTEs with `UNION`/`UNION ALL`, then group by `food_name.id`.
- Over-fetch each source separately, for example 50 lexical, 50 trigram, and 50
  vector candidates.
- Compute rank columns in the final SELECT and collapse by `element_id` after
  ordering, as the service does today.

This avoids a failure mode where vector search never sees an exact alias because
the alias was outside the initial vector top N.

## Schema Changes

Add small, explicit metadata to `food_name`:

```sql
ALTER TABLE food_name
  ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN rank_priority INTEGER NOT NULL DEFAULT 0;
```

Use `is_default` for the best display/search alias of an element. Use
`rank_priority` for curated exceptions, such as common whole-food names that
should outrank more specific cuts or parts.

Optional later fields:

```sql
ALTER TABLE food_name
  ADD COLUMN normalized_name TEXT,
  ADD COLUMN phonetic_name TEXT;
```

`normalized_name` can store lowercased, punctuation-stripped names. Only add it
if query normalization becomes repeated or expensive. `phonetic_name` should wait
until there is evidence that trigram matching is not enough for voice mistakes.

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

### Phase 1: Hybrid Search Ranking

- Add query normalization helper for food search.
- Change `FoodNameSearchHit` to optionally include rank/debug fields while
  keeping existing fields.
- Refactor `searchFoodName(query)` into `searchFoodName(query, opts)` with
  optional `userId`.
- Generate candidates from exact/prefix, trigram, and embedding sources.
- Apply deterministic final ranking and keep the current collapse-by-`element_id`
  behavior.
- Keep returning the top 10 hits.

### Phase 2: Alias Priority Metadata

- Add `is_default` and `rank_priority` to `food_name`.
- Backfill default aliases for common whole foods.
- Seed specific aliases for known bad cases, starting with `egg`.
- Update the embed script to leave existing embeddings alone and embed only new
  aliases with `embedding IS NULL`, as it already does.

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

### Phase 5: Evaluation and Tuning

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

- Should `rank_priority` live on `food_name`, `element`, or both?
- Should branded foods be demoted by default for short generic queries?
- Should recipe results appear before whole foods when the recipe name is an
  exact user alias?
- Should the API expose rank/debug fields only in development, or always?
- What user id source should mobile use before real authentication exists?
