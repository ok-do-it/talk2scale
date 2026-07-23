import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, db } from '../test/app.js';

const app = buildApp();

let userId: number;
let otherUserId: number;
let elementId: number;
let unitId: number;

const createdLogIds: number[] = [];

beforeAll(async () => {
	const users = await db
		.selectFrom('users')
		.select('id')
		.orderBy('id', 'asc')
		.limit(2)
		.execute();
	userId = users[0].id;
	otherUserId = users[1]?.id ?? users[0].id;

	if (!users[1]) {
		const created = await db
			.insertInto('users')
			.values({
				name: 'Food Log Test User',
				email: `food-log-test-${Date.now()}@example.com`,
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		otherUserId = created.id;
	}

	const element = await db
		.selectFrom('element')
		.select('id')
		.where('type', '=', 'whole_food')
		.limit(1)
		.executeTakeFirstOrThrow();
	elementId = element.id;

	const unit = await db
		.selectFrom('measure')
		.select('id')
		.where('element_id', 'is', null)
		.limit(1)
		.executeTakeFirstOrThrow();
	unitId = unit.id;
});

afterAll(async () => {
	if (createdLogIds.length) {
		await db.deleteFrom('food_log').where('id', 'in', createdLogIds).execute();
	}
	await db.destroy();
});

function foodLogPayload(overrides?: Record<string, unknown>) {
	return {
		user_id: userId,
		element_id: elementId,
		raw_name: 'test food',
		amount: 100,
		measure_id: unitId,
		...overrides,
	};
}

async function createFoodLog(overrides?: Record<string, unknown>) {
	const res = await request(app)
		.post('/food-logs')
		.send(foodLogPayload(overrides));
	expect(res.status).toBe(201);
	createdLogIds.push(res.body.id);
	return res.body as {
		id: number;
		user_id: number;
		raw_name: string;
		logged_at: string;
	};
}

describe('POST /food-logs', () => {
	it('creates a food log and returns 201', async () => {
		const res = await request(app).post('/food-logs').send(foodLogPayload());
		expect(res.status).toBe(201);
		createdLogIds.push(res.body.id);
		expect(res.body).toMatchObject({
			id: expect.any(Number),
			user_id: userId,
			element_id: elementId,
			raw_name: 'test food',
			amount: 100,
			measure_id: unitId,
		});
		expect(res.body.logged_at).toBeDefined();
	});

	it('accepts an explicit logged_at', async () => {
		const loggedAt = '2025-12-17T12:00:00.000Z';
		const log = await createFoodLog({ logged_at: loggedAt });
		expect(new Date(log.logged_at).toISOString()).toBe(loggedAt);
	});

	it('returns 400 when user_id is missing', async () => {
		const res = await request(app).post('/food-logs').send({
			element_id: elementId,
			raw_name: 'x',
			amount: 1,
			measure_id: unitId,
		});
		expect(res.status).toBe(400);
	});

	it('returns 400 when amount is missing', async () => {
		const res = await request(app).post('/food-logs').send({
			user_id: userId,
			element_id: elementId,
			raw_name: 'x',
			measure_id: unitId,
		});
		expect(res.status).toBe(400);
	});

	it('returns 400 when raw_name is empty', async () => {
		const res = await request(app)
			.post('/food-logs')
			.send(foodLogPayload({ raw_name: '' }));
		expect(res.status).toBe(400);
	});
});

describe('GET /food-logs/:id', () => {
	it('returns a food log', async () => {
		const log = await createFoodLog();
		const res = await request(app).get(`/food-logs/${log.id}`);
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			id: log.id,
			user_id: userId,
			raw_name: 'test food',
		});
	});

	it('returns 404 for nonexistent log', async () => {
		const res = await request(app).get('/food-logs/999999999');
		expect(res.status).toBe(404);
	});

	it('returns 400 for non-numeric id', async () => {
		const res = await request(app).get('/food-logs/abc');
		expect(res.status).toBe(400);
	});
});

describe('DELETE /food-logs/:id', () => {
	it('deletes a food log and returns 204', async () => {
		const log = await createFoodLog();
		const res = await request(app).delete(`/food-logs/${log.id}`);
		expect(res.status).toBe(204);

		const getRes = await request(app).get(`/food-logs/${log.id}`);
		expect(getRes.status).toBe(404);
	});

	it('returns 404 when log does not exist', async () => {
		const res = await request(app).delete('/food-logs/999999999');
		expect(res.status).toBe(404);
	});
});

describe('GET /food-logs/:id/nutrients', () => {
	it('returns nutrient groups for a food log', async () => {
		const log = await createFoodLog();
		const res = await request(app).get(`/food-logs/${log.id}/nutrients`);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});

	it('returns 404 for nonexistent log', async () => {
		const res = await request(app).get('/food-logs/999999999/nutrients');
		expect(res.status).toBe(404);
	});
});

describe('GET /users/:userId/food-logs', () => {
	it('returns food logs for a user with kcal', async () => {
		const log = await createFoodLog();
		const res = await request(app).get(`/users/${userId}/food-logs`);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		const found = res.body.find(
			(row: { id: number; kcal?: unknown }) => row.id === log.id,
		);
		expect(found).toMatchObject({
			id: log.id,
			kcal: expect.any(Number),
		});
	});

	it('orders by logged_at descending', async () => {
		const older = await createFoodLog({
			logged_at: '2025-12-10T08:00:00.000Z',
			raw_name: 'older food',
		});
		const newer = await createFoodLog({
			logged_at: '2025-12-10T18:00:00.000Z',
			raw_name: 'newer food',
		});
		const res = await request(app).get(
			`/users/${userId}/food-logs?from=2025-12-10T00:00:00.000Z&to=2025-12-10T23:59:59.999Z`,
		);
		expect(res.status).toBe(200);
		const ids = res.body.map((row: { id: number }) => row.id);
		expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
	});

	it('accepts date range params', async () => {
		const res = await request(app).get(
			`/users/${userId}/food-logs?from=2024-01-01&to=2026-12-31`,
		);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});

	it('does not return another user food logs', async () => {
		const otherLog = await createFoodLog({
			user_id: otherUserId,
			raw_name: 'other user food',
		});
		const res = await request(app).get(`/users/${userId}/food-logs`);
		expect(res.status).toBe(200);
		const found = res.body.find(
			(row: { id: number }) => row.id === otherLog.id,
		);
		expect(found).toBeUndefined();
	});

	it('returns 400 for invalid date', async () => {
		const res = await request(app).get(
			`/users/${userId}/food-logs?from=not-a-date`,
		);
		expect(res.status).toBe(400);
	});
});

describe('GET /users/:userId/food-logs/nutrients', () => {
	it('returns nutrient groups across food logs', async () => {
		const res = await request(app).get(`/users/${userId}/food-logs/nutrients`);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});

	it('accepts date range params', async () => {
		const res = await request(app).get(
			`/users/${userId}/food-logs/nutrients?from=2024-01-01&to=2026-12-31`,
		);
		expect(res.status).toBe(200);
	});
});
