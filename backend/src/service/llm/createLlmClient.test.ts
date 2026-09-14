import { describe, expect, it } from 'vitest';
import { createLlmClient } from './createLlmClient.js';

const baseConfig = {
	anthropicApiKey: '',
	anthropicModel: 'claude-3-5-haiku-20241022',
	ollamaHost: 'http://127.0.0.1:11434',
	ollamaModel: 'llama3.2-vision',
} as const;

describe('createLlmClient', () => {
	it('throws when anthropic is selected without an API key', () => {
		expect(() =>
			createLlmClient({ ...baseConfig, provider: 'anthropic' }),
		).toThrow(/ANTHROPIC_API_KEY/);
	});

	it('creates a client for ollama without an API key', () => {
		const client = createLlmClient({ ...baseConfig, provider: 'ollama' });
		expect(typeof client.complete).toBe('function');
	});
});
