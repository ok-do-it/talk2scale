# Agent notes — Talk to Scale

Use this for **project context**. Prefer the linked docs before inventing architecture.

## Primary references

| Doc | Path |
|-----|------|
| Product overview, modules, flows, BLE sketch, RDBMS data model | [README.md](README.md) |
| Hardware schematics, wiring, BOM (placeholders and conventions) | [docs/hardware/README.md](docs/hardware/README.md) |
| Mobile app BLE design (Android stack, permissions, GATT flow, UUIDs) | [docs/mobile-app/design.md](docs/mobile-app/design.md) |
| Open decisions and scratch tasks | [docs/todo.txt](docs/todo.txt) |


## Database access for data analysis

Run arbitrary SQL and get results as JSON:

```bash
cd backend && npm run query -- "SELECT id, name FROM food LIMIT 5"
```

The command prints a JSON array of rows to stdout. On failure, it writes the error to stderr and exits with code 1.

**Note:**
- Use subagent if anticipated output is bulky.
- Add sql limit if no other constraints
- Don't make assumptions about schema, read `db/migrations/002_schema.sql` first


# Coding guidelines

## Android app
- use MaterialButton when need to show icon and text caption
- don't use strings.xml hard code all captions