import { mkdir, writeFile } from 'node:fs/promises';
import express from 'express';
import multer from 'multer';
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

			const text = await voiceService.foodNameToText(req.file.buffer);
			if (!text) {
				res.status(404).json({ error: 'voice_not_recognized' });
				return;
			}

			const response: TranscribeResponse = {
				text,
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
