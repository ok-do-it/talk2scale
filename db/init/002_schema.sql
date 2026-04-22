-- Talk2Scale - Database Schema & Architecture
--
-- Overview:
-- - TypeScript backend + PostgreSQL persistence.
-- - Mobile app syncs food data and logs through backend APIs.
-- - Core entities:
--   users, element (canonical nutrients/foods/recipes), food_name (search/display names),
--   link (recursive composition), measure (serving definitions), meal, food_log.
--
-- Data scale estimations for full USDA FoodData Central import:
-- - element: ~510k rows (nutrients, generic foods, branded foods)
-- - link: ~6.7M rows (food->component mappings)
-- - food_name: ~600k+ rows (search aliases)
-- - estimated storage: ~400-500MB
--
-- Key design decisions:
-- 1) PostgreSQL enables fast recursive CTE traversal and fuzzy search (pg_trgm).
-- 2) Composite pattern with element + link supports infinite nesting.
-- 3) food_name is separate from element so canonical names and user-facing names diverge cleanly.
-- 4) food_log.element_id is nullable to support unresolved voice/text entries.
-- 5) Nutrition is computed on read from composition graph, not persisted as redundant totals.

CREATE TYPE element_type AS ENUM ('nutrient', 'whole_food', 'recipe', 'branded_food');
CREATE TYPE data_source AS ENUM ('user', 'usda', 'admin');

-- users: basic user account information.
CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

-- element: canonical entity for anything with nutritional value/composition.
-- - type classifies node as nutrient, whole_food, recipe, or branded_food.
-- - name is internal canonical name.
-- - source identifies where this entity came from.
-- - external_id is source-specific identifier (e.g., USDA FDC id).
-- Quantities are always grams through unit/link math.
CREATE TABLE element (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type element_type NOT NULL,
  name TEXT NOT NULL,
  source data_source NOT NULL,
  external_id TEXT NULL
);

-- link: self-referencing composition junction (DAG edge).
-- - parent_id references container/recipe/food.
-- - child_id references ingredient/nutrient.
-- - ratio is fraction of parent mass (1.0 means 100%).
-- Composite PK (parent_id, child_id) prevents duplicate edges.
CREATE TABLE link (
  parent_id BIGINT NOT NULL REFERENCES element(id) ON DELETE CASCADE,
  child_id BIGINT NOT NULL REFERENCES element(id) ON DELETE CASCADE,
  ratio DOUBLE PRECISION NOT NULL CHECK (ratio > 0),
  PRIMARY KEY (parent_id, child_id),
  CHECK (parent_id <> child_id)
);

-- measure: serving label and gram conversion.
-- - element_id NULL means universal unit (not tied to one element).
-- - examples: gram, ounce, slice, cup.
CREATE TABLE measure (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  element_id BIGINT REFERENCES element(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grams DOUBLE PRECISION NOT NULL CHECK (grams > 0)
);

-- food_name: searchable/display names for an element.
-- Element.name remains canonical; food_name stores user-facing alternatives.
-- Supports trigram fuzzy search and optional embedding similarity search.
CREATE TABLE food_name (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  element_id BIGINT NOT NULL REFERENCES element(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  embedding vector(768) NULL,
  locale TEXT NULL
);

-- meal: timestamped collection of log entries for a user.
CREATE TABLE meal (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- food_log: one recorded food/recipe amount within a meal.
-- - raw_name stores original voice/text input.
-- - element_id is nullable until entity resolution completes.
-- - amount + unit_id represent quantity (grams, cup, slice, etc.).
CREATE TABLE food_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meal_id BIGINT NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
  element_id BIGINT REFERENCES element(id) ON DELETE SET NULL,
  raw_name TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  unit_id BIGINT NOT NULL REFERENCES measure(id) ON DELETE RESTRICT
);

CREATE INDEX idx_element_type ON element(type);
CREATE INDEX idx_element_source ON element(source);
CREATE UNIQUE INDEX idx_element_source_external_id
  ON element(source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX idx_link_parent_id ON link(parent_id);
CREATE INDEX idx_link_child_id ON link(child_id);

CREATE INDEX idx_measure_element_id ON measure(element_id);

CREATE INDEX idx_food_name_element_id ON food_name(element_id);
CREATE INDEX idx_food_name_user_id ON food_name(user_id);
CREATE INDEX idx_food_name_embedding_cosine ON food_name USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_food_name_name_trgm ON food_name USING GIN (name gin_trgm_ops);

CREATE INDEX idx_meal_user_id_logged_at ON meal(user_id, logged_at DESC);

CREATE INDEX idx_food_log_meal_id ON food_log(meal_id);
CREATE INDEX idx_food_log_element_id ON food_log(element_id);
CREATE INDEX idx_food_log_unit_id ON food_log(unit_id);

-- Example recursive CTE for computed nutrient totals:
--
-- WITH RECURSIVE RecipeTree AS (
--     SELECT id, type, 250.0 AS cumulative_amount
--     FROM element WHERE id = [LOGGED_ELEMENT_ID]
--     UNION ALL
--     SELECT child.id, child.type, (parent.cumulative_amount * edge.ratio)
--     FROM RecipeTree parent
--     JOIN link edge ON parent.id = edge.parent_id
--     JOIN element child ON edge.child_id = child.id
-- )
-- SELECT n.id, n.name, SUM(rt.cumulative_amount) AS total_grams
-- FROM RecipeTree rt
-- JOIN element n ON rt.id = n.id
-- WHERE rt.type = 'nutrient'
-- GROUP BY n.id, n.name;
