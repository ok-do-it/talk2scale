import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { z } from 'zod';
import type { UserService } from '../service/userService.js';

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

const userIdSchema = z.coerce.number().int().positive();

const caloriesBurnedBodySchema = z.object({
	day: z.string().regex(dayPattern),
	kcal: z.number().nonnegative(),
});

const balanceQuerySchema = z.object({
	from: z.string().regex(dayPattern).optional(),
	to: z.string().regex(dayPattern).optional(),
});

const dailyTargetsBodySchema = z.object({
	kcal: z.number().int().nonnegative(),
	nutrient_amounts: z.array(
		z.object({
			id: z.number().int().positive(),
			grams: z.number().positive(),
		}),
	),
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

export function createUserRoutes(userService: UserService): express.Router {
	const router = express.Router();
	router.use(express.json());

	router.get('/users/:userId', async (req, res) => {
		const userId = userIdSchema.safeParse(req.params.userId);
		if (!userId.success) {
			res.status(400).json({ error: 'invalid user id' });
			return;
		}
		const user = await userService.getUser(userId.data);
		if (!user) {
			res.status(404).json({ error: 'user not found' });
			return;
		}
		res.json(user);
	});

	router.post(
		'/users/:userId/calories-burned',
		validate(caloriesBurnedBodySchema),
		async (req, res) => {
			const userId = userIdSchema.safeParse(req.params.userId);
			if (!userId.success) {
				res.status(400).json({ error: 'invalid user id' });
				return;
			}
			const body = req.body as z.infer<typeof caloriesBurnedBodySchema>;
			const result = await userService.upsertCaloriesBurned(
				userId.data,
				body.day,
				body.kcal,
			);
			if (result === 'user_not_found') {
				res.status(400).json({ error: 'user not found' });
				return;
			}
			res.json(result);
		},
	);

	router.get('/users/:userId/balance', async (req, res) => {
		const userId = userIdSchema.safeParse(req.params.userId);
		if (!userId.success) {
			res.status(400).json({ error: 'invalid user id' });
			return;
		}
		const query = balanceQuerySchema.safeParse(req.query);
		if (!query.success) {
			res.status(400).json({ error: z.flattenError(query.error) });
			return;
		}
		const result = await userService.getBalance(
			userId.data,
			query.data.from,
			query.data.to,
		);
		res.json(result);
	});

	router.get('/users/:userId/daily-targets', async (req, res) => {
		const userId = userIdSchema.safeParse(req.params.userId);
		if (!userId.success) {
			res.status(400).json({ error: 'invalid user id' });
			return;
		}
		const result = await userService.getDailyTargets(userId.data);
		if (result === 'user_not_found') {
			res.status(404).json({ error: 'user not found' });
			return;
		}
		res.json(result);
	});

	router.put(
		'/users/:userId/daily-targets',
		validate(dailyTargetsBodySchema),
		async (req, res) => {
			const userId = userIdSchema.safeParse(req.params.userId);
			if (!userId.success) {
				res.status(400).json({ error: 'invalid user id' });
				return;
			}
			const body = req.body as z.infer<typeof dailyTargetsBodySchema>;
			const result = await userService.setDailyTargets(userId.data, body);
			if (result === 'user_not_found') {
				res.status(404).json({ error: 'user not found' });
				return;
			}
			res.json(result);
		},
	);

	return router;
}
