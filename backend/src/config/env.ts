import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Keep compatibility with both run locations:
// - repo root (loads .env via default lookup)
// - backend/ directory (explicitly load ../.env)
dotenv.config();

const configDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(configDir, '..', '..');
const repoRootEnvPath = path.resolve(backendDir, '..', '.env');

dotenv.config({ path: repoRootEnvPath });

const parsedPort = Number(process.env.PORT);
const postgresDb = process.env.POSTGRES_DB?.trim();
const postgresUser = process.env.POSTGRES_USER?.trim();
const postgresPassword = process.env.POSTGRES_PASSWORD?.trim();
const postgresHost = process.env.POSTGRES_HOST?.trim();
const parsedPostgresPort = Number(process.env.POSTGRES_PORT);

export const env = {
	port: parsedPort,
	postgresDb,
	postgresUser,
	postgresPassword,
	postgresHost,
	postgresPort: parsedPostgresPort,
	searchPrefix: 'Represent this sentence for searching relevant passages: ',
};
