import express from 'express';
import multer from 'multer';
import type {
	EmbeddingService,
	FoodNameSearchHit,
} from '../service/embeddingService.js';
import type { VoiceService } from '../service/voiceService.js';

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024 },
});

type VoiceFoodResponse = {
	text: string;
	food: FoodNameSearchHit;
};

export function createVoiceRoutes(
	voiceService: VoiceService,
	embeddingService: EmbeddingService,
): express.Router {
	const router = express.Router();

	router.post('/voice/transcribe', upload.single('audio'), async (req, res) => {
		if (!req.file?.buffer?.length) {
			res.status(400).json({ error: 'missing audio file' });
			return;
		}
		try {
			const text = await voiceService.foodNameToText(req.file.buffer);
			if (!text) {
				res.status(404).json({ error: 'voice_not_recognized' });
				return;
			}

			const result = await embeddingService.searchFoodName(text);
			const [food] = result;
			if (!food) {
				res.status(404).json({ error: 'food_not_found', text, hits: result });
				return;
			}

			const response: VoiceFoodResponse = {
				text,
				food,
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
