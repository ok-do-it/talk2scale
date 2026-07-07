import express from 'express';
import type { EmbeddingService } from '../service/embeddingService.js';

export function createSearchRoutes(
	embeddingService: EmbeddingService,
): express.Router {
	const router = express.Router();

	router.get('/health', (_req, res) => {
		res.status(200).json({ ok: true }).end();
	});

	router.get('/search-food', async (req, res) => {
		const foodName = (req.query.food_name as string | undefined)?.trim();
		if (!foodName) {
			res.status(400).json({ error: 'missing ?food_name= parameter' });
			return;
		}
		const hits = await embeddingService.searchFoodName(foodName);
		res.json(hits);
	});

	return router;
}
