import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

function assertRequiredEnv(): void {
  if (!env.postgresHost || !Number.isFinite(env.postgresPort) || !env.postgresDb || !env.postgresUser) {
    throw new Error(
      'Missing DB connection env. Required: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER.'
    );
  }
}

function buildDatabaseUrl(): string {
  const url = new URL(`postgresql://${env.postgresHost}:${env.postgresPort}/${env.postgresDb}`);
  url.username = env.postgresUser as string;
  url.password = env.postgresPassword ?? '';
  return url.toString();
}

async function runCodegen(databaseUrl: string): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const backendDir = path.resolve(scriptDir, '../..');
  const codegenBin = path.resolve(backendDir, 'node_modules/.bin/kysely-codegen');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      codegenBin,
      [
        '--dialect',
        'postgres',
        '--url',
        databaseUrl,
        '--out-file',
        'src/db/types.generated.ts',
        '--type-mapping',
        '{"int8":"number"}',
      ],
      {
        cwd: backendDir,
        stdio: 'inherit',
      }
    );

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`kysely-codegen exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function main(): Promise<void> {
  assertRequiredEnv();
  const databaseUrl = buildDatabaseUrl();
  await runCodegen(databaseUrl);
}

await main();
