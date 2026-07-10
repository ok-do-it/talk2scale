# Agent notes — Talk to Scale

Use this for **project context**. Prefer the linked docs before inventing architecture.

## Primary references

| Doc | Path |
|-----|------|
| Product overview, modules, flows, BLE sketch, RDBMS data model | [README.md](README.md) |
| Hardware schematics, wiring, BOM (placeholders and conventions) | [docs/hardware/README.md](docs/hardware/README.md) |
| Mobile app BLE design (React Native transport, permissions, GATT flow, UUIDs) | [docs/mobile-app/design.md](docs/mobile-app/design.md) |
| Backend API endpoint reference (request/response shapes, error codes) | [docs/backend/endpoints.md](docs/backend/endpoints.md) |
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
- React Native app lives in `mobile/`
- hard-code captions in component files for now