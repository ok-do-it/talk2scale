import { mkdir, writeFile } from 'node:fs/promises';
import express from 'express';
import multer from 'multer';
import { parseSpokenGrams } from '../service/spokenGrams.js';
import {
	detectAudioFormat,
	type VoiceService,
} from '../service/voiceService.js';

const voiceSamplesDir = new URL('../../voice_samples/', import.meta.url);

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024 },
});

type TranscribeResponse = {
	text: string;
	grams: number | null;
};

function resolveVoiceSampleExtension(audio: Buffer): string {
	try {
		return detectAudioFormat(audio);
	} catch {
		return 'bin';
	}
}

export function createVoiceRoutes(voiceService: VoiceService): express.Router {
	const router = express.Router();

	router.post('/voice/transcribe', upload.single('audio'), async (req, res) => {
		if (!req.file?.buffer?.length) {
			res.status(400).json({ error: 'missing audio file' });
			return;
		}
		try {
			await mkdir(voiceSamplesDir, { recursive: true });
			const extension = resolveVoiceSampleExtension(req.file.buffer);
			await writeFile(
				new URL(`./${Date.now().toString()}.${extension}`, voiceSamplesDir),
				req.file.buffer,
			);

			const transcript = await voiceService.foodNameToText(req.file.buffer);
			if (!transcript) {
				res.status(404).json({ error: 'voice_not_recognized' });
				return;
			}

			const parsed = parseSpokenGrams(transcript);
			const response: TranscribeResponse = {
				text: parsed.foodName,
				grams: parsed.grams,
			};
			res.json(response);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'transcription failed';
			res.status(500).json({ error: message });
		}
	});

	return router;
}
