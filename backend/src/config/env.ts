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

function parseLlmProvider(raw: string | undefined): 'ollama' | 'anthropic' {
	const value = (raw ?? 'ollama').trim().toLowerCase();
	if (value === 'ollama' || value === 'anthropic') {
		return value;
	}
	throw new Error(`LLM_PROVIDER must be ollama or anthropic, got: ${raw}`);
}

export type LlmProvider = 'ollama' | 'anthropic';

export const env = {
	port: parsedPort,
	postgresDb,
	postgresUser,
	postgresPassword,
	postgresHost,
	postgresPort: parsedPostgresPort,
	searchPrefix: 'Represent this sentence for searching relevant passages: ',
	llm: {
		provider: parseLlmProvider(process.env.LLM_PROVIDER),
		anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() ?? '',
		anthropicModel:
			process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-haiku-20241022',
		ollamaHost: process.env.OLLAMA_HOST?.trim() || 'http://127.0.0.1:11434',
		ollamaModel: process.env.OLLAMA_MODEL?.trim() || 'llama3.2-vision',
	},
};
