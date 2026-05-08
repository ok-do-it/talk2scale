import { db } from '../db/client.js';
import type { MealService } from './mealService.js';

export type CaloriesBurnedRow = {
	user_id: number;
	day: string;
	kcal: number;
};

export type DailyCaloriesEntry = {
	day: string;
	kcal_burned: number;
	kcal_consumed: number;
};

export type UserService = {
	upsertCaloriesBurned: (
		userId: number,
		day: string,
		kcal: number,
	) => Promise<CaloriesBurnedRow | 'user_not_found'>;
	getBalance: (
		userId: number,
		from?: string,
		to?: string,
	) => Promise<DailyCaloriesEntry[]>;
};

function toDate(day: string): Date {
	return new Date(`${day}T00:00:00Z`);
}

function endOfDay(day: string): Date {
	return new Date(`${day}T23:59:59.999Z`);
}

export function createUserService(mealService: MealService): UserService {
	return {
		async upsertCaloriesBurned(userId, day, kcal) {
			const user = await db
				.selectFrom('users')
				.select('id')
				.where('id', '=', userId)
				.executeTakeFirst();
			if (!user) return 'user_not_found';

			const row = await db
				.insertInto('calories_burned')
				.values({ user_id: userId, day, kcal })
				.onConflict((oc) =>
					oc.columns(['user_id', 'day']).doUpdateSet({ kcal }),
				)
				.returning(['user_id', 'day', 'kcal'])
				.executeTakeFirstOrThrow();
			return row as CaloriesBurnedRow;
		},

		async getBalance(userId, from, to) {
			let burnedQuery = db
				.selectFrom('calories_burned')
				.select(['day', 'kcal'])
				.where('user_id', '=', userId);
			if (from) burnedQuery = burnedQuery.where('day', '>=', from);
			if (to) burnedQuery = burnedQuery.where('day', '<=', to);
			const burnedRows = await burnedQuery.execute();

			const consumed = await mealService.getUserDailyKcal(
				userId,
				from ? toDate(from) : undefined,
				to ? endOfDay(to) : undefined,
			);

			const days = new Set<string>();
			const burnedMap = new Map<string, number>();
			for (const row of burnedRows) {
				burnedMap.set(row.day, row.kcal);
				days.add(row.day);
			}
			for (const day of consumed.keys()) days.add(day);

			return [...days]
				.sort()
				.map((day) => ({
					day,
					kcal_burned: burnedMap.get(day) ?? 0,
					kcal_consumed: consumed.get(day) ?? 0,
				}));
		},
	};
}
