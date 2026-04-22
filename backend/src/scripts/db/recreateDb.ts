import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { closeDatabaseConnection, db } from '../../db/client.js';

const LOCAL_POSTGRES_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function assertLocalTarget(): void {
  const host = (env.postgresHost ?? '').trim().toLowerCase();
  if (!host) {
    throw new Error('POSTGRES_HOST is not set');
  }

  if (!LOCAL_POSTGRES_HOSTS.has(host)) {
    throw new Error(
      `Refusing to recreate DB for non-local POSTGRES_HOST "${env.postgresHost}". Allowed: localhost, 127.0.0.1, ::1`
    );
  }
}

function resolveInitDir(): string {
  const scriptFilePath = fileURLToPath(import.meta.url);
  const scriptDir = path.dirname(scriptFilePath);
  return path.resolve(scriptDir, '../../../../db/init');
}

async function loadSqlFiles(initDir: string): Promise<string[]> {
  const entries = await readdir(initDir, { withFileTypes: true });
  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => path.join(initDir, entry.name))
    .sort((left, right) => left.localeCompare(right));

  if (sqlFiles.length === 0) {
    throw new Error(`No SQL files found in ${initDir}`);
  }

  return sqlFiles;
}

async function applySqlFile(sqlFilePath: string): Promise<void> {
  const sqlContents = await readFile(sqlFilePath, 'utf8');
  logger.info({ sqlFilePath }, 'Applying SQL file');
  await sql.raw(sqlContents).execute(db);
}

export async function recreateDatabase(): Promise<void> {
  assertLocalTarget();
  const initDir = resolveInitDir();
  const sqlFiles = await loadSqlFiles(initDir);
  logger.info({ initDir, sqlFiles }, 'Starting DB recreation');

  logger.info('Dropping and recreating public schema');
  await sql.raw('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;').execute(db);

  for (const sqlFilePath of sqlFiles) {
    await applySqlFile(sqlFilePath);
  }

  logger.info('DB recreation completed');
}

function isDirectExecution(): boolean {
  const entryScript = process.argv[1];
  if (!entryScript) {
    return false;
  }

  return path.resolve(entryScript) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  try {
    await recreateDatabase();
  } catch (error) {
    logger.error({ err: error }, 'DB recreation failed');
    process.exitCode = 1;
  } finally {
    await closeDatabaseConnection();
  }
}
