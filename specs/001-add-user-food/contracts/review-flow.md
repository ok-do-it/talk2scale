# Contract: Review flow

The mobile screen is the only writer of the label draft. The server sees a photo only for parsing, and sees structured fields only on confirm.

## Entry

The food-logging menu shows a control labeled exactly `Add Nutrition`, next to Create Recipe. It opens the review screen. It does not open meal logging or recipe creation.

## Camera

The screen launches the device camera. It does not open the photo library. If the camera permission is denied or the camera cannot be used, the screen says so and stores nothing.

A taken photo is not kept after confirm or after the user leaves the screen.

## Parse

`POST /llm/nutrition-facts` with multipart field `image` (jpeg, png, or webp, max 10MB). Unchanged.

**Response** `200`

```json
{
  "serving_grams": 40,
  "nutrients": [
    { "element_id": 3, "name": "Protein", "grams": 10 }
  ]
}
```

The response has no food name. The form name stays whatever the user already typed, including empty on the first photo.

**Errors** `400` (unreadable, unsupported type, or no mapped nutrient) and `502` (parser unavailable). The screen explains the failure, stores nothing, and offers another photo.

## Review form

| Control | Behavior |
|---------|----------|
| Food name | Editable text, initially empty |
| Serving size | Editable grams, prefilled from `serving_grams` |
| Nutrient rows | Name shown, amount editable. Remove a row. Add a row only from `GET /elements?type=nutrient`. |
| Photograph again | Replaces serving size and rows from the new parse. Keeps the typed name. Does not save. |
| Confirm | Enabled only when the name is non-empty, serving size is greater than zero, and at least one nutrient amount is greater than zero. Calls `POST /user-foods`. |
| Leave | Discards the draft. No request except a parse that already finished. |

Confirm failure leaves the form as the user left it and does not navigate away.

Success shows that the food was saved, then returns to the food-logging screen. It does not open meal logging or recipe creation. Today's meal list is unchanged.

## Captions

Every user-visible string is a literal in the component that renders it, including the menu label `Add Nutrition`.
