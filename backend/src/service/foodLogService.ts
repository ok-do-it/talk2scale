import type { Selectable } from 'kysely';
import { z } from 'zod';
import { db } from '../db/client.js';
import type { FoodLog } from '../db/types.js';
import type {
	FoodTreeService,
	NutrientEntry,
	NutrientGroupPayload,
} from './foodTreeService.js';

export const newFoodLogSchema = z.object({
	user_id: z.number().int().positive(),
	logged_at: z.coerce.date().optional(),
	element_id: z.number().int().positive().nullable(),
	raw_name: z.string().min(1),
	amount: z.number().positive(),
	measure_id: z.number().int().positive(),
});

export type NewFoodLog = z.infer<typeof newFoodLogSchema>;

export type FoodLogWithKcal = Selectable<FoodLog> & {
	kcal: number;
};

export type FoodLogService = ReturnType<typeof createFoodLogService>;

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

function extractKcal(groups: NutrientGroupPayload[]): number {
	const basic = groups.find((g) => g.name === 'Basic');
	const energy = basic?.nutrients.find(
		(n) => n.id === null && n.calculated === true,
	);
	return energy?.amount ?? 0;
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

	const measureIds = [...new Set(resolvedLogs.map((log) => log.measure_id))];
	const measures = await db
		.selectFrom('measure')
		.selectAll()
		.where('id', 'in', measureIds)
		.execute();
	const measureById = new Map(measures.map((m) => [m.id, m]));

	const allGroups: NutrientGroupPayload[][] = [];
	for (const log of resolvedLogs) {
		const measure = measureById.get(log.measure_id);
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

export function createFoodLogService(foodTreeService: FoodTreeService) {
	return {
		async createFoodLog(input: NewFoodLog): Promise<Selectable<FoodLog>> {
			const loggedAt = input.logged_at ?? new Date();
			return db
				.insertInto('food_log')
				.values({
					user_id: input.user_id,
					logged_at: loggedAt,
					element_id: input.element_id,
					raw_name: input.raw_name,
					amount: input.amount,
					measure_id: input.measure_id,
				})
				.returningAll()
				.executeTakeFirstOrThrow();
		},

		async getFoodLog(logId: number): Promise<Selectable<FoodLog> | null> {
			return (
				(await db
					.selectFrom('food_log')
					.selectAll()
					.where('id', '=', logId)
					.executeTakeFirst()) ?? null
			);
		},

		async getFoodLogsByUser(
			userId: number,
			from?: Date,
			to?: Date,
		): Promise<FoodLogWithKcal[]> {
			let query = db
				.selectFrom('food_log')
				.selectAll()
				.where('user_id', '=', userId);

			if (from !== undefined) query = query.where('logged_at', '>=', from);
			if (to !== undefined) query = query.where('logged_at', '<=', to);

			const foodLogs = await query.orderBy('logged_at', 'desc').execute();
			if (foodLogs.length === 0) return [];

			return Promise.all(
				foodLogs.map(async (log) => {
					const groups = await computeNutrientsForLogs([log], foodTreeService);
					return {
						...log,
						kcal: extractKcal(groups),
					};
				}),
			);
		},

		async removeFoodLog(logId: number): Promise<boolean> {
			const result = await db
				.deleteFrom('food_log')
				.where('id', '=', logId)
				.executeTakeFirst();
			return (result.numDeletedRows ?? 0n) > 0n;
		},

		async getFoodLogNutrients(
			logId: number,
		): Promise<NutrientGroupPayload[] | null> {
			const log = await db
				.selectFrom('food_log')
				.selectAll()
				.where('id', '=', logId)
				.executeTakeFirst();
			if (!log) return null;
			return computeNutrientsForLogs([log], foodTreeService);
		},

		// Per-day kcal totals for a user, keyed by UTC date (YYYY-MM-DD).
		// Days with no logged food are absent from the map.
		async getUserDailyKcal(
			userId: number,
			from?: Date,
			to?: Date,
		): Promise<Map<string, number>> {
			let query = db
				.selectFrom('food_log')
				.selectAll()
				.where('user_id', '=', userId);

			if (from !== undefined) query = query.where('logged_at', '>=', from);
			if (to !== undefined) query = query.where('logged_at', '<=', to);

			const rows = await query.execute();

			const logsByDay = new Map<string, Selectable<FoodLog>[]>();
			for (const row of rows) {
				const day = new Date(row.logged_at).toISOString().slice(0, 10);
				const list = logsByDay.get(day) ?? [];
				list.push(row);
				logsByDay.set(day, list);
			}

			const result = new Map<string, number>();
			for (const [day, logs] of logsByDay) {
				const groups = await computeNutrientsForLogs(logs, foodTreeService);
				const kcal = extractKcal(groups);
				if (kcal > 0) result.set(day, kcal);
			}
			return result;
		},

		async getUserRangeNutrients(
			userId: number,
			from?: Date,
			to?: Date,
		): Promise<NutrientGroupPayload[]> {
			let query = db
				.selectFrom('food_log')
				.selectAll()
				.where('user_id', '=', userId);

			if (from !== undefined) query = query.where('logged_at', '>=', from);
			if (to !== undefined) query = query.where('logged_at', '<=', to);

			const foodLogs = await query.execute();
			return computeNutrientsForLogs(foodLogs, foodTreeService);
		},
	};
}
