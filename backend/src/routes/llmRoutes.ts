import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { LlmImageMimeType } from '../service/llm/llmClient.js';
import {
	isLlmParseError,
	isLlmProviderError,
} from '../service/llm/llmErrors.js';
import type { LlmService } from '../service/llmService.js';

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024 },
});

const dictationBodySchema = z.object({
	text: z.string().trim().min(1),
});

function detectImageMime(data: Buffer): LlmImageMimeType | null {
	if (
		data.length >= 3 &&
		data[0] === 0xff &&
		data[1] === 0xd8 &&
		data[2] === 0xff
	) {
		return 'image/jpeg';
	}
	if (
		data.length >= 8 &&
		data[0] === 0x89 &&
		data[1] === 0x50 &&
		data[2] === 0x4e &&
		data[3] === 0x47
	) {
		return 'image/png';
	}
	if (
		data.length >= 12 &&
		data.toString('ascii', 0, 4) === 'RIFF' &&
		data.toString('ascii', 8, 12) === 'WEBP'
	) {
		return 'image/webp';
	}
	return null;
}

function sendLlmError(res: express.Response, err: unknown): void {
	if (isLlmParseError(err)) {
		res.status(400).json({ error: err.message });
		return;
	}
	if (isLlmProviderError(err)) {
		res.status(502).json({ error: err.message });
		return;
	}
	const message = err instanceof Error ? err.message : 'llm request failed';
	res.status(500).json({ error: message });
}

export function createLlmRoutes(llmService: LlmService): express.Router {
	const router = express.Router();
	router.use(express.json());

	router.post(
		'/llm/nutrition-facts',
		upload.single('image'),
		async (req, res) => {
			if (!req.file?.buffer?.length) {
				res.status(400).json({ error: 'missing image file' });
				return;
			}
			const mimeType = detectImageMime(req.file.buffer);
			if (!mimeType) {
				res.status(400).json({
					error: 'unsupported image type: expected jpeg, png, or webp',
				});
				return;
			}
			try {
				const result = await llmService.parseNutritionFactsImage({
					mimeType,
					data: req.file.buffer,
				});
				res.json(result);
			} catch (err) {
				sendLlmError(res, err);
			}
		},
	);

	router.post('/llm/dictation', async (req, res) => {
		const body = dictationBodySchema.safeParse(req.body);
		if (!body.success) {
			res.status(400).json({ error: 'invalid body: expected { text }' });
			return;
		}
		try {
			const result = await llmService.parseDictation(body.data.text);
			res.json(result);
		} catch (err) {
			sendLlmError(res, err);
		}
	});

	return router;
}
