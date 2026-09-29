# Feature Specification: Add a Food from a Nutrition Table Photo

**Feature Branch**: `001-add-user-food`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "Add a way for a user to add their own food item. They photograph a nutrition-facts label with the camera, then review a form before anything is saved. On that form they can edit the food name and the nutrient table read from the image. Submit saves the food only after they confirm. Do not log it as a meal yet. Do not build recipes."

## Clarifications

### Session 2026-09-28

- Q: What is this feature, and what is the button called? → A: This feature is adding a food by picturing a nutrition table. The button label is "Add Nutrition". Adding a food from an image in some other way is a later feature and is out of scope.
- Q: When this nutrition-table food is saved, which kind of food should it be? → A: A user-owned branded food, a packaged product from the label. It is not a generic whole food, not a recipe, and not a new food kind.
- Q: How is the serving size from the nutrition-facts label saved? → A: Save one measure named "serving" whose element is the new food and whose grams are the confirmed serving size.
- Q: How is each nutrition fact saved? → A: Save one link from the new food to that nutrient. The link ratio is the nutrient's grams in the serving divided by the serving size in grams.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save a personal food after reviewing a label photo (Priority: P1)

The current user wants a packaged food that is not already theirs to become a food they own. They tap "Add Nutrition", photograph the nutrition-facts label, check the draft on a review form, correct the name and the nutrient amounts, and confirm. Only then is the food saved, with a serving measure and one nutrient link per confirmed fact. It is not added to today's meals, and it is not a recipe.

**Why this priority**: This is the whole reason for the feature. Without a confirmed save of a personal food, the photo and the form deliver nothing the user can keep.

**Independent Test**: Photograph a readable nutrition-facts label, change the name and at least one nutrient amount, confirm, and verify that one personal food exists for that user, it has a "serving" measure and one nutrient link per saved fact, today's meal list is unchanged, and no recipe was created.

**Acceptance Scenarios**:

1. **Given** the current user on the food-logging screen, **When** they tap "Add Nutrition", **Then** the camera opens so they can photograph a nutrition-facts label.
2. **Given** a readable nutrition-facts photo, **When** reading finishes, **Then** a review form appears and no food has been saved yet.
3. **Given** the review form, **When** the user changes the food name, the serving size, and one or more nutrient amounts and then confirms, **Then** the saved food uses those edited values.
4. **Given** the user confirms a valid review form, **When** the save succeeds, **Then** the food belongs only to that user, it has one measure named "serving" for the confirmed serving size, it has one nutrient link per confirmed fact, today's meals are unchanged, and no recipe exists for that food.
5. **Given** a successful save, **When** the user looks at the shared food catalog, **Then** the new food is not listed there.

---

### User Story 2 - Leave without saving (Priority: P2)

A user may open the camera or the review form and then change their mind. Nothing should be stored unless they confirm.

**Why this priority**: The user must be able to trust that looking at a draft is not the same as adding a food or a meal.

**Independent Test**: Start the flow, reach the review form, leave without confirming, and verify that no personal food and no meal entry were created.

**Acceptance Scenarios**:

1. **Given** a review form filled from a photo, **When** the user leaves without confirming, **Then** no personal food is saved and no meal entry is created.
2. **Given** the camera is open and no photo has been accepted, **When** the user leaves, **Then** no personal food is saved and no meal entry is created.
3. **Given** a review form, **When** the user photographs the label again, **Then** the serving size and nutrient table are replaced by the new reading, the name they already typed stays, and nothing is saved until they confirm.

---

### User Story 3 - Recover when the label cannot be read (Priority: P3)

A photo may be blurry, not a nutrition-facts label, or contain no nutrient the product recognizes. The user needs a clear failure and another chance to photograph, without a food being saved.

**Why this priority**: A failed reading is common, and it must not create an empty or guessed food.

**Independent Test**: Submit a photo that cannot be turned into at least one recognized nutrient and verify that the user can try another photo and that nothing was saved.

**Acceptance Scenarios**:

1. **Given** a photo that cannot be read as a nutrition-facts label, **When** reading fails, **Then** the user is told the label could not be read, nothing is saved, and they can photograph again.
2. **Given** a photo that reads but matches no recognized nutrient, **When** reading finishes, **Then** the same failure is shown, nothing is saved, and they can photograph again.
3. **Given** the device camera cannot be used, **When** the user starts the flow, **Then** they are told the camera is unavailable and nothing is saved.

---

### Edge Cases

- The user confirms with an empty food name. Save stays unavailable until the name has visible text.
- The user removes every nutrient row, or leaves only amounts that are zero or blank. Save stays unavailable until at least one nutrient has an amount greater than zero.
- The serving size is cleared or set to zero. Save stays unavailable until the serving size is greater than zero.
- The user enters a name they already used for another personal food. Save still succeeds; the foods stay separate.
- Reading the photo or saving the food cannot be completed. Nothing is saved, and the user can retry. A failed save keeps the review form as they left it.
- The label lists energy (calories) or a unit that is not a mass. Those values are not added to the nutrient table.
- The label's serving is not in grams. The review form still shows one serving size in grams, which the user can correct.
- The user adds a nutrient row for a nutrient the product does not recognize. That row cannot be saved; only recognized nutrients are allowed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST show a control labeled exactly "Add Nutrition" on the food-logging experience. Choosing it starts this feature. It MUST stay separate from logging a meal, from creating a recipe, and from any later way of adding a food from an image.
- **FR-002**: The system MUST photograph a nutrition-facts label with the device camera. Choosing an existing picture from the photo library is out of scope.
- **FR-003**: The system MUST turn a successful photo into a draft serving size, in grams, and a draft nutrient table. Each row is one recognized nutrient and the mass of that nutrient in the serving, in grams.
- **FR-004**: The system MUST NOT take the food name from the photo. The review form MUST start with an empty name that the user can type and edit.
- **FR-005**: The system MUST show the review form before anything is saved. Opening the form, editing it, or photographing again MUST NOT create a food, a meal entry, or a recipe.
- **FR-006**: On the review form, the user MUST be able to edit the food name, the serving size, and each nutrient amount.
- **FR-007**: On the review form, the user MUST be able to remove a nutrient row and add a row only for a nutrient the product already recognizes.
- **FR-008**: The user MUST be able to confirm only when the name has visible text, the serving size is greater than zero, and at least one nutrient row has an amount greater than zero. Otherwise confirm stays unavailable.
- **FR-009**: Confirm MUST save one user-owned branded food for the current user, using the name, serving size, and nutrient rows on the form at that moment. It MUST NOT be saved as a generic whole food, a recipe, or a new food kind.
- **FR-010**: The saved food MUST belong only to the user who confirmed it. The system MUST NOT add it to the shared food catalog, merge it into that catalog, or make it visible to other users.
- **FR-011**: Confirm MUST NOT create a meal entry and MUST NOT create a recipe.
- **FR-012**: After a successful save, the user MUST see that the food was saved. The flow MUST end without opening meal logging or recipe creation.
- **FR-013**: If the user leaves before confirming, the system MUST discard the draft photo and the draft form. No food, meal entry, or recipe is created.
- **FR-014**: If the user photographs again from the review form, the system MUST replace the serving size and nutrient table with the new reading and MUST keep the name already entered. Nothing is saved by the new photo.
- **FR-015**: If the photo cannot be read, matches no recognized nutrient, or the camera cannot be used, the system MUST explain the problem, save nothing, and let the user try again when a camera photo is possible.
- **FR-016**: If saving fails, the system MUST leave the review form unchanged, save nothing, and let the user confirm again.
- **FR-017**: The system MUST NOT keep the label photo after the user saves or leaves. Only the confirmed name, serving size, and nutrient rows are stored.
- **FR-018**: The review form MUST keep showing nutrient masses for the confirmed serving. The saved link ratio is only the serving mass divided into those masses, so one serving reproduces the confirmed amounts. Daily-value percents are not saved.
- **FR-019**: Confirm MUST save one measure named "serving" for that food. Its grams MUST equal the confirmed serving size, and it MUST reference only that new food. It MUST belong to the current user, not to every user.
- **FR-020**: Confirm MUST save one link from the new food to each confirmed nutrient. The link ratio MUST equal that nutrient's grams in the serving divided by the serving size in grams. Example: 10 g of protein in a 40 g serving is ratio 0.25, and one serving then yields 10 g of protein.
- **FR-021**: The system MUST NOT save a nutrient fact that is not a confirmed row, and MUST NOT use a recipe-style share of the nutrient rows as the ratio.

### Key Entities

- **Personal food**: A branded food owned by one user, created only by this nutrition-table flow. It has a name, one serving measure, and one or more nutrient links. It is not a generic whole food, not a meal entry, not a recipe, and not part of the shared food catalog.
- **Serving measure**: The saved record named "serving". It stores the confirmed serving size in grams and references the new food. It belongs to the user who confirmed the food.
- **Nutrient link**: The saved connection from the new food to one recognized nutrient. Its ratio is the nutrient's grams in the serving divided by the serving size in grams.
- **Label draft**: The unsaved review state produced from one camera photo: an editable name, a serving size, and nutrient rows. It exists only until the user confirms or leaves.
- **Nutrient row**: A recognized nutrient and the mass of that nutrient, in grams, in the serving. Rows the product cannot recognize are not part of the draft or the saved food.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with a readable nutrition-facts label can photograph it, correct the review form, and see a saved personal food in under 2 minutes.
- **SC-002**: In 100% of sessions abandoned before confirm, no personal food, meal entry, or recipe remains afterward.
- **SC-003**: In 100% of successful confirms, today's meal list is unchanged, no recipe is created, and the saved food has one "serving" measure plus one nutrient link per confirmed fact, with each link reproducing that fact's amount for one serving.
- **SC-004**: In 100% of successful confirms, the saved food is visible only to the user who saved it and does not appear in the shared food catalog.
- **SC-005**: In 100% of unreadable photos, or photos with no recognized nutrient, the user gets a clear retry and zero saved foods.
- **SC-006**: At least 90% of users who reach a review form from a readable label can correct the name and nutrient amounts and confirm on the first attempt, without starting over.

## Assumptions

- The person adding the food is the user already selected in the app. This feature does not add a new sign-in step.
- The food name is typed on the review form. The existing nutrition-label reading returns a serving size and nutrient masses only; it does not return a product name, and this feature does not add name reading.
- That same existing reading is the only way a photo becomes a serving size and nutrient table. This feature does not add a second way to interpret a label.
- Energy values such as calories are omitted, matching what that reading already skips. A food can be saved without calories.
- Serving size and nutrient amounts are in grams. A label that uses another household measure is converted to grams before the form is shown, and the user can edit that number.
- Nutrient rows can only refer to nutrients the product already recognizes. The user cannot invent a new nutrient name.
- Two personal foods may share the same name. Saving does not warn or merge them.
- The label photo is used only to fill the draft. It is not stored on the saved food.
- The entry control is labeled exactly "Add Nutrition" and is available from the main food-logging screen. It is distinct from adding a meal, from creating a recipe, and from a later feature that adds a food from an image in another way.
- The serving measure is named "serving" and is owned by the current user. Its size is the confirmed serving, in grams.
- Each saved nutrient link uses ratio = nutrient grams in the serving / serving grams. That matches nutrient amount = ratio × food mass. It is not a share of the nutrient rows.
- Using the saved food in a later meal, editing it after save, deleting it, barcode scan, photo-library import, adding a food from a non-label image, and recipes are out of scope.
