import express from 'express';
import type {
	FoodLogItem,
	MealService,
	NewMeal,
	NewRecipe,
	RecipeChild,
} from '../service/mealService.js';

function parseId(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	const n = Number.parseInt(value, 10);
	return Number.isNaN(n) || n <= 0 ? null : n;
}

function parseDate(value: unknown): Date | null | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'string') return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}

function isForeignKeyViolation(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: unknown }).code === '23503'
	);
}

function isValidFoodLogItem(item: unknown): item is FoodLogItem {
	if (typeof item !== 'object' || item === null) return false;
	const o = item as Record<string, unknown>;
	return (
		(o.element_id === null ||
			(typeof o.element_id === 'number' &&
				Number.isInteger(o.element_id) &&
				o.element_id > 0)) &&
		typeof o.raw_name === 'string' &&
		o.raw_name.trim().length > 0 &&
		typeof o.amount === 'number' &&
		o.amount > 0 &&
		typeof o.unit_id === 'number' &&
		Number.isInteger(o.unit_id) &&
		o.unit_id > 0
	);
}

function isValidRecipeChild(item: unknown): item is RecipeChild {
	if (typeof item !== 'object' || item === null) return false;
	const o = item as Record<string, unknown>;
	return (
		typeof o.element_id === 'number' &&
		Number.isInteger(o.element_id) &&
		o.element_id > 0 &&
		typeof o.grams === 'number' &&
		o.grams > 0
	);
}

export function createMealRoutes(mealService: MealService): express.Router {
	const router = express.Router();
	router.use(express.json());

	router.post('/meals', async (req, res) => {
		const body = req.body as Record<string, unknown>;
		const { user_id, logged_at, food_logs } = body;

		if (
			typeof user_id !== 'number' ||
			!Number.isInteger(user_id) ||
			user_id <= 0
		) {
			res.status(400).json({ error: 'user_id must be a positive integer' });
			return;
		}
		if (
			logged_at === undefined ||
			typeof logged_at !== 'string' ||
				Number.isNaN(new Date(logged_at).getTime())
		) {
			res
				.status(400)
				.json({ error: 'logged_at must be a valid ISO 8601 date string' });
			return;
		}
		if (!Array.isArray(food_logs) || food_logs.length === 0) {
			res.status(400).json({ error: 'food_logs must be a non-empty array' });
			return;
		}
		if (!food_logs.every(isValidFoodLogItem)) {
			res.status(400).json({
				error:
					'each food_log must have raw_name (string), amount (> 0), unit_id (int > 0), element_id (int | null)',
			});
			return;
		}

		const input: NewMeal = {
			user_id,
			logged_at,
			food_logs,
		};
		const meal = await mealService.createMeal(input);
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

	router.patch('/meals/:id/name', async (req, res) => {
		const mealId = parseId(req.params.id);
		if (mealId === null) {
			res.status(400).json({ error: 'invalid meal id' });
			return;
		}
		const { name } = req.body as Record<string, unknown>;
		if (typeof name !== 'string' || name.trim().length === 0) {
			res.status(400).json({ error: 'name must be a non-empty string' });
			return;
		}
		const meal = await mealService.updateMealName(mealId, name);
		if (!meal) {
			res.status(404).json({ error: `meal ${mealId} not found` });
			return;
		}
		res.json(meal);
	});

	router.post('/meals/:id/food-logs', async (req, res) => {
		const mealId = parseId(req.params.id);
		if (mealId === null) {
			res.status(400).json({ error: 'invalid meal id' });
			return;
		}
		if (!isValidFoodLogItem(req.body)) {
			res.status(400).json({ error: 'body must be a valid food log item' });
			return;
		}
		try {
			const foodLog = await mealService.addFoodLog(mealId, req.body);
			res.status(201).json(foodLog);
		} catch (err) {
			if (isForeignKeyViolation(err)) {
				res.status(404).json({ error: `meal ${mealId} not found` });
				return;
			}
			throw err;
		}
	});

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

	// must be registered before /users/:userId/meals to avoid ambiguity
	router.get('/users/:userId/meals/nutrients', async (req, res) => {
		const userId = parseId(req.params.userId);
		if (userId === null) {
			res.status(400).json({ error: 'invalid user id' });
			return;
		}
		const fromParam = parseDate(req.query.from);
		const toParam = parseDate(req.query.to);
		if (fromParam === null) {
			res
				.status(400)
				.json({ error: 'from must be a valid ISO 8601 date string' });
			return;
		}
		if (toParam === null) {
			res
				.status(400)
				.json({ error: 'to must be a valid ISO 8601 date string' });
			return;
		}
		const nutrients = await mealService.getUserRangeNutrients(
			userId,
			fromParam,
			toParam,
		);
		res.json(nutrients);
	});

	router.get('/users/:userId/meals', async (req, res) => {
		const userId = parseId(req.params.userId);
		if (userId === null) {
			res.status(400).json({ error: 'invalid user id' });
			return;
		}
		const fromParam = parseDate(req.query.from);
		const toParam = parseDate(req.query.to);
		if (fromParam === null) {
			res
				.status(400)
				.json({ error: 'from must be a valid ISO 8601 date string' });
			return;
		}
		if (toParam === null) {
			res
				.status(400)
				.json({ error: 'to must be a valid ISO 8601 date string' });
			return;
		}
		const meals = await mealService.getMealsByUser(userId, fromParam, toParam);
		res.json(meals);
	});

	router.post('/recipes', async (req, res) => {
		const body = req.body as Record<string, unknown>;
		const { name, children, serving_grams } = body;

		if (typeof name !== 'string' || name.trim().length === 0) {
			res.status(400).json({ error: 'name must be a non-empty string' });
			return;
		}
		if (
			!Array.isArray(children) ||
			children.length === 0 ||
			!children.every(isValidRecipeChild)
		) {
			res.status(400).json({
				error:
					'children must be a non-empty array of { element_id: int > 0, grams: number > 0 }',
			});
			return;
		}
		if (
			serving_grams !== undefined &&
			(typeof serving_grams !== 'number' || serving_grams <= 0)
		) {
			res
				.status(400)
				.json({ error: 'serving_grams must be a positive number' });
			return;
		}

		const input: NewRecipe = {
			name,
			children,
			serving_grams:
				typeof serving_grams === 'number' ? serving_grams : undefined,
		};

		try {
			const recipe = await mealService.createRecipe(input);
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
