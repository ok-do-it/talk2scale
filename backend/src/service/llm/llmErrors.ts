export class LlmProviderError extends Error {
	override name = 'LlmProviderError';
}

export class LlmParseError extends Error {
	override name = 'LlmParseError';
}

export function isLlmProviderError(err: unknown): err is LlmProviderError {
	return err instanceof LlmProviderError;
}

export function isLlmParseError(err: unknown): err is LlmParseError {
	return err instanceof LlmParseError;
}
