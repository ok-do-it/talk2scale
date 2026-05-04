import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { z } from 'zod';
import {
	type FoodLogItem,
	foodLogItemSchema,
	type MealService,
	type NewMeal,
	type NewRecipe,
	newMealSchema,
	newRecipeSchema,
} from '../service/mealService.js';

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

export function createMealRoutes(mealService: MealService): express.Router {
	const router = express.Router();
	router.use(express.json());

	router.post('/meals', validate(newMealSchema), async (req, res) => {
		const meal = await mealService.createMeal(req.body as NewMeal);
		res.status(201).json(meal);
	});

	router.get('/meals/:id', async (req, res) => {
		const mealId = parseId(req.params.id);
		if (mealId === null) {
			res.status(400).json({ error: 'invalid meal id' });
			return;
		}
		const meal = await mealService.getMeal(mealId);
		if (!meal) {
			res.status(404).json({ error: `meal ${mealId} not found` });
			return;
		}
		res.json(meal);
	});

	router.patch(
		'/meals/:id/name',
		validate(z.object({ name: z.string().min(1) })),
		async (req, res) => {
			const mealId = parseId(req.params.id);
			if (mealId === null) {
				res.status(400).json({ error: 'invalid meal id' });
				return;
			}
			const meal = await mealService.updateMealName(
				mealId,
				(req.body as { name: string }).name,
			);
			if (!meal) {
				res.status(404).json({ error: `meal ${mealId} not found` });
				return;
			}
			res.json(meal);
		},
	);

	router.post(
		'/meals/:id/food-logs',
		validate(foodLogItemSchema),
		async (req, res) => {
			const mealId = parseId(req.params.id);
			if (mealId === null) {
				res.status(400).json({ error: 'invalid meal id' });
				return;
			}
			try {
				const foodLog = await mealService.addFoodLog(
					mealId,
					req.body as FoodLogItem,
				);
				res.status(201).json(foodLog);
			} catch (err) {
				if (isForeignKeyViolation(err)) {
					res.status(404).json({ error: `meal ${mealId} not found` });
					return;
				}
				throw err;
			}
		},
	);

	router.delete('/meals/:id/food-logs/:logId', async (req, res) => {
		const mealId = parseId(req.params.id);
		const logId = parseId(req.params.logId);
		if (mealId === null || logId === null) {
			res.status(400).json({ error: 'invalid id parameter' });
			return;
		}
		const deleted = await mealService.removeFoodLog(mealId, logId);
		if (!deleted) {
			res
				.status(404)
				.json({ error: `food log ${logId} not found in meal ${mealId}` });
			return;
		}
		res.status(204).end();
	});

	router.get('/meals/:id/nutrients', async (req, res) => {
		const mealId = parseId(req.params.id);
		if (mealId === null) {
			res.status(400).json({ error: 'invalid meal id' });
			return;
		}
		const nutrients = await mealService.getMealNutrients(mealId);
		if (nutrients === null) {
			res.status(404).json({ error: `meal ${mealId} not found` });
			return;
		}
		res.json(nutrients);
	});

	// registered before /users/:userId/meals to avoid ambiguity
	router.get('/users/:userId/meals/nutrients', async (req, res) => {
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
		const nutrients = await mealService.getUserRangeNutrients(
			userId,
			query.data.from,
			query.data.to,
		);
		res.json(nutrients);
	});

	router.get('/users/:userId/meals', async (req, res) => {
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
		const meals = await mealService.getMealsByUser(
			userId,
			query.data.from,
			query.data.to,
		);
		res.json(meals);
	});

	router.post('/recipes', validate(newRecipeSchema), async (req, res) => {
		try {
			const recipe = await mealService.createRecipe(req.body as NewRecipe);
			res.status(201).json(recipe);
		} catch (err) {
			if (isForeignKeyViolation(err)) {
				res
					.status(400)
					.json({ error: 'one or more child element_ids do not exist' });
				return;
			}
			throw err;
		}
	});

	return router;
}
