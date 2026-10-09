# Agent notes — Talk to Scale

Use this for **project context**. Prefer the linked docs before inventing architecture.

## Primary references

| Doc | Path |
|-----|------|
| Product overview, modules, flows, BLE sketch, RDBMS data model | [README.md](README.md) |
| Hardware schematics, wiring, BOM (placeholders and conventions) | [docs/hardware/README.md](docs/hardware/README.md) |
| Mobile BLE design (protocol and the legacy React Native app in `mobile-rn/`; active client is `android/`) | [docs/mobile-app/design.md](docs/mobile-app/design.md) |
| Backend API endpoint reference (request/response shapes, error codes) | [docs/backend/endpoints.md](docs/backend/endpoints.md) |
| USDA import, name suppression, dedupe, curated merges/aliases | [docs/db/import-usda.md](docs/db/import-usda.md) |
| Food search ranking design (hybrid lexical + embedding) | [docs/backend/food_item_search_improvements.md](docs/backend/food_item_search_improvements.md) |
| Open decisions and scratch tasks | [docs/todo.txt](docs/todo.txt) |


## Database access for data analysis

Run arbitrary SQL and get results as JSON:

```bash
cd backend && npm run query -- "SELECT id, name FROM food_name LIMIT 5"
```

The command prints a JSON array of rows to stdout. On failure, it writes the error to stderr and exits with code 1.

**Note:**
- Use subagent if anticipated output is bulky.
- Add sql limit if no other constraints
- Don't make assumptions about schema, read `db/migrations/002_schema.sql` first


# Constraints
- NEVER commit, let use review first

# Coding guidelines

## Backend app
- run `cd backend && npm run typecheck && npm run check` before finishing backend changes

## Mobile app
- Active app is the native Android project in `android/`
- React Native app in `mobile-rn/` is legacy
- hard-code captions in the UI file that renders them