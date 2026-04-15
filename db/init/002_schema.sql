CREATE TYPE element_type AS ENUM ('nutrient', 'whole_food', 'recipe', 'branded_food');

CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE element (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type element_type NOT NULL,
  name TEXT NOT NULL,
  usda_id INTEGER NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE link (
  parent_id BIGINT NOT NULL REFERENCES element(id) ON DELETE CASCADE,
  child_id BIGINT NOT NULL REFERENCES element(id) ON DELETE CASCADE,
  ratio DOUBLE PRECISION NOT NULL CHECK (ratio > 0),
  PRIMARY KEY (parent_id, child_id),
  CHECK (parent_id <> child_id)
);

CREATE TABLE unit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  element_id BIGINT REFERENCES element(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grams DOUBLE PRECISION NOT NULL CHECK (grams > 0)
);

CREATE TABLE alias (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  element_id BIGINT NOT NULL REFERENCES element(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  locale TEXT NULL
);

CREATE TABLE meal (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meal_id BIGINT NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
  element_id BIGINT REFERENCES element(id) ON DELETE SET NULL,
  raw_name TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  unit_id BIGINT NOT NULL REFERENCES unit(id) ON DELETE RESTRICT
);

CREATE INDEX idx_element_type ON element(type);
CREATE INDEX idx_element_user_id ON element(user_id);
CREATE UNIQUE INDEX idx_element_usda_id ON element(usda_id) WHERE usda_id IS NOT NULL;

CREATE INDEX idx_link_parent_id ON link(parent_id);
CREATE INDEX idx_link_child_id ON link(child_id);

CREATE INDEX idx_unit_element_id ON unit(element_id);

CREATE INDEX idx_alias_element_id ON alias(element_id);
CREATE INDEX idx_alias_name_trgm ON alias USING GIN (name gin_trgm_ops);

CREATE INDEX idx_meal_user_id_logged_at ON meal(user_id, logged_at DESC);

CREATE INDEX idx_log_meal_id ON log(meal_id);
CREATE INDEX idx_log_element_id ON log(element_id);
CREATE INDEX idx_log_unit_id ON log(unit_id);
