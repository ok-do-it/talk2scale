# Agent notes — Talk to Scale

Use this for **project context**. Prefer the linked docs before inventing architecture.

## Primary references

| Doc | Path |
|-----|------|
| Product overview, modules, flows, BLE sketch, RDBMS data model | [README.md](README.md) |
| Hardware schematics, wiring, BOM (placeholders and conventions) | [docs/hardware/README.md](docs/hardware/README.md) |
| Mobile app BLE design (Android stack, permissions, GATT flow, UUIDs) | [docs/mobile-app/design.md](docs/mobile-app/design.md) |
| Open decisions and scratch tasks | [docs/todo.txt](docs/todo.txt) |


# Coding guidelines

## Android app
- use MaterialButton when need to show icon and text caption
- don't use strings.xml hard code all captions