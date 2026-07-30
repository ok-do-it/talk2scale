import { buildApiUrl } from '../config/api';

const TRANSCRIBE_TIMEOUT_MS = 15000;

export type TranscribeResult = {
	text: string;
	grams: number | null;
};

type TranscribeResponse = {
	text: string;
	grams?: number | null;
};

type TranscribeErrorResponse = {
	error?: string;
	text?: string;
	grams?: number | null;
};

export async function transcribeFoodAudio(
	uri: string,
): Promise<TranscribeResult> {
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, TRANSCRIBE_TIMEOUT_MS);
	const form = new FormData();
	form.append('audio', {
		uri,
		name: 'recording.m4a',
		type: 'audio/mp4',
	} as unknown as Blob);

	try {
		const res = await fetch(buildApiUrl('/voice/transcribe'), {
			method: 'POST',
			body: form,
			signal: controller.signal,
		});

		if (!res.ok) {
			let detail = `HTTP ${res.status}`;
			try {
				const body = (await res.json()) as TranscribeErrorResponse;
				if (body.text?.trim()) {
					return {
						text: body.text,
						grams: body.grams ?? null,
					};
				}
				if (body.error) detail = body.error;
			} catch {
				// ignore
			}
			throw new Error(detail);
		}

		const data = (await res.json()) as TranscribeResponse;
		return {
			text: data.text,
			grams: data.grams ?? null,
		};
	} finally {
		clearTimeout(timeout);
	}
}
