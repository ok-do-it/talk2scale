import type { LlmClient, LlmCompleteInput } from './llmClient.js';
import { LlmProviderError } from './llmErrors.js';

const REQUEST_TIMEOUT_MS = 60_000;

type OllamaChatResponse = {
	message?: { content?: string };
};

export function createOllamaClient(opts: {
	host: string;
	model: string;
}): LlmClient {
	const baseUrl = opts.host.replace(/\/$/, '');

	return {
		async complete(input: LlmCompleteInput): Promise<string> {
			const messages: Array<{
				role: string;
				content: string;
				images?: string[];
			}> = [
				{ role: 'system', content: input.system },
				{
					role: 'user',
					content: input.user,
					...(input.image
						? { images: [input.image.data.toString('base64')] }
						: {}),
				},
			];

			let response: Response;
			try {
				response = await fetch(`${baseUrl}/api/chat`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						model: opts.model,
						stream: false,
						format: 'json',
						messages,
					}),
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				});
			} catch (err) {
				throw new LlmProviderError(
					`ollama request failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			}

			if (!response.ok) {
				const body = await response.text();
				throw new LlmProviderError(
					`ollama HTTP ${response.status}: ${body.slice(0, 500)}`,
				);
			}

			const payload = (await response.json()) as OllamaChatResponse;
			const text = payload.message?.content?.trim() ?? '';
			if (!text) {
				throw new LlmProviderError('ollama returned empty content');
			}
			return text;
		},
	};
}
