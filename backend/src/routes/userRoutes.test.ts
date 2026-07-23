import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, db } from '../test/app.js';

const app = buildApp();

let userId: number;
let elementId: number;
let unitId: number;

const BURN_ONLY_DAY = '2025-12-15';
const UPSERT_DAY = '2025-12-16';
const LOG_ONLY_DAY = '2025-12-17';
const COMBINED_DAY = '2025-12-18';
const OUT_OF_RANGE_DAY = '2026-06-01';

const createdLogIds: number[] = [];

let nutrientId: number;

beforeAll(async () => {
	const user = await db
		.selectFrom('users')
		.select('id')
		.limit(1)
		.executeTakeFirstOrThrow();
	userId = user.id;

	const element = await db
		.selectFrom('element')
		.select('id')
		.where('type', '=', 'whole_food')
		.limit(1)
		.executeTakeFirstOrThrow();
	elementId = element.id;

	const nutrient = await db
		.selectFrom('element')
		.select('id')
		.where('type', '=', 'nutrient')
		.limit(1)
		.executeTakeFirstOrThrow();
	nutrientId = nutrient.id;

	const unit = await db
		.selectFrom('measure')
		.select('id')
		.where('element_id', 'is', null)
		.limit(1)
		.executeTakeFirstOrThrow();
	unitId = unit.id;

	await db
		.deleteFrom('calories_burned')
		.where('user_id', '=', userId)
		.execute();
	await db
		.updateTable('users')
		.set({ daily_targets: null })
		.where('id', '=', userId)
		.execute();
});

afterAll(async () => {
	await db
		.deleteFrom('calories_burned')
		.where('user_id', '=', userId)
		.execute();
	if (createdLogIds.length > 0) {
		await db.deleteFrom('food_log').where('id', 'in', createdLogIds).execute();
	}
	await db.destroy();
});

async function seedFoodLog(day: string): Promise<number> {
	const res = await request(app)
		.post('/food-logs')
		.send({
			user_id: userId,
			logged_at: `${day}T12:00:00Z`,
			element_id: elementId,
			raw_name: 'test food',
			amount: 100,
			measure_id: unitId,
		});
	expect(res.status).toBe(201);
	createdLogIds.push(res.body.id);
	return res.body.id;
}

describe('GET /users/:userId', () => {
	it('returns user profile', async () => {
		const dbUser = await db
			.selectFrom('users')
			.select(['id', 'email', 'name', 'tracking_started_on'])
			.where('id', '=', userId)
			.executeTakeFirstOrThrow();

		const res = await request(app).get(`/users/${userId}`);
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			id: dbUser.id,
			email: dbUser.email,
			name: dbUser.name,
			tracking_started_on: dbUser.tracking_started_on,
		});
	});

	it('returns 404 for nonexistent user', async () => {
		const res = await request(app).get('/users/999999999');
		expect(res.status).toBe(404);
		expect(res.body.error).toBe('user not found');
	});

	it('returns 400 for non-numeric userId', async () => {
		const res = await request(app).get('/users/abc');
		expect(res.status).toBe(400);
	});
});

describe('POST /users/:userId/calories-burned', () => {
	it('creates a row and returns it', async () => {
		const res = await request(app)
			.post(`/users/${userId}/calories-burned`)
			.send({ day: BURN_ONLY_DAY, kcal: 450 });
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			user_id: userId,
			day: BURN_ONLY_DAY,
			kcal: 450,
		});
	});

	it('updates instead of duplicating on same (user, day)', async () => {
		const first = await request(app)
			.post(`/users/${userId}/calories-burned`)
			.send({ day: UPSERT_DAY, kcal: 300 });
		expect(first.status).toBe(200);

		const second = await request(app)
			.post(`/users/${userId}/calories-burned`)
			.send({ day: UPSERT_DAY, kcal: 500 });
		expect(second.status).toBe(200);
		expect(second.body.kcal).toBe(500);

		const rows = await db
			.selectFrom('calories_burned')
			.selectAll()
			.where('user_id', '=', userId)
			.where('day', '=', UPSERT_DAY)
			.execute();
		expect(rows).toHaveLength(1);
		expect(rows[0].kcal).toBe(500);
	});

	it('returns 400 for bad day format', async () => {
		const res = await request(app)
			.post(`/users/${userId}/calories-burned`)
			.send({ day: '2025/12/15', kcal: 100 });
		expect(res.status).toBe(400);
	});

	it('returns 400 for negative kcal', async () => {
		const res = await request(app)
			.post(`/users/${userId}/calories-burned`)
			.send({ day: BURN_ONLY_DAY, kcal: -1 });
		expect(res.status).toBe(400);
	});

	it('returns 400 for nonexistent user', async () => {
		const res = await request(app)
			.post('/users/999999999/calories-burned')
			.send({ day: BURN_ONLY_DAY, kcal: 100 });
		expect(res.status).toBe(400);
		expect(res.body.error).toBe('user not found');
	});

	it('returns 400 for non-numeric userId', async () => {
		const res = await request(app)
			.post('/users/abc/calories-burned')
			.send({ day: BURN_ONLY_DAY, kcal: 100 });
		expect(res.status).toBe(400);
	});
});

describe('GET /users/:userId/balance', () => {
	it('returns days with only kcal_burned set when no food logs on that day', async () => {
		const res = await request(app).get(
			`/users/${userId}/balance?from=${BURN_ONLY_DAY}&to=${BURN_ONLY_DAY}`,
		);
		expect(res.status).toBe(200);
		expect(res.body).toEqual([
			{ day: BURN_ONLY_DAY, kcal_burned: 450, kcal_consumed: 0 },
		]);
	});

	it('returns days with only kcal_consumed set when no burned record', async () => {
		await seedFoodLog(LOG_ONLY_DAY);

		const res = await request(app).get(
			`/users/${userId}/balance?from=${LOG_ONLY_DAY}&to=${LOG_ONLY_DAY}`,
		);
		expect(res.status).toBe(200);
		expect(res.body).toHaveLength(1);
		expect(res.body[0]).toMatchObject({
			day: LOG_ONLY_DAY,
			kcal_burned: 0,
		});
		expect(res.body[0].kcal_consumed).toBeGreaterThan(0);
	});

	it('combines burned + consumed for the same day', async () => {
		await seedFoodLog(COMBINED_DAY);
		await request(app)
			.post(`/users/${userId}/calories-burned`)
			.send({ day: COMBINED_DAY, kcal: 600 });

		const res = await request(app).get(
			`/users/${userId}/balance?from=${COMBINED_DAY}&to=${COMBINED_DAY}`,
		);
		expect(res.status).toBe(200);
		expect(res.body).toHaveLength(1);
		expect(res.body[0]).toMatchObject({
			day: COMBINED_DAY,
			kcal_burned: 600,
		});
		expect(res.body[0].kcal_consumed).toBeGreaterThan(0);
	});

	it('filters by from / to', async () => {
		const res = await request(app).get(
			`/users/${userId}/balance?from=${BURN_ONLY_DAY}&to=${COMBINED_DAY}`,
		);
		expect(res.status).toBe(200);
		const days = res.body.map((e: { day: string }) => e.day);
		expect(days).toContain(BURN_ONLY_DAY);
		expect(days).toContain(COMBINED_DAY);
		expect(days).not.toContain(OUT_OF_RANGE_DAY);
	});

	it('returns sorted by day asc', async () => {
		const res = await request(app).get(`/users/${userId}/balance`);
		expect(res.status).toBe(200);
		const days = res.body.map((e: { day: string }) => e.day);
		const sorted = [...days].sort();
		expect(days).toEqual(sorted);
	});

	it('returns empty array for unknown user', async () => {
		const res = await request(app).get('/users/999999999/balance');
		expect(res.status).toBe(200);
		expect(res.body).toEqual([]);
	});

	it('returns 400 for bad date format', async () => {
		const res = await request(app).get(
			`/users/${userId}/balance?from=2025/12/15`,
		);
		expect(res.status).toBe(400);
	});

	it('returns 400 for non-numeric userId', async () => {
		const res = await request(app).get('/users/abc/balance');
		expect(res.status).toBe(400);
	});
});

describe('GET /users/:userId/daily-targets', () => {
	it('returns null when targets are not set', async () => {
		const res = await request(app).get(`/users/${userId}/daily-targets`);
		expect(res.status).toBe(200);
		expect(res.body).toBeNull();
	});

	it('returns 404 for nonexistent user', async () => {
		const res = await request(app).get('/users/999999999/daily-targets');
		expect(res.status).toBe(404);
		expect(res.body.error).toBe('user not found');
	});

	it('returns 400 for non-numeric userId', async () => {
		const res = await request(app).get('/users/abc/daily-targets');
		expect(res.status).toBe(400);
	});
});

describe('PUT /users/:userId/daily-targets', () => {
	it('saves and returns daily targets', async () => {
		const targets = {
			kcal: 2000,
			nutrient_amounts: [{ id: nutrientId, grams: 0.065 }],
		};
		const res = await request(app)
			.put(`/users/${userId}/daily-targets`)
			.send(targets);
		expect(res.status).toBe(200);
		expect(res.body).toEqual(targets);
	});

	it('GET returns previously saved targets', async () => {
		const res = await request(app).get(`/users/${userId}/daily-targets`);
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			kcal: 2000,
			nutrient_amounts: [{ id: nutrientId, grams: 0.065 }],
		});
	});

	it('overwrites targets on subsequent PUT', async () => {
		const updated = { kcal: 2500, nutrient_amounts: [] };
		const res = await request(app)
			.put(`/users/${userId}/daily-targets`)
			.send(updated);
		expect(res.status).toBe(200);
		expect(res.body).toEqual(updated);

		const get = await request(app).get(`/users/${userId}/daily-targets`);
		expect(get.body).toEqual(updated);
	});

	it('returns 400 when kcal is missing', async () => {
		const res = await request(app)
			.put(`/users/${userId}/daily-targets`)
			.send({ nutrient_amounts: [] });
		expect(res.status).toBe(400);
	});

	it('returns 400 for negative grams', async () => {
		const res = await request(app)
			.put(`/users/${userId}/daily-targets`)
			.send({ kcal: 2000, nutrient_amounts: [{ id: nutrientId, grams: -1 }] });
		expect(res.status).toBe(400);
	});

	it('returns 400 for non-integer nutrient id', async () => {
		const res = await request(app)
			.put(`/users/${userId}/daily-targets`)
			.send({ kcal: 2000, nutrient_amounts: [{ id: 1.5, grams: 10 }] });
		expect(res.status).toBe(400);
	});

	it('returns 404 for nonexistent user', async () => {
		const res = await request(app)
			.put('/users/999999999/daily-targets')
			.send({ kcal: 2000, nutrient_amounts: [] });
		expect(res.status).toBe(404);
		expect(res.body.error).toBe('user not found');
	});

	it('returns 400 for non-numeric userId', async () => {
		const res = await request(app)
			.put('/users/abc/daily-targets')
			.send({ kcal: 2000, nutrient_amounts: [] });
		expect(res.status).toBe(400);
	});
});
