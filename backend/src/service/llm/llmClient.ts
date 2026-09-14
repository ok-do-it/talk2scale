export type LlmImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export type LlmCompleteImage = {
	mimeType: LlmImageMimeType;
	data: Buffer;
};

export type LlmCompleteInput = {
	system: string;
	user: string;
	image?: LlmCompleteImage;
};

export type LlmClient = {
	complete: (input: LlmCompleteInput) => Promise<string>;
};
