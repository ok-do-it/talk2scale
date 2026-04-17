# Local DB (PostgreSQL + pgvector)

This directory contains local database infrastructure for Talk2Scale.

## Prerequisites

- Docker Desktop / Docker Engine
- Docker Compose v2
- OrbStack on macOS is supported (uses the same commands)

## Setup

From the repository root, create a local env file once:

```bash
cp .env.example .env
```

Then review `.env` and adjust credentials/port as needed.

## Start

```bash
cd db
docker compose up -d
```

## Stop

```bash
cd db
docker compose stop
```

## Remove Container/Network (Keep Data)

```bash
cd db
docker compose down
```

## Full Reset (Delete Data Volume)

```bash
cd db
docker compose down -v
docker compose up -d
```

`down -v` removes all DB data and reruns `init/*.sql` on next start.

## Recreate Schema From SQL Init

If Postgres is already running and you want to reset schema objects without recreating the Docker volume:

```bash
cd backend
npm run recreate-db
```

This command:
- applies `db/init/*.sql` in filename order
- drops existing schema objects via `db/init/002_schema.sql`
- recreates all tables, types, and indexes

Safety guard:
- the script only runs when `POSTGRES_HOST` is local (`localhost`, `127.0.0.1`, or `::1`)
- if host is non-local, the command exits with an error

## Verify Extensions

```bash
cd db
docker compose exec postgres bash -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dx"'
```

Expected extensions include:
- `vector`
- `pg_trgm`

## Notes

- DB data persists in named volume `talk2scale_postgres_data`.
- Compose loads variables from repository root `.env`.
- Configuration is local-only by default (no internet exposure settings).
