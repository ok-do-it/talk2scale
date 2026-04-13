import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep compatibility with both run locations:
// - repo root (loads .env via default lookup)
// - backend/ directory (explicitly load ../.env)
dotenv.config();

const configDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(configDir, '..', '..');
const repoRootEnvPath = path.resolve(backendDir, '..', '.env');

dotenv.config({ path: repoRootEnvPath });

const parsedPort = Number(process.env.PORT);

export const env = {
  port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 8888,
  searchPrefix: 'Represent this sentence for searching relevant passages: ',
};
