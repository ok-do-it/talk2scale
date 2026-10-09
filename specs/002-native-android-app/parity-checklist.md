# Parity Checklist: Native Android App

Walk this on the phone with the native app (FR-020, SC-001). Every item must pass before the legacy React Native app (`mobile-rn/`) and `android-legacy/` are removed. Each item is a feature from `mobile-rn/src`; it must be present and working, not identical (FR-001a). Record intended differences in the last section.

## Scale connection

- [ ] Bluetooth permissions are requested; denying them leaves mock mode usable
- [ ] Scan lists only the scale (service UUID or name `TalkToScale`)
- [ ] Picking the scale connects and shows live weight
- [ ] App start with a stored scale reconnects without a scan
- [ ] Failed reconnect on start falls back to mock mode
- [ ] Stable indicator shows after 3 equal readings
- [ ] Tare zeroes the scale (connected) or the mock (not connected)
- [ ] Calibration: Set Zero, then Set Calibration Weight with reference grams
- [ ] Settings icon when disconnected says the scale is not connected
- [ ] Disconnect returns to mock mode
- [ ] Forget All Devices stops auto-reconnect on next start
- [ ] Link loss shows disconnected and stops live weight

## Mock mode

- [ ] Debug build: long-press weight toggles mock mode
- [ ] Tap on weight adds a random mock weight

## Food entry

- [ ] Typing searches after a short pause and shows up to 6 hits with type
- [ ] Clear button empties the query
- [ ] Hold mic records, shows Listening, release sends; auto-stops at 10 s
- [ ] Transcribed text fills the query and searches right away
- [ ] Spoken grams override the scale weight
- [ ] After a voice search, the first hit is picked after a 3 s countdown unless the user acts
- [ ] Empty or failed transcription shows the repeat message
- [ ] Picking a hit with no weight shows "No weight reading yet"
- [ ] After a new log, the scale is tared
- [ ] 20 recordings in a row succeed (SC-002)

## Dashboard

- [ ] Header shows user name or `#id`
- [ ] User ID dialog changes the user and reloads; the choice survives restart
- [ ] Nutrition page shows today's totals against targets
- [ ] Nutrition load failure keeps last totals and shows an error
- [ ] Carousel swipes and page dots switch pages; footer button switches pages
- [ ] Today's food lists newest first with 30-minute cluster headers and kcal
- [ ] Tap a log opens edit mode on the Scale page; picking a food updates it
- [ ] Back leaves edit mode
- [ ] Swipe right on a log asks to delete, then removes it
- [ ] Dashboard refreshes after create, edit, delete, and on return from other screens

## Create Recipe

- [ ] Opens from the Home menu
- [ ] Name required, serving grams optional and positive
- [ ] Ingredients added with the food entry panel, shown with grams, removable
- [ ] Total grams shown
- [ ] Save sends one request; errors show the backend message
- [ ] Back with ingredients asks to discard

## Success criteria

- [ ] SC-003: live weight within 5 s of opening with a stored scale
- [ ] SC-004: 10 reference weights match the scale's reading
- [ ] SC-005: small UI change reaches the phone in under 30 s
- [ ] SC-006: peak dev build memory lower than the React Native setup

## Intended differences from the React Native app

- _None yet._
