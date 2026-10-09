# Research: Add a Food from a Nutrition Table Photo

## Decision: Read the label with the existing nutrition-facts parser

**Rationale**: `POST /llm/nutrition-facts` already returns `serving_grams` and nutrient masses in grams, mapped onto catalog nutrient ids. It does not return a product name, and it skips calories. That matches the review form: the name starts empty, and the table is the parser output.

**Alternatives considered**: A second parser that also reads the product name. Rejected because the spec says this feature does not add name reading. A photo-library import. Rejected because the spec is camera-only.

## Decision: Capture the photo with Expo's camera launcher, not a library picker

**Rationale**: The app has no camera dependency today (`mobile-rn/package.json`, `mobile-rn/app.json`). `expo-image-picker`'s camera launch takes one photo and returns it to the screen. The screen must not offer the photo library. The image is sent only to the existing parse endpoint, which keeps the bytes in memory and does not write a file. iOS needs `NSCameraUsageDescription`. Android needs the camera permission. Both strings are app config, not a caption catalog.

**Alternatives considered**: `expo-camera` with a custom viewfinder. Rejected because the flow is one shot, then a form, not a live camera session. Saving the image on the food. Rejected by the spec.

## Decision: Save with a new create endpoint, not the recipe endpoint

**Rationale**: `POST /recipes` inserts `type = recipe`, a `whole batch` measure, and `link.ratio = child grams / sum(child grams)`. This feature inserts `type = branded_food`, one measure named `serving`, and `link.ratio = nutrient grams / serving grams`. Example: 10 g protein in a 40 g serving is ratio 0.25, so one serving yields 10 g protein (`amount = ratio × mass` in the food tree). Sharing the recipe service would create a recipe and the wrong ratios.

**Alternatives considered**: Client writes element, link, and measure as separate calls. Rejected because a failed middle call would leave a partial food. One transaction, same shape as `recipeService.createRecipe`.

## Decision: Leave `element.external_id` null and own the food through `measure.user_id`

**Rationale**: `element` has no `user_id` column. The partial unique index on `(source, external_id)` allows many null `external_id` values and only one non-null pair. Recipes already store `external_id` as the user id, so a second row with `source = user` and that same id cannot be inserted. Personal foods must allow many per user, including users who already have a recipe. `external_id` stays null. The serving measure sets `user_id` to the current user, `element_id` to the new food, `name` to `serving`, and `grams` to the confirmed serving size. A `food_name` row with that same `user_id` stores the display name and is not embedded for catalog search.

**Alternatives considered**: `external_id = user id`, matching the recipe comment. Rejected because the unique index allows only one such element per user. A new `element.user_id` column. Rejected because the existing measure and food-name user columns already record ownership without a migration.

## Decision: Hide `source = user` from the shared catalog

**Rationale**: `GET /elements` with no user currently returns every element, and food search joins `food_name` to `element` with no source filter. A new branded food would show up in both. Constitution V forbids writing a user food into the USDA catalog or catalog search. Default element listing and catalog search exclude `element.source = user`. User recipes stay available through the existing `user_id` plus `external_id` filter. This feature does not add a "my foods" browser and does not log the food.

**Alternatives considered**: Skip the `food_name` insert and leave search unchanged. Rejected because `GET /elements` would still list the element. Filter every `food_name.user_id` out of search. Rejected because custom names on USDA foods are a separate, already-shipped path and this feature should not change them.

## Decision: Reject a nutrient that is not a catalog nutrient, and reject duplicates

**Rationale**: `link` requires an existing child and a ratio greater than zero, and `(parent_id, child_id)` is unique. The save checks that each child exists and has `type = nutrient`, that grams and serving size are greater than zero, and that the same nutrient is not sent twice. The review form offers only nutrients from `GET /elements?type=nutrient`. The user cannot type a new nutrient name.

**Alternatives considered**: Accept any element id and let the database foreign key fail. Rejected because a whole food or recipe id would become a child with a nutrient-style ratio. Summing duplicate rows. Rejected in favor of a 400 so the form shows one row per nutrient.
