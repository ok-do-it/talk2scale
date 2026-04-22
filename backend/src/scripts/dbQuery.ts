import { sql } from 'kysely';
import { closeDatabaseConnection, db } from '../db/client.js';

function getQueryArg(): string {
  const query = process.argv[2]?.trim();
  if (!query) {
    throw new Error('Usage: npm run db-query -- "SELECT 1"');
  }
  return query;
}

async function main(): Promise<void> {
  const query = getQueryArg();
  const result = await sql.raw(query).execute(db);
  console.log(JSON.stringify(result.rows));
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
} finally {
  await closeDatabaseConnection();
}
