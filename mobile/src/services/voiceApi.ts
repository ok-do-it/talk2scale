import { buildApiUrl } from '../config/api';

const TRANSCRIBE_TIMEOUT_MS = 15000;

export type VoiceFood = {
	foodNameId: number;
	elementId: number;
	elementName: string;
	name: string;
	distance: number;
	aliasCount: number;
};

type TranscribeResponse = {
	text: string;
	food: VoiceFood;
};

export async function transcribeFoodAudio(uri: string): Promise<VoiceFood> {
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
				const body = (await res.json()) as { error?: string };
				if (body.error) detail = body.error;
			} catch {
				// ignore
			}
			throw new Error(detail);
		}

		const data = (await res.json()) as TranscribeResponse;
		return data.food;
	} finally {
		clearTimeout(timeout);
	}
}
