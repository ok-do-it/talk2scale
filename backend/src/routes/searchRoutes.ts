import express from 'express';
import { env } from '../config/env.js';
import type { SearchService } from '../service/searchService.js';

export function createSearchRoutes(
	searchService: SearchService,
): express.Router {
	const router = express.Router();

	router.get('/health', (_req, res) => {
		res.status(200).json({ ok: true }).end();
	});

	router.get('/all', (_req, res) => {
		res.json(searchService.getAllFoods()).end();
	});

	router.get('/search', async (req, res) => {
		const food = req.query.food as string;
		if (!food) {
			res.status(400).json({ error: 'missing ?food= parameter' });
			return;
		}
		const top = await searchService.searchOne(food, env.searchPrefix);
		res.json(top);
	});

	router.get('/searchMany', async (req, res) => {
		const food = req.query.food as string;
		if (!food) {
			res.status(400).json({ error: 'missing ?food= parameter' });
			return;
		}
		const results = await searchService.searchMany(food, env.searchPrefix, 10);
		res.json(results);
	});

	return router;
}
