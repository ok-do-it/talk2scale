import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool, types as pgTypes } from 'pg';
import { env } from '../config/env.js';
import type { Database } from './types.js';

const INT8_OID = 20;

pgTypes.setTypeParser(INT8_OID, (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Received int8 outside JS safe integer range: ${value}`);
  }
  return parsed;
});

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
