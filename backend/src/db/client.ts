import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { env } from '../config/env.js';
import type { Database } from './types.js';

const pool = new Pool({
  host: env.postgresHost,
  port: env.postgresPort,
  database: env.postgresDb,
  user: env.postgresUser,
  password: env.postgresPassword,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export async function assertDatabaseConnection(): Promise<void> {
  await sql`select 1`.execute(db);
}

export async function closeDatabaseConnection(): Promise<void> {
  await db.destroy();
}
