import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { z } from 'zod';
import {
	type NewRecipe,
	newRecipeSchema,
	type RecipeService,
} from '../service/recipeService.js';

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

function isForeignKeyViolation(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: unknown }).code === '23503'
	);
}

export function createRecipeRoutes(
	recipeService: RecipeService,
): express.Router {
	const router = express.Router();
	router.use(express.json());

	router.post('/recipes', validate(newRecipeSchema), async (req, res) => {
		try {
			const recipe = await recipeService.createRecipe(req.body as NewRecipe);
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
