import type { LlmClient, LlmCompleteInput } from './llmClient.js';
import { LlmProviderError } from './llmErrors.js';

const REQUEST_TIMEOUT_MS = 60_000;
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 4096;

type AnthropicContentBlock = { type: string; text?: string };

type AnthropicMessagesResponse = {
	content?: AnthropicContentBlock[];
};

export function createAnthropicClient(opts: {
	apiKey: string;
	model: string;
}): LlmClient {
	return {
		async complete(input: LlmCompleteInput): Promise<string> {
			const userContent: unknown[] = [];
			if (input.image) {
				userContent.push({
					type: 'image',
					source: {
						type: 'base64',
						media_type: input.image.mimeType,
						data: input.image.data.toString('base64'),
					},
				});
			}
			userContent.push({ type: 'text', text: input.user });

			let response: Response;
			try {
				response = await fetch('https://api.anthropic.com/v1/messages', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						'x-api-key': opts.apiKey,
						'anthropic-version': ANTHROPIC_VERSION,
					},
					body: JSON.stringify({
						model: opts.model,
						max_tokens: MAX_TOKENS,
						system: input.system,
						messages: [{ role: 'user', content: userContent }],
					}),
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				});
			} catch (err) {
				throw new LlmProviderError(
					`anthropic request failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			}

			if (!response.ok) {
				const body = await response.text();
				throw new LlmProviderError(
					`anthropic HTTP ${response.status}: ${body.slice(0, 500)}`,
				);
			}

			const payload = (await response.json()) as AnthropicMessagesResponse;
			const text = payload.content
				?.filter((block) => block.type === 'text' && block.text)
				.map((block) => block.text)
				.join('\n')
				.trim();
			if (!text) {
				throw new LlmProviderError('anthropic returned empty content');
			}
			return text;
		},
	};
}
