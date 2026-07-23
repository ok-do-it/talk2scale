import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { z } from 'zod';
import {
	type FoodLogService,
	type NewFoodLog,
	newFoodLogSchema,
} from '../service/foodLogService.js';

const dateRangeSchema = z.object({
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
});

function validate<T>(schema: z.ZodType<T>) {
	return (req: Request, res: Response, next: NextFunction): void => {
		const result = schema.safeParse(req.body);
		if (!result.success) {
			res.status(400).json({ error: z.flattenError(result.error) });
			return;
		}
		req.body = result.data;
		next();
	};
}

function parseId(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	const n = Number.parseInt(value, 10);
	return Number.isNaN(n) || n <= 0 ? null : n;
}

function isForeignKeyViolation(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: unknown }).code === '23503'
	);
}

export function createFoodLogRoutes(
	foodLogService: FoodLogService,
): express.Router {
	const router = express.Router();
	router.use(express.json());

	router.post('/food-logs', validate(newFoodLogSchema), async (req, res) => {
		try {
			const foodLog = await foodLogService.createFoodLog(
				req.body as NewFoodLog,
			);
			res.status(201).json(foodLog);
		} catch (err) {
			if (isForeignKeyViolation(err)) {
				res.status(400).json({
					error: 'invalid user_id, element_id, or measure_id',
				});
				return;
			}
			throw err;
		}
	});

	router.get('/food-logs/:id', async (req, res) => {
		const logId = parseId(req.params.id);
		if (logId === null) {
			res.status(400).json({ error: 'invalid food log id' });
			return;
		}
		const foodLog = await foodLogService.getFoodLog(logId);
		if (!foodLog) {
			res.status(404).json({ error: `food log ${logId} not found` });
			return;
		}
		res.json(foodLog);
	});

	router.delete('/food-logs/:id', async (req, res) => {
		const logId = parseId(req.params.id);
		if (logId === null) {
			res.status(400).json({ error: 'invalid food log id' });
			return;
		}
		const deleted = await foodLogService.removeFoodLog(logId);
		if (!deleted) {
			res.status(404).json({ error: `food log ${logId} not found` });
			return;
		}
		res.status(204).end();
	});

	router.get('/food-logs/:id/nutrients', async (req, res) => {
		const logId = parseId(req.params.id);
		if (logId === null) {
			res.status(400).json({ error: 'invalid food log id' });
			return;
		}
		const nutrients = await foodLogService.getFoodLogNutrients(logId);
		if (nutrients === null) {
			res.status(404).json({ error: `food log ${logId} not found` });
			return;
		}
		res.json(nutrients);
	});

	// registered before /users/:userId/food-logs to avoid ambiguity
	router.get('/users/:userId/food-logs/nutrients', async (req, res) => {
		const userId = parseId(req.params.userId);
		if (userId === null) {
			res.status(400).json({ error: 'invalid user id' });
			return;
		}
		const query = dateRangeSchema.safeParse(req.query);
		if (!query.success) {
			res.status(400).json({ error: z.flattenError(query.error) });
			return;
		}
		const nutrients = await foodLogService.getUserRangeNutrients(
			userId,
			query.data.from,
			query.data.to,
		);
		res.json(nutrients);
	});

	router.get('/users/:userId/food-logs', async (req, res) => {
		const userId = parseId(req.params.userId);
		if (userId === null) {
			res.status(400).json({ error: 'invalid user id' });
			return;
		}
		const query = dateRangeSchema.safeParse(req.query);
		if (!query.success) {
			res.status(400).json({ error: z.flattenError(query.error) });
			return;
		}
		const foodLogs = await foodLogService.getFoodLogsByUser(
			userId,
			query.data.from,
			query.data.to,
		);
		res.json(foodLogs);
	});

	return router;
}
