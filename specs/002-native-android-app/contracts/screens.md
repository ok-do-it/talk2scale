# Contract: Screens and navigation

Features on each screen are binding. Layout, wording, and error handling may improve on the React Native app (FR-001a). Captions are string literals in the composable that renders them (Principle IV).

## Navigation

| Route | React Native screen | Entry |
|-------|---------------------|-------|
| `home` | `HomeScreen` | Start destination |
| `connection` | `ConnectionScreen` | Bluetooth icon in the Home header |
| `createRecipe` | `CreateRecipeScreen` | Home menu → Create Recipe |

## Home

- **Header**: user icon opens the User ID dialog (number input, Cancel, OK); the label next to it shows the user name, or `#<id>` if unknown. Bluetooth icon opens Connection, starting a connect attempt when not connected. Settings icon opens Calibration, or says "Scale not connected". Menu icon offers Create Recipe.
- **Carousel, page 1 Nutrition**: "Today" totals against daily targets. Refreshes when the page is shown.
- **Carousel, page 2 Scale**: the shared food entry panel (below). Page dots switch pages.
- **Today's food**: grouped list (see [data-model.md](../data-model.md)). Tap to edit, swipe right to delete with confirmation.
- **Footer**: "Add Food From Scale" on the Nutrition page, "Back" on the Scale page (also leaves edit mode).
- **Refresh**: on open, on return from another screen, on user change, after each create, edit, or delete.

## Food entry panel (Home Scale page and Create Recipe)

- Live weight with a stable indicator, and a Tare button.
- Long-press the weight in debug builds to toggle mock mode; in mock mode a tap on the weight adds a random weight.
- Search field ("Food name") with clear button, results dropdown (up to 6, showing name and type), "Searching..." while loading.
- Hold the mic ("Hold to speak" / "Release to send") to record, release to send. Shows "Listening..." over the field. Empty or failed transcription shows "Food not found. Please hold the mic and repeat."
- After a voice search, the first hit is picked after a 3 s countdown bar unless the user picks or edits.
- Picking a food with no weight shows "No weight reading yet". After a successful new log, the scale is tared.

## Calibration dialog

"Set Zero" sends Tare. "Set Calibration Weight" takes reference grams and sends Calibrate. When disconnected, shows "Scale not connected".

## Connection

Requests Bluetooth permissions. When opened with a connect request, reconnects to the stored device if there is one, otherwise scans and lists discovered scales to pick. Buttons: Connect, Disconnect, Forget All Devices.

## Create Recipe

Recipe name, optional serving grams, the food entry panel for ingredients, list of ingredients with grams and a delete button, total grams, Save and Back. Validation and discard prompts as in [data-model.md](../data-model.md).
