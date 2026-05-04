import type { Selectable } from 'kysely';
import { z } from 'zod';
import { db } from '../db/client.js';
import type { Element, FoodLog, Link, Meal, Measure } from '../db/types.js';
import type {
	FoodTreeService,
	NutrientEntry,
	NutrientGroupPayload,
} from './foodTreeService.js';

export const foodLogItemSchema = z.object({
	element_id: z.number().int().positive().nullable(),
	raw_name: z.string().min(1),
	amount: z.number().positive(),
	unit_id: z.number().int().positive(),
});

export const newMealSchema = z.object({
	user_id: z.number().int().positive(),
	logged_at: z.coerce.date().optional(),
	food_logs: z.array(foodLogItemSchema).min(1),
});

export const recipeChildSchema = z.object({
	element_id: z.number().int().positive(),
	grams: z.number().positive(),
});

export const newRecipeSchema = z.object({
	name: z.string().min(1),
	children: z.array(recipeChildSchema).min(1),
	serving_grams: z.number().positive().optional(),
});

export type FoodLogItem = z.infer<typeof foodLogItemSchema>;
export type NewMeal = z.infer<typeof newMealSchema>;
export type RecipeChild = z.infer<typeof recipeChildSchema>;
export type NewRecipe = z.infer<typeof newRecipeSchema>;

export type MealWithLogs = Selectable<Meal> & {
	food_logs: Selectable<FoodLog>[];
};

export type RecipeWithDetails = Selectable<Element> & {
	links: Selectable<Link>[];
	measures: Selectable<Measure>[];
};

export type MealService = ReturnType<typeof createMealService>;

function resolveMealName(loggedAt: Date): string {
	const hour = loggedAt.getHours();
	if (hour >= 5 && hour < 11) return 'Breakfast';
	if (hour >= 11 && hour < 16) return 'Lunch';
	if (hour >= 16 && hour < 22) return 'Dinner';
	return 'Late Night';
}

function sumNutrientGroups(
	allGroups: NutrientGroupPayload[][],
): NutrientGroupPayload[] {
	type GroupAccum = {
		id: number;
		name: string;
		displayOrder: number;
		nutrients: Map<string, NutrientEntry>;
	};

	const groupMap = new Map<number, GroupAccum>();

	for (const groups of allGroups) {
		for (const group of groups) {
			let accum = groupMap.get(group.id);
			if (!accum) {
				accum = {
					id: group.id,
					name: group.name,
					displayOrder: group.displayOrder,
					nutrients: new Map(),
				};
				groupMap.set(group.id, accum);
			}
			for (const nutrient of group.nutrients) {
				const key =
					nutrient.id !== null ? String(nutrient.id) : `__${nutrient.name}`;
				const existing = accum.nutrients.get(key);
				if (existing) {
					existing.amount += nutrient.amount;
				} else {
					accum.nutrients.set(key, { ...nutrient });
				}
			}
		}
	}

	return [...groupMap.values()]
		.sort((a, b) => a.displayOrder - b.displayOrder)
		.map((g) => ({
			id: g.id,
			name: g.name,
			displayOrder: g.displayOrder,
			nutrients: [...g.nutrients.values()],
		}));
}

async function computeNutrientsForLogs(
	foodLogs: Selectable<FoodLog>[],
	foodTreeService: FoodTreeService,
): Promise<NutrientGroupPayload[]> {
	const resolvedLogs = foodLogs.filter(
		(log): log is Selectable<FoodLog> & { element_id: number } =>
			log.element_id !== null,
	);
	if (resolvedLogs.length === 0) return [];

	const unitIds = [...new Set(resolvedLogs.map((log) => log.unit_id))];
	const measures = await db
		.selectFrom('measure')
		.selectAll()
		.where('id', 'in', unitIds)
		.execute();
	const measureById = new Map(measures.map((m) => [m.id, m]));

	const allGroups: NutrientGroupPayload[][] = [];
	for (const log of resolvedLogs) {
		const measure = measureById.get(log.unit_id);
		if (!measure) continue;
		const mass = Number(log.amount) * Number(measure.grams);
		const groups = await foodTreeService.nutrientsByElement(
			log.element_id,
			mass,
		);
		if (groups) allGroups.push(groups);
	}

	return sumNutrientGroups(allGroups);
}

export function createMealService(foodTreeService: FoodTreeService) {
	return {
		async createMeal(input: NewMeal): Promise<MealWithLogs> {
			return db.transaction().execute(async (trx) => {
				const loggedAt = input.logged_at ?? new Date();
				const name = resolveMealName(loggedAt);

				const meal = await trx
					.insertInto('meal')
					.values({ user_id: input.user_id, name, logged_at: loggedAt })
					.returningAll()
					.executeTakeFirstOrThrow();

				const food_logs =
					input.food_logs.length > 0
						? await trx
								.insertInto('food_log')
								.values(
									input.food_logs.map((item) => ({
										meal_id: meal.id,
										element_id: item.element_id,
										raw_name: item.raw_name,
										amount: item.amount,
										unit_id: item.unit_id,
									})),
								)
								.returningAll()
								.execute()
						: [];

				return { ...meal, food_logs };
			});
		},

		async getMeal(mealId: number): Promise<MealWithLogs | null> {
			const meal = await db
				.selectFrom('meal')
				.selectAll()
				.where('id', '=', mealId)
				.executeTakeFirst();
			if (!meal) return null;

			const food_logs = await db
				.selectFrom('food_log')
				.selectAll()
				.where('meal_id', '=', mealId)
				.execute();

			return { ...meal, food_logs };
		},

		async getMealsByUser(
			userId: number,
			from?: Date,
			to?: Date,
		): Promise<MealWithLogs[]> {
			let query = db
				.selectFrom('meal')
				.selectAll()
				.where('user_id', '=', userId);

			if (from !== undefined) query = query.where('logged_at', '>=', from);
			if (to !== undefined) query = query.where('logged_at', '<=', to);

			const meals = await query.orderBy('logged_at', 'desc').execute();
			if (meals.length === 0) return [];

			const mealIds = meals.map((m) => m.id);
			const foodLogs = await db
				.selectFrom('food_log')
				.selectAll()
				.where('meal_id', 'in', mealIds)
				.execute();

			const logsByMealId = new Map<number, Selectable<FoodLog>[]>();
			for (const log of foodLogs) {
				const list = logsByMealId.get(log.meal_id) ?? [];
				list.push(log);
				logsByMealId.set(log.meal_id, list);
			}

			return meals.map((meal) => ({
				...meal,
				food_logs: logsByMealId.get(meal.id) ?? [],
			}));
		},

		async updateMealName(
			mealId: number,
			name: string,
		): Promise<Selectable<Meal> | null> {
			return (
				(await db
					.updateTable('meal')
					.set({ name })
					.where('id', '=', mealId)
					.returningAll()
					.executeTakeFirst()) ?? null
			);
		},

		async addFoodLog(
			mealId: number,
			item: FoodLogItem,
		): Promise<Selectable<FoodLog>> {
			return db
				.insertInto('food_log')
				.values({
					meal_id: mealId,
					element_id: item.element_id,
					raw_name: item.raw_name,
					amount: item.amount,
					unit_id: item.unit_id,
				})
				.returningAll()
				.executeTakeFirstOrThrow();
		},

		async removeFoodLog(mealId: number, logId: number): Promise<boolean> {
			const result = await db
				.deleteFrom('food_log')
				.where('id', '=', logId)
				.where('meal_id', '=', mealId)
				.executeTakeFirst();
			return (result.numDeletedRows ?? 0n) > 0n;
		},

		async getMealNutrients(
			mealId: number,
		): Promise<NutrientGroupPayload[] | null> {
			const meal = await db
				.selectFrom('meal')
				.select('id')
				.where('id', '=', mealId)
				.executeTakeFirst();
			if (!meal) return null;

			const foodLogs = await db
				.selectFrom('food_log')
				.selectAll()
				.where('meal_id', '=', mealId)
				.execute();

			return computeNutrientsForLogs(foodLogs, foodTreeService);
		},

		async getUserRangeNutrients(
			userId: number,
			from?: Date,
			to?: Date,
		): Promise<NutrientGroupPayload[]> {
			const foodLogs = await db
				.selectFrom('food_log')
				.innerJoin('meal', 'meal.id', 'food_log.meal_id')
				.selectAll('food_log')
				.where('meal.user_id', '=', userId)
				.$if(from !== undefined, (q) =>
					q.where('meal.logged_at', '>=', from as Date),
				)
				.$if(to !== undefined, (q) =>
					q.where('meal.logged_at', '<=', to as Date),
				)
				.execute();

			return computeNutrientsForLogs(foodLogs, foodTreeService);
		},

		async createRecipe(input: NewRecipe): Promise<RecipeWithDetails> {
			return db.transaction().execute(async (trx) => {
				const element = await trx
					.insertInto('element')
					.values({
						type: 'recipe',
						source: 'user',
						name: input.name,
						external_id: null,
					})
					.returningAll()
					.executeTakeFirstOrThrow();

				const wholeBatchGrams = input.children.reduce(
					(sum, c) => sum + c.grams,
					0,
				);

				const links = await trx
					.insertInto('link')
					.values(
						input.children.map((c) => ({
							parent_id: element.id,
							child_id: c.element_id,
							ratio: c.grams / wholeBatchGrams,
						})),
					)
					.returningAll()
					.execute();

				const measureValues: Array<{
					element_id: number;
					name: string;
					grams: number;
				}> = [
					{
						element_id: element.id,
						name: 'whole batch',
						grams: wholeBatchGrams,
					},
				];

				if (input.serving_grams !== undefined) {
					measureValues.push({
						element_id: element.id,
						name: 'serving',
						grams: input.serving_grams,
					});
				}

				const measures = await trx
					.insertInto('measure')
					.values(measureValues)
					.returningAll()
					.execute();

				return { ...element, links, measures };
			});
		},
	};
}
