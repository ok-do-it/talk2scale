import { createAnthropicClient } from './anthropicClient.js';
import type { LlmClient } from './llmClient.js';
import { createOllamaClient } from './ollamaClient.js';

export type LlmClientConfig = {
	provider: 'ollama' | 'anthropic';
	anthropicApiKey: string;
	anthropicModel: string;
	ollamaHost: string;
	ollamaModel: string;
};

export function createLlmClient(config: LlmClientConfig): LlmClient {
	if (config.provider === 'anthropic') {
		if (!config.anthropicApiKey) {
			throw new Error(
				'ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic',
			);
		}
		return createAnthropicClient({
			apiKey: config.anthropicApiKey,
			model: config.anthropicModel,
		});
	}

	return createOllamaClient({
		host: config.ollamaHost,
		model: config.ollamaModel,
	});
}
